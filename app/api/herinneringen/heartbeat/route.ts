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

  const samenvatting: Array<{ companyId: string; verstuurd: number; mislukt: number }> = []

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
        // Eén bedrijf faalt → overslaan, de rest gaat door.
        samenvatting.push({ companyId, verstuurd, mislukt })
        continue
      }
      const kandidaten = (data ?? []) as Kandidaat[]

      const { data: company } = await service
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()
      const bedrijf = company?.name ?? 'het veiligheidsportaal'

      for (const k of kandidaten) {
        try {
          if (!k.email || !k.token) {
            mislukt++
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
            continue
          }
          await service.rpc('herinnering_loggen', {
            p_persoon_id: k.persoon_id,
            p_bron: 'automatisch',
            p_acties: k.acties ?? [],
            p_email: k.email,
          })
          verstuurd++
        } catch {
          mislukt++
        }
      }
    } catch {
      // Onverwachte fout op bedrijfsniveau: niet de hele heartbeat stoppen.
    }
    samenvatting.push({ companyId, verstuurd, mislukt })
  }

  console.log('[heartbeat] herinneringen verstuurd', JSON.stringify(samenvatting))
  return NextResponse.json({ ok: true, bedrijven: samenvatting.length, samenvatting })
}
