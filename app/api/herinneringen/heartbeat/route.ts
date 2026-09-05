import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stuurHerinnerMail, type HerinnerActie } from '@/lib/resend'

// Nooit cachen/prerenderen.
export const dynamic = 'force-dynamic'

type Kandidaat = {
  persoon_id: string
  naam: string | null
  email: string | null
  token: string | null
  acties: HerinnerActie[] | null
}

// Constante-tijd-vergelijking van het gedeelde geheim (voorkomt timing-lek).
function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// AUTOMATISCHE wekker, aangeroepen door pg_cron (geen ingelogde gebruiker).
// Beveiliging: header 'x-heartbeat-secret' moet exact gelijk zijn aan
// process.env.HEARTBEAT_SECRET (server-only). Anders 401 en niets doen.
export async function POST(request: Request) {
  const secret = process.env.HEARTBEAT_SECRET
  const meegegeven = request.headers.get('x-heartbeat-secret') ?? ''
  // Geen geheim geconfigureerd, of mismatch → weigeren.
  if (!secret || !gelijk(secret, meegegeven)) {
    return NextResponse.json({ ok: false, fout: 'Niet geautoriseerd.' }, { status: 401 })
  }

  const service = createServiceClient()

  // Alle bedrijven met een actief ritme (niet 'uit').
  const { data: instellingen, error: instErr } = await service
    .from('herinner_instelling')
    .select('company_id, ritme')
    .neq('ritme', 'uit')
  if (instErr) {
    return NextResponse.json({ ok: false, fout: 'Kon instellingen niet laden.' }, { status: 500 })
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

  const samenvatting: Array<{ companyId: string; verstuurd: number; mislukt: number; fout?: string }> = []

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

  return NextResponse.json({ ok: true, bedrijven: samenvatting.length, samenvatting })
}
