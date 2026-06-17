import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/service'
import { BEWIJS_BUCKET, DOWNLOAD_GELDIGHEID_SEC, parseJson, isVeiligOpslagPad, type BewijsItem } from '@/lib/bewijs'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// Ruwe vorm zoals deellink_bewijs_lijst die teruggeeft (paden + metadata).
type RawBewijs = {
  id?: string
  pad?: string
  bestandsnaam?: string | null
  type?: string | null
  grootte?: number | null
  geupload_door?: string | null
  created_at?: string | null
}

// GAST-download: signed download-URL's voor de bewijzen van de eigen actie.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { token, actieId } = (body ?? {}) as Record<string, unknown>
  if (typeof token !== 'string' || !token || typeof actieId !== 'string' || !actieId) {
    return fout('Ongeldige invoer.', 400)
  }

  const anon = createAnonClient()
  const { data, error } = await anon.rpc('deellink_bewijs_lijst', {
    p_token: token,
    p_actie_id: actieId,
  })
  if (error) return fout('Geen toegang.', 403)

  const rijen = parseJson<RawBewijs[]>(data) ?? []
  const service = createServiceClient()

  const bewijzen: BewijsItem[] = await Promise.all(
    rijen.map(async (r): Promise<BewijsItem> => {
      let downloadUrl: string | null = null
      // Alleen paden die de RPC (token-gevalideerd) teruggaf én bucket-relatief
      // binnen de eigen opslag blijven, krijgen een signed URL.
      if (isVeiligOpslagPad(r.pad)) {
        const { data: signed } = await service.storage
          .from(BEWIJS_BUCKET)
          .createSignedUrl(r.pad, DOWNLOAD_GELDIGHEID_SEC)
        downloadUrl = signed?.signedUrl ?? null
      }
      return {
        id: String(r.id ?? ''),
        bestandsnaam: r.bestandsnaam ?? null,
        type: r.type ?? null,
        grootte: typeof r.grootte === 'number' ? r.grootte : null,
        geupload_door: r.geupload_door ?? null,
        created_at: r.created_at ?? null,
        downloadUrl,
      }
    })
  )

  return NextResponse.json({ bewijzen })
}
