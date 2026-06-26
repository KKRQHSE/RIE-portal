// ============================================================================
// Managementdashboard — test van de lees-RPC's met een ECHTE ingelogde KAM-sessie.
// ----------------------------------------------------------------------------
// Dekt drie dingen die ertoe doen:
//   1. CORRECTHEID  — dashboard_overzicht(eigen bedrijf) telt precies wat we
//      vooraf inzetten (totaal/afgerond/pct, te beoordelen, prioriteit, over termijn).
//   2. ISOLATIE     — dashboard_overzicht(ANDER bedrijf) wordt geweigerd.
//   3. AUTORISATIE  — dashboard_admin_overzicht() wordt voor een niet-admin geweigerd.
//
// Draait op twee wegwerp-testbedrijven (prefix DASHTEST_) die in een finally-blok
// volledig worden opgeruimd, ook bij fouten. Vereist NEXT_PUBLIC_SUPABASE_URL +
// ANON_KEY + SUPABASE_SERVICE_ROLE_KEY in .env.local.
// ============================================================================

// TLS: op dit netwerk zit een onderscheppende proxy (UNABLE_TO_VERIFY_LEAF_SIGNATURE),
// waardoor de strikte cert-verificatie van Node's fetch faalt. Draai dit script daarom
// met de Windows-certstore i.p.v. de onveilige globale bypass:
//   node --use-system-ca scripts/dashboard_test.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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
  } catch { /* */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / ANON / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local')
  process.exit(2)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Dashtest!' + TS

let companyA = null
let companyB = null
let userId = null
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function run() {
  // --- opzet via service role: twee bedrijven, bekende PvA-acties in bedrijf A ---
  const { data: cA, error: eA } = await admin.from('companies').insert({ name: `DASHTEST_A_${TS}` }).select('id').single()
  if (eA) throw new Error('companies A insert: ' + eA.message)
  companyA = cA.id
  const { data: cB, error: eB } = await admin.from('companies').insert({ name: `DASHTEST_B_${TS}` }).select('id').single()
  if (eB) throw new Error('companies B insert: ' + eB.message)
  companyB = cB.id

  // Bekende staat in A: 4 acties.
  //  nr1 Afgerond | nr2 Open+concept (te beoordelen) Hoog | nr3 Open over de termijn Middel | nr4 In behandeling Laag
  const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const { error: ei } = await admin.from('pva_items').insert([
    { company_id: companyA, nr: '1', prio: 'Hoog',   status: 'Afgerond' },
    { company_id: companyA, nr: '2', prio: 'Hoog',   status: 'Open',           concept_status: 'voorstel_afgerond' },
    { company_id: companyA, nr: '3', prio: 'Middel', status: 'Open',           termijn: 'Q1 2026', termijn_datum: gisteren },
    { company_id: companyA, nr: '4', prio: 'Laag',   status: 'In behandeling' },
  ])
  if (ei) throw new Error('pva_items insert: ' + ei.message)

  // KAM-gebruiker, gekoppeld aan bedrijf A.
  const email = `dashtest_${TS}@example.test`
  const { data: created, error: eu } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (eu) throw new Error('createUser: ' + eu.message)
  userId = created.user.id
  const { error: eup } = await admin.from('users').upsert({ id: userId, email, role: 'client', company_id: companyA, naam: 'Dash KAM' })
  if (eup) throw new Error('users upsert: ' + eup.message)

  // --- ingelogde KAM-sessie ---
  const kam = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: esi } = await kam.auth.signInWithPassword({ email, password: PW })
  if (esi) throw new Error('signIn: ' + esi.message)

  // 1. CORRECTHEID — dashboard_overzicht voor eigen bedrijf.
  const r = await kam.rpc('dashboard_overzicht', { p_company_id: companyA })
  check('dashboard_overzicht eigen bedrijf: geen fout', !r.error && !!r.data, r.error?.message)
  const d = r.data ?? {}
  const pva = d.pva ?? {}
  check('PvA-totalen kloppen (4 totaal, 1 afgerond, 25%)',
    pva.totaal === 4 && pva.afgerond === 1 && pva.pct === 25,
    `totaal=${pva.totaal} afgerond=${pva.afgerond} pct=${pva.pct}`)
  check('te_beoordelen telt het ingediende voorstel (1)', d.te_beoordelen === 1, `=${d.te_beoordelen}`)
  const po = d.prio_open ?? {}
  check('prioriteit-open klopt (Hoog1/Middel1/Laag1)',
    po.Hoog === 1 && po.Middel === 1 && po.Laag === 1, `H=${po.Hoog} M=${po.Middel} L=${po.Laag}`)
  check('termijn.over telt de overschreden actie (1)', (d.termijn ?? {}).over === 1, `=${(d.termijn ?? {}).over}`)

  // 2. ISOLATIE — zelfde KAM mag het ANDERE bedrijf niet zien.
  const rIso = await kam.rpc('dashboard_overzicht', { p_company_id: companyB })
  check('dashboard_overzicht ander bedrijf: geweigerd', !!rIso.error, rIso.error ? 'geweigerd' : 'GEEN fout!')

  // 3. AUTORISATIE — niet-admin mag de admin-roll-up niet draaien.
  const rAdmin = await kam.rpc('dashboard_admin_overzicht')
  check('dashboard_admin_overzicht als niet-admin: geweigerd', !!rAdmin.error, rAdmin.error ? 'geweigerd' : 'GEEN fout!')
}

async function cleanup() {
  for (const cid of [companyA, companyB]) {
    if (cid) await admin.from('pva_items').delete().eq('company_id', cid)
  }
  if (userId) {
    await admin.from('users').delete().eq('id', userId)
    try { await admin.auth.admin.deleteUser(userId) } catch { /* */ }
  }
  for (const cid of [companyA, companyB]) {
    if (cid) await admin.from('companies').delete().eq('id', cid)
  }
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de test:', e.message)
  exitCode = 1
} finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle DASHTEST_-data en testgebruiker verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
