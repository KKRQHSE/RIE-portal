// ============================================================================
// Nachtbouw Fase 1: project_locatie op inspecties + automatische persoon_id bij
// het starten (migratie 0074).
// ----------------------------------------------------------------------------
// Dekt:
//  - inspectie_start vult persoon_id automatisch vanuit personen.user_id =
//    auth.uid() (dezelfde company) -- de directe koppeling i.p.v. de omweg.
//  - Ontbreekt die koppeling (geen personen-rij met dit user_id), dan blijft
//    persoon_id NULL -- geen crash, geen giswerk.
//  - Een personen-rij bij een ANDER bedrijf met hetzelfde user_id telt niet mee
//    (company-scoped lookup).
//  - inspectie_start_centraal vult persoon_id op dezelfde manier.
//  - inspectie_project_opslaan zet/wist het veld, zichtbaar in zowel
//    inspectie_bibliotheek als inspectie_rapport; geblokkeerd na afronden.
//
// Draaien:  node --use-system-ca scripts/inspectie_project_persoon_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix IPPTEST_ wordt opgeruimd.
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
const PW = 'Ipptest!' + TS

const companyIds = []
const userIds = []
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `IPPTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id)
  await admin.from('bedrijf_modules').insert({ company_id: data.id, module: 'inspectie', actief: true })
  return data.id
}

async function maakSessie(label, companyId) {
  const email = `ipptest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: eup } = await admin.from('users').upsert({
    id: created.user.id, email, role: 'client', company_id: companyId, naam: `IPPTEST ${label}`,
  })
  if (eup) throw new Error(`users upsert (${label}): ${eup.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: esi } = await client.auth.signInWithPassword({ email, password: PW })
  if (esi) throw new Error(`signIn (${label}): ${esi.message}`)
  return { client, userId: created.user.id }
}

async function run() {
  const companyA = await maakBedrijf('A')
  const companyB = await maakBedrijf('B')

  // --- Persoon MET koppeling (company A) ---
  const gekoppeld = await maakSessie('gekoppeld', companyA)
  const { data: persoonA, error: epA } = await admin.from('personen')
    .insert({ company_id: companyA, naam: 'IPPTEST Gekoppeld', user_id: gekoppeld.userId })
    .select('id').single()
  if (epA) throw new Error('personen insert A: ' + epA.message)

  // --- Persoon MET hetzelfde user_id, maar bij bedrijf B (mag niet meetellen) ---
  await admin.from('personen').insert({ company_id: companyB, naam: 'IPPTEST Verkeerd bedrijf', user_id: gekoppeld.userId })

  // --- Sessie ZONDER personen-koppeling (company A) ---
  const ongekoppeld = await maakSessie('ongekoppeld', companyA)

  // --- Sjabloon + punt (via de gekoppelde sessie) ---
  const rs = await gekoppeld.client.rpc('sjabloon_opslaan', {
    p_sjabloon_id: null, p_company_id: companyA, p_naam: 'IPPTEST rondgang', p_controlesoort: 'werkplek',
  })
  check('sjabloon_opslaan maakt sjabloon', !rs.error && !!rs.data, rs.error?.message)
  const sjabloonId = rs.data
  const rp = await gekoppeld.client.rpc('punt_opslaan', {
    p_punt_id: null, p_sjabloon_id: sjabloonId, p_tekst: 'IPPTEST punt', p_verplicht: true, p_volgorde: null,
  })
  check('punt_opslaan voegt punt toe', !rp.error, rp.error?.message)

  // 1. inspectie_start (gekoppelde sessie) → persoon_id automatisch gevuld
  const r1 = await gekoppeld.client.rpc('inspectie_start', { p_sjabloon_id: sjabloonId })
  check('inspectie_start (gekoppeld) geeft inspectie_id', !r1.error && !!r1.data, r1.error?.message)
  const inspectieGekoppeld = r1.data
  const { data: iGek } = await admin.from('inspectie').select('persoon_id').eq('id', inspectieGekoppeld).single()
  check('persoon_id automatisch gevuld vanuit personen.user_id', iGek?.persoon_id === persoonA.id, `kreeg ${iGek?.persoon_id}`)

  // 2. inspectie_start (ongekoppelde sessie) → persoon_id blijft NULL, geen crash
  const r2 = await ongekoppeld.client.rpc('inspectie_start', { p_sjabloon_id: sjabloonId })
  check('inspectie_start (ongekoppeld) geeft toch een inspectie_id', !r2.error && !!r2.data, r2.error?.message)
  const inspectieOngekoppeld = r2.data
  const { data: iOngek } = await admin.from('inspectie').select('persoon_id').eq('id', inspectieOngekoppeld).single()
  check('persoon_id blijft NULL zonder personen-koppeling', iOngek?.persoon_id === null, `kreeg ${iOngek?.persoon_id}`)

  // 3. project_locatie opslaan + teruglezen via bibliotheek en rapport
  const rProj = await gekoppeld.client.rpc('inspectie_project_opslaan', {
    p_inspectie_id: inspectieGekoppeld, p_project_locatie: '  Kantoor Rotterdam  ',
  })
  check('inspectie_project_opslaan slaagt', !rProj.error, rProj.error?.message)

  const { data: bib } = await gekoppeld.client.rpc('inspectie_bibliotheek', { p_company_id: companyA })
  const regelBib = (bib ?? []).find(r => r.id === inspectieGekoppeld)
  check('project_locatie zichtbaar in inspectie_bibliotheek (getrimd)', regelBib?.project_locatie === 'Kantoor Rotterdam', `kreeg ${regelBib?.project_locatie}`)

  // Leeg/whitespace wordt NULL, niet een lege string.
  const rProjLeeg = await gekoppeld.client.rpc('inspectie_project_opslaan', {
    p_inspectie_id: inspectieGekoppeld, p_project_locatie: '   ',
  })
  check('inspectie_project_opslaan met alleen witruimte slaagt', !rProjLeeg.error, rProjLeeg.error?.message)
  const { data: bib2 } = await gekoppeld.client.rpc('inspectie_bibliotheek', { p_company_id: companyA })
  const regelBib2 = (bib2 ?? []).find(r => r.id === inspectieGekoppeld)
  check('lege/witruimte project_locatie wordt NULL, geen lege string', regelBib2?.project_locatie === null, `kreeg ${JSON.stringify(regelBib2?.project_locatie)}`)

  // Terugzetten voor de rapport-check hieronder.
  await gekoppeld.client.rpc('inspectie_project_opslaan', { p_inspectie_id: inspectieGekoppeld, p_project_locatie: 'Kantoor Rotterdam' })

  // Verplicht punt beantwoorden zodat afronden kan.
  const { data: bevs } = await admin.from('inspectie_bevinding').select('id').eq('inspectie_id', inspectieGekoppeld)
  for (const b of bevs ?? []) {
    await gekoppeld.client.rpc('bevinding_opslaan', { p_bevinding_id: b.id, p_resultaat: 'in_orde', p_afhandeling: 'geen', p_opmerking: null })
  }
  const rAf = await gekoppeld.client.rpc('inspectie_afronden', { p_inspectie_id: inspectieGekoppeld, p_conclusie: null })
  check('inspectie_afronden slaagt', !rAf.error, rAf.error?.message)

  const { data: rapport } = await gekoppeld.client.rpc('inspectie_rapport', { p_inspectie_id: inspectieGekoppeld })
  check('project_locatie zichtbaar in inspectie_rapport', rapport?.project_locatie === 'Kantoor Rotterdam', `kreeg ${rapport?.project_locatie}`)

  // 4. Na afronden: project_locatie wijzigen mag niet meer.
  const rProjNa = await gekoppeld.client.rpc('inspectie_project_opslaan', { p_inspectie_id: inspectieGekoppeld, p_project_locatie: 'Poging na afronden' })
  check('inspectie_project_opslaan geblokkeerd na afronden', !!rProjNa.error, rProjNa.error ? 'geweigerd' : 'GEEN fout!')

  // 5. inspectie_start_centraal vult persoon_id op dezelfde manier.
  const { data: rubriek, error: erub } = await admin.from('centrale_rubriek')
    .insert({ naam: 'IPPTEST Rubriek', volgorde: 1 }).select('id').single()
  if (erub) throw new Error('centrale_rubriek insert: ' + erub.message)
  const { data: vraag, error: evr } = await admin.from('centrale_vraag')
    .insert({ rubriek_id: rubriek.id, tekst: 'IPPTEST Vraag?', volgorde: 1 }).select('id').single()
  if (evr) throw new Error('centrale_vraag insert: ' + evr.message)
  await admin.from('bedrijf_rubriek').insert({ company_id: companyA, rubriek_id: rubriek.id })

  const rc = await gekoppeld.client.rpc('inspectie_start_centraal', { p_company_id: companyA })
  check('inspectie_start_centraal geeft inspectie_id', !rc.error && !!rc.data, rc.error?.message)
  const { data: iCentr } = await admin.from('inspectie').select('persoon_id').eq('id', rc.data).single()
  check('persoon_id ook automatisch gevuld bij inspectie_start_centraal', iCentr?.persoon_id === persoonA.id, `kreeg ${iCentr?.persoon_id}`)

  await admin.from('centrale_rubriek').delete().eq('id', rubriek.id)
}

run()
  .catch(e => { console.error('ONVERWACHTE FOUT:', e.message); process.exitCode = 1 })
  .finally(async () => {
    for (const id of companyIds) {
      try { await admin.from('companies').delete().eq('id', id) } catch { /* best effort, cascades */ }
    }
    for (const id of userIds) {
      try { await admin.auth.admin.deleteUser(id) } catch { /* best effort */ }
    }
    const mislukt = results.filter(r => !r.ok)
    console.log('\n' + '─'.repeat(60))
    console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
    if (mislukt.length) process.exitCode = 1
  })
