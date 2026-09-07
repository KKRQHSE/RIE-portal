import type { Vraag } from './types'

// Zuivere filterfunctie voor de locatiefilter in de RI&E-inzage (Fase 2,
// migratie 0080). 'alle' = geen filter (huidig gedrag, het enige pad bij een
// bedrijf zonder locaties). Bij een gekozen locatie blijven organisatiebrede
// vragen (locatie_id null) altijd zichtbaar; alleen vragen van ANDERE
// locaties vallen weg.
export function filterVragenOpLocatie(vragen: Vraag[], locatieFilter: string): Vraag[] {
  if (locatieFilter === 'alle') return vragen
  return vragen.filter(v => v.locatie_id == null || v.locatie_id === locatieFilter)
}
