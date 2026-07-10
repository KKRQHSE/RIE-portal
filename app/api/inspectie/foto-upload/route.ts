import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isVeiligOpslagPad, parseJson } from '@/lib/bewijs'
import { INSPECTIE_FOTO_BUCKET } from '@/lib/inspectie-foto'

// Nooit cachen/prerenderen: altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// Geef de browser een kortlevende signed upload-URL voor één gereserveerd pad.
// Anders dan bij de incident-meldflow is de uploader hier INGELOGD: de RPC doet
// de mag_bedrijf_beheren-check en leidt het bedrijf af uit de inspectie, nooit
// uit clientinvoer. De service role komt pas ná die validatie in beeld.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { inspectieId, bevindingId, bestandsnaam } = (body ?? {}) as Record<string, unknown>
  if (
    typeof inspectieId !== 'string' || !inspectieId ||
    typeof bestandsnaam !== 'string' || !bestandsnaam.trim() ||
    (bevindingId != null && typeof bevindingId !== 'string')
  ) {
    return fout('Ongeldige invoer.', 400)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  const { data, error } = await supabase.rpc('inspectie_foto_pad', {
    p_inspectie_id: inspectieId,
    p_bevinding_id: bevindingId ?? null,
    p_bestandsnaam: bestandsnaam,
  })
  if (error) return fout('Geen toegang.', 403)

  const gereserveerd = parseJson<{ pad?: string; company_id?: string }>(data)
  const pad = gereserveerd?.pad
  // De RPC bepaalt het pad; deze guard borgt bovendien dat het een bucket-relatief
  // pad binnen de eigen opslag is.
  if (!isVeiligOpslagPad(pad)) return fout('Geen toegang.', 403)

  const service = createServiceClient()
  const { data: signed, error: signErr } = await service.storage
    .from(INSPECTIE_FOTO_BUCKET)
    .createSignedUploadUrl(pad)
  if (signErr || !signed) return fout('Upload voorbereiden mislukt.', 500)

  return NextResponse.json({ signedUrl: signed.signedUrl, uploadToken: signed.token, pad })
}
