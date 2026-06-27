// ============================================================================
// Centrale inspectie-bibliotheek — isolatie- en beveiligingstests (bewijs)
// ----------------------------------------------------------------------------
// Bewijst de kern van het centraal/lokaal-model:
//  * Centrale norm is LEESBAAR voor elke klant, maar SCHRIJFBAAR alleen door admin.
//  * Een klant kan centrale rubrieken/vragen niet aanmaken, wijzigen of archiveren.
//  * Bedrijf A kan de koppeling/afwijking van B niet zien of muteren.
//  * Een klant kan niet stiekem afwijken: direct op de tabel schrijven is geblokkeerd
//    (alleen-lezen), en de RPC weigert afwijken op een niet-gekoppelde rubriek.
//  * Positieve controles: admin beheert centraal; een klant koppelt + wijkt lokaal af
//    + zet terug naar centraal, en start een inspectie vanuit de norm.
//
// Draaien:   node --use-system-ca scripts/centrale_bibliotheek_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles met prefix CBTEST_ wordt in
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
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken.')
  process.exit(1)
}
if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; isolatietest overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Cbtest!' + TS
const companyIds = []
const userIds = []
const rubriekIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `CBTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id)
  return data.id
}

async function maakGebruiker(label, companyId, role) {
  const email = `cbtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: e } = await admin.from('users').upsert({
    id: created.user.id, email, role, company_id: companyId, naam: `CBTEST ${label}`,
  })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const aCompany = await maakBedrijf('A')
  const bCompany = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', aCompany, 'client')
  const clientB = await maakGebruiker('B', bCompany, 'client')
  const adminClient = await maakGebruiker('ADMIN', null, 'admin')

  // --- Positieve admin-controle: admin maakt centrale rubriek + vraag via RPC ---
  let rubriekId, vraagId
  {
    const { data, error } = await adminClient.rpc('centrale_rubriek_opslaan', {
      p_id: null, p_naam: 'CBTEST_rubriek', p_volgorde: 999, p_rie_code: null,
    })
    check('admin maakt centrale rubriek (positieve controle)', !error && !!data, error?.message)
    rubriekId = data
    if (rubriekId) rubriekIds.push(rubriekId)
  }
  {
    const { data, error } = await adminClient.rpc('centrale_vraag_opslaan', {
      p_id: null, p_rubriek_id: rubriekId, p_tekst: 'CBTEST centrale vraag?', p_volgorde: 1,
    })
    check('admin maakt centrale vraag (positieve controle)', !error && !!data, error?.message)
    vraagId = data
  }

  // --- Klant mag centraal LEZEN maar niet muteren ---
  {
    const { data, error } = await clientA.from('centrale_rubriek').select('id').eq('id', rubriekId)
    check('klant A leest centrale rubriek (positieve controle)', !error && (data?.length ?? 0) === 1)
  }
  {
    const { error } = await clientA.rpc('centrale_rubriek_opslaan', { p_id: null, p_naam: 'CBTEST_kaap', p_volgorde: 1, p_rie_code: null })
    check('klant A kan GEEN centrale rubriek aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('centrale_vraag_opslaan', { p_id: vraagId, p_rubriek_id: rubriekId, p_tekst: 'gekaapt', p_volgorde: 1 })
    check('klant A kan centrale vraag niet wijzigen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('centrale_rubriek_archiveren', { p_id: rubriekId })
    check('klant A kan centrale rubriek niet archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('centrale_vraag_archiveren', { p_id: vraagId })
    check('klant A kan centrale vraag niet archiveren', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.from('centrale_rubriek').insert({ naam: 'CBTEST_direct', volgorde: 1 })
    check('klant A kan niet direct in centrale_rubriek schrijven (RLS)', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- B koppelt + wijkt af; A mag daar niets van zien of muteren ---
  {
    const { error } = await clientB.rpc('rubriek_koppelen', { p_company_id: bCompany, p_rubriek_id: rubriekId })
    check('B koppelt eigen rubriek (positieve controle)', !error, error?.message)
  }
  {
    const { error } = await clientB.rpc('vraag_lokaal_aanpassen', { p_company_id: bCompany, p_vraag_id: vraagId, p_lokale_tekst: 'B lokale tekst' })
    check('B wijkt eigen vraag lokaal af (positieve controle)', !error, error?.message)
  }
  {
    const { data, error } = await clientA.from('bedrijf_rubriek').select('rubriek_id').eq('company_id', bCompany)
    check('A ziet koppeling van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data, error } = await clientA.from('bedrijf_vraag_afwijking').select('vraag_id').eq('company_id', bCompany)
    check('A ziet afwijking van B niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { error } = await clientA.rpc('bedrijf_norm_overzicht', { p_company_id: bCompany })
    check('A kan norm-overzicht van B niet opvragen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('rubriek_koppelen', { p_company_id: bCompany, p_rubriek_id: rubriekId })
    check('A kan voor B geen rubriek koppelen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('rubriek_ontkoppelen', { p_company_id: bCompany, p_rubriek_id: rubriekId })
    check('A kan B niet ontkoppelen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: bCompany, p_vraag_id: vraagId, p_lokale_tekst: 'A kaapt B' })
    check('A kan vraag van B niet lokaal aanpassen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('vraag_uitzetten', { p_company_id: bCompany, p_vraag_id: vraagId })
    check('A kan vraag van B niet uitzetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('vraag_terug_naar_centraal', { p_company_id: bCompany, p_vraag_id: vraagId })
    check('A kan afwijking van B niet terugzetten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await clientA.rpc('inspectie_start_centraal', { p_company_id: bCompany })
    check('A kan geen inspectie starten voor B', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // Defensieve dubbelcheck: B's afwijking is onveranderd na alle pogingen van A.
  {
    const { data } = await admin.from('bedrijf_vraag_afwijking').select('lokale_tekst, modus').eq('company_id', bCompany).eq('vraag_id', vraagId).single()
    check('B-afwijking bleef ongewijzigd na aanvallen van A', !!data && data.modus === 'lokaal' && data.lokale_tekst === 'B lokale tekst')
  }

  // --- Geen stiekeme afwijking: direct schrijven kan niet; RPC eist koppeling ---
  {
    const { error } = await clientA.from('bedrijf_vraag_afwijking').insert({
      company_id: aCompany, vraag_id: vraagId, modus: 'lokaal', lokale_tekst: 'stiekem', basis_versie: 1,
    })
    check('A kan niet direct in bedrijf_vraag_afwijking schrijven (alleen via RPC)', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    // A heeft de rubriek (nog) niet gekoppeld → afwijken moet weigeren.
    const { error } = await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: aCompany, p_vraag_id: vraagId, p_lokale_tekst: 'mag niet' })
    check('A kan niet afwijken op een niet-gekoppelde rubriek', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Positieve klant-controle: A koppelt, wijkt af, zet terug, start inspectie ---
  {
    const { error } = await clientA.rpc('rubriek_koppelen', { p_company_id: aCompany, p_rubriek_id: rubriekId })
    check('A koppelt eigen rubriek (positieve controle)', !error, error?.message)
  }
  {
    const { error } = await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: aCompany, p_vraag_id: vraagId, p_lokale_tekst: 'A eigen tekst' })
    check('A wijkt eigen vraag lokaal af (positieve controle)', !error, error?.message)
  }
  {
    const { data, error } = await clientA.rpc('bedrijf_norm_overzicht', { p_company_id: aCompany })
    const rub = Array.isArray(data) ? data.find(r => r.rubriek_id === rubriekId) : null
    const v = rub?.vragen?.find(x => x.vraag_id === vraagId)
    check('A ziet eigen afwijking met geldende tekst', !error && v?.geldende_tekst === 'A eigen tekst', error?.message)
  }
  {
    const { error } = await clientA.rpc('vraag_terug_naar_centraal', { p_company_id: aCompany, p_vraag_id: vraagId })
    check('A zet eigen vraag terug naar centraal (positieve controle)', !error, error?.message)
  }
  {
    const { data, error } = await clientA.rpc('inspectie_start_centraal', { p_company_id: aCompany })
    check('A start inspectie vanuit de norm (positieve controle)', !error && !!data, error?.message)
    if (data) {
      const { data: bev } = await admin.from('inspectie_bevinding').select('rubriek_naam_snap, punt_tekst_snap').eq('inspectie_id', data)
      const ok = (bev?.length ?? 0) === 1 && bev[0].rubriek_naam_snap === 'CBTEST_rubriek'
      check('Gestarte inspectie heeft de rubriek-snapshot', ok, `${bev?.length ?? '?'} bevindingen`)
    }
  }

  // --- Signaal 'norm gewijzigd' + dashboard-telling, en dat 'mijn versie houden' wist ---
  {
    await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: aCompany, p_vraag_id: vraagId, p_lokale_tekst: 'A versie' })
    // Admin wijzigt de centrale tekst → versie omhoog.
    await adminClient.rpc('centrale_vraag_opslaan', { p_id: vraagId, p_rubriek_id: rubriekId, p_tekst: 'CBTEST centrale vraag v2?', p_volgorde: 1 })

    const { data: norm } = await clientA.rpc('bedrijf_norm_overzicht', { p_company_id: aCompany })
    const v = (Array.isArray(norm) ? norm.find(r => r.rubriek_id === rubriekId) : null)?.vragen?.find(x => x.vraag_id === vraagId)
    check('A ziet norm_gewijzigd na centrale tekstwijziging', v?.norm_gewijzigd === true)

    const { data: dash } = await clientA.rpc('dashboard_overzicht', { p_company_id: aCompany })
    check('Dashboard telt de bijgewerkte afwijking', (dash?.norm_bijgewerkt ?? 0) >= 1, `${dash?.norm_bijgewerkt}`)

    // 'Mijn versie houden' = afwijking herbevestigen → basis_versie bij, signaal weg.
    await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: aCompany, p_vraag_id: vraagId, p_lokale_tekst: 'A versie' })
    const { data: dash2 } = await clientA.rpc('dashboard_overzicht', { p_company_id: aCompany })
    check('Signaal verdwijnt na mijn-versie-houden', (dash2?.norm_bijgewerkt ?? 0) === 0, `${dash2?.norm_bijgewerkt}`)

    // Opruimen voor het archiveer-blok hieronder: terug naar centraal.
    await clientA.rpc('vraag_terug_naar_centraal', { p_company_id: aCompany, p_vraag_id: vraagId })
  }

  // --- Een lokale afwijking blijft leven, ook als centraal archiveert ---
  {
    await clientA.rpc('vraag_lokaal_aanpassen', { p_company_id: aCompany, p_vraag_id: vraagId, p_lokale_tekst: 'A blijft afwijken na archivering' })
    // Tweede centrale vraag die A vólgt (geen afwijking).
    const { data: vraag2 } = await adminClient.rpc('centrale_vraag_opslaan', { p_id: null, p_rubriek_id: rubriekId, p_tekst: 'CBTEST gevolgde vraag?', p_volgorde: 2 })
    // Admin archiveert beide centrale vragen.
    await adminClient.rpc('centrale_vraag_archiveren', { p_id: vraagId })
    await adminClient.rpc('centrale_vraag_archiveren', { p_id: vraag2 })

    const { data: norm } = await clientA.rpc('bedrijf_norm_overzicht', { p_company_id: aCompany })
    const rub = Array.isArray(norm) ? norm.find(r => r.rubriek_id === rubriekId) : null
    const vBehouden = rub?.vragen?.find(x => x.vraag_id === vraagId)
    const vGevolgd = rub?.vragen?.find(x => x.vraag_id === vraag2)
    check('Lokaal afgeweken vraag blijft na centrale archivering (eigen versie)',
      !!vBehouden && vBehouden.centraal_vervallen === true && vBehouden.geldende_tekst === 'A blijft afwijken na archivering')
    check('Gevolgde vraag verdwijnt na centrale archivering', !vGevolgd)

    const { data: insp, error } = await clientA.rpc('inspectie_start_centraal', { p_company_id: aCompany })
    let ok = false
    if (!error && insp) {
      const { data: bev } = await admin.from('inspectie_bevinding').select('punt_tekst_snap').eq('inspectie_id', insp)
      ok = (bev?.length ?? 0) === 1 && bev[0].punt_tekst_snap === 'A blijft afwijken na archivering'
    }
    check('Inspectie vanuit de norm bevat alleen de behouden lokale vraag', ok, error?.message)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of [
      'inspectie_historie', 'inspectie_bevinding', 'inspectie',
      'bedrijf_vraag_afwijking', 'bedrijf_rubriek',
    ]) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  // Centrale testcontent (vragen cascaden mee met de rubriek).
  if (rubriekIds.length) {
    await admin.from('centrale_rubriek').delete().in('id', rubriekIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
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
    console.log('\nOpgeruimd: alle CBTEST_-data, centrale testrubriek en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
