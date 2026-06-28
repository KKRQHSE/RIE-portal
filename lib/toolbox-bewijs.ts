// Gedeelde teksten voor de toolbox-export (bewijsstuk + bedrijfsoverzicht).
// Eerlijke, neutrale formulering: het digitale bewijs is een aantoonbare
// digitale bevestiging — NIET als "gekwalificeerde handtekening" of
// "juridisch onaantastbaar" verkopen.
import type { ToolboxBewijssoort } from '@/lib/types'

export const BEWIJSSOORT_ZIN: Record<ToolboxBewijssoort, string> = {
  digitaal: 'Digitaal gevolgd; eigen naam bevestigd en eigen handtekening gezet.',
  fysiek_aanwezig:
    'Aanwezigheid geregistreerd door de toolbox-houder; geen eigen handtekening van de deelnemer.',
}

// Korte labels voor de overzichtskolom/CSV.
export const BEWIJSSOORT_LABEL: Record<ToolboxBewijssoort, string> = {
  digitaal: 'Digitaal (eigen handtekening)',
  fysiek_aanwezig: 'Aanwezigheidsregistratie',
}

export const VERANTWOORDING =
  'Gegenereerd uit het onveranderlijke deelname-record; geeft de inhoud weer zoals die op ' +
  'het moment van afronden gold. Het betreft een aantoonbare digitale bevestiging door de ' +
  'deelnemer — geen gekwalificeerde elektronische handtekening.'

export function datumTijdNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
