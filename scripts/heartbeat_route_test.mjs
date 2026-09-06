// ============================================================================
// Heartbeat-route — end-to-end test van GET (Vercel Cron) en POST (handmatig)
// ----------------------------------------------------------------------------
// De RPC-test (heartbeat_rpc_test.mjs) bewijst herinner_kandidaten zelf. Dit
// script bewijst de HTTP-laag eromheen, tegen een DRAAIENDE app:
//   1. GET zonder Authorization-header       -> 401, niets gedraaid
//   2. GET met een FOUTE Bearer               -> 401
//   3. GET met de JUISTE Bearer (CRON_SECRET) -> 200, draait de heartbeat
//   4. Elk verwerkt bedrijf krijgt een audit_log-regel (actie
//      'automatische_herinnering') — dit is de "niet stil weggeslikt"-eis:
//      een falende/stilgevallen heartbeat moet een queryable spoor achterlaten,
//      niet alleen console-logs die hier niet inzichtbaar zijn.
//   5. POST (het bestaande handmatige/curl-pad) blijft werken met het EIGEN
//      x-heartbeat-secret-geheim, los van CRON_SECRET.
//   6. POST zonder/met foute x-heartbeat-secret -> 401.
//
// Vereist HEARTBEAT_SECRET + CRON_SECRET in .env.local (lokale dev-geheimen,
// GEEN productiewaarden — die zet Kees apart in Vercel). Ontbreken ze, dan
// slaat dit script netjes over (net als de AI-tests zonder sleutel).
//
// Draaien (twee terminals):
//   1) npm run dev
//   2) node --use-system-ca scripts/heartbeat_route_test.mjs
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = env.CRON_SECRET
const HEARTBEAT_SECRET = env.HEARTBEAT_SECRET
const BASIS = (env.AI_TEST_BASIS || 'http://localhost:3000').replace(/\/$/, '')

if (!CRON_SECRET || !HEARTBEAT_SECRET) {
  console.log('— CRON_SECRET/HEARTBEAT_SECRET ontbreken in .env.local; route-test overgeslagen.')
  process.exit(0)
}
if (!URL || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local')
  process.exit(2)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function appDraait() {
  try { await fetch(`${BASIS}/login`, { signal: AbortSignal.timeout(4000) }); return true }
  catch { return false }
}

async function run() {
  if (!(await appDraait())) {
    check('dev-server bereikbaar', false, `geen respons op ${BASIS} — hele test overgeslagen`)
    return
  }

  const rGeen = await fetch(`${BASIS}/api/herinneringen/heartbeat`, { method: 'GET' })
  check('GET zonder Authorization-header -> 401', rGeen.status === 401, `status ${rGeen.status}`)

  const rFout = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'GET', headers: { authorization: 'Bearer volledig-fout-geheim' },
  })
  check('GET met foute Bearer -> 401', rFout.status === 401, `status ${rFout.status}`)

  const vlak = new Date().toISOString()
  const rGoed = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'GET', headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const jGoed = await rGoed.json().catch(() => ({}))
  check('GET met juiste Bearer -> 200, ok:true', rGoed.status === 200 && jGoed.ok === true, JSON.stringify(jGoed).slice(0, 200))
  check('GET-antwoord bevat een samenvatting per bedrijf', Array.isArray(jGoed.samenvatting), JSON.stringify(jGoed.samenvatting))

  // Audit-spoor: elk bedrijf uit de samenvatting moet een verse audit_log-regel
  // hebben gekregen (de "niet stil weggeslikt"-eis).
  const { data: logs, error: logErr } = await admin
    .from('audit_log')
    .select('company_id, wanneer, detail')
    .eq('actie', 'automatische_herinnering')
    .gte('wanneer', vlak)
  check('audit_log heeft geen leesfout', !logErr, logErr?.message)
  const gelogdeBedrijven = new Set((logs ?? []).map(l => l.company_id))
  const verwacht = new Set((jGoed.samenvatting ?? []).map(s => s.companyId))
  const alleGelogd = [...verwacht].every(id => gelogdeBedrijven.has(id))
  check('elk verwerkt bedrijf heeft een audit_log-regel voor deze run', alleGelogd,
    `verwacht ${[...verwacht].length}, gevonden ${gelogdeBedrijven.size}`)

  const rPostGeen = await fetch(`${BASIS}/api/herinneringen/heartbeat`, { method: 'POST' })
  check('POST zonder x-heartbeat-secret -> 401', rPostGeen.status === 401, `status ${rPostGeen.status}`)

  const rPostFout = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'POST', headers: { 'x-heartbeat-secret': 'fout' },
  })
  check('POST met fout x-heartbeat-secret -> 401', rPostFout.status === 401, `status ${rPostFout.status}`)

  const rPostGoed = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'POST', headers: { 'x-heartbeat-secret': HEARTBEAT_SECRET },
  })
  const jPostGoed = await rPostGoed.json().catch(() => ({}))
  check('POST met juist x-heartbeat-secret -> 200, ok:true (handmatig pad blijft werken)',
    rPostGoed.status === 200 && jPostGoed.ok === true, JSON.stringify(jPostGoed).slice(0, 200))

  // CRON_SECRET en HEARTBEAT_SECRET moeten losse geheimen zijn — het ene mag
  // het andere pad niet kunnen openen.
  const rKruisGet = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'GET', headers: { authorization: `Bearer ${HEARTBEAT_SECRET}` },
  })
  check('GET met HEARTBEAT_SECRET i.p.v. CRON_SECRET -> alsnog 401 (geen kruisbestuiving)',
    rKruisGet.status === 401, `status ${rKruisGet.status}`)
  const rKruisPost = await fetch(`${BASIS}/api/herinneringen/heartbeat`, {
    method: 'POST', headers: { 'x-heartbeat-secret': CRON_SECRET },
  })
  check('POST met CRON_SECRET i.p.v. HEARTBEAT_SECRET -> alsnog 401 (geen kruisbestuiving)',
    rKruisPost.status === 401, `status ${rKruisPost.status}`)
}

run()
  .catch(e => { console.error('ONVERWACHTE FOUT:', e.message); process.exitCode = 1 })
  .finally(() => {
    const mislukt = results.filter(r => !r.ok)
    console.log('\n' + '─'.repeat(60))
    console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
    if (mislukt.length) process.exitCode = 1
  })
