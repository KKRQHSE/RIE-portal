// ============================================================================
// Werkplekinspectie — STAP 3: negatieve isolatie-tests (bewijs)
// ----------------------------------------------------------------------------
// Toont aan dat de bedrijfsisolatie van de inspectie-module houdt: een ingelogde
// gebruiker van bedrijf A kan GEEN sjabloon/inspectie/bevinding van bedrijf B
// zien (0 rijen via RLS) of muteren (de SECURITY DEFINER-RPC's weigeren via
// mag_bedrijf_beheren).
//
// Draaien:   node scripts/inspectie_isolatie_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om testbedrijven + auth-users
// aan te maken en achteraf op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit deel over (exit 0).
//
// Alles wat het script aanmaakt heeft de prefix INSPTEST_ en wordt in een
// finally-blok opgeruimd — óók als een test faalt of een fout optreedt. Er wordt
// geen echte mail verstuurd (auth-users worden direct via de admin-API met
// email_confirm aangemaakt).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// --- Mini .env.local-parser (geen extra dependency) ---
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
  console.log('  DEEL 3 (isolatie-tests) wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Insptest!' + TS

// Verzamel wat we aanmaken, zodat de cleanup altijd kan opruimen.
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
    .insert({ name: `INSPTEST_${label}_${TS}` })
    .select('id')
    .single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)

  // Module aanzetten (realistische setup; wordt opgeruimd).
  await admin.from('bedrijf_modules').insert({ company_id: comp.id, module: 'inspectie', actief: true })

  // Sjabloon + punt + inspectie + bevinding rechtstreeks (service role omzeilt RLS).
  const { data: sjab, error: e1 } = await admin
    .from('inspectie_sjabloon')
    .insert({ company_id: comp.id, naam: `INSPTEST_sjabloon_${label}`, controlesoort: 'rondgang', actief: true })
    .select('id')
    .single()
  if (e1) throw new Error(`sjabloon insert (${label}): ${e1.message}`)

  const { error: e2 } = await admin
    .from('inspectie_sjabloon_punt')
    .insert({ company_id: comp.id, sjabloon_id: sjab.id, volgorde: 1, tekst: 'Nooduitgang vrij?', verplicht: true })
  if (e2) throw new Error(`punt insert (${label}): ${e2.message}`)

  const { data: insp, error: e3 } = await admin
    .from('inspectie')
    .insert({ company_id: comp.id, sjabloon_id: sjab.id, status: 'concept', sjabloon_naam_snap: `INSPTEST_sjabloon_${label}`, controlesoort_snap: 'rondgang' })
    .select('id')
    .single()
  if (e3) throw new Error(`inspectie insert (${label}): ${e3.message}`)

  // resultaat is NOT NULL in het echte schema; een geldige (in_orde, geen)-bevinding
  // voldoet aan alle CHECK-constraints en volstaat voor de isolatieproef.
  const { data: bev, error: e4 } = await admin
    .from('inspectie_bevinding')
    .insert({ company_id: comp.id, inspectie_id: insp.id, punt_tekst_snap: 'Nooduitgang vrij?', resultaat: 'in_orde', afhandeling: 'geen' })
    .select('id')
    .single()
  if (e4) throw new Error(`bevinding insert (${label}): ${e4.message}`)

  return { companyId: comp.id, sjabloonId: sjab.id, inspectieId: insp.id, bevindingId: bev.id }
}

async function maakGebruiker(label, companyId) {
  const email = `insptest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)

  // Profielrij: client van dit bedrijf (zo werkt mag_bedrijf_beheren).
  const { error: e } = await admin
    .from('users')
    .upsert({ id, email, role: 'client', company_id: companyId, naam: `INSPTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  // Ingelogde client (eigen sessie-instance).
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', A.companyId)
  await maakGebruiker('B', B.companyId) // bewijst dat B echt een geldige user is

  // --- Positieve controle: A ziet zijn EIGEN sjabloon wel ---
  {
    const { data, error } = await clientA.from('inspectie_sjabloon').select('id').eq('id', A.sjabloonId)
    check('A ziet eigen sjabloon (positieve controle)', !error && (data?.length ?? 0) === 1)
  }

  // --- Lezen: A mag NIETS van B zien (0 rijen via RLS) ---
  {
    const { data, error } = await clientA.from('inspectie_sjabloon').select('id').eq('id', B.sjabloonId)
    check('A ziet sjabloon van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data, error } = await clientA.from('inspectie').select('id').eq('id', B.inspectieId)
    check('A ziet inspectie van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data, error } = await clientA.from('inspectie_bevinding').select('id').eq('id', B.bevindingId)
    check('A ziet bevinding van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // --- Muteren: A's RPC-aanroepen op B-id's moeten WEIGEREN (error) ---
  {
    const { error } = await clientA.rpc('sjabloon_archiveren', { p_sjabloon_id: B.sjabloonId })
    check('A kan sjabloon van B niet archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('inspectie_start', { p_sjabloon_id: B.sjabloonId })
    check('A kan geen inspectie starten op sjabloon van B', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('bevinding_opslaan', {
      p_bevinding_id: B.bevindingId, p_resultaat: 'in_orde', p_afhandeling: 'geen', p_opmerking: null,
    })
    check('A kan bevinding van B niet opslaan', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('bevinding_naar_actie', { p_bevinding_id: B.bevindingId })
    check('A kan bevinding van B niet naar actie zetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Defensieve dubbelcheck: B's sjabloon is niet stiekem gearchiveerd.
  {
    const { data } = await admin.from('inspectie_sjabloon').select('gearchiveerd_op').eq('id', B.sjabloonId).single()
    check('B-sjabloon bleef ongewijzigd na aanvallen van A', !!data && data.gearchiveerd_op === null)
  }

  // --- Rapporten-laag (bibliotheek + rapport), lezen via RPC ---

  // Positieve controle: A ziet zijn EIGEN bibliotheek en eigen inspectie erin.
  {
    const { data, error } = await clientA.rpc('inspectie_bibliotheek', { p_company_id: A.companyId })
    const eigen = Array.isArray(data) && data.some(r => r.id === A.inspectieId)
    check('A ziet eigen bibliotheek met eigen inspectie (positieve controle)', !error && eigen,
      error ? error.message : `${Array.isArray(data) ? data.length : '?'} regels`)
  }

  // Positieve controle: A kan zijn EIGEN inspectierapport opvragen.
  {
    const { data, error } = await clientA.rpc('inspectie_rapport', { p_inspectie_id: A.inspectieId })
    check('A kan eigen inspectierapport opvragen (positieve controle)',
      !error && !!data && data.id === A.inspectieId, error ? error.message : 'ok')
  }

  // Negatief: A mag de bibliotheek van B NIET opvragen (cross-company geweigerd).
  {
    const { error } = await clientA.rpc('inspectie_bibliotheek', { p_company_id: B.companyId })
    check('A kan bibliotheek van B niet opvragen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Negatief: A mag een rapport van B's inspectie NIET opvragen.
  {
    const { error } = await clientA.rpc('inspectie_rapport', { p_inspectie_id: B.inspectieId })
    check('A kan rapport van B niet opvragen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
}

async function cleanup() {
  // FK-veilige volgorde. Service role omzeilt RLS.
  if (companyIds.length) {
    for (const tbl of [
      'pva_items',
      'inspectie_historie',
      'inspectie_bevinding',
      'inspectie',
      'inspectie_sjabloon_punt',
      'inspectie_sjabloon',
      'bedrijf_modules',
      'personen',
    ]) {
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
    console.log('\nOpgeruimd: alle INSPTEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
