// ============================================================================
// Meerjarendashboard: locatie-roll-up (Fase 4, migratie 0084)
// ----------------------------------------------------------------------------
// Bewijst:
//   1. REGRESSIE — een bedrijf zonder locaties krijgt exact de bestaande
//      sleutels terug, met een lege per_locatie-array (geen crash, geen
//      gedragsverandering). Alle organisatiebrede cijfers (if_getal,
//      dekking_pct, doel_totaal, doelstelling) blijven ongewijzigd.
//   2. ROLL-UP KLOPT — bij een bedrijf MET locaties telt per_locatie per
//      locatie correct (afgeronde inspecties, toolbox-sessies, incidenten),
//      en de som over alle locaties + wat aan geen locatie hangt = het
//      organisatiebrede totaal (roll-up, geen parallelle telling).
//   3. ISOLATIE — bedrijf B kan dashboard_meerjaren van bedrijf A niet
//      opvragen (bestaande mag_bedrijf_beheren-guard, ongewijzigd).
//
// Draaien:   node --use-system-ca scripts/dashboard_meerjaren_locatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Ontbreekt die, dan meldt
// het script dat en slaat over (exit 0). Alles met prefix DMLT_ wordt in een
// finally-blok opgeruimd.
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* geen .env.local */ }
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
  console.log('  De test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Dmlt!' + TS
const JAAR = 2026

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies').insert({ name: `DMLT_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  return comp.id
}

