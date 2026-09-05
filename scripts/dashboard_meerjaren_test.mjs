// ============================================================================
// Meerjaren-dashboard (Fase 3, voorbereidend) -- migratie 0075, verfijnd 0076.
// ----------------------------------------------------------------------------
// Dekt:
//  - Alleen KAM/admin (mag_bedrijf_beheren); teamleider en ander bedrijf dicht.
//  - Toont altijd het huidige jaar, ook zonder enige data (geen crash, geen
//    lege lijst).
//  - Een jaar met incidenten/toolbox-sessies/afgeronde inspecties/gewerkte
//    uren komt erbij, met de juiste cijfers voor dat specifieke jaar (geen
//    vermenging tussen jaren).
//  - Toolbox-dekking: null (geen data) als er dat jaar geen sessie was, een
//    percentage zodra er wel een sessie was -- nooit een misleidende 0%.
//  - IF-getal per jaar volgt exact if_getal_voor_jaar() (hergebruikt, niet
//    opnieuw uitgevonden).
//  - (0076) Toolbox-dekking rekent met de HISTORISCH-correcte headcount per
//    jaar (datum_in_dienst/datum_uit_dienst), niet het huidige aantal: iemand
//    die pas dit jaar in dienst kwam telt niet mee voor een ouder jaar, en
//    andersom voor iemand die toen al uit dienst was.
//  - (0076) Inspectiedoel is een echte jaar-specifieke waarde: een doel gezet
//    voor jaar X verschijnt NIET bij een ander jaar.
//  - (0076) Doelstelling is een echte jaar-specifieke tekst: een doelstelling
//    gezet voor jaar X verschijnt NIET bij een ander jaar.
//
// Draaien:  node --use-system-ca scripts/dashboard_meerjaren_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix MJTEST_ wordt opgeruimd.
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
const PW = 'Mjtest!' + TS
const HUIDIG_JAAR = new Date().getFullYear()
const OUD_JAAR = HUIDIG_JAAR - 3

