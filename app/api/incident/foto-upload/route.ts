import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/service'
import { parseJson, isVeiligOpslagPad } from '@/lib/bewijs'
import { INCIDENT_FOTO_BUCKET } from '@/lib/incident'

// Nooit cachen/prerenderen: altijd een verse, request-specifieke actie.
export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// MELDER-upload: geef de browser een kortlevende signed upload-URL voor één
// gereserveerd pad. Het bedrijfstoken wordt door de RPC zelf gevalideerd; de
// service role komt pas ná die validatie in beeld, en alleen op de server.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { token, incidentId, bestandsnaam } = (body ?? {}) as Record<string, unknown>
  if (
    typeof token !== 'string' || !token ||
    typeof incidentId !== 'string' || !incidentId ||
    typeof bestandsnaam !== 'string' || !bestandsnaam.trim()
  ) {
    return fout('Ongeldige invoer.', 400)
  }

  // Token + incident-koppeling worden in de RPC gevalideerd; die reserveert een pad.
  const anon = createAnonClient()
  const { data, error } = await anon.rpc('incident_foto_pad_token', {
    p_token: token,
    p_incident_id: incidentId,
    p_bestandsnaam: bestandsnaam,
  })
  if (error) return fout('Geen toegang.', 403)

  const reserved = parseJson<{ pad?: string; company_id?: string }>(data)
  const pad = reserved?.pad
  // De RPC bepaalt het pad uit het token (niet uit client-invoer); deze guard borgt
  // bovendien dat het een bucket-relatief pad binnen de eigen opslag is.
  if (!isVeiligOpslagPad(pad)) return fout('Geen toegang.', 403)

  // Pas hier de service role: één signed upload-URL voor exact dit pad.
  const service = createServiceClient()
  const { data: signed, error: signErr } = await service.storage
    .from(INCIDENT_FOTO_BUCKET)
    .createSignedUploadUrl(pad)
  if (signErr || !signed) return fout('Upload voorbereiden mislukt.', 500)

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    uploadToken: signed.token,
    pad,
  })
}
