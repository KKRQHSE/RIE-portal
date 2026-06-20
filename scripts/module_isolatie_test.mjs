// ============================================================================
// Module-zelfbeheer — negatieve isolatie-tests (bewijs)
// ----------------------------------------------------------------------------
// Toont aan dat de bedrijfsisolatie van de modulelaag houdt: een ingelogde
// beheerder van bedrijf A kan GEEN module-toestand van bedrijf B zien (0 rijen via
// RLS op bedrijf_modules / module_historie) of muteren (de SECURITY DEFINER-RPC's
// module_activeren / module_gebruik_zetten / module_stopzetten weigeren via
// mag_bedrijf_beheren).
//
// Draaien:   node scripts/module_isolatie_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om testbedrijven + auth-users
// aan te maken en achteraf op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit over (exit 0).
//
// Alles met prefix MODTEST_ wordt in een finally-blok opgeruimd — óók bij een
// fout. Er wordt geen echte mail verstuurd (auth-users via de admin-API met
// email_confirm). De RPC's draaien hier puur tegen testbedrijven.
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
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local.')
  console.log('  De module-isolatie-test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Modtest!' + TS
const MODULE = 'inspectie'

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies')
    .insert({ name: `MODTEST_${label}_${TS}` })
    .select('id')
    .single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)

  // Een actieve inspectiemodule (service role omzeilt RLS).
  const { error: e1 } = await admin.from('bedrijf_modules').insert({
    company_id: comp.id,
    module: MODULE,
    actief: true,
    module_status: 'actief',
    geactiveerd_op: new Date().toISOString(),
  })
  if (e1) throw new Error(`bedrijf_modules insert (${label}): ${e1.message}`)

  return { companyId: comp.id }
}

async function maakGebruiker(label, companyId) {
  const email = `modtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)

  const { error: e } = await admin
    .from('users')
    .upsert({ id, email, role: 'client', company_id: companyId, naam: `MODTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function statusVan(companyId) {
  const { data } = await admin
    .from('bedrijf_modules')
    .select('actief, module_status')
    .eq('company_id', companyId)
    .eq('module', MODULE)
    .single()
  return data
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', A.companyId)
  await maakGebruiker('B', B.companyId) // bewijst dat B een geldige beheerder heeft

  // --- Positieve controle: A ziet zijn EIGEN modulerij ---
  {
    const { data, error } = await clientA
      .from('bedrijf_modules').select('module').eq('company_id', A.companyId)
    check('A ziet eigen module (positieve controle)', !error && (data?.length ?? 0) === 1)
  }

  // --- Lezen: A mag NIETS van B zien ---
  {
    const { data, error } = await clientA
      .from('bedrijf_modules').select('module').eq('company_id', B.companyId)
    check('A ziet module-toestand van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data, error } = await clientA
      .from('module_historie').select('id').eq('company_id', B.companyId)
    check('A ziet modulehistorie van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // --- Muteren: A's RPC-aanroepen op B's company_id moeten WEIGEREN ---
  {
    const { error } = await clientA.rpc('module_stopzetten', { p_company_id: B.companyId, p_module: MODULE })
    check('A kan module van B niet stopzetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('module_gebruik_zetten', { p_company_id: B.companyId, p_module: MODULE, p_aan: false })
    check('A kan gebruik van B niet uitzetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('module_activeren', { p_company_id: B.companyId, p_module: 'audit' })
    check('A kan bij B geen nieuwe module activeren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Defensieve dubbelcheck: B's module is ongewijzigd na alle aanvallen ---
  {
    const s = await statusVan(B.companyId)
    check('B-module bleef actief + aan na aanvallen van A',
      !!s && s.module_status === 'actief' && s.actief === true,
      s ? `status=${s.module_status}, actief=${s.actief}` : 'geen rij')
  }
  {
    const { data } = await admin.from('bedrijf_modules').select('module').eq('company_id', B.companyId).eq('module', 'audit')
    check('A heeft bij B geen audit-module aangemaakt', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['module_historie', 'bedrijf_modules', 'personen']) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
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
    console.log('\nOpgeruimd: alle MODTEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
