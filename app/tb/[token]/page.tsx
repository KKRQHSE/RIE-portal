import { createClient } from '@/lib/supabase/server'
import ToolboxGastClient from '@/components/ToolboxGastClient'
import {
  VEILIGE_HUISSTIJL,
  normaliseerLettertype,
  normaliseerModus,
  type HuisstijlView,
} from '@/lib/huisstijl'
import type { WerknemerToolbox } from '@/lib/types'

const HUISSTIJL_BUCKET = 'merk-assets'

type RawData = {
  persoon?: { id?: string; naam?: string | null } | null
  bedrijf?: string | null
  huisstijl?: Record<string, unknown> | null
  toolboxen?: WerknemerToolbox[] | null
}

function OngeldigeLink() {
  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
        <h1 className="text-lg font-semibold text-ink mb-2">Deze link is niet meer geldig</h1>
        <p className="text-sm text-ink/50">De link is verlopen of ingetrokken. Vraag je KAM-coördinator om een nieuwe link.</p>
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
        lettertype: normaliseerLettertype(h.lettertype),
      }
    : VEILIGE_HUISSTIJL

  return (
    <ToolboxGastClient
      token={token}
      persoonNaam={persoonNaam}
      bedrijfNaam={bedrijfNaam}
      huisstijl={huisstijl}
      initialToolboxen={(raw.toolboxen ?? []) as WerknemerToolbox[]}
    />
  )
}
