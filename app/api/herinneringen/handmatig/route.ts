import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stuurHerinnerMail, type HerinnerActie } from '@/lib/resend'

// Nooit cachen/prerenderen: dit is altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ ok: false, fout: bericht }, { status })
}

// Vorm van een rij uit herinner_kandidaten(). E-mail komt UITSLUITEND hiervandaan
// (de database), nooit uit de browser.
type Kandidaat = {
  persoon_id: string
  naam: string | null
  email: string | null
  token: string | null
  acties: HerinnerActie[] | null
}

// HANDMATIGE herinnering door de ingelogde KAM/admin. De browser stuurt alleen
// persoon-ids; alle mailgegevens (e-mail, token, acties) komen uit de RPC, die
// via RLS + mag_bedrijf_beheren al afdwingt dat de gebruiker dit bedrijf beheert.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { companyId, personIds } = (body ?? {}) as Record<string, unknown>
  if (typeof companyId !== 'string' || !companyId) {
    return fout('Ongeldige invoer.', 400)
  }

  // "iedereen" = personIds leeg/ontbreekt of bevat 'alle'. Anders: alleen deze ids.
  const idsArray = Array.isArray(personIds)
    ? personIds.filter((x): x is string => typeof x === 'string' && x !== '')
    : []
  const allesSelecteren = idsArray.length === 0 || idsArray.includes('alle')
  const gevraagdeIds = new Set(idsArray.filter(x => x !== 'alle'))

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // Autorisatie + kandidaten in één: faalt bij geen beheerrecht op het bedrijf.
  const { data, error } = await supabase.rpc('herinner_kandidaten', {
    p_company_id: companyId,
    p_alleen_ritme: false,
  })
  if (error) return fout('Geen toegang.', 403)

  const kandidaten = (data ?? []) as Kandidaat[]

  // Bedrijfsnaam vers uit de DB voor in de mail.
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()
  const bedrijf = company?.name ?? 'het veiligheidsportaal'

  // Selecteer de kandidaten die de KAM koos (of allemaal).
  const geselecteerd = allesSelecteren
    ? kandidaten
    : kandidaten.filter(k => gevraagdeIds.has(k.persoon_id))

  // Gevraagde personen die NIET in de kandidatenlijst zitten: niet in aanmerking
  // (meestal de rem max 2/7 dagen, of geen geldige link/e-mail/openstaande actie).
  const kandidaatIds = new Set(kandidaten.map(k => k.persoon_id))
  const overgeslagen = allesSelecteren
    ? []
    : [...gevraagdeIds].filter(id => !kandidaatIds.has(id)).map(persoonId => ({ persoonId }))

  let verstuurd = 0
  const mislukt: Array<{ persoonId: string; naam: string | null; reden: string }> = []

  for (const k of geselecteerd) {
    // Per item afgeschermd: één mislukte mail blokkeert de rest niet.
    try {
      if (!k.email || !k.token) {
        mislukt.push({ persoonId: k.persoon_id, naam: k.naam, reden: 'geen e-mailadres of geldige link' })
        continue
      }
      const res = await stuurHerinnerMail({
        naarEmail: k.email, // alleen het DB-adres, nooit browser-invoer
        naarNaam: k.naam ?? '',
        bedrijf,
        deellinkToken: k.token,
        acties: k.acties ?? [],
      })
      if (!res.ok) {
        mislukt.push({ persoonId: k.persoon_id, naam: k.naam, reden: res.fout })
        continue
      }
      // Pas loggen NA succesvol versturen.
      await supabase.rpc('herinnering_loggen', {
        p_persoon_id: k.persoon_id,
        p_bron: 'handmatig',
        p_acties: k.acties ?? [],
        p_email: k.email,
      })
      verstuurd++
    } catch {
      mislukt.push({ persoonId: k.persoon_id, naam: k.naam, reden: 'onverwachte fout bij versturen' })
    }
  }

  return NextResponse.json({
    ok: true,
    verstuurd,
    mislukt,
    overgeslagen,
    totaalGeselecteerd: geselecteerd.length,
  })
}
