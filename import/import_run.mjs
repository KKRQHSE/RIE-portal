// Roept import_company(jsonb) aan met import/dataset.json als parameter ($1).
// Voegt daarna de rie_versies-rij (versie 1, vrijgegeven, toets_datum) toe en verifieert.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

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

const env = loadEnv()
const conn = env.DATABASE_URL
if (!conn) { console.error('DATABASE_URL ontbreekt'); process.exit(2) }

const dataset = readFileSync(resolve(ROOT, 'import/dataset.json'), 'utf8')
const pvaExtra = JSON.parse(readFileSync(resolve(ROOT, 'import/pva_extra.json'), 'utf8'))
const TOETS_DATUM = '2026-03-06' // revisie 08, jaartal-typefout gecorrigeerd naar 2026 (op verzoek)

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query('begin')

  const imp = await client.query('select public.import_company($1::jsonb) as company_id', [dataset])
  const companyId = imp.rows[0].company_id
  console.log('import_company -> company_id:', companyId)

  // rie_versies-rij (import_company maakt die NIET aan)
  await client.query(
    `insert into public.rie_versies (company_id, versie, status, toets_datum, opmerking)
     values ($1, 1, 'vrijgegeven', $2::date, $3)`,
    [companyId, TOETS_DATUM, 'Ingeladen via import_company uit de RI&E-brondocx; toets_datum = laatste revisie uit het revisie-overzicht.']
  )
  console.log('rie_versies-rij toegevoegd (versie 1, vrijgegeven, toets_datum', TOETS_DATUM + ')')

  // termijn_datum (gereed-datum) + opm (norm) die import_company niet vult
  for (const e of pvaExtra) {
    await client.query(
      `update public.pva_items set termijn_datum = $3::date, opm = $4
       where company_id = $1 and nr = $2`,
      [companyId, e.nr, e.termijn_datum, e.opm]
    )
  }
  console.log(`pva_items bijgewerkt: termijn_datum + opm voor ${pvaExtra.length} acties`)

  await client.query('commit')

  // --- verificatie ---
  const q = async (sql, p = []) => (await client.query(sql, p)).rows
  const [comp] = await q('select id, name, (dataset is not null) as heeft_dataset from companies where id=$1', [companyId])
  const [cnt] = await q(
    `select
       (select count(*) from modules   where company_id=$1) as modules,
       (select count(*) from vragen    where company_id=$1) as vragen,
       (select count(*) from pva_items where company_id=$1) as pva_items,
       (select count(*) from fotos     where company_id=$1) as fotos`, [companyId])
  const rv = await q('select versie, status, toets_datum from rie_versies where company_id=$1', [companyId])
  const antw = await q('select antwoord, count(*)::int as n from vragen where company_id=$1 group by antwoord order by antwoord', [companyId])

  console.log('\n=== VERIFICATIE ===')
  console.log('bedrijf:', comp)
  console.log('tellingen:', cnt)
  console.log('rie_versies:', rv)
  console.log('antwoord-verdeling:', antw)
  console.log('\nCOMPANY_ID=' + companyId)
} catch (e) {
  try { await client.query('rollback') } catch {}
  console.error('FOUT:', e.message)
  if (e.code) console.error('code:', e.code)
  if (e.detail) console.error('detail:', e.detail)
  process.exitCode = 1
} finally {
  await client.end()
}
