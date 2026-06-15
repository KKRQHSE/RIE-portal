import { createClient } from '@/lib/supabase/server'
import GastClient, { type GastActie } from '@/components/GastClient'

// Ruwe vorm van deellink_data(token) -> jsonb {persoon, bedrijf, acties[]}.
type RawData = {
  persoon?: { naam?: string | null } | null
  bedrijf?: { naam?: string | null; name?: string | null } | null
  acties?: Array<Record<string, unknown>> | null
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
    />
  )
}
