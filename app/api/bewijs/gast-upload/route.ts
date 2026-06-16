import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/service'
import { BEWIJS_BUCKET, parseJson } from '@/lib/bewijs'

// Nooit cachen/prerenderen: dit is altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// GAST-upload: geef de browser een kortlevende signed upload-URL voor één
// gereserveerd pad. De deellink-token wordt door de RPC zelf gevalideerd; de
// service role komt pas in beeld ná die validatie en alleen op de server.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { token, actieId, bestandsnaam } = (body ?? {}) as Record<string, unknown>
  if (
    typeof token !== 'string' || !token ||
    typeof actieId !== 'string' || !actieId ||
    typeof bestandsnaam !== 'string' || !bestandsnaam.trim()
  ) {
    return fout('Ongeldige invoer.', 400)
  }

  // Token + actie-koppeling worden in de RPC gevalideerd; die reserveert een pad.
  const anon = createAnonClient()
  const { data, error } = await anon.rpc('deellink_bewijs_pad', {
    p_token: token,
    p_actie_id: actieId,
    p_bestandsnaam: bestandsnaam,
  })
  if (error) return fout('Geen toegang.', 403)

  const reserved = parseJson<{ pad?: string; company_id?: string }>(data)
  const pad = reserved?.pad
  if (typeof pad !== 'string' || !pad) return fout('Geen toegang.', 403)

  // Pas hier de service role: één signed upload-URL voor exact dit pad.
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
