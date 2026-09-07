// Zelftest voor lib/rie-locatie-filter.ts (Fase 2, migratie 0080) --
// draaien: node scripts/rie_locatie_filter_selftest.ts (Node 24 strip-types).
// Geen DB nodig: bewijst puur de filterlogica die de RI&E-inzage gebruikt.
//   - 'alle' (default, het enige pad bij een bedrijf zonder locaties) toont
//     alles ongewijzigd.
//   - Een gekozen locatie toont organisatiebrede vragen (locatie_id null) +
//     precies de vragen van die locatie, en NIETS van andere locaties.

import { filterVragenOpLocatie } from '../lib/rie-locatie-filter.ts'
import type { Vraag } from '../lib/types.ts'

const results: { naam: string; ok: boolean }[] = []
function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

function vraag(nr: string, locatie_id: string | null): Vraag {
  return {
    id: nr, company_id: 'c1', module_id: 'm1', nr, vraag: null, antwoord: null,
    bevinding: null, brf: null, klasse: null, pva: null, volgorde: null, locatie_id,
  }
}

const orgbreed1 = vraag('1', null)
const orgbreed2 = vraag('2', null)
const malden = vraag('3', 'loc-malden')
const utrecht = vraag('4', 'loc-utrecht')
const alle = [orgbreed1, orgbreed2, malden, utrecht]

// --- Regressie: bedrijf zonder locaties heeft alleen organisatiebrede vragen
//     (locatie_id overal null) en filtert altijd op 'alle' -- moet alles tonen.
{
  const zonderLocaties = [orgbreed1, orgbreed2]
  const r = filterVragenOpLocatie(zonderLocaties, 'alle')
  check('Bedrijf zonder locaties: alle vragen zichtbaar, ongewijzigd',
    r.length === 2 && r === zonderLocaties, `${r.length} vragen, zelfde referentie: ${r === zonderLocaties}`)
}

// --- 'alle': toont echt alles, ook bij een bedrijf MET locaties ---
{
  const r = filterVragenOpLocatie(alle, 'alle')
  check("'alle' toont elke vraag, ook locatie-specifieke", r.length === 4, `${r.length}/4`)
}

// --- Gekozen locatie: organisatiebreed + die locatie, niets van een andere ---
{
  const r = filterVragenOpLocatie(alle, 'loc-malden')
  const nrs = r.map(v => v.nr).sort()
  check("Locatie 'Malden' gekozen: organisatiebreed (1,2) + Malden (3), Utrecht (4) weg",
    nrs.length === 3 && nrs.join(',') === '1,2,3', nrs.join(','))
}
{
  const r = filterVragenOpLocatie(alle, 'loc-utrecht')
  const nrs = r.map(v => v.nr).sort()
  check("Locatie 'Utrecht' gekozen: organisatiebreed (1,2) + Utrecht (4), Malden (3) weg",
    nrs.length === 3 && nrs.join(',') === '1,2,4', nrs.join(','))
}

// --- Onbekende/gearchiveerde locatie-id: toont alleen organisatiebrede vragen
//     (fail-closed, geen crash, geen per-ongeluk alles tonen) ---
{
  const r = filterVragenOpLocatie(alle, 'loc-bestaat-niet')
  const nrs = r.map(v => v.nr).sort()
  check('Onbekende locatie-id: alleen organisatiebrede vragen, geen crash',
    nrs.join(',') === '1,2', nrs.join(','))
}

// --- Lege lijst blijft leeg, ongeacht filter ---
{
  const r = filterVragenOpLocatie([], 'loc-malden')
  check('Lege vragenlijst blijft leeg', r.length === 0)
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} checks geslaagd.`)
process.exit(falen > 0 ? 1 : 0)
