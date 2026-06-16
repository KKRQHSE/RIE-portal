import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BEWIJS_BUCKET, veiligeExt } from '@/lib/bewijs'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// BEHEERDER-upload: alleen voor een ingelogde gebruiker die het bedrijf van de
// actie mag beheren. De toegang wordt afgedwongen door bewijs_lijst(actieId),
// dat bij geen toegang een fout teruggeeft. Pas daarna maken we de signed URL.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { actieId, bestandsnaam } = (body ?? {}) as Record<string, unknown>
  if (
    typeof actieId !== 'string' || !actieId ||
    typeof bestandsnaam !== 'string' || !bestandsnaam.trim()
  ) {
    return fout('Ongeldige invoer.', 400)
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // Autorisatie: deze RPC gooit bij geen beheerrecht op het bedrijf van de actie.
  const { error: toegangErr } = await supabase.rpc('bewijs_lijst', { p_actie_id: actieId })
  if (toegangErr) return fout('Geen toegang.', 403)

  // company_id alleen nodig voor het pad; toegang is hierboven al bevestigd.
  const { data: item, error: itemErr } = await supabase
    .from('pva_items')
    .select('company_id')
    .eq('id', actieId)
    .single()
  if (itemErr || !item?.company_id) return fout('Actie niet gevonden.', 404)

  // Pad zoals de DB het ook opbouwt: bewijs/<company_id>/<actieId>/<random>.<ext>
  const pad = `bewijs/${item.company_id}/${actieId}/${globalThis.crypto.randomUUID()}.${veiligeExt(bestandsnaam)}`

  const service = createServiceClient()
  const { data: signed, error: signErr } = await service.storage
    .from(BEWIJS_BUCKET)
    .createSignedUploadUrl(pad)
  if (signErr || !signed) return fout('Upload voorbereiden mislukt.', 500)

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    uploadToken: signed.token,
    pad,
  })
}
