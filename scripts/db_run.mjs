// Kleine SQL-runner tegen DATABASE_URL uit .env.local (Supabase).
// Gebruik:
//   node scripts/db_run.mjs --query "select 1 as ok"
//   node scripts/db_run.mjs --file db/inspectie_stap1_rpcs.sql
// Met --json worden de rijen als JSON geprint. Secrets worden nooit geprint.
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

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const asJson = args.includes('--json')

const env = loadEnv()
const conn = env.DATABASE_URL
if (!conn) { console.error('DATABASE_URL ontbreekt in .env.local'); process.exit(2) }

let sql
const file = arg('--file')
const query = arg('--query')
if (file) sql = readFileSync(resolve(ROOT, file), 'utf8')
else if (query) sql = query
else { console.error('Geef --file <pad> of --query "<sql>"'); process.exit(2) }

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  const res = await client.query(sql)
  const results = Array.isArray(res) ? res : [res]
  for (const r of results) {
    if (r.command && r.rowCount != null && (!r.rows || r.rows.length === 0)) {
      console.log(`${r.command} (${r.rowCount} rijen)`)
    }
    if (r.rows && r.rows.length) {
      if (asJson) console.log(JSON.stringify(r.rows, null, 2))
      else console.table(r.rows)
    }
  }
  console.log('OK')
} catch (e) {
  console.error('SQL-FOUT:', e.message)
  if (e.code) console.error('code:', e.code)
  process.exitCode = 1
} finally {
  await client.end()
}
