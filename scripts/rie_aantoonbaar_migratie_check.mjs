// Fase A-controle bij migratie 0049 (aantoonbaar op vragen).
//
// Doel: bewijzen dat de migratie niets aan de bestaande data verandert. Draai
// hem VOOR de migratie om een basislijn vast te leggen, en NA de migratie om te
// vergelijken. Per bedrijf wordt een md5 over alle bestaande kolommen van
// vragen en pva_items berekend (rij voor rij, in vaste volgorde), plus de
// rijaantallen. De nieuwe kolommen zitten bewust NIET in de checksum — die
// horen juist te veranderen (van "bestaat niet" naar "NULL").
//
// Gebruik:
//   node scripts/rie_aantoonbaar_migratie_check.mjs --basislijn
//   node scripts/rie_aantoonbaar_migratie_check.mjs --vergelijk
//
// De basislijn gaat naar scripts/.rie_aantoonbaar_basislijn.json (gitignored
// noch nodig in de repo; alleen een lokaal werkbestand).
import pg from 'pg'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASISLIJN = join(HERE, '.rie_aantoonbaar_basislijn.json')

function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* valt terug op process.env */ }
  return { ...env, ...process.env }
}

const args = process.argv.slice(2)
const modus = args.includes('--basislijn') ? 'basislijn'
            : args.includes('--vergelijk') ? 'vergelijk'
            : null
if (!modus) {
  // Bewust exitcode 0 en geen 2: dit is geen test maar een migratiehulp, en hij
  // hoort niet als FAIL op te duiken in een testronde die alle scripts langsgaat.
  // Zonder vlag is er simpelweg niets te doen.
  console.log('Migratiehulp bij 0049 (aantoonbaar op vragen) — geen test.')
  console.log('')
  console.log('  --basislijn   vastleggen VOOR de migratie')
  console.log('  --vergelijk   controleren NA de migratie')
  console.log('')
  console.log('Zonder vlag valt er niets te doen; dit is geen fout.')
  process.exit(0)
}

const env = loadEnv()
if (!env.DATABASE_URL) { console.error('DATABASE_URL ontbreekt in .env.local'); process.exit(2) }

// Alle kolommen die vóór 0049 al bestonden. Expliciet opgesomd i.p.v. `*`,
// zodat de nieuwe kolommen de checksum niet vervuilen en een onverwachte
// schemawijziging (verdwenen kolom) hard opvalt.
const VRAGEN_KOLOMMEN = [
  'id', 'company_id', 'module_id', 'nr', 'vraag', 'antwoord', 'bevinding',
  'brf', 'klasse', 'pva', 'volgorde', 'archived_at', 'created_at',
  'updated_at', 'updated_by', 'rie_versie_id',
]
const PVA_KOLOMMEN = [
  'id', 'company_id', 'nr', 'onderwerp', 'maatregel', 'tree', 'ref', 'prio',
  'termijn', 'verantw', 'status', 'opm', 'updated_at', 'updated_by',
  'persoon_id', 'concept_status', 'concept_opm', 'concept_at',
  'vrijgegeven_op', 'vrijgegeven_door', 'vrijgave_opmerking', 'vrijgave_bewijs',
  'rie_versie_id', 'bron_type', 'bron_id', 'termijn_datum',
]

// md5 over de geconcateneerde, geordende rijen. coalesce naar een teken dat
// niet in de data voorkomt, zodat NULL en lege tekst niet samenvallen.
const rijHash = (kolommen) =>
  kolommen.map(k => `coalesce(${k}::text, '\\x00')`).join(" || '\\x1f' || ")

const SQL = `
select
  c.name as bedrijf,
  (select count(*) from vragen v where v.company_id = c.id)     as vragen_rijen,
  (select count(*) from pva_items p where p.company_id = c.id)  as pva_rijen,
  (select md5(string_agg(h, '\\x1e' order by h))
     from (select ${rijHash(VRAGEN_KOLOMMEN)} as h
             from vragen v where v.company_id = c.id) s)        as vragen_md5,
  (select md5(string_agg(h, '\\x1e' order by h))
     from (select ${rijHash(PVA_KOLOMMEN)} as h
             from pva_items p where p.company_id = c.id) s)     as pva_md5
from companies c
order by c.name;
`

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
let uitkomst = 0
try {
  await client.connect()
  const { rows } = await client.query(SQL)

  if (modus === 'basislijn') {
    writeFileSync(BASISLIJN, JSON.stringify(rows, null, 2), 'utf8')
    console.table(rows.map(r => ({ bedrijf: r.bedrijf, vragen: r.vragen_rijen, pva: r.pva_rijen })))
    console.log(`\nBasislijn vastgelegd voor ${rows.length} bedrijven -> ${BASISLIJN}`)
    console.log('Draai de migratie en daarna: node scripts/rie_aantoonbaar_migratie_check.mjs --vergelijk')
  } else {
    if (!existsSync(BASISLIJN)) {
      console.error(`Geen basislijn gevonden (${BASISLIJN}). Draai eerst --basislijn, vóór de migratie.`)
      process.exit(2)
    }
    const voor = JSON.parse(readFileSync(BASISLIJN, 'utf8'))
    const perNaam = new Map(voor.map(r => [r.bedrijf, r]))
    let fouten = 0

    for (const na of rows) {
      const v = perNaam.get(na.bedrijf)
      if (!v) { console.log(`~  ${na.bedrijf}: nieuw bedrijf sinds de basislijn — overgeslagen`); continue }
      perNaam.delete(na.bedrijf)
      const verschillen = []
      for (const k of ['vragen_rijen', 'pva_rijen', 'vragen_md5', 'pva_md5']) {
        if (String(v[k]) !== String(na[k])) verschillen.push(`${k}: ${v[k]} -> ${na[k]}`)
      }
      if (verschillen.length) {
        fouten++
        console.log(`FOUT  ${na.bedrijf}: ${verschillen.join(', ')}`)
      } else {
        console.log(`OK    ${na.bedrijf}: ${na.vragen_rijen} vragen, ${na.pva_rijen} pva-acties ongewijzigd`)
      }
    }
    for (const rest of perNaam.keys()) {
      fouten++
      console.log(`FOUT  ${rest}: stond in de basislijn maar is nu weg`)
    }

    // De nieuwe kolommen horen te bestaan en overal NULL te zijn.
    const { rows: nieuw } = await client.query(`
      select count(*) filter (where aantoonbaar is not null)             as gevuld,
             count(*) filter (where aantoonbaar_toelichting is not null) as toelichting_gevuld,
             count(*)                                                    as totaal
        from vragen`)
    const n = nieuw[0]
    if (Number(n.gevuld) === 0 && Number(n.toelichting_gevuld) === 0) {
      console.log(`OK    nieuwe kolommen aanwezig en overal NULL (${n.totaal} vragen)`)
    } else {
      fouten++
      console.log(`FOUT  nieuwe kolommen niet leeg: ${n.gevuld} aantoonbaar, ${n.toelichting_gevuld} toelichting`)
    }

    console.log(fouten === 0 ? '\nGROEN — migratie heeft de bestaande data niet geraakt.' : `\nROOD — ${fouten} afwijking(en).`)
    uitkomst = fouten === 0 ? 0 : 1
  }
} catch (e) {
  console.error('SQL-FOUT:', e.message)
  if (e.code) console.error('code:', e.code)
  uitkomst = 1
} finally {
  await client.end()
}
process.exit(uitkomst)
