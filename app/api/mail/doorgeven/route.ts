import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stuurActieMail } from '@/lib/resend'

// Nooit cachen/prerenderen: dit is altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ ok: false, fout: bericht }, { status })
}

// DOORGEVEN-mail: mailt de NIEUWE actiehouder na een geslaagde doorgeef-actie.
//
// BEVEILIGINGSKEUZE — één route voor zowel gast als beheerder, die de ontvanger
// VOLLEDIG OPNIEUW VALIDEERT en de mail uit DB-waarden opbouwt:
//   * De gast heeft geen sessie, dus we kunnen niet op de ingelogde gebruiker
//     leunen. We vertrouwen óók niet op het door de client meegestuurde e-mail-
//     adres (dat zou vrije mail naar een willekeurig adres toelaten).
//   * In plaats daarvan is de deellink-TOKEN van de ontvanger het bewijsmiddel:
//     die is zojuist door de doorgeef-RPC aangemaakt/teruggegeven. We zoeken de
//     deellink server-side op met de service role (ná deze token-check), leiden
//     daaruit de échte ontvanger (persoon + e-mail uit de DB) af, en eisen
//     bovendien dat het genoemde actienummer dáadwerkelijk aan die persoon is
//     toegewezen. Zo kan er geen mail los van een echte doorgeefactie, en nooit
//     naar een ander adres dan dat van de gevalideerde ontvanger, worden gestuurd.
// Daarom is geen aparte gast-RPC nodig: de token + de toewijzingscheck zijn de
// validatie, en de service role komt — net als bij app/api/bewijs/gast-* — pas
// ná die validatie in beeld.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { token, actieNr } = (body ?? {}) as Record<string, unknown>
  if (
    typeof token !== 'string' || !token ||
    typeof actieNr !== 'string' || !actieNr
  ) {
    return fout('Ongeldige invoer.', 400)
  }

  const service = createServiceClient()

  // 1) Token → deellink. De token is het bewijsmiddel; bestaat er geen actieve
  //    deellink, dan geen toegang.
  const { data: deellink, error: linkErr } = await service
    .from('deellinks')
    .select('company_id, persoon_id, vervalt_op, ingetrokken')
    .eq('token', token)
    .single()
  if (linkErr || !deellink) return fout('Geen toegang.', 403)

  const verlopen = deellink.vervalt_op && new Date(deellink.vervalt_op).getTime() <= Date.now()
  if (deellink.ingetrokken || verlopen) return fout('Geen toegang.', 403)

  // 2) Eis dat de genoemde actie écht aan deze ontvanger is toegewezen — anders
  //    zou een geldige token misbruikt kunnen worden voor losse mail.
  const { data: actie, error: actieErr } = await service
    .from('pva_items')
    .select('onderwerp')
    .eq('company_id', deellink.company_id)
    .eq('nr', actieNr)
    .eq('persoon_id', deellink.persoon_id)
    .limit(1)
    .maybeSingle()
  if (actieErr || !actie) return fout('Geen toegang.', 403)

  // 3) Ontvanger + bedrijf vers uit de DB; nooit uit client-invoer.
  const { data: persoon } = await service
    .from('personen')
    .select('naam, email')
    .eq('id', deellink.persoon_id)
    .single()
  if (!persoon?.email) {
    // Doorgeven zélf is al geslaagd; alleen de mail kan niet. Zachte uitkomst.
    return NextResponse.json({ ok: false, fout: 'De ontvanger heeft geen e-mailadres.' })
  }

  const { data: company } = await service
    .from('companies')
    .select('name')
    .eq('id', deellink.company_id)
    .single()

  const res = await stuurActieMail({
    naarEmail: persoon.email,
    naarNaam: persoon.naam,
    bedrijf: company?.name ?? 'het veiligheidsportaal',
    actieNr,
    actieOnderwerp: actie.onderwerp,
    deellinkToken: token,
  })

  // De mailsleutel of interne fout lekt nooit naar de response.
  return NextResponse.json(res)
}
