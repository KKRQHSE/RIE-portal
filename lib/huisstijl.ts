// Client-veilige huisstijl-helpers (geen server-imports — mag in client components).
import type { CSSProperties } from 'react'

export type HuisstijlModus = 'default' | 'co_branding' | 'white_label'
export type Lettertype = 'grotesk' | 'modern' | 'klassiek' | 'zakelijk'

// Effectieve, kant-en-klare huisstijl voor de UI: logo's al als publieke URL.
export type HuisstijlView = {
  modus: HuisstijlModus
  merkNaam: string | null
  merkLogoUrl: string | null
  klantLogoUrl: string | null
  accentKleur: string
  // Optioneel: secundaire/rustige tint (gaugetrack, knop-hover) en een
  // sprekend "vleugje" voor spaarzame badges. null = geen instelling — de UI
  // valt dan terug op resp. de ink-tint en de gewone accentkleur (huidig
  // gedrag, geen bedrijf zonder deze velden ziet iets anders).
  accentKleur2: string | null
  accentKleurHighlight: string | null
  lettertype: Lettertype
}

// VEILIGE STANDAARD — niet te onderscheiden van het huidige gedrag:
// QHSE-merklogo (terugval /logo.jpg), oranje accent, grotesk-lettertype.
export const VEILIGE_HUISSTIJL: HuisstijlView = {
  modus: 'default',
  merkNaam: 'QHSE Totaal',
  merkLogoUrl: null,
  klantLogoUrl: null,
  accentKleur: '#FF5200',
  accentKleur2: null,
  accentKleurHighlight: null,
  lettertype: 'grotesk',
}

// Sleutels → CSS-variabelen van de in de layout geladen fonts.
export const FONT_FAMILIES: Record<Lettertype, string> = {
  grotesk:  'var(--font-hanken)',
  modern:   'var(--font-inter)',
  klassiek: 'var(--font-source-serif)',
  zakelijk: 'var(--font-ibm-plex)',
}

export function normaliseerLettertype(v: unknown): Lettertype {
  return v === 'modern' || v === 'klassiek' || v === 'zakelijk' ? v : 'grotesk'
}

export function normaliseerModus(v: unknown): HuisstijlModus {
  return v === 'co_branding' || v === 'white_label' ? v : 'default'
}

// Zet de accentkleur (als CSS-variabele die de Tailwind accent-utilities volgen)
// en het lettertype op de hoofdcontainer. --color-accent-2/-highlight worden
// bewust ALLEEN gezet als er een waarde is: ontbreken ze, dan grijpt de
// geneste var()-fallback op de gebruiksplek (Gauge, .btn-dark, NotificatieBel)
// in — dat is exact het huidige gedrag, ongewijzigd voor elk ander bedrijf.
export function huisstijlStyle(h: HuisstijlView): CSSProperties {
  const style: Record<string, string> = {
    '--color-accent': h.accentKleur || '#FF5200',
  }
  if (h.accentKleur2) style['--color-accent-2'] = h.accentKleur2
  if (h.accentKleurHighlight) style['--color-accent-highlight'] = h.accentKleurHighlight
  return {
    ...style,
    fontFamily: FONT_FAMILIES[h.lettertype] ?? FONT_FAMILIES.grotesk,
  } as CSSProperties
}
