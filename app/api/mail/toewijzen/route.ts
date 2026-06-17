import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stuurActieMail } from '@/lib/resend'

// Nooit cachen/prerenderen: dit is altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ ok: false, fout: bericht }, { status })
}

// TOEWIJZEN-mail: een ingelogde beheerder (KAM) nodigt een persoon uit met de
// eigen deellink. Autorisatie leunt volledig op RLS: kan de ingelogde gebruiker
// de persoon (en diens deellink) lezen via zijn eigen sessie-client, dan beheert
// hij het bedrijf en mag hij mailen. We bouwen de mail uit DB-waarden, niet uit
// client-invoer: de client levert alleen welke persoon, de rest komt vers uit de
// database. Zo kan er geen mail naar een vreemd adres worden afgedwongen.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { persoonId } = (body ?? {}) as Record<string, unknown>
  if (typeof persoonId !== 'string' || !persoonId) {
    return fout('Ongeldige invoer.', 400)
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // RLS is de autorisatie: alleen een beheerder van het bedrijf ziet deze rij.
  const { data: persoon, error: persoonErr } = await supabase
    .from('personen')
    .select('naam, email, company_id')
    .eq('id', persoonId)
    .single()
  if (persoonErr || !persoon) return fout('Geen toegang.', 403)

  if (!persoon.email) {
    return fout('Deze persoon heeft geen e-mailadres.', 400)
  }

  // Bedrijfsnaam vers uit de DB (niet uit client-invoer).
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', persoon.company_id)
    .single()

  // Actieve, niet-ingetrokken, niet-verlopen deellink — anders is er geen URL.
  const { data: deellinks } = await supabase
    .from('deellinks')
    .select('token, vervalt_op, ingetrokken')
    .eq('persoon_id', persoonId)
    .eq('ingetrokken', false)

  const nu = Date.now()
  const actief = (deellinks ?? []).find(
    l => !l.vervalt_op || new Date(l.vervalt_op).getTime() > nu
  )
  if (!actief?.token) {
    return fout('Er is geen actieve deellink voor deze persoon.', 400)
  }

  // Algemene uitnodiging: geen specifiek actienummer.
  const res = await stuurActieMail({
    naarEmail: persoon.email,
    naarNaam: persoon.naam,
    bedrijf: company?.name ?? 'het veiligheidsportaal',
    deellinkToken: actief.token,
  })

  // De mailsleutel of interne fout lekt nooit naar de response.
  return NextResponse.json(res)
}
