import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stuurHerinnerMail, type HerinnerActie } from '@/lib/resend'

// Nooit cachen/prerenderen.
export const dynamic = 'force-dynamic'
// Loopt over alle bedrijven met een actief ritme + genereert daarna
// notificaties voor ALLE bedrijven — ruim onder de meeste functielimieten,
// maar expliciet gezet zodat een groeiend aantal bedrijven niet stilletjes
// afgekapt wordt.
export const maxDuration = 60

type Kandidaat = {
  persoon_id: string
  naam: string | null
  email: string | null
  token: string | null
  acties: HerinnerActie[] | null
}

type Samenvatting = { companyId: string; verstuurd: number; mislukt: number; fout?: string }

// Constante-tijd-vergelijking van het gedeelde geheim (voorkomt timing-lek).
function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// De eigenlijke heartbeat-uitvoering. Gedeeld door GET (Vercel Cron, zie
// vercel.json — Vercel Cron doet ALTIJD een GET-aanroep, nooit POST) en POST
// (handmatig/curl testen, met het eigen x-heartbeat-secret-geheim). Alleen de
// autorisatie verschilt per aanroepweg; de uitvoering zelf is identiek.
async function voerHeartbeatUit() {
  const service = createServiceClient()

  // Alle bedrijven met een actief ritme (niet 'uit').
  const { data: instellingen, error: instErr } = await service
    .from('herinner_instelling')
    .select('company_id, ritme')
    .neq('ritme', 'uit')
  if (instErr) {
    // Totale infra-fout, geen enkel bedrijf verwerkt — ook dit mag niet stil
    // verdwijnen in alleen de (hier niet inzichtbare) function-logs.
    try {
      await service.rpc('audit_log_schrijven', {
        p_actie: 'automatische_herinnering_mislukt',
        p_entiteit: 'herinnering',
        p_entiteit_id: null,
        p_company_id: null,
        p_detail: { fout: instErr.message },
      })
    } catch { /* audit-log is best-effort, mag de foutrapportage niet blokkeren */ }
    return { ok: false as const, fout: 'Kon instellingen niet laden.' }
  }

  // Bedrijfsnamen in ÉÉN query vooraf i.p.v. één query per bedrijf in de lus
  // (N+1). De naam gaat alleen de afzender-header in; ontbreekt hij, dan geldt
  // dezelfde terugval als voorheen.
  const companyIds = (instellingen ?? []).map(i => i.company_id as string)
  const namen = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: companies } = await service
      .from('companies')
      .select('id, name')
      .in('id', companyIds)
    for (const c of companies ?? []) namen.set(c.id as string, c.name as string)
  }

  const samenvatting: Samenvatting[] = []

  for (const inst of instellingen ?? []) {
    const companyId = inst.company_id as string
    let verstuurd = 0
    let mislukt = 0
    try {
      // p_alleen_ritme=true: filtert op bedrijfsritme én de rem.
      const { data, error } = await service.rpc('herinner_kandidaten', {
        p_company_id: companyId,
        p_alleen_ritme: true,
      })
      if (error) {
        // Eén bedrijf faalt → overslaan, de rest gaat door — maar niet meer
        // stil: dit moet zichtbaar anders zijn dan "niemand aan de beurt".
        console.error('[heartbeat] RPC-fout bij bedrijf', companyId, error.message)
        samenvatting.push({ companyId, verstuurd, mislukt, fout: error.message })
        continue
      }
      const kandidaten = (data ?? []) as Kandidaat[]

      const bedrijf = namen.get(companyId) ?? 'het veiligheidsportaal'

      for (const k of kandidaten) {
        try {
          if (!k.email || !k.token) {
            mislukt++
            console.warn('[heartbeat] kandidaat overgeslagen: geen e-mail/token', companyId, k.persoon_id)
            continue
          }
          const res = await stuurHerinnerMail({
            naarEmail: k.email, // alleen het DB-adres
            naarNaam: k.naam ?? '',
            bedrijf,
            deellinkToken: k.token,
            acties: k.acties ?? [],
          })
          if (!res.ok) {
            mislukt++
            console.warn('[heartbeat] verzending mislukt', companyId, k.persoon_id, res.fout)
            continue
          }
          await service.rpc('herinnering_loggen', {
            p_persoon_id: k.persoon_id,
            p_bron: 'automatisch',
            p_acties: k.acties ?? [],
            p_email: k.email,
          })
          verstuurd++
        } catch (e) {
          mislukt++
          console.error('[heartbeat] onverwachte fout bij kandidaat', companyId, k.persoon_id, e)
        }
      }
    } catch (e) {
      // Onverwachte fout op bedrijfsniveau: niet de hele heartbeat stoppen,
      // maar wel loggen — anders is dit bedrijf straks weer een stille nul.
      console.error('[heartbeat] onverwachte fout op bedrijfsniveau', companyId, e)
    }
    samenvatting.push({ companyId, verstuurd, mislukt })
  }

  console.log('[heartbeat] herinneringen verstuurd', JSON.stringify(samenvatting))

  // Elk bedrijf dat vandaag verwerkt is krijgt een audit_log-regel — ook een
  // schone nul (verstuurd:0, mislukt:0) telt, want dat bewijst dat de run
  // heeft gedraaid. Zo is "het is drie dagen stil" straks een query
  // (`select * from audit_log where actie='automatische_herinnering' order by
  // wanneer desc`) i.p.v. iets dat alleen in Vercel's function-logs zichtbaar
  // is. Best-effort: een mislukte log-regel mag de heartbeat zelf niet slopen.
  for (const s of samenvatting) {
    try {
      await service.rpc('audit_log_schrijven', {
        p_actie: 'automatische_herinnering',
        p_entiteit: 'herinnering',
        p_entiteit_id: null,
        p_company_id: s.companyId,
        p_detail: { verstuurd: s.verstuurd, mislukt: s.mislukt, fout: s.fout ?? null },
      })
    } catch (e) {
      console.error('[heartbeat] audit_log_schrijven mislukt', s.companyId, e)
    }
  }

  // In-app notificaties verversen (B2): los van het e-mail-ritme hierboven --
  // dit vult de periodieke dagbundels + de vier scan-soorten voor iedereen die
  // de app niet elke dag opent (wie 'm wel opent triggert dezelfde scan al
  // via notificaties_ophalen). Eén bedrijf dat faalt mag de rest niet blokkeren.
  const { data: alleBedrijven } = await service.from('companies').select('id')
  let notificatiesOk = 0
  for (const c of alleBedrijven ?? []) {
    try {
      const { error } = await service.rpc('notificaties_genereren', { p_company_id: c.id as string })
      if (error) throw error
      notificatiesOk++
    } catch (e) {
      console.error('[heartbeat] notificaties_genereren mislukt', c.id, e)
    }
  }
  console.log('[heartbeat] notificaties ververst', notificatiesOk, '/', (alleBedrijven ?? []).length)

  return {
    ok: true as const,
    bedrijven: samenvatting.length,
    samenvatting,
    notificaties: { ok: notificatiesOk, totaal: (alleBedrijven ?? []).length },
  }
}

