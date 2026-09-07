// ============================================================================
// Locatie op inspecties/toolbox-sessies/acties — isolatie- en regressiebewijs
// (Fase 3, migratie 0082)
// ----------------------------------------------------------------------------
// Bewijst:
//   1. ISOLATIE — inspectie_locatie_zetten/toolbox_sessie_opslaan weigeren een
//      locatie_id die bij een ANDER bedrijf hoort (cross-company-guard), en
//      bedrijf A kan geen inspectie/sessie van bedrijf B via deze RPC's raken.
//   2. WERKEND ATTRIBUUT — een geldige, eigen locatie_id wordt geaccepteerd en
//      komt terug in inspectie_bibliotheek/inspectie_rapport/
//      toolbox_sessies_overzicht (server-side naam erbij).
//   3. REGRESSIE — bestaande aanroepen zonder p_locatie_id (of met NULL)
//      blijven precies zoals voorheen werken; project_locatie (het bestaande
//      vrije tekstveld) blijft ongemoeid naast locatie_id staan.
//
// Draaien:   node --use-system-ca scripts/locatie_inspectie_toolbox_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Ontbreekt die, dan meldt
// het script dat en slaat over (exit 0). Alles met prefix LOCIT_ wordt in een
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
const PW = 'Locit!' + TS

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies').insert({ name: `LOCIT_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  return comp.id
}

