// ============================================================================
// Security-hardening — null-veilige guard + anon-EXECUTE ingetrokken (bewijs)
// ----------------------------------------------------------------------------
// Bewijst de drie lagen van migraties 0022/0023:
//  1. EXHAUSTIEF (via pg): elke gehardende per-bedrijf/admin-RPC heeft GEEN
//     anon-EXECUTE meer; de bewust-anon token-RPC's hebben die nog WEL.
//  2. RUNTIME (supabase-js): een anon-caller (geen login, geen token) wordt
//     afgewezen op een representatieve set RPC's (reads, writes, admin).
//  3. REGRESSIE: een echte KAM/admin van het eigen bedrijf kan ze nog gewoon
//     gebruiken; en de werknemer-/gast-token-flow werkt nog (anon MÉT geldig
//     token komt door, anon ZÓNDER token niet).
//
// Draaien:  node --use-system-ca scripts/security_hardening_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL. Alles met prefix SECTEST_ wordt opgeruimd.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
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
const DBURL = env.DATABASE_URL
if (!URL || !ANON) { console.error('SUPABASE-URL/ANON ontbreken.'); process.exit(1) }
if (!SERVICE || !DBURL) { console.log('— SERVICE_ROLE of DATABASE_URL ontbreekt; overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Sectest!' + TS
const companyIds = [], userIds = [], toolboxIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

// De 57 gehardende RPC's (gelijk aan migratie 0023).
const HARDENED = [
  'actie_doorgeven','actie_historie_ophalen','bedrijf_norm_overzicht','bedrijf_toolbox_overzicht',
  'bevinding_naar_actie','bevinding_opslaan','bewijs_lijst','bewijs_registreren','bewijs_verwijderen',
  'create_deellink','dashboard_overzicht','doelstelling_zetten','functiegroep_archiveren','functiegroep_opslaan',
  'geef_actie_vrij','herinner_kandidaten','herinnering_loggen','inspectie_afronden','inspectie_bibliotheek',
  'inspectie_conclusie_opslaan','inspectie_rapport','inspectie_start','inspectie_start_centraal','intrek_deellink',
  'koppel_mij_als_persoon','module_activeren','module_gebruik_zetten','module_stopzetten','persoon_functiegroep_zetten',
  'punt_opslaan','punt_verwijderen','rubriek_koppelen','rubriek_ontkoppelen','sjabloon_archiveren',
  'sjabloon_doelgroep_zetten','sjabloon_opslaan','stuur_concept_terug','toolbox_dashboard','toolbox_koppelen',
  'toolbox_lokaal_aanpassen','toolbox_ontkoppelen','toolbox_terug_naar_centraal','toolbox_uitzetten',
  'vraag_lokaal_aanpassen','vraag_terug_naar_centraal','vraag_uitzetten','zet_concept_beheerder','zet_herinner_ritme',
  'centrale_rubriek_opslaan','centrale_rubriek_archiveren','centrale_vraag_opslaan','centrale_vraag_archiveren',
  'centrale_toolbox_opslaan','centrale_toolbox_archiveren','centrale_toolbox_vraag_opslaan','centrale_toolbox_vraag_archiveren',
  'dashboard_admin_overzicht',
  // Incidenten — KAM-afhandeling (migratie 0027), per-bedrijf, anon dicht.
  'incident_deel2_opslaan','incident_meldlink_zorg','incident_meldlink_roteren','incident_meldlink_intrekken',
]
// Bewust anon/token-toegankelijk (moeten anon-EXECUTE houden).
const TOKEN_ANON = [
  'toolbox_voor_token','toolbox_afronden_token','deellink_data','deellink_actie_doorgeven',
  'deellink_actie_historie','deellink_bewijs_lijst','deellink_bewijs_pad','deellink_bewijs_registreren','deellink_concept_update',
  // Incidenten — open meldflow (Deel 1) via bedrijfstoken (migratie 0026).
  'incident_meldcontext_token','incident_melden_token','incident_foto_pad_token','incident_foto_registreren_token',
]

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `SECTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `sectest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `SECTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}

async function run(pgc) {
  // === LAAG 1 — exhaustieve grant-surface (pg) ===
  const namen = [...HARDENED, ...TOKEN_ANON]
  const { rows } = await pgc.query(
    `select p.proname,
       exists(select 1 from aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
              where r.rolname='anon' and a.privilege_type='EXECUTE') as anon_exec
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname = any($1)`, [namen])
  const anonExec = Object.fromEntries(rows.map(r => [r.proname, r.anon_exec]))
  let mis = 0
  for (const naam of HARDENED) if (anonExec[naam] !== false) { mis++; console.log(`   ! ${naam} heeft nog anon-EXECUTE`) }
  check(`Alle ${HARDENED.length} gehardende RPC's hebben GEEN anon-EXECUTE`, mis === 0, mis ? `${mis} mis` : 'exhaustief')
  let tokOk = 0
  for (const naam of TOKEN_ANON) if (anonExec[naam] === true) tokOk++
  check(`Alle ${TOKEN_ANON.length} bewust-anon token-RPC's behouden anon-EXECUTE`, tokOk === TOKEN_ANON.length, `${tokOk}/${TOKEN_ANON.length}`)

  // === Setup voor runtime ===
  const aCompany = await maakBedrijf('A')
  const clientA = await maakGebruiker('A', aCompany, 'client')
  const adminClient = await maakGebruiker('ADMIN', null, 'admin')

  // Admin maakt een link-toolbox (geen video/quiz vereist) en koppelt hem aan A.
  // Koppelen is admin-werk sinds 0040; een KAM kan dit niet meer zelf.
  const { data: tbId } = await adminClient.rpc('centrale_toolbox_opslaan', {
    p_id: null, p_titel: 'SECTEST_tb', p_tekst: 'x', p_video_url: null,
    p_vereist_video: false, p_vereist_quiz: false, p_quiz_slaaggrens: 70,
    p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 999,
  })
  if (tbId) toolboxIds.push(tbId)
  await adminClient.rpc('toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbId })
  const { data: fgId } = await clientA.rpc('functiegroep_opslaan', { p_id: null, p_company_id: aCompany, p_naam: 'SECTEST_groep', p_volgorde: 1 })
  const { data: p1 } = await admin.from('personen').insert({ company_id: aCompany, naam: 'SECTEST_P1', status: 'actief' }).select('id').single()
  const { data: token } = await clientA.rpc('create_deellink', { p_persoon_id: p1.id })

  // === LAAG 2 — runtime: anon afgewezen (reads, writes, admin) ===
  const y = new Date().getFullYear()
  const anonReads = [
    ['bedrijf_norm_overzicht', { p_company_id: aCompany }],
    ['bedrijf_toolbox_overzicht', { p_company_id: aCompany }],
    ['dashboard_overzicht', { p_company_id: aCompany }],
    ['toolbox_dashboard', { p_company_id: aCompany }],
    ['inspectie_bibliotheek', { p_company_id: aCompany }],
    ['herinner_kandidaten', { p_company_id: aCompany }],
  ]
  for (const [naam, params] of anonReads) {
    const { error } = await anon.rpc(naam, params)
    check(`anon afgewezen op read-RPC ${naam}`, !!error)
  }
  const anonMutaties = [
    ['doelstelling_zetten', { p_company_id: aCompany, p_functiegroep_id: fgId, p_doel_per_jaar: 99 }],
    ['functiegroep_opslaan', { p_id: null, p_company_id: aCompany, p_naam: 'HACK', p_volgorde: 1 }],
    ['toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbId }],
    ['create_deellink', { p_persoon_id: p1.id }],
    ['centrale_toolbox_opslaan', { p_id: null, p_titel: 'HACK', p_tekst: 'x', p_video_url: null, p_vereist_video: false, p_vereist_quiz: false, p_quiz_slaaggrens: 70, p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 1 }],
    ['dashboard_admin_overzicht', {}],
  ]
  for (const [naam, params] of anonMutaties) {
    const { error } = await anon.rpc(naam, params)
    check(`anon afgewezen op write/admin-RPC ${naam}`, !!error)
  }

  // === LAAG 3 — regressie: KAM/admin van eigen bedrijf werkt nog ===
  {
    const { data, error } = await clientA.rpc('bedrijf_norm_overzicht', { p_company_id: aCompany })
    check('KAM A kan bedrijf_norm_overzicht nog gebruiken', !error && Array.isArray(data), error?.message)
  }
  {
    const { data, error } = await clientA.rpc('toolbox_dashboard', { p_company_id: aCompany })
    check('KAM A kan toolbox_dashboard nog gebruiken', !error && !!data?.bedrijf, error?.message)
  }
  {
    const { error } = await clientA.rpc('doelstelling_zetten', { p_company_id: aCompany, p_functiegroep_id: fgId, p_doel_per_jaar: 10 })
    check('KAM A kan doelstelling_zetten nog gebruiken', !error, error?.message)
  }
  {
    const { data, error } = await clientA.rpc('toolbox_bewijs_overzicht', { p_company_id: aCompany, p_van: `${y}-01-01`, p_tot: `${y}-12-31` })
    check('KAM A kan export nog gebruiken (regressie 0021)', !error && Array.isArray(data), error?.message)
  }
  {
    // 0040: koppelen is géén KAM-werk meer. Bewust hier, naast de regressiechecks,
    // zodat een latere verruiming van de guard direct opvalt.
    const { error } = await clientA.rpc('toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbId })
    check('KAM A kan NIET meer koppelen (admin-only, 0040)', !!error && /beheerders/i.test(error.message || ''), error?.message ?? 'GEEN fout!')
  }
  {
    const { data, error } = await adminClient.rpc('dashboard_admin_overzicht')
    check('Admin kan dashboard_admin_overzicht nog gebruiken', !error && Array.isArray(data), error?.message)
  }
  {
    const { data, error } = await adminClient.rpc('centrale_toolbox_opslaan', { p_id: null, p_titel: 'SECTEST_tb2', p_tekst: 'x', p_video_url: null, p_vereist_video: false, p_vereist_quiz: false, p_quiz_slaaggrens: 70, p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 998 })
    check('Admin kan centrale_toolbox_opslaan nog gebruiken', !error && !!data, error?.message)
    if (data) toolboxIds.push(data)
  }

  // === LAAG 3 — werknemer-/gast-token-flow: MÉT token door, ZÓNDER token niet ===
  {
    const { data, error } = await anon.rpc('toolbox_voor_token', { p_token: token })
    check('anon MÉT geldig token: toolbox_voor_token werkt', !error && data?.persoon?.id === p1.id, error?.message)
  }
  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: token })
    check('anon MÉT geldig token: deellink_data werkt', !error && !!data?.persoon, error?.message)
  }
  {
    const { data, error } = await anon.rpc('toolbox_voor_token', { p_token: `neptoken_${TS}` })
    check('anon ZÓNDER geldig token: toolbox_voor_token geeft niets', !error && data === null, `data=${JSON.stringify(data)}`)
  }
  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: `neptoken_${TS}` })
    check('anon ZÓNDER geldig token: deellink_data geeft niets', !error && data === null, `data=${JSON.stringify(data)}`)
  }
  // Positieve eind-tot-eind: anon rondt via geldig token zijn eigen toolbox af.
  {
    const { data, error } = await anon.rpc('toolbox_afronden_token', { p_token: token, p_toolbox_id: tbId, p_video_bekeken: false, p_quiz_antwoorden: [], p_naam_bevestigd: true, p_handtekening: 'data:image/png;base64,AAAA' })
    check('anon MÉT token kan eigen toolbox afronden (flow intact)', !error && !!data, error?.message)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['toolbox_deelname', 'bedrijf_toolbox_afwijking', 'bedrijf_toolbox', 'bedrijf_doelstelling', 'deellinks', 'personen', 'functiegroep']) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  if (toolboxIds.length) await admin.from('centrale_toolbox').delete().in('id', toolboxIds)
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

let exitCode = 0
const pgc = new pg.Client({ connectionString: DBURL, ssl: { rejectUnauthorized: false } })
try {
  await pgc.connect()
  await run(pgc)
} catch (e) { console.error('\nFOUT:', e.message); exitCode = 1 }
finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle SECTEST_-data verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
  await pgc.end()
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
