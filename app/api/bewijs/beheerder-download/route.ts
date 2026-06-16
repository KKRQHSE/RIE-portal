import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BEWIJS_BUCKET, DOWNLOAD_GELDIGHEID_SEC, parseJson, type BewijsItem } from '@/lib/bewijs'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// bewijs_lijst geeft incl. verwijderde rijen terug (met verwijderd_op/door).
type RawBewijs = {
  id?: string
  pad?: string
  bestandsnaam?: string | null
  type?: string | null
  grootte?: number | null
  geupload_door?: string | null
  created_at?: string | null
  verwijderd_op?: string | null
}

// BEHEERDER-download: signed download-URL's voor de ACTIEVE bewijzen van een actie.
// Toegang via de sessie-client + bewijs_lijst (gooit bij geen beheerrecht).
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { actieId } = (body ?? {}) as Record<string, unknown>
  if (typeof actieId !== 'string' || !actieId) {
    return fout('Ongeldige invoer.', 400)
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  const { data, error } = await supabase.rpc('bewijs_lijst', { p_actie_id: actieId })
  if (error) return fout('Geen toegang.', 403)

  const rijen = parseJson<RawBewijs[]>(data) ?? []
  // Toon alleen actieve bewijzen; verwijderde blijven in DB/historie maar niet hier.
  const actief = rijen.filter(r => !r.verwijderd_op)

  const service = createServiceClient()
  const bewijzen: BewijsItem[] = await Promise.all(
    actief.map(async (r): Promise<BewijsItem> => {
      let downloadUrl: string | null = null
      if (typeof r.pad === 'string' && r.pad) {
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
