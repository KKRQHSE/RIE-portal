// ============================================================================
// Toolbox-suggesties -- RPC-test (migratie 0077)
// ----------------------------------------------------------------------------
// Dekt:
//  - RI&E-hoofdrisico (module met 'Nee'-antwoord) + recente inspectiebevinding
//    ('niet_in_orde', afhandeling='geen') op HETZELFDE onderwerp -> beide
//    redenen komen terug, en een gekoppelde toolbox op dat onderwerp wint van
//    elke bibliotheekbron.
//  - Incident (gevolg letsel, gematcht via de VASTE oorzaak-vocabulaire) op
//    een onderwerp ZONDER gekoppelde toolbox -> bibliotheekbron als fallback.
//  - Een uitgezette toolbox (bedrijf_toolbox_afwijking modus='uit') telt niet
//    mee -- valt terug op de bron.
//  - Een onderwerp zonder toolbox EN zonder bron -> heeft_match=false (het
//    signaal voor de optionele AI-aanvulling).
//  - Negatieve filters: een afgehandelde inspectiebevinding, een oude
//    inspectie (>6 mnd), een incident zonder letsel/verzuim-gevolg, en een oud
//    incident (>12 mnd) leveren GEEN suggestie op.
//  - Isolatie: teamleider mag (mag_bedrijf_werken), ander bedrijf niet; een
//    kaal bedrijf geeft een lege lijst, geen fout.
//
// Draaien:  node --use-system-ca scripts/toolbox_suggesties_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix TBSUGTEST_ wordt
// opgeruimd -- ook de twee GLOBALE testrijen in centrale_toolbox/toolbox_bron
// (die tabellen hebben geen company_id).
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
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
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
const PW = 'Tbsugtest!' + TS

const companyIds = []
const userIds = []
const moduleIds = []
const inspectieIds = []
const centraleToolboxIds = []
const toolboxBronIds = []
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