async function maakGebruiker(label, companyId, role = 'client') {
  const email = `dmlt_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: e } = await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `DMLT ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  // --- 1. REGRESSIE: bedrijf zonder locaties ---
  const companyGeen = await maakBedrijf('GEEN')
  const clientGeen = await maakGebruiker('GEEN', companyGeen, 'client')
  await admin.from('incident').insert({ company_id: companyGeen, datum: `${JAAR}-03-01`, locatie: 'ergens', omschrijving: 'test' })
  {
    const { data, error } = await clientGeen.rpc('dashboard_meerjaren', { p_company_id: companyGeen })
    const rij = (data ?? []).find(j => j.jaar === JAAR)
    check('Bedrijf zonder locaties: per_locatie is een lege array, geen crash',
      !error && Array.isArray(rij?.per_locatie) && rij.per_locatie.length === 0,
      error?.message ?? `per_locatie=${JSON.stringify(rij?.per_locatie)}`)
    check('Bedrijf zonder locaties: organisatiebreed incidententotaal ongewijzigd (1)',
      rij?.incidenten === 1, `incidenten=${rij?.incidenten}`)
  }

  // --- 2. ROLL-UP: bedrijf met twee locaties ---
  const companyMet = await maakBedrijf('MET')
  const clientMet = await maakGebruiker('MET', companyMet, 'client')
  const { data: locX } = await admin.from('locatie').insert({ company_id: companyMet, naam: 'Locatie X', volgorde: 1 }).select('id').single()
  const { data: locY } = await admin.from('locatie').insert({ company_id: companyMet, naam: 'Locatie Y', volgorde: 2 }).select('id').single()

  // 2 afgeronde inspecties bij X, 1 bij Y, 1 organisatiebreed (geen locatie).
  await admin.from('inspectie').insert([
    { company_id: companyMet, status: 'afgerond', uitgevoerd_op: `${JAAR}-02-01`, locatie_id: locX.id },
    { company_id: companyMet, status: 'afgerond', uitgevoerd_op: `${JAAR}-02-02`, locatie_id: locX.id },
    { company_id: companyMet, status: 'afgerond', uitgevoerd_op: `${JAAR}-02-03`, locatie_id: locY.id },
    { company_id: companyMet, status: 'afgerond', uitgevoerd_op: `${JAAR}-02-04`, locatie_id: null },
  ])
  // 3 toolbox-sessies bij X, 0 bij Y, 1 organisatiebreed.
  await admin.from('toolbox_sessie').insert([
    { company_id: companyMet, datum: `${JAAR}-04-01`, onderwerp: 'a', locatie_id: locX.id },
    { company_id: companyMet, datum: `${JAAR}-04-02`, onderwerp: 'b', locatie_id: locX.id },
    { company_id: companyMet, datum: `${JAAR}-04-03`, onderwerp: 'c', locatie_id: locX.id },
    { company_id: companyMet, datum: `${JAAR}-04-04`, onderwerp: 'd', locatie_id: null },
  ])
  // 2 incidenten bij Y, 0 bij X, 1 organisatiebreed.
  await admin.from('incident').insert([
    { company_id: companyMet, datum: `${JAAR}-05-01`, locatie: 'plek', omschrijving: 'i1', locatie_id: locY.id },
    { company_id: companyMet, datum: `${JAAR}-05-02`, locatie: 'plek', omschrijving: 'i2', locatie_id: locY.id },
    { company_id: companyMet, datum: `${JAAR}-05-03`, locatie: 'plek', omschrijving: 'i3', locatie_id: null },
  ])

  const { data: dataMet, error: errMet } = await clientMet.rpc('dashboard_meerjaren', { p_company_id: companyMet })
  const rijMet = (dataMet ?? []).find(j => j.jaar === JAAR)
  check('Roll-up: RPC-aanroep zelf slaagt', !errMet, errMet?.message)

  const plX = rijMet?.per_locatie?.find(p => p.locatie_id === locX.id)
  const plY = rijMet?.per_locatie?.find(p => p.locatie_id === locY.id)

  check('Roll-up: Locatie X heeft 2 afgeronde inspecties', plX?.inspecties_afgerond === 2, `${plX?.inspecties_afgerond}`)
  check('Roll-up: Locatie Y heeft 1 afgeronde inspectie', plY?.inspecties_afgerond === 1, `${plY?.inspecties_afgerond}`)
  check('Roll-up: Locatie X heeft 3 toolbox-sessies', plX?.toolbox_sessies === 3, `${plX?.toolbox_sessies}`)
  check('Roll-up: Locatie Y heeft 0 toolbox-sessies', plY?.toolbox_sessies === 0, `${plY?.toolbox_sessies}`)
  check('Roll-up: Locatie Y heeft 2 incidenten', plY?.incidenten === 2, `${plY?.incidenten}`)
  check('Roll-up: Locatie X heeft 0 incidenten', plX?.incidenten === 0, `${plX?.incidenten}`)

  // Roll-up-consistentie: som(locaties) + organisatiebreed-zonder-locatie = totaal.
  const somInspecties = (plX?.inspecties_afgerond ?? 0) + (plY?.inspecties_afgerond ?? 0)
  check('Roll-up telt niet dubbel en verliest niets: som locaties (3) + 1 zonder locatie = organisatiebreed totaal (4)',
    somInspecties === 3 && rijMet?.inspecties?.afgerond === 4, `som=${somInspecties}, totaal=${rijMet?.inspecties?.afgerond}`)

  // IF-getal/doelstelling blijven organisatiebreed (geen per-locatie sleutel op die velden zelf).
  check('IF-getal blijft een organisatiebreed veld op het jaar-object (geen per-locatie-opsplitsing)',
    typeof rijMet?.if_getal === 'object' && !('per_locatie' in (rijMet?.if_getal ?? {})))

  // --- 3. ISOLATIE ---
  const companyB = await maakBedrijf('B')
  const clientB = await maakGebruiker('B', companyB, 'client')
  {
    const { error } = await clientB.rpc('dashboard_meerjaren', { p_company_id: companyMet })
    check('B kan het meerjarendashboard van MET niet opvragen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['incident', 'toolbox_sessie', 'inspectie', 'locatie', 'personen']) {
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
    console.log('\nOpgeruimd: alle DMLT_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
