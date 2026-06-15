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
// en het lettertype op de hoofdcontainer.
export function huisstijlStyle(h: HuisstijlView): CSSProperties {
  return {
    '--color-accent': h.accentKleur || '#FF5200',
    fontFamily: FONT_FAMILIES[h.lettertype] ?? FONT_FAMILIES.grotesk,
  } as CSSProperties
}