function isoDagenGeleden(dagen) {
  const d = new Date()
  d.setDate(d.getDate() - dagen)
  return d.toISOString()
}
function datumDagenGeleden(dagen) {
  return isoDagenGeleden(dagen).slice(0, 10)
}

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `TBSUGTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id)
  return data.id
}

async function maakSessie(label, companyId, role) {
  const email = `tbsugtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: eup } = await admin.from('users').upsert({
    id: created.user.id, email, role, company_id: companyId, naam: `TBSUGTEST ${label}`,
  })
  if (eup) throw new Error(`users upsert (${label}): ${eup.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: esi } = await client.auth.signInWithPassword({ email, password: PW })
  if (esi) throw new Error(`signIn (${label}): ${esi.message}`)
  return client
}

function vind(rijen, code) {
  return (rijen ?? []).find(r => r.onderwerp_code === code) ?? null
}

async function run() {
  const companyA = await maakBedrijf('A')
  const kam = await maakSessie('kam', companyA, 'client')
  const teamleider = await maakSessie('teamleider', companyA, 'teamleider')

  // --- Kaal bedrijf: geen fout, lege lijst ---
  const r0 = await kam.rpc('toolbox_suggesties', { p_company_id: companyA })
  check('kaal bedrijf: geen fout', !r0.error, r0.error?.message)
  check('kaal bedrijf: lege lijst', Array.isArray(r0.data) && r0.data.length === 0, JSON.stringify(r0.data))

  // ========================================================================
  // Onderwerp 1: werken_op_hoogte -- RI&E + recente inspectiebevinding
  // (twee onafhankelijke redenen, zelfde onderwerp) + een gekoppelde toolbox
  // die ook een matchende bron zou kunnen verslaan.
  // ========================================================================
  const { data: mod, error: emod } = await admin.from('modules')
    .insert({ company_id: companyA, code: 'TBSUGTEST_MOD', titel: 'Werken op hoogte bij dakwerk' })
    .select('id').single()
  if (emod) throw new Error('modules insert: ' + emod.message)
  moduleIds.push(mod.id)
  const { error: evr } = await admin.from('vragen')
    .insert({ company_id: companyA, module_id: mod.id, nr: '1', vraag: 'Is er valbeveiliging?', antwoord: 'Nee' })
  if (evr) throw new Error('vragen insert: ' + evr.message)

  const { data: insp, error: eins } = await admin.from('inspectie')
    .insert({ company_id: companyA, status: 'afgerond', uitgevoerd_op: isoDagenGeleden(10) })
    .select('id').single()
  if (eins) throw new Error('inspectie insert: ' + eins.message)
  inspectieIds.push(insp.id)
  const { error: ebev } = await admin.from('inspectie_bevinding').insert({
    company_id: companyA, inspectie_id: insp.id, punt_tekst_snap: 'Is er valbeveiliging aanwezig bij het steigerwerk?',
    resultaat: 'niet_in_orde', afhandeling: 'geen', rubriek_naam_snap: 'Valbeveiliging bij steiger',
  })
  if (ebev) throw new Error('inspectie_bevinding insert: ' + ebev.message)

  const { data: ctHoogte, error: ectH } = await admin.from('centrale_toolbox')
    .insert({ titel: 'TBSUGTEST Veilig werken op hoogte', tekst: 'testtekst' })
    .select('id').single()
  if (ectH) throw new Error('centrale_toolbox insert (hoogte): ' + ectH.message)
  centraleToolboxIds.push(ctHoogte.id)
  const { error: ebtH } = await admin.from('bedrijf_toolbox').insert({ company_id: companyA, toolbox_id: ctHoogte.id })
  if (ebtH) throw new Error('bedrijf_toolbox insert (hoogte): ' + ebtH.message)
  // Een bron die OOK op 'hoogte' matcht -- lage volgorde, zou zonder de
  // toolbox-voorrangsregel als eerste gekozen worden.
  const { data: bronHoogte, error: ebrH } = await admin.from('toolbox_bron')
    .insert({ naam: 'TBSUGTEST Hoogtewerk bron', url: 'https://example.test/hoogte', omschrijving: 'test', volgorde: -1000 })
    .select('id').single()
  if (ebrH) throw new Error('toolbox_bron insert (hoogte): ' + ebrH.message)
  toolboxBronIds.push(bronHoogte.id)

  // ========================================================================
  // Onderwerp 2: tillen_fysieke_belasting -- incident (directe oorzaak 10,
  // "Onjuist tillen"), GEEN gekoppelde toolbox -> bron-fallback (eigen,
  // gegarandeerd laagste volgorde).
  // ========================================================================
  const { error: eincTil } = await admin.from('incident').insert({
    company_id: companyA, datum: datumDagenGeleden(30), locatie: 'TBSUGTEST', omschrijving: 'TBSUGTEST incident tillen',
    gevolgen: ['letsel'], directe_oorzaken: [10],
  })
  if (eincTil) throw new Error('incident insert (tillen): ' + eincTil.message)
  const { data: bronTillen, error: ebrT } = await admin.from('toolbox_bron')
    .insert({ naam: 'TBSUGTEST Tillen en fysieke belasting bron', url: 'https://example.test/tillen', omschrijving: 'test', volgorde: -1000 })
    .select('id').single()
  if (ebrT) throw new Error('toolbox_bron insert (tillen): ' + ebrT.message)
  toolboxBronIds.push(bronTillen.id)

  // ========================================================================
  // Onderwerp 3: vallen_struikelen -- incident (basis oorzaak "Gebrek aan
  // orde en netheid"? nee -- directe oorzaak 22), toolbox gekoppeld MAAR
  // uitgezet -> valt terug op de (eigen) bron.
  // ========================================================================
  const { error: eincVal } = await admin.from('incident').insert({
    company_id: companyA, datum: datumDagenGeleden(20), locatie: 'TBSUGTEST', omschrijving: 'TBSUGTEST incident vallen',
    gevolgen: ['ongeval_zonder_verzuim'], directe_oorzaken: [22],
  })
  if (eincVal) throw new Error('incident insert (vallen): ' + eincVal.message)
  const { data: ctVal, error: ectV } = await admin.from('centrale_toolbox')
    .insert({ titel: 'TBSUGTEST Voorkom struikelen', tekst: 'testtekst' })
    .select('id').single()
  if (ectV) throw new Error('centrale_toolbox insert (vallen): ' + ectV.message)
  centraleToolboxIds.push(ctVal.id)
  const { error: ebtV } = await admin.from('bedrijf_toolbox').insert({ company_id: companyA, toolbox_id: ctVal.id })
  if (ebtV) throw new Error('bedrijf_toolbox insert (vallen): ' + ebtV.message)
  const { error: eafwV } = await admin.from('bedrijf_toolbox_afwijking')
    .insert({ company_id: companyA, toolbox_id: ctVal.id, modus: 'uit', basis_versie: 1 })
  if (eafwV) throw new Error('bedrijf_toolbox_afwijking insert (vallen): ' + eafwV.message)
  const { data: bronVal, error: ebrV } = await admin.from('toolbox_bron')
    .insert({ naam: 'TBSUGTEST Struikelen en gladheid bron', url: 'https://example.test/struikelen', omschrijving: 'test', volgorde: -1000 })
    .select('id').single()
  if (ebrV) throw new Error('toolbox_bron insert (vallen): ' + ebrV.message)
  toolboxBronIds.push(bronVal.id)

  // ========================================================================
  // Onderwerp 4: brand_explosie -- incident (directe oorzaak 21,
  // "Brand-/explosiegevaar"), GEEN toolbox, GEEN bron -> heeft_match=false.
  // ========================================================================
  const { error: eincBrand } = await admin.from('incident').insert({
    company_id: companyA, datum: datumDagenGeleden(15), locatie: 'TBSUGTEST', omschrijving: 'TBSUGTEST incident brand',
    gevolgen: ['letsel'], directe_oorzaken: [21],
  })
  if (eincBrand) throw new Error('incident insert (brand): ' + eincBrand.message)

  // ========================================================================
  // Negatieve filters -- elk op een EIGEN onderwerp, zodat een gemiste
  // uitsluiting zichtbaar wordt als een onterechte suggestie.
  // ========================================================================
  // pbm: bevinding niet in orde, maar al AFGEHANDELD -> mag niet meetellen.
  const { data: inspPbm, error: einsP } = await admin.from('inspectie')
    .insert({ company_id: companyA, status: 'afgerond', uitgevoerd_op: isoDagenGeleden(5) })
    .select('id').single()
  if (einsP) throw new Error('inspectie insert (pbm): ' + einsP.message)
  inspectieIds.push(inspPbm.id)
  const { error: ebevP } = await admin.from('inspectie_bevinding').insert({
    company_id: companyA, inspectie_id: inspPbm.id, punt_tekst_snap: 'Draagt iedereen PBM?',
    resultaat: 'niet_in_orde', afhandeling: 'meteen_hersteld', opmerking: 'TBSUGTEST direct opgelost',
    rubriek_naam_snap: 'PBM ontbreekt',
  })
  if (ebevP) throw new Error('inspectie_bevinding insert (pbm): ' + ebevP.message)

  // machineveiligheid: bevinding niet in orde, niet afgehandeld, maar de
  // inspectie is te OUD (>6 mnd) -> mag niet meetellen.
  const { data: inspOud, error: einsO } = await admin.from('inspectie')
    .insert({ company_id: companyA, status: 'afgerond', uitgevoerd_op: isoDagenGeleden(240) })
    .select('id').single()
  if (einsO) throw new Error('inspectie insert (oud): ' + einsO.message)
  inspectieIds.push(inspOud.id)
  const { error: ebevO } = await admin.from('inspectie_bevinding').insert({
    company_id: companyA, inspectie_id: inspOud.id, punt_tekst_snap: 'Is de machine goed afgeschermd?',
    resultaat: 'niet_in_orde', afhandeling: 'geen', rubriek_naam_snap: 'Onvoldoende afscherming machine',
  })
  if (ebevO) throw new Error('inspectie_bevinding insert (oud): ' + ebevO.message)

  // lawaai: incident, oorzaak 'Te veel lawaai' (23), maar GEEN letsel/verzuim
  // gevolg -> mag niet meetellen.
  const { error: eincLawaai } = await admin.from('incident').insert({
    company_id: companyA, datum: datumDagenGeleden(10), locatie: 'TBSUGTEST', omschrijving: 'TBSUGTEST incident lawaai',
    gevolgen: ['milieuschade'], directe_oorzaken: [23],
  })
  if (eincLawaai) throw new Error('incident insert (lawaai): ' + eincLawaai.message)

  // ventilatie: incident, oorzaak 'Onvoldoende ventilatie' (27), gevolg
  // letsel, maar de datum is te OUD (>12 mnd) -> mag niet meetellen.
  const { error: eincVent } = await admin.from('incident').insert({
    company_id: companyA, datum: datumDagenGeleden(400), locatie: 'TBSUGTEST', omschrijving: 'TBSUGTEST incident ventilatie',
    gevolgen: ['letsel'], directe_oorzaken: [27],
  })
  if (eincVent) throw new Error('incident insert (ventilatie): ' + eincVent.message)

  // ========================================================================
  // Bevragen als KAM van bedrijf A
  // ========================================================================
  const r1 = await kam.rpc('toolbox_suggesties', { p_company_id: companyA })
  check('geen fout na alle testdata', !r1.error, r1.error?.message)
  const rijen = r1.data ?? []

  const hoogte = vind(rijen, 'werken_op_hoogte')
  check('werken_op_hoogte: komt voor', !!hoogte, JSON.stringify(rijen.map(r => r.onderwerp_code)))
  check('werken_op_hoogte: RI&E-reden aanwezig', !!hoogte?.redenen?.some(r => r.startsWith('uit je RI&E:') && r.includes('dakwerk')), JSON.stringify(hoogte?.redenen))
  check('werken_op_hoogte: inspectiebevinding-reden aanwezig', !!hoogte?.redenen?.some(r => r.startsWith('recente inspectiebevinding:') && r.includes('Valbeveiliging')), JSON.stringify(hoogte?.redenen))
  check('werken_op_hoogte: gekoppelde toolbox wint van de bron', hoogte?.toolbox_id === ctHoogte.id && hoogte?.bron_id === null, JSON.stringify(hoogte))
  check('werken_op_hoogte: heeft_match = true', hoogte?.heeft_match === true, JSON.stringify(hoogte))

  const tillen = vind(rijen, 'tillen_fysieke_belasting')
  check('tillen_fysieke_belasting: komt voor via incident-oorzaak', !!tillen, JSON.stringify(rijen.map(r => r.onderwerp_code)))
  check('tillen_fysieke_belasting: reden noemt de oorzaak-omschrijving', !!tillen?.redenen?.some(r => r === 'incident: Onjuist tillen'), JSON.stringify(tillen?.redenen))
  check('tillen_fysieke_belasting: geen eigen toolbox -> bron-fallback (mijn testbron)', tillen?.toolbox_id === null && tillen?.bron_id === bronTillen.id, JSON.stringify(tillen))

  const vallen = vind(rijen, 'vallen_struikelen')
  check('vallen_struikelen: komt voor', !!vallen, JSON.stringify(rijen.map(r => r.onderwerp_code)))
  check('vallen_struikelen: uitgezette toolbox telt niet mee', vallen?.toolbox_id === null, JSON.stringify(vallen))
  check('vallen_struikelen: valt terug op de bron', vallen?.bron_id === bronVal.id, JSON.stringify(vallen))

  const brand = vind(rijen, 'brand_explosie')
  check('brand_explosie: komt voor (gap)', !!brand, JSON.stringify(rijen.map(r => r.onderwerp_code)))
  check('brand_explosie: geen toolbox, geen bron -> heeft_match=false (AI-aanvulling)', brand?.toolbox_id === null && brand?.bron_id === null && brand?.heeft_match === false, JSON.stringify(brand))

  check('pbm: afgehandelde bevinding telt niet mee', !vind(rijen, 'pbm'), JSON.stringify(vind(rijen, 'pbm')))
  check('machineveiligheid: te oude inspectie telt niet mee', !vind(rijen, 'machineveiligheid'), JSON.stringify(vind(rijen, 'machineveiligheid')))
  check('lawaai: incident zonder letsel/verzuim telt niet mee', !vind(rijen, 'lawaai'), JSON.stringify(vind(rijen, 'lawaai')))
  check('ventilatie: te oud incident (>12 mnd) telt niet mee', !vind(rijen, 'ventilatie'), JSON.stringify(vind(rijen, 'ventilatie')))

  // ========================================================================
  // Isolatie
  // ========================================================================
  const rTl = await teamleider.rpc('toolbox_suggesties', { p_company_id: companyA })
  check('teamleider mag de suggesties zien (mag_bedrijf_werken)', !rTl.error && Array.isArray(rTl.data), rTl.error?.message)
  check('teamleider ziet dezelfde werken_op_hoogte-suggestie', !!vind(rTl.data, 'werken_op_hoogte'), JSON.stringify(rTl.data?.map(r => r.onderwerp_code)))

  const companyB = await maakBedrijf('B')
  const kamB = await maakSessie('kamB', companyB, 'client')
  const rCross = await kamB.rpc('toolbox_suggesties', { p_company_id: companyA })
  check('ander bedrijf krijgt geen toegang tot A', !!rCross.error, rCross.error ? 'geweigerd' : 'TOEGESTAAN!')

  const rBLeeg = await kamB.rpc('toolbox_suggesties', { p_company_id: companyB })
  check('bedrijf B (geen eigen data) krijgt een lege lijst, geen lek van A', !rBLeeg.error && Array.isArray(rBLeeg.data) && rBLeeg.data.length === 0, JSON.stringify(rBLeeg.data))
}

run()
  .catch(e => { console.error('ONVERWACHTE FOUT:', e.message); process.exitCode = 1 })
  .finally(async () => {
    for (const id of toolboxBronIds) {
      try { await admin.from('toolbox_bron').delete().eq('id', id) } catch { /* best effort */ }
    }
    for (const id of centraleToolboxIds) {
      try { await admin.from('centrale_toolbox').delete().eq('id', id) } catch { /* best effort, cascades bedrijf_toolbox(_afwijking) */ }
    }
    for (const id of companyIds) {
      try { await admin.from('companies').delete().eq('id', id) } catch { /* best effort, cascades modules/vragen/inspectie/incident/users */ }
    }
    for (const id of userIds) {
      try { await admin.auth.admin.deleteUser(id) } catch { /* best effort */ }
    }
    const mislukt = results.filter(r => !r.ok)
    console.log('\n' + '─'.repeat(60))
    console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
    if (mislukt.length) process.exitCode = 1
  })