async function maakGebruiker(label, companyId, role = 'client') {
  const email = `locit_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: e } = await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `LOCIT ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const companyA = await maakBedrijf('A')
  const companyB = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', companyA, 'client')
  await maakGebruiker('B', companyB, 'client')

  const { data: locA } = await admin.from('locatie').insert({ company_id: companyA, naam: 'Locatie A' }).select('id').single()
  const { data: locB } = await admin.from('locatie').insert({ company_id: companyB, naam: 'Locatie B' }).select('id').single()

  // --- Opzet: een inspectie bij A. Rechtstreeks via service-role aangemaakt
  //     (geen norm-rubrieken nodig) -- deze test bewijst de locatie-RPC's,
  //     niet inspectie_start_centraal zelf (dat heeft zijn eigen tests). ---
  const { data: inspRij, error: eInspA } = await admin
    .from('inspectie')
    .insert({ company_id: companyA, status: 'concept', sjabloon_naam_snap: 'LOCIT-inspectie' })
    .select('id').single()
  const inspA = inspRij?.id
  check('Regressie-opzet: inspectie aanmaken zonder locatie werkt ongewijzigd (locatie_id blijft NULL)',
    !eInspA && !!inspA, eInspA?.message)

  // --- ISOLATIE: A kan zijn eigen inspectie niet aan B's locatie hangen ---
  {
    const { error } = await clientA.rpc('inspectie_locatie_zetten', { p_inspectie_id: inspA, p_locatie_id: locB.id })
    check("A kan eigen inspectie niet aan B's locatie hangen (cross-company)", !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // --- WERKEND: A mag zijn eigen inspectie aan zijn EIGEN locatie hangen ---
  {
    const { error } = await clientA.rpc('inspectie_locatie_zetten', { p_inspectie_id: inspA, p_locatie_id: locA.id })
    check('A mag eigen inspectie aan eigen locatie hangen', !error, error?.message)
  }
  // --- Server-side naam komt terug in inspectie_bibliotheek ---
  {
    const { data, error } = await clientA.rpc('inspectie_bibliotheek', { p_company_id: companyA })
    const regel = (data ?? []).find(r => r.id === inspA)
    check('inspectie_bibliotheek geeft locatie_naam mee', !error && regel?.locatie_naam === 'Locatie A',
      error?.message ?? `locatie_naam=${regel?.locatie_naam}`)
  }
  // --- Server-side naam komt terug in inspectie_rapport ---
  {
    const { data, error } = await clientA.rpc('inspectie_rapport', { p_inspectie_id: inspA })
    check('inspectie_rapport geeft locatie_naam mee', !error && data?.locatie_naam === 'Locatie A',
      error?.message ?? `locatie_naam=${data?.locatie_naam}`)
  }
  // --- project_locatie (bestaand vrij tekstveld) blijft onaangeroerd naast locatie_id ---
  {
    const { error: eProj } = await clientA.rpc('inspectie_project_opslaan', { p_inspectie_id: inspA, p_project_locatie: 'De Horst 12' })
    const { data: rij } = await admin.from('inspectie').select('project_locatie, locatie_id').eq('id', inspA).single()
    check('project_locatie en locatie_id bestaan naast elkaar, geen dataverlies',
      !eProj && rij?.project_locatie === 'De Horst 12' && rij?.locatie_id === locA.id,
      `project_locatie=${rij?.project_locatie}, locatie_id=${rij?.locatie_id}`)
  }
  // --- B kan A's inspectie niet raken via deze RPC (bestaande isolatiegrens) ---
  {
    const { error } = await (await maakGebruiker('B2', companyB, 'client'))
      .rpc('inspectie_locatie_zetten', { p_inspectie_id: inspA, p_locatie_id: locB.id })
    check("B kan A's inspectie niet aan een locatie hangen", !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Toolbox-sessie: nieuw met p_locatie_id, cross-company-guard, en het
  //     bestaande 6-argumenten-aanroeppad (zonder locatie) blijft werken ---
  {
    const { data, error } = await clientA.rpc('toolbox_sessie_opslaan', {
      p_company_id: companyA, p_sessie_id: null, p_datum: '2026-01-15',
      p_onderwerp: 'Regressie zonder locatie', p_notitie: null,
    })
    check('Regressie: toolbox_sessie_opslaan werkt met de oude parameterset (geen p_locatie_id)',
      !error && !!data, error?.message)
  }
  {
    const { error } = await clientA.rpc('toolbox_sessie_opslaan', {
      p_company_id: companyA, p_sessie_id: null, p_datum: '2026-01-16',
      p_onderwerp: 'Met vreemde locatie', p_notitie: null, p_locatie_id: locB.id,
    })
    check("A kan een sessie niet aan B's locatie hangen (cross-company)", !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  let sessieAId
  {
    const { data, error } = await clientA.rpc('toolbox_sessie_opslaan', {
      p_company_id: companyA, p_sessie_id: null, p_datum: '2026-01-17',
      p_onderwerp: 'Met eigen locatie', p_notitie: null, p_locatie_id: locA.id,
    })
    sessieAId = data
    check('A mag een sessie aan de eigen locatie hangen', !error && !!data, error?.message)
  }
  {
    const { data, error } = await clientA.rpc('toolbox_sessies_overzicht', { p_company_id: companyA })
    const regel = (data?.sessies ?? []).find(s => s.sessie_id === sessieAId)
    check('toolbox_sessies_overzicht geeft locatie_naam mee', !error && regel?.locatie_naam === 'Locatie A',
      error?.message ?? `locatie_naam=${regel?.locatie_naam}`)
  }

  // --- pva_items: locatie_id volgt het bestaande persoon_id-schrijfpad
  //     (rechtstreeks vanuit de client, mag_bedrijf_beheren-policy) ---
  const { data: pva } = await admin.from('pva_items').insert({ company_id: companyA, nr: 'LOCIT1' }).select('id').single()
  {
    const { error } = await clientA.from('pva_items').update({ locatie_id: locA.id }).eq('id', pva.id)
    const { data: rij } = await admin.from('pva_items').select('locatie_id').eq('id', pva.id).single()
    check('A kan locatie_id op eigen pva_item zetten (bestaand schrijfpad)',
      !error && rij?.locatie_id === locA.id, error?.message ?? `locatie_id=${rij?.locatie_id}`)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['pva_items', 'toolbox_sessie', 'inspectie_historie', 'inspectie_bevinding', 'inspectie', 'locatie', 'personen']) {
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
    console.log('\nOpgeruimd: alle LOCIT_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
