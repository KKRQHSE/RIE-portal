import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DOWNLOAD_GELDIGHEID_SEC, signedUrlOpties } from '@/lib/bewijs'
import { INSPECTIE_FOTO_BUCKET, type InspectieFotoItem } from '@/lib/inspectie-foto'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// Signed download-URL's voor alle foto's van één inspectie (beide niveaus in één
// keer; de client sorteert ze op bevinding_id). Toegang via de sessie-client — de
// RLS-select-policy op inspectie_foto (mag_bedrijf_beheren) levert alleen rijen
// van het eigen bedrijf; pas dáárna mint de service role de kortlevende URL's.
// Cross-company komt er zo nooit doorheen.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { inspectieId } = (body ?? {}) as Record<string, unknown>
  if (typeof inspectieId !== 'string' || !inspectieId) return fout('Ongeldige invoer.', 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  const { data: rijen, error } = await supabase
    .from('inspectie_foto')
    .select('id, company_id, bevinding_id, storage_pad, bestandsnaam, type')
    .eq('inspectie_id', inspectieId)
    .order('aangemaakt_op', { ascending: true })
  if (error) return fout('Geen toegang.', 403)

  const service = createServiceClient()
  const fotos: InspectieFotoItem[] = await Promise.all(
    (rijen ?? []).map(async (r): Promise<InspectieFotoItem> => {
      let downloadUrl: string | null = null
      if (typeof r.storage_pad === 'string' && r.storage_pad) {
        const { data: signed } = await service.storage
          .from(INSPECTIE_FOTO_BUCKET)
          .createSignedUrl(r.storage_pad, DOWNLOAD_GELDIGHEID_SEC, signedUrlOpties(r.type, r.bestandsnaam))
        downloadUrl = signed?.signedUrl ?? null
        // Legt de UITGIFTE van de signed URL vast, niet het ophalen zelf;
        // zichtbaar falen (console.error), niet blokkerend.
        if (downloadUrl) {
          const { error: logErr } = await supabase.rpc('audit_log_schrijven', {
            p_actie: 'foto_gedownload', p_entiteit: 'inspectie_foto', p_entiteit_id: r.id,
            p_company_id: r.company_id ?? null, p_detail: { bestandsnaam: r.bestandsnaam ?? null, inspectie_id: inspectieId },
          })
          if (logErr) console.error('[audit_log] foto_gedownload (inspectie) mislukt', r.id, logErr.message)
        }
      }
      return {
        id: String(r.id),
        bevinding_id: (r.bevinding_id as string | null) ?? null,
        bestandsnaam: r.bestandsnaam ?? null,
        type: r.type ?? null,
        downloadUrl,
      }
    }),
  )

  return NextResponse.json({ fotos })
}
