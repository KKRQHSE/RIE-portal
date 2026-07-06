// ============================================================================
// Klant-dashboard — isolatie-tests voor de handmatige bedrijfsvoering-velden
// ----------------------------------------------------------------------------
// Bewijst de bedrijfsisolatie van bedrijf_dashboard_instelling + de RPC
// dashboard_instelling_zetten: een KAM van bedrijf A ziet/muteert NIET de velden
// van bedrijf B, een anonieme bezoeker kan niets lezen of muteren, en een KAM
// mag zijn EIGEN bedrijf wél instellen (positieve controle).
//
// Draaien:   node --use-system-ca scripts/dashboard_isolatie_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om testbedrijven + auth-users
// aan te maken en achteraf op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit over (exit 0). Alles met prefix DASHTEST_ wordt in een
// finally-blok opgeruimd, ook als een test faalt.
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
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch {
    // geen .env.local — valt terug op process.env
  }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken in .env.local.')
  process.exit(1)
}
if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local. Isolatie-tests overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Dashtest!' + TS

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// Alle 10 parameters van dashboard_instelling_zetten, met overschrijfbare waarden.
function zetArgs(companyId, over = {}) {
  return {
    p_company_id: companyId,
    p_klachten_aantal: 1,
    p_tevredenheid_score: 7.5,
    p_tevredenheid_toelichting: 'DASHTEST_toelichting',
    p_audit_intern_gedaan: 1,
    p_audit_intern_totaal: 2,
    p_audit_extern_omschrijving: '11 en 13 maart',
    p_audit_status: 'gepland',
    p_doelstelling_tekst: 'DASHTEST_doel',
    p_iso_taken_tekst: 'DASHTEST_iso',
    ...over,
  }
}

async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies')
    .insert({ name: `DASHTEST_${label}_${TS}` })
    .select('id')
    .single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  return comp.id
}

async function maakGebruiker(label, companyId) {
  const email = `dashtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)

  const { error: e } = await admin
    .from('users')
    .upsert({ id, email, role: 'client', company_id: companyId, naam: `DASHTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const aId = await maakBedrijf('A')
  const bId = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', aId)
  await maakGebruiker('B', bId) // bewijst dat B een geldige KAM is

  // Anonieme bezoeker (geen sessie).
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

  // Seed: bedrijf B heeft al bedrijfsvoering-velden (service role omzeilt RLS).
  {
    const { error } = await admin.from('bedrijf_dashboard_instelling')
      .insert({ company_id: bId, klachten_aantal: 5, audit_status: 'DASHTEST_B_status' })
    if (error) throw new Error(`seed instelling B: ${error.message}`)
  }

  // --- Positieve controle: A zet zijn EIGEN bedrijfsvoering via de RPC ---
  {
    const { error } = await clientA.rpc('dashboard_instelling_zetten', zetArgs(aId))
    check('A zet eigen bedrijfsvoering via RPC (positieve controle)', !error, error ? error.message : 'ok')
  }

  // --- Positieve controle: A ziet zijn EIGEN velden (RLS select) ---
  {
    const { data, error } = await clientA.from('bedrijf_dashboard_instelling')
      .select('klachten_aantal, audit_status').eq('company_id', aId)
    check('A ziet eigen bedrijfsvoering (positieve controle)',
      !error && (data?.length ?? 0) === 1 && data[0].audit_status === 'gepland',
      error ? error.message : `${data?.length ?? '?'} rijen`)
  }

  // --- Lezen: A mag de velden van B NIET zien (0 rijen via RLS) ---
  {
    const { data, error } = await clientA.from('bedrijf_dashboard_instelling')
      .select('klachten_aantal').eq('company_id', bId)
    check('A ziet bedrijfsvoering van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // --- Muteren: A mag de velden van B NIET zetten (mag_bedrijf_beheren weigert) ---
  {
    const { error } = await clientA.rpc('dashboard_instelling_zetten', zetArgs(bId, { p_klachten_aantal: 999 }))
    check('A kan bedrijfsvoering van B niet muteren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Anon: geen muteren (EXECUTE ingetrokken, Beslissing 62) ---
  {
    const { error } = await anon.rpc('dashboard_instelling_zetten', zetArgs(bId, { p_klachten_aantal: 999 }))
    check('Anon kan geen bedrijfsvoering muteren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Anon: geen lezen (RLS geeft 0 rijen) ---
  {
    const { data, error } = await anon.from('bedrijf_dashboard_instelling')
      .select('klachten_aantal').eq('company_id', bId)
    check('Anon ziet geen bedrijfsvoering', (data?.length ?? 0) === 0, error ? 'geweigerd' : `${data?.length ?? 0} rijen`)
  }

  // --- Waardegrens: negatief klachtenaantal geweigerd ---
  {
    const { error } = await clientA.rpc('dashboard_instelling_zetten', zetArgs(aId, { p_klachten_aantal: -1 }))
    check('A kan geen negatief klachtenaantal zetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Defensieve dubbelcheck: B's velden zijn niet gewijzigd door A/anon ---
  {
    const { data } = await admin.from('bedrijf_dashboard_instelling')
      .select('klachten_aantal, audit_status').eq('company_id', bId).single()
    check('B-bedrijfsvoering bleef ongewijzigd na aanvallen',
      !!data && data.klachten_aantal === 5 && data.audit_status === 'DASHTEST_B_status')
  }
}

async function cleanup() {
  if (companyIds.length) {
    await admin.from('bedrijf_dashboard_instelling').delete().in('company_id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) {
      try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ }
    }
  }
  if (companyIds.length) {
    await admin.from('companies').delete().in('id', companyIds)
  }
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de testopzet:', e.message)
  exitCode = 1
} finally {
  try {
    await cleanup()
    console.log('\nOpgeruimd: alle DASHTEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
