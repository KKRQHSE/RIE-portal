import type { Vraag } from './types'

// Zuivere filterfunctie voor de locatiefilter in de RI&E-inzage. 'alle' = geen
// filter (het enige pad bij een bedrijf zonder locaties): toont alles, ook
// organisatiebrede vragen. Bij een gekozen locatie springt de weergave naar
// UITSLUITEND de vragen van díe locatie -- organisatiebrede vragen en vragen
// van andere locaties vallen dan allebei weg (op Kees' expliciete verzoek,
// 24 sept 2026 -- zelfde gedrag als de bestaande locatiefilter op /pva).
export function filterVragenOpLocatie(vragen: Vraag[], locatieFilter: string): Vraag[] {
  if (locatieFilter === 'alle') return vragen
  return vragen.filter(v => v.locatie_id === locatieFilter)
}
