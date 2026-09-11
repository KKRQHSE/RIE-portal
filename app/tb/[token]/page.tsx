import { createClient } from '@/lib/supabase/server'
import ToolboxGastClient from '@/components/ToolboxGastClient'
import {
  VEILIGE_HUISSTIJL,
  normaliseerLettertype,
  normaliseerModus,
  type HuisstijlView,
} from '@/lib/huisstijl'
import type { WerknemerToolbox } from '@/lib/types'
import { parseStorageRef } from '@/lib/video-bron'
import { createServiceClient } from '@/lib/supabase/service'
import { normaliseerBeschikbareTalen } from '@/lib/i18n-werknemer'

const HUISSTIJL_BUCKET = 'merk-assets'
const VIDEO_GELDIGHEID_SEC = 60 * 60 * 4   // signed video-URL: 4 uur

// Een `storage:bucket/pad`-referentie (privé-bucket) → kortlevende signed URL.
// Het token is op dit punt al gevalideerd door toolbox_voor_token, dus dit hand
// alleen voor een geldige werknemer-link een tijdelijke URL uit; de bucket blijft
// privé. Een gewone publieke URL (YouTube/CDN/publieke bucket) gaat ongewijzigd door.
async function resolveVideoUrl(url: string | null): Promise<string | null> {
  if (!url) return url
  const ref = parseStorageRef(url)
  if (!ref) return url
  try {
    const service = createServiceClient()
    const { data } = await service.storage.from(ref.bucket).createSignedUrl(ref.path, VIDEO_GELDIGHEID_SEC)
    return data?.signedUrl ?? null
  } catch {
    return null   // niet kunnen signen → de UI toont een nette fallback
  }
}

type RawData = {
  persoon?: { id?: string; naam?: string | null } | null
  bedrijf?: string | null
  beschikbare_talen?: unknown
  huisstijl?: Record<string, unknown> | null
  toolboxen?: WerknemerToolbox[] | null
}

// Server-component, geen taal-state (het token is nog niet gevalideerd, dus
// er is geen bedrijf/huisstijl om een taalwissel op te baseren). Dood-lopend
// scherm, dus statisch tweetalig i.p.v. een interactieve toggle (Kees'
// keuze, optie A uit NACHT_2026-09-06.md). ⚠️ TR is machinevertaling, nog te
// laten nakijken door een moedertaalspreker.
function OngeldigeLink() {
  return (
    <main className="min-h-screen glass-bg flex items-center justify-center px-4">
      <div className="glass-tile rounded-2xl p-8 max-w-md text-center space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-ink mb-2">Deze link is niet meer geldig</h1>
          <p className="text-sm text-ink/50">De link is verlopen of ingetrokken. Vraag je KAM-coördinator om een nieuwe link.</p>
        </div>
        <div className="pt-4 border-t border-ink/10">
          <p className="text-lg font-semibold text-ink mb-2">Bu bağlantının süresi doldu</p>
          <p className="text-sm text-ink/50">Bağlantının süresi doldu veya iptal edildi. KAM koordinatöründen yeni bir bağlantı iste.</p>
        </div>
      </div>
    </main>
  )
}

export default async function ToolboxGastPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('toolbox_voor_token', { p_token: token })
  if (error || !data) return <OngeldigeLink />

  const raw = data as RawData
  const persoonNaam = typeof raw.persoon?.naam === 'string' ? raw.persoon.naam : null
  const bedrijfNaam = typeof raw.bedrijf === 'string' ? raw.bedrijf : null
  const beschikbareTalen = normaliseerBeschikbareTalen(raw.beschikbare_talen)

  const h = raw.huisstijl
  const publiekeUrl = (pad: unknown): string | null =>
    typeof pad === 'string' && pad ? supabase.storage.from(HUISSTIJL_BUCKET).getPublicUrl(pad).data.publicUrl : null
  const huisstijl: HuisstijlView = h
    ? {
        modus: normaliseerModus(h.modus),
        merkNaam: typeof h.merk_naam === 'string' ? h.merk_naam : null,
        merkLogoUrl: publiekeUrl(h.merk_logo),
        klantLogoUrl: publiekeUrl(h.klant_logo),
        accentKleur: typeof h.accent_kleur === 'string' && h.accent_kleur ? h.accent_kleur : '#FF5200',
        accentKleur2: typeof h.accent_kleur_2 === 'string' && h.accent_kleur_2 ? h.accent_kleur_2 : null,
        accentKleurHighlight: typeof h.accent_kleur_highlight === 'string' && h.accent_kleur_highlight ? h.accent_kleur_highlight : null,
        lettertype: normaliseerLettertype(h.lettertype),
      }
    : VEILIGE_HUISSTIJL

  // Privé-Storage-video's signen (publieke URL's blijven ongewijzigd).
  const toolboxen = await Promise.all(
    ((raw.toolboxen ?? []) as WerknemerToolbox[]).map(async t => ({
      ...t,
      video_url: await resolveVideoUrl(t.video_url),
    })),
  )

  return (
    <ToolboxGastClient
      token={token}
      persoonNaam={persoonNaam}
      bedrijfNaam={bedrijfNaam}
      beschikbareTalen={beschikbareTalen}
      huisstijl={huisstijl}
      initialToolboxen={toolboxen}
    />
  )
}
