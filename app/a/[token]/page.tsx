import { createClient } from '@/lib/supabase/server'
import GastClient, { type GastActie } from '@/components/GastClient'
import {
  VEILIGE_HUISSTIJL,
  normaliseerLettertype,
  normaliseerModus,
  type HuisstijlView,
} from '@/lib/huisstijl'

// Zelfde bucket als de ingelogde kant (lib/huisstijl-data.ts).
const HUISSTIJL_BUCKET = 'merk-assets'

// Ruwe vorm van deellink_data(token) -> jsonb {persoon, bedrijf, acties[], huisstijl}.
type RawData = {
  persoon?: { naam?: string | null } | null
  bedrijf?: { naam?: string | null; name?: string | null } | null
  acties?: Array<Record<string, unknown>> | null
  huisstijl?: Record<string, unknown> | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : v == null ? null : String(v)
}

function OngeldigeLink() {
  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
        <h1 className="text-lg font-semibold text-ink mb-2">Deze link is niet meer geldig</h1>
        <p className="text-sm text-ink/50">
          De deellink is verlopen of ingetrokken. Vraag je KAM-coördinator om een nieuwe link.
        </p>
      </div>
    </main>
  )
}

export default async function GastPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // Gast gebruikt UITSLUITEND deze RPC; nooit directe tabel-queries.
  const { data, error } = await supabase.rpc('deellink_data', { p_token: token })
  if (error || !data) return <OngeldigeLink />

  const raw = data as RawData
  const persoonNaam = str(raw.persoon?.naam)
  const bedrijfNaam = str(raw.bedrijf?.naam) ?? str(raw.bedrijf?.name)

  // Huisstijl-paden (storage) -> publieke URL's, net als lib/huisstijl-data.ts.
  // Ontbreekt de huisstijl of is hij 'default'/leeg → veilige standaard (geen regressie).
  const h = raw.huisstijl
  const publiekeUrl = (pad: unknown): string | null =>
    typeof pad === 'string' && pad
      ? supabase.storage.from(HUISSTIJL_BUCKET).getPublicUrl(pad).data.publicUrl
      : null

  const huisstijl: HuisstijlView = h
    ? {
        modus: normaliseerModus(h.modus),
        merkNaam: typeof h.merk_naam === 'string' ? h.merk_naam : null,
        merkLogoUrl: publiekeUrl(h.merk_logo),
        klantLogoUrl: publiekeUrl(h.klant_logo),
        accentKleur:
          typeof h.accent_kleur === 'string' && h.accent_kleur ? h.accent_kleur : '#FF5200',
        lettertype: normaliseerLettertype(h.lettertype),
      }
    : VEILIGE_HUISSTIJL

  const acties: GastActie[] = (raw.acties ?? []).map(a => ({
    id: String(a.id),
    nr: str(a.nr),
    onderwerp: str(a.onderwerp),
    prio: str(a.prio),
    termijn: str(a.termijn),
    status: str(a.status),
    concept_status: str(a.concept_status),
    concept_opm: str(a.concept_opm),
  }))

  return (
    <GastClient
      token={token}
      persoonNaam={persoonNaam}
      bedrijfNaam={bedrijfNaam}
      acties={acties}
      huisstijl={huisstijl}
    />
  )
}
