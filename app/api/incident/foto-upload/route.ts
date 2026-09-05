import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/service'
import { parseJson, isVeiligOpslagPad, isServerToegestaanType, isToegestaneGrootte } from '@/lib/bewijs'
import { INCIDENT_FOTO_BUCKET } from '@/lib/incident'
import { rateLimietToegestaan } from '@/lib/rate-limit'

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

  const { token, incidentId, bestandsnaam, type, grootte } = (body ?? {}) as Record<string, unknown>
  if (
    typeof token !== 'string' || !token ||
    typeof incidentId !== 'string' || !incidentId ||
    typeof bestandsnaam !== 'string' || !bestandsnaam.trim()
  ) {
    return fout('Ongeldige invoer.', 400)
  }
  if (!isServerToegestaanType(type)) return fout('Alleen jpg/png/webp/gif of pdf zijn toegestaan.', 415)
  if (!isToegestaneGrootte(grootte)) return fout('Bestand te groot of ongeldige grootte opgegeven.', 413)

  const anon = createAnonClient()

  // Rate limit per token (het permanente bedrijfstoken, niet per IP — zie
  // gast-upload voor dezelfde afweging) — 20 uploads per 10 minuten.
  const magUploaden = await rateLimietToegestaan(anon, `token:${token}`, 'incident_foto_upload', 20, 600)
  if (!magUploaden) return fout('Te veel uploads met deze link, probeer het over een paar minuten opnieuw.', 429)

  // Token + incident-koppeling worden in de RPC gevalideerd; die reserveert een pad.
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
