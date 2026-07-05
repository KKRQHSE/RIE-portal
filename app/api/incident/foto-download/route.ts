import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DOWNLOAD_GELDIGHEID_SEC } from '@/lib/bewijs'
import { INCIDENT_FOTO_BUCKET, type IncidentFotoItem } from '@/lib/incident'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// KAM-download: signed download-URL's voor de foto's van één incident. Toegang via
// de sessie-client — de RLS-select-policy op incident_foto (mag_bedrijf_beheren)
// levert alleen de rijen van het eigen bedrijf; pas dáárna mint de service role de
// kortlevende signed URL's. Cross-company komt er zo nooit doorheen.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { incidentId } = (body ?? {}) as Record<string, unknown>
  if (typeof incidentId !== 'string' || !incidentId) return fout('Ongeldige invoer.', 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // RLS schermt af op het eigen bedrijf; een incident van een ander bedrijf geeft
  // simpelweg geen rijen terug.
  const { data: rijen, error } = await supabase
    .from('incident_foto')
    .select('id, storage_pad, bestandsnaam, type')
    .eq('incident_id', incidentId)
    .order('aangemaakt_op', { ascending: true })
  if (error) return fout('Geen toegang.', 403)

  const service = createServiceClient()
  const fotos: IncidentFotoItem[] = await Promise.all(
    (rijen ?? []).map(async (r): Promise<IncidentFotoItem> => {
      let downloadUrl: string | null = null
      if (typeof r.storage_pad === 'string' && r.storage_pad) {
        const { data: signed } = await service.storage
          .from(INCIDENT_FOTO_BUCKET)
          .createSignedUrl(r.storage_pad, DOWNLOAD_GELDIGHEID_SEC)
        downloadUrl = signed?.signedUrl ?? null
      }
      return {
        id: String(r.id),
        bestandsnaam: r.bestandsnaam ?? null,
        type: r.type ?? null,
        downloadUrl,
      }
    }),
  )

  return NextResponse.json({ fotos })
}