const companyIds = []
const userIds = []
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `MJTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id)
  return data.id
}

async function maakSessie(label, companyId, role) {
  const email = `mjtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: eup } = await admin.from('users').upsert({
    id: created.user.id, email, role, company_id: companyId, naam: `MJTEST ${label}`,
  })
  if (eup) throw new Error(`users upsert (${label}): ${eup.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: esi } = await client.auth.signInWithPassword({ email, password: PW })
  if (esi) throw new Error(`signIn (${label}): ${esi.message}`)
  return client
}

async function run() {
  const companyA = await maakBedrijf('A')
  const kam = await maakSessie('kam', companyA, 'client')
  const teamleider = await maakSessie('teamleider', companyA, 'teamleider')

  // --- Kaal bedrijf: alleen het huidige jaar, geen data ---
  const r0 = await kam.rpc('dashboard_meerjaren', { p_company_id: companyA })
  check('geen fout op een kaal bedrijf', !r0.error, r0.error?.message)
  const jaren0 = r0.data ?? []
  check('toont altijd het huidige jaar, ook zonder data', jaren0.some(j => j.jaar === HUIDIG_JAAR), JSON.stringify(jaren0))
  const huidigLeeg = jaren0.find(j => j.jaar === HUIDIG_JAAR)
  check('kaal jaar: 0 incidenten, if_getal null, toolbox-dekking null', huidigLeeg?.incidenten === 0 && huidigLeeg?.if_getal?.if_getal === null && huidigLeeg?.toolbox?.dekking_pct === null, JSON.stringify(huidigLeeg))

  // --- Teamleider mag niet ---
  const rTl = await teamleider.rpc('dashboard_meerjaren', { p_company_id: companyA })
  check('teamleider krijgt geen toegang', !!rTl.error, rTl.error ? 'geweigerd' : 'TOEGESTAAN!')

  // --- Ander bedrijf mag niet ---
  const companyB = await maakBedrijf('B')
  const kamB = await maakSessie('kamB', companyB, 'client')
  const rCross = await kamB.rpc('dashboard_meerjaren', { p_company_id: companyA })
  check('ander bedrijf krijgt geen toegang', !!rCross.error, rCross.error ? 'geweigerd' : 'TOEGESTAAN!')

  // --- Drie personen met verschillende diensttijd, om historische headcount te toetsen ---
  // persoon: altijd in dienst (geen datums) -> telt mee in elk jaar.
  // persoonLaat: kwam pas dit jaar in dienst -> telt NIET mee voor OUD_JAAR.
  // persoonVroeg: al uit dienst vóór OUD_JAAR -> telt NIET mee voor OUD_JAAR of dit jaar.
  const { data: persoon, error: ep } = await admin.from('personen')
    .insert({ company_id: companyA, naam: 'MJTEST Persoon' }).select('id').single()
  if (ep) throw new Error('personen insert: ' + ep.message)
  const { data: persoonLaat, error: epl } = await admin.from('personen')
    .insert({ company_id: companyA, naam: 'MJTEST Laat', datum_in_dienst: `${HUIDIG_JAAR}-01-01` }).select('id').single()
  if (epl) throw new Error('personen insert (laat): ' + epl.message)
  const { error: epv } = await admin.from('personen')
    .insert({ company_id: companyA, naam: 'MJTEST Vroeg', datum_uit_dienst: `${OUD_JAAR - 1}-12-31` })
  if (epv) throw new Error('personen insert (vroeg): ' + epv.message)

  await admin.from('incident').insert({
    company_id: companyA, datum: `${OUD_JAAR}-05-01`, locatie: 'MJTEST', omschrijving: 'MJTEST incident', gevolgen: ['letsel'],
  })
  const { data: sessieOud, error: es } = await admin.from('toolbox_sessie')
    .insert({ company_id: companyA, datum: `${OUD_JAAR}-06-01`, onderwerp: 'MJTEST onderwerp' }).select('id').single()
  if (es) throw new Error('toolbox_sessie insert: ' + es.message)
  const { error: ed } = await admin.from('toolbox_deelname').insert({
    company_id: companyA, persoon_id: persoon.id, sessie_id: sessieOud.id, bewijssoort: 'fysiek_aanwezig',
    titel_snap: 'MJTEST', tekst_snap: 'MJTEST', bevestigde_naam: 'MJTEST Persoon', naam_bevestigd: true,
    afgerond_op: `${OUD_JAAR}-06-01T10:00:00Z`,
  })
  if (ed) throw new Error('toolbox_deelname insert: ' + ed.message)
  await kam.rpc('gewerkte_uren_zetten', { p_company_id: companyA, p_jaar: OUD_JAAR, p_uren: 1000 })

  // Dit jaar: alleen persoonLaat woont een sessie bij (persoon en persoonVroeg niet).
  const { data: sessieHuidig, error: esh } = await admin.from('toolbox_sessie')
    .insert({ company_id: companyA, datum: `${HUIDIG_JAAR}-02-01`, onderwerp: 'MJTEST onderwerp huidig' }).select('id').single()
  if (esh) throw new Error('toolbox_sessie insert (huidig): ' + esh.message)
  const { error: edh } = await admin.from('toolbox_deelname').insert({
    company_id: companyA, persoon_id: persoonLaat.id, sessie_id: sessieHuidig.id, bewijssoort: 'fysiek_aanwezig',
    titel_snap: 'MJTEST', tekst_snap: 'MJTEST', bevestigde_naam: 'MJTEST Laat', naam_bevestigd: true,
    afgerond_op: `${HUIDIG_JAAR}-02-01T10:00:00Z`,
  })
  if (edh) throw new Error('toolbox_deelname insert (huidig): ' + edh.message)

  // Inspectiedoel en doelstelling: allebei alleen voor OUD_JAAR gezet.
  await kam.rpc('inspectie_doel_zetten', { p_company_id: companyA, p_persoon_id: persoon.id, p_doel_per_jaar: 5, p_jaar: OUD_JAAR })
  await kam.rpc('jaardoelstelling_zetten', { p_company_id: companyA, p_jaar: OUD_JAAR, p_tekst: 'MJTEST doelstelling van toen' })

  const r1 = await kam.rpc('dashboard_meerjaren', { p_company_id: companyA })
  check('geen fout na het toevoegen van oud-jaar-data', !r1.error, r1.error?.message)
  const jaren1 = r1.data ?? []
  check('oud jaar verschijnt nu in de lijst', jaren1.some(j => j.jaar === OUD_JAAR), JSON.stringify(jaren1.map(j => j.jaar)))
  const oud = jaren1.find(j => j.jaar === OUD_JAAR)
  check('oud jaar: 1 incident', oud?.incidenten === 1, JSON.stringify(oud))
  check('oud jaar: 1 toolbox-sessie', oud?.toolbox?.sessies === 1, JSON.stringify(oud?.toolbox))
  check('oud jaar: toolbox-dekking is een getal (niet null) zodra er een sessie was', typeof oud?.toolbox?.dekking_pct === 'number', JSON.stringify(oud?.toolbox))
  // Headcount voor OUD_JAAR: alleen 'persoon' was toen in dienst (Laat kwam later,
  // Vroeg was al weg) -> noemer 1, 1 deelnemer -> 100%.
  check('oud jaar: toolbox-dekking gebruikt de HISTORISCHE headcount (100%, niet verwaterd door personen die toen niet in dienst waren)', oud?.toolbox?.dekking_pct === 100, JSON.stringify(oud?.toolbox))
  check('oud jaar: if_getal volgt if_getal_voor_jaar (1000 uur, 0 verzuimongevallen -> 0)', oud?.if_getal?.if_getal === 0, JSON.stringify(oud?.if_getal))
  check('oud jaar: inspectiedoel is de echte jaar-specifieke waarde (5)', oud?.inspecties?.doel_totaal === 5, JSON.stringify(oud?.inspecties))
  check('oud jaar: doelstelling van dat jaar', oud?.doelstelling === 'MJTEST doelstelling van toen', JSON.stringify(oud?.doelstelling))

  const huidigNa = jaren1.find(j => j.jaar === HUIDIG_JAAR)
  check('huidig jaar blijft ongemoeid door oud-jaar-data (0 incidenten)', huidigNa?.incidenten === 0, JSON.stringify(huidigNa))
  check('huidig jaar: inspectiedoel van OUD_JAAR lekt niet door (0, geen terugwerkende kracht meer)', huidigNa?.inspecties?.doel_totaal === 0, JSON.stringify(huidigNa?.inspecties))
  check('huidig jaar: doelstelling van OUD_JAAR lekt niet door (null)', huidigNa?.doelstelling === null, JSON.stringify(huidigNa?.doelstelling))
  // Headcount voor HUIDIG_JAAR: 'persoon' + 'persoonLaat' zijn in dienst (Vroeg niet) -> noemer 2,
  // 1 deelnemer (Laat) -> 50%.
  check('huidig jaar: toolbox-dekking gebruikt de headcount van NU (50%, twee in dienst, één deelnemer)', huidigNa?.toolbox?.dekking_pct === 50, JSON.stringify(huidigNa?.toolbox))

  // --- Cross-company/teamleider-guards op de twee (0076-)RPC's zelf, los van dashboard_meerjaren ---
  const rDoelTl = await teamleider.rpc('jaardoelstelling_zetten', { p_company_id: companyA, p_jaar: HUIDIG_JAAR, p_tekst: 'x' })
  check('teamleider kan geen doelstelling zetten', !!rDoelTl.error, rDoelTl.error ? 'geweigerd' : 'TOEGESTAAN!')
  const rDoelCross = await kamB.rpc('jaardoelstelling_zetten', { p_company_id: companyA, p_jaar: HUIDIG_JAAR, p_tekst: 'x' })
  check('ander bedrijf kan geen doelstelling zetten bij A', !!rDoelCross.error, rDoelCross.error ? 'geweigerd' : 'TOEGESTAAN!')
  const rDoelIdCross = await kamB.rpc('inspectie_doel_zetten', { p_company_id: companyA, p_persoon_id: persoon.id, p_doel_per_jaar: 1, p_jaar: OUD_JAAR })
  check('ander bedrijf kan geen inspectiedoel zetten bij A (ook niet met expliciet jaar)', !!rDoelIdCross.error, rDoelIdCross.error ? 'geweigerd' : 'TOEGESTAAN!')
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
