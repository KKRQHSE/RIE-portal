import type { Vraag } from './types'

// Filterstanden op de RI&E-pagina. 'NietAantoonbaar' is een eigen soort
// aandachtspunt: het antwoord is Ja, maar de adviseur kon het niet aantoonbaar
// maken. Dat staat los van de Nee-antwoorden en heeft dus een eigen filter.
export type RieFilter = 'Alle' | 'Nee' | 'NietAantoonbaar'

// Aantoonbaarheid is alleen betekenisvol bij een Ja-antwoord (zie migratie
// 0049, die dat ook in import_rie_content afdwingt). De antwoordcheck staat
// hier bewust nog een keer, zodat afwijkende of oudere data geen badge oplevert.
export function isNietAantoonbaar(v: Vraag): boolean {
  return v.antwoord === 'Ja' && v.aantoonbaar === 'Nee'
}
