import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/service'
import { BEWIJS_BUCKET, DOWNLOAD_GELDIGHEID_SEC, parseJson, isVeiligOpslagPad, signedUrlOpties, type BewijsItem } from '@/lib/bewijs'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// Ruwe vorm zoals deellink_bewijs_lijst die teruggeeft (paden + metadata).
type RawBewijs = {
  id?: string
  company_id?: string
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
          .createSignedUrl(r.pad, DOWNLOAD_GELDIGHEID_SEC, signedUrlOpties(r.type, r.bestandsnaam))
        downloadUrl = signed?.signedUrl ?? null
        // Gast heeft geen sessie (auth.uid() = null in de log) — via de
        // service-role, want de anon-client mag audit_log_schrijven niet
        // aanroepen (bewust: alleen authenticated/service_role). Legt de
        // UITGIFTE vast, niet het ophalen; zichtbaar falen, niet blokkerend
        // (zelfde keuze als de beheerder-download-route).
        if (downloadUrl) {
          const { error: logErr } = await service.rpc('audit_log_schrijven', {
            p_actie: 'bewijs_gedownload', p_entiteit: 'bewijs', p_entiteit_id: r.id ?? null,
            p_company_id: r.company_id ?? null, p_detail: { bestandsnaam: r.bestandsnaam ?? null, gast: true },
          })
          if (logErr) console.error('[audit_log] bewijs_gedownload (gast) mislukt', r.id, logErr.message)
        }
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
