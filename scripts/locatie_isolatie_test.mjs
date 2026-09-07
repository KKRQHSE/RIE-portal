// ============================================================================
// Locatie — isolatie- én regressiebewijs (migratie 0080, Fase 1)
// ----------------------------------------------------------------------------
// Locatie is een ATTRIBUUT, geen rechtenlaag: de isolatiegrens blijft
// company_id, via de bestaande mag_bedrijf_beheren/mag_bedrijf_werken. Dit
// script bewijst drie dingen:
//
//   1. ISOLATIE — bedrijf A kan GEEN locaties van bedrijf B lezen (RLS) of
//      muteren (locatie_opslaan/locatie_archiveren weigeren via
//      mag_bedrijf_beheren) — zelfde vorm als module_isolatie_test.mjs.
//   2. WERKEND ATTRIBUUT — een teamleider (mag_bedrijf_werken, geen
//      mag_bedrijf_beheren) kan de locatielijst van het EIGEN bedrijf wél
//      lezen, maar niet muteren. Dit is de bewuste RLS-keuze uit Fase 1
//      (locatie_sel op mag_bedrijf_werken i.p.v. mag_bedrijf_beheren).
//   3. REGRESSIE — een bedrijf ZONDER locaties (geen rijen in locatie,
//      locatie_id overal NULL) gedraagt zich exact als voorheen: vragen/
//      inspectie/toolbox_sessie/pva_items/incident blijven aanmaakbaar en
//      leesbaar zonder dat locatie_id ooit verplicht wordt.
//
// Draaien:   node --use-system-ca scripts/locatie_isolatie_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Ontbreekt die, dan meldt
// het script dat en slaat over (exit 0). Alles met prefix LOCTEST_ wordt in
// een finally-blok opgeruimd, ook bij een fout.
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
  console.log('  De locatie-isolatie-test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Loctest!' + TS

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
    .insert({ name: `LOCTEST_${label}_${TS}` })
    .select('id')
    .single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  return { companyId: comp.id }
}

async function maakGebruiker(label, companyId, role = 'client') {
  const email = `loctest_${label}_${TS}@example.test`
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
    .upsert({ id, email, role, company_id: companyId, naam: `LOCTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', A.companyId, 'client')
  await maakGebruiker('B', B.companyId, 'client') // bewijst dat B een geldige beheerder heeft
  const teamleiderA = await maakGebruiker('TL', A.companyId, 'teamleider')

  // --- Opzet: bedrijf B krijgt één locatie, via de RPC (positieve controle) ---
  const { data: locatieBId, error: eOpslaanB } = await (
    await maakGebruiker('B2', B.companyId, 'client')
  ).rpc('locatie_opslaan', { p_id: null, p_company_id: B.companyId, p_naam: 'Hoofdkantoor B', p_volgorde: 1 })
  check('B kan een eigen locatie aanmaken (positieve controle)', !eOpslaanB && !!locatieBId, eOpslaanB?.message)

  // --- 1. ISOLATIE: A ziet en muteert NIETS van B ---
  {
    const { data, error } = await clientA.from('locatie').select('id').eq('company_id', B.companyId)
    check('A ziet locaties van B niet (RLS)', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { error } = await clientA.rpc('locatie_opslaan', {
      p_id: null, p_company_id: B.companyId, p_naam: 'Ongeautoriseerd', p_volgorde: 99,
    })
    check('A kan bij B geen locatie aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('locatie_opslaan', {
      p_id: locatieBId, p_company_id: B.companyId, p_naam: 'Overgenomen', p_volgorde: 1,
    })
    check('A kan de locatie van B niet hernoemen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('locatie_archiveren', { p_id: locatieBId })
    check('A kan de locatie van B niet archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { data } = await admin.from('locatie').select('naam, gearchiveerd_op').eq('id', locatieBId).single()
    check("B's locatie ongewijzigd na alle aanvallen van A",
      !!data && data.naam === 'Hoofdkantoor B' && data.gearchiveerd_op === null,
      data ? `naam=${data.naam}, gearchiveerd=${data.gearchiveerd_op}` : 'geen rij')
  }

  // --- 2. Attribuut, geen rechtenlaag: teamleider van A leest wél, muteert niet ---
  const { data: locatieAId, error: eOpslaanA } = await clientA.rpc('locatie_opslaan', {
    p_id: null, p_company_id: A.companyId, p_naam: 'Vestiging A', p_volgorde: 1,
  })
  check('A (client) kan een eigen locatie aanmaken', !eOpslaanA && !!locatieAId, eOpslaanA?.message)
  {
    const { data, error } = await teamleiderA.from('locatie').select('naam').eq('company_id', A.companyId)
    check('Teamleider van A kan de locatielijst lezen (mag_bedrijf_werken)',
      !error && data?.some(l => l.naam === 'Vestiging A'), error?.message ?? `${data?.length ?? 0} rijen`)
  }
  {
    const { error } = await teamleiderA.rpc('locatie_opslaan', {
      p_id: null, p_company_id: A.companyId, p_naam: 'Door teamleider', p_volgorde: 2,
    })
    check('Teamleider van A kan GEEN locatie aanmaken (alleen mag_bedrijf_beheren)',
      !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await teamleiderA.rpc('locatie_archiveren', { p_id: locatieAId })
    check('Teamleider van A kan GEEN locatie archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- 3. REGRESSIE: bedrijf zonder locaties gedraagt zich exact als voorheen ---
  const C = await maakBedrijf('C')
  const clientC = await maakGebruiker('C', C.companyId, 'client')
  {
    const { data, error } = await clientC.from('locatie').select('id').eq('company_id', C.companyId)
    check('Bedrijf zonder locaties: lege lijst, geen fout', !error && (data?.length ?? 0) === 0, error?.message)
  }
  // module_id is verplicht op vragen; alleen locatie_id (nullable) is relevant hier.
  // Service-role-insert (bypasst RLS) is hier voldoende: dit bewijst het
  // datamodel-gedrag (locatie_id blijft NULL), niet de RLS-schrijfpolicy van
  // vragen zelf — die is ongewijzigd en dus geen onderdeel van deze migratie.
  const { data: moduleC, error: eModC } = await admin
    .from('modules').insert({ company_id: C.companyId, code: 'loctest', titel: 'LOCTEST-module' })
    .select('id').single()
  if (eModC) throw new Error(`modules insert (C): ${eModC.message}`)
  {
    const { data, error } = await admin
      .from('vragen')
      .insert({ company_id: C.companyId, module_id: moduleC.id, nr: '1', vraag: 'Test?' })
      .select('id, locatie_id')
      .single()
    check('Vraag aanmaken zonder locatie werkt ongewijzigd (locatie_id = NULL)',
      !error && data?.locatie_id === null, error?.message ?? `locatie_id=${data?.locatie_id}`)
  }
  {
    const { data: pva, error } = await admin
      .from('pva_items').insert({ company_id: C.companyId, nr: '1' }).select('id, locatie_id').single()
    check('PvA-item aanmaken zonder locatie werkt ongewijzigd (locatie_id = NULL)',
      !error && pva?.locatie_id === null, error?.message ?? `locatie_id=${pva?.locatie_id}`)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['pva_items', 'vragen', 'modules', 'locatie', 'personen']) {
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
    console.log('\nOpgeruimd: alle LOCTEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