// AUTOMATISCH, aangeroepen door Vercel Cron (vercel.json, schedule "0 6 * * *").
// Vercel Cron doet ALTIJD een GET-aanroep naar het geconfigureerde pad, nooit
// POST — vandaar een apart GET-pad i.p.v. de bestaande POST hergebruiken.
// Beveiliging volgt Vercel's eigen conventie: zodra de omgevingsvariabele
// CRON_SECRET op het project staat, stuurt Vercel die automatisch mee als
// 'Authorization: Bearer <CRON_SECRET>' bij de cron-aanroep. Zonder match: 401
// en niets doen. (Los geheim van HEARTBEAT_SECRET hieronder — een gelekt
// handmatig testgeheim mag de cron-aanroep niet kunnen namaken en andersom.)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !gelijk(`Bearer ${secret}`, header)) {
    return NextResponse.json({ ok: false, fout: 'Niet geautoriseerd.' }, { status: 401 })
  }
  const resultaat = await voerHeartbeatUit()
  return NextResponse.json(resultaat, { status: resultaat.ok ? 200 : 500 })
}

// HANDMATIG/TEST — bv. een curl-aanroep buiten het dagelijkse schema om.
// Beveiliging: header 'x-heartbeat-secret' moet exact gelijk zijn aan
// process.env.HEARTBEAT_SECRET (server-only). Anders 401 en niets doen.
export async function POST(request: Request) {
  const secret = process.env.HEARTBEAT_SECRET
  const meegegeven = request.headers.get('x-heartbeat-secret') ?? ''
  if (!secret || !gelijk(secret, meegegeven)) {
    return NextResponse.json({ ok: false, fout: 'Niet geautoriseerd.' }, { status: 401 })
  }
  const resultaat = await voerHeartbeatUit()
  return NextResponse.json(resultaat, { status: resultaat.ok ? 200 : 500 })
}
