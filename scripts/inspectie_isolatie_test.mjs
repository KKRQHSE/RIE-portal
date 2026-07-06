// ============================================================================
// Werkplekinspectie — STAP 3: negatieve isolatie-tests (bewijs)
// ----------------------------------------------------------------------------
// Toont aan dat de bedrijfsisolatie van de inspectie-module houdt: een ingelogde
// gebruiker van bedrijf A kan GEEN sjabloon/inspectie/bevinding/inspectie-doel van
// bedrijf B zien (0 rijen via RLS) of muteren (de SECURITY DEFINER-RPC's weigeren via
// mag_bedrijf_beheren + cross-company-guard).
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

  // Functiegroep (rol in het bedrijf) + een persoon, om de koppel-isolatie te toetsen.
  const { data: fg, error: e5 } = await admin
    .from('functiegroep')
    .insert({ company_id: comp.id, naam: `INSPTEST_groep_${label}`, volgorde: 1 })
    .select('id')
    .single()
  if (e5) throw new Error(`functiegroep insert (${label}): ${e5.message}`)

  const { data: pers, error: e6 } = await admin
    .from('personen')
    .insert({ company_id: comp.id, naam: `INSPTEST_persoon_${label}`, status: 'actief' })
    .select('id')
    .single()
  if (e6) throw new Error(`persoon insert (${label}): ${e6.message}`)

  return {
    companyId: comp.id, sjabloonId: sjab.id, inspectieId: insp.id, bevindingId: bev.id,
    functiegroepId: fg.id, persoonId: pers.id,
  }
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

  // --- Functiegroepen: zien, muteren en koppelen over bedrijfsgrenzen heen ---

  // Positieve controle: A ziet zijn EIGEN functiegroep wel.
  {
    const { data, error } = await clientA.from('functiegroep').select('id').eq('id', A.functiegroepId)
    check('A ziet eigen functiegroep (positieve controle)', !error && (data?.length ?? 0) === 1)
  }

  // Lezen: A mag de functiegroep van B NIET zien (0 rijen via RLS).
  {
    const { data, error } = await clientA.from('functiegroep').select('id').eq('id', B.functiegroepId)
    check('A ziet functiegroep van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // Muteren: A mag B's functiegroep niet hernoemen of archiveren.
  {
    const { error } = await clientA.rpc('functiegroep_opslaan', {
      p_id: B.functiegroepId, p_company_id: A.companyId, p_naam: 'Gekaapt', p_volgorde: 99,
    })
    check('A kan functiegroep van B niet hernoemen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('functiegroep_archiveren', { p_id: B.functiegroepId })
    check('A kan functiegroep van B niet archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // A mag GEEN nieuwe functiegroep aanmaken bij bedrijf B (company_id = B).
  {
    const { error } = await clientA.rpc('functiegroep_opslaan', {
      p_id: null, p_company_id: B.companyId, p_naam: 'INSPTEST_indringer', p_volgorde: 1,
    })
    check('A kan geen functiegroep aanmaken bij B', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Koppelen: A mag B's functiegroep niet aan zijn EIGEN persoon hangen (cross-company).
  {
    const { error } = await clientA.rpc('persoon_functiegroep_zetten', {
      p_persoon_id: A.persoonId, p_functiegroep_id: B.functiegroepId,
    })
    check('A kan B-functiegroep niet aan eigen persoon koppelen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Koppelen: A mag al helemaal niets aan B's persoon doen.
  {
    const { error } = await clientA.rpc('persoon_functiegroep_zetten', {
      p_persoon_id: B.persoonId, p_functiegroep_id: A.functiegroepId,
    })
    check('A kan persoon van B geen functiegroep geven', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Sjabloon-doelgroep: A mag de doelgroep van B's sjabloon niet zetten.
  {
    const { error } = await clientA.rpc('sjabloon_doelgroep_zetten', {
      p_sjabloon_id: B.sjabloonId, p_doel_functiegroep_id: A.functiegroepId,
    })
    check('A kan doelgroep van B-sjabloon niet zetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Sjabloon-doelgroep: A mag zijn EIGEN sjabloon niet op B's functiegroep richten.
  {
    const { error } = await clientA.rpc('sjabloon_doelgroep_zetten', {
      p_sjabloon_id: A.sjabloonId, p_doel_functiegroep_id: B.functiegroepId,
    })
    check('A kan eigen sjabloon niet op B-functiegroep richten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Positieve controle: binnen A werkt het wél (koppelen + doelgroep zetten).
  {
    const { error } = await clientA.rpc('persoon_functiegroep_zetten', {
      p_persoon_id: A.persoonId, p_functiegroep_id: A.functiegroepId,
    })
    check('A koppelt eigen functiegroep aan eigen persoon (positieve controle)', !error,
      error ? error.message : 'ok')
  }
  {
    const { error } = await clientA.rpc('sjabloon_doelgroep_zetten', {
      p_sjabloon_id: A.sjabloonId, p_doel_functiegroep_id: A.functiegroepId,
    })
    check('A richt eigen sjabloon op eigen functiegroep (positieve controle)', !error,
      error ? error.message : 'ok')
  }

  // Defensieve dubbelcheck: B's functiegroep is niet stiekem gewijzigd/gearchiveerd.
  {
    const { data } = await admin.from('functiegroep').select('naam, gearchiveerd_op').eq('id', B.functiegroepId).single()
    check('B-functiegroep bleef ongewijzigd na aanvallen van A',
      !!data && data.gearchiveerd_op === null && data.naam === 'INSPTEST_groep_B')
  }

  // --- Inspectie-doel per persoon (bedrijf_inspectie_doel + inspectie_doel_zetten, 0031) ---
  // Eigen doel-tabel voor de werkplekinspectie, los van de toolbox. Alleen-lezen voor
  // het eigen bedrijf via RLS; muteren uitsluitend via de SECURITY DEFINER-RPC met
  // cross-company-guard (geen write-policy op de tabel).

  // Seed: bedrijf B krijgt een inspectie-doel op zijn eigen persoon (service role omzeilt RLS).
  {
    const { error } = await admin.from('bedrijf_inspectie_doel')
      .insert({ company_id: B.companyId, persoon_id: B.persoonId, doel_per_jaar: 7 })
    if (error) throw new Error(`seed inspectie-doel B: ${error.message}`)
  }

  // Positieve controle: A zet via de RPC een inspectie-doel op zijn EIGEN persoon.
  {
    const { error } = await clientA.rpc('inspectie_doel_zetten', {
      p_company_id: A.companyId, p_persoon_id: A.persoonId, p_doel_per_jaar: 5,
    })
    check('A zet inspectie-doel op eigen persoon (positieve controle)', !error, error ? error.message : 'ok')
  }

  // Positieve controle: A ziet zijn EIGEN inspectie-doel (RLS select).
  {
    const { data, error } = await clientA.from('bedrijf_inspectie_doel')
      .select('doel_per_jaar').eq('company_id', A.companyId).eq('persoon_id', A.persoonId)
    check('A ziet eigen inspectie-doel (positieve controle)',
      !error && (data?.length ?? 0) === 1 && data[0].doel_per_jaar === 5,
      error ? error.message : `${data?.length ?? '?'} rijen`)
  }

  // Lezen: A mag het inspectie-doel van B NIET zien (0 rijen via RLS).
  {
    const { data, error } = await clientA.from('bedrijf_inspectie_doel')
      .select('doel_per_jaar').eq('company_id', B.companyId).eq('persoon_id', B.persoonId)
    check('A ziet inspectie-doel van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // Muteren: A mag geen inspectie-doel zetten BIJ bedrijf B (mag_bedrijf_beheren weigert).
  {
    const { error } = await clientA.rpc('inspectie_doel_zetten', {
      p_company_id: B.companyId, p_persoon_id: B.persoonId, p_doel_per_jaar: 99,
    })
    check('A kan geen inspectie-doel zetten bij B', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Muteren: A mag onder zijn EIGEN company-id geen doel op B's persoon zetten
  // (cross-company-guard: persoon hoort niet bij dit bedrijf).
  {
    const { error } = await clientA.rpc('inspectie_doel_zetten', {
      p_company_id: A.companyId, p_persoon_id: B.persoonId, p_doel_per_jaar: 99,
    })
    check('A kan geen doel op B-persoon zetten via eigen bedrijf', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Waardegrens: een negatief doel wordt geweigerd (RPC-guard + CHECK-constraint).
  {
    const { error } = await clientA.rpc('inspectie_doel_zetten', {
      p_company_id: A.companyId, p_persoon_id: A.persoonId, p_doel_per_jaar: -1,
    })
    check('A kan geen negatief inspectie-doel zetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Defensieve dubbelcheck: B's inspectie-doel is niet gewijzigd door A's aanvallen.
  {
    const { data } = await admin.from('bedrijf_inspectie_doel')
      .select('doel_per_jaar').eq('company_id', B.companyId).eq('persoon_id', B.persoonId).single()
    check('B-inspectie-doel bleef ongewijzigd na aanvallen van A', !!data && data.doel_per_jaar === 7)
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
      'bedrijf_inspectie_doel',
      'personen',
      'functiegroep',
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
