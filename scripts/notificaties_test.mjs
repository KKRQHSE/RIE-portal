// ============================================================================
// Instelbaar in-app notificatiesysteem (Spoor B, B2)
// ----------------------------------------------------------------------------
// Dekt:
//  - goedkeuringsverzoek: alleen KAM/admin (nooit teamleider), direct via
//    INSERT-trigger;
//  - incident_melding: KAM + teamleider (scope 'werk'), direct via trigger;
//  - per-soort voorkeur (direct/periodiek/uit) wordt gerespecteerd: 'uit'
//    onderdrukt volledig, 'periodiek' levert een dagbundel i.p.v. een losse
//    rij per voorval, default (geen voorkeurrij) gedraagt zich als 'direct';
//  - de vier scan-soorten (acties over termijn, geplande audits,
//    RI&E-toetsing verloopt, toolbox-achterstand) met hun eigen rol-scope
//    (audits/RI&E/goedkeuring = KAM/admin-only, acties/toolbox = ook
//    teamleider) en idempotentie (nogmaals scannen dupliceert niet);
//  - cross-company isolatie op alle RPC's + RLS op de rauwe tabel zelf;
//  - gelezen zetten raakt nooit andermans rij.
//
// Draaien:  node --use-system-ca scripts/notificaties_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix NOTITEST_ wordt opgeruimd.
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
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
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
if (!URL || !ANON) { console.error('SUPABASE-URL/ANON ontbreken.'); process.exit(1) }
if (!SERVICE) { console.log('— SERVICE_ROLE ontbreekt; overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Notitest!' + TS
const companyIds = [], userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `NOTITEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `notitest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `NOTITEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return { client, id: created.user.id }
}

function heeft(lijst, eventType) {
  return (lijst ?? []).some(n => n.event_type === eventType)
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('KAMA', A, 'client')
  const teamleiderA = await maakGebruiker('TLA', A, 'teamleider')
  const kamB = await maakGebruiker('KAMB', B, 'client')
  const teamleiderB = await maakGebruiker('TLB', B, 'teamleider')

  // ===== 1. Voorkeuren: default alles 'direct', zetten/valideren =====
  {
    const { data, error } = await kamA.client.rpc('notificatie_voorkeuren_ophalen')
    const alleDirect = (data ?? []).length === 6 && data.every(v => v.modus === 'direct')
    check('default voorkeur is overal direct (6 soorten)', !error && alleDirect, error?.message ?? JSON.stringify(data))
  }
  {
    const { error } = await kamA.client.rpc('notificatie_voorkeur_zetten', { p_event_type: 'onzin', p_modus: 'direct' })
    check('onbekend event_type wordt geweigerd', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.client.rpc('notificatie_voorkeur_zetten', { p_event_type: 'incident_melding', p_modus: 'onzin' })
    check('onbekende modus wordt geweigerd', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 2. Goedkeuringsverzoek: alleen KAM/admin, nooit teamleider =====
  const { data: gv1, error: gv1Err } = await admin.from('goedkeuringsverzoek')
    .insert({ company_id: A, type: 'nieuw_concept', persoon_id: null, aangemaakt_door: teamleiderA.id })
    .select('id').single()
  if (gv1Err) throw new Error(`fixture goedkeuringsverzoek: ${gv1Err.message}`)
  {
    const { data: lijst } = await admin.from('notificatie').select('event_type, user_id').eq('event_type', 'goedkeuringsverzoek').eq('bron_id', gv1.id)
    const kamHeeft = lijst?.some(n => n.user_id === kamA.id)
    const tlHeeft = lijst?.some(n => n.user_id === teamleiderA.id)
    check('goedkeuringsverzoek-notificatie gaat naar KAM', kamHeeft === true, JSON.stringify(lijst))
    check('goedkeuringsverzoek-notificatie gaat NOOIT naar teamleider', tlHeeft !== true, JSON.stringify(lijst))
  }
  {
    const { data, error } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('KAM ziet de goedkeuringsverzoek-notificatie via de RPC', !error && heeft(data, 'goedkeuringsverzoek'), error?.message)
  }
  {
    const { error } = await kamB.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('KAM van ander bedrijf krijgt GEEN toegang tot notificaties van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 3. Incident: KAM + teamleider (scope 'werk') =====
  const { data: inc1, error: inc1Err } = await admin.from('incident')
    .insert({ company_id: A, datum: '2026-07-01', locatie: 'NOTITEST Hal 1', omschrijving: 'NOTITEST incident' })
    .select('id').single()
  if (inc1Err) throw new Error(`fixture incident: ${inc1Err.message}`)
  {
    const { data: lijst } = await admin.from('notificatie').select('user_id').eq('event_type', 'incident_melding').eq('bron_id', inc1.id)
    const kamHeeft = lijst?.some(n => n.user_id === kamA.id)
    const tlHeeft = lijst?.some(n => n.user_id === teamleiderA.id)
    check('incidentmelding gaat naar KAM', kamHeeft === true, JSON.stringify(lijst))
    check('incidentmelding gaat ook naar teamleider (scope werk)', tlHeeft === true, JSON.stringify(lijst))
  }
  {
    const { data: lijst } = await admin.from('notificatie').select('company_id').eq('event_type', 'incident_melding').eq('bron_id', inc1.id).eq('user_id', teamleiderB.id)
    check('incidentmelding van bedrijf A bereikt teamleider van bedrijf B niet', (lijst ?? []).length === 0, JSON.stringify(lijst))
  }

  // ===== 4. Voorkeur 'uit' onderdrukt volledig =====
  await teamleiderA.client.rpc('notificatie_voorkeur_zetten', { p_event_type: 'incident_melding', p_modus: 'uit' })
  const { data: inc2 } = await admin.from('incident')
    .insert({ company_id: A, datum: '2026-07-02', locatie: 'NOTITEST Hal 2', omschrijving: 'NOTITEST incident 2' })
    .select('id').single()
  {
    const { data: lijst } = await admin.from('notificatie').select('user_id').eq('event_type', 'incident_melding').eq('bron_id', inc2.id)
    const tlHeeft = lijst?.some(n => n.user_id === teamleiderA.id)
    const kamHeeft = lijst?.some(n => n.user_id === kamA.id)
    check('modus=uit onderdrukt de notificatie (teamleider)', tlHeeft !== true, JSON.stringify(lijst))
    check('KAM (nog op direct) krijgt hem gewoon', kamHeeft === true, JSON.stringify(lijst))
  }

  // ===== 5. Voorkeur 'periodiek' bundelt i.p.v. losse rij =====
  await kamA.client.rpc('notificatie_voorkeur_zetten', { p_event_type: 'incident_melding', p_modus: 'periodiek' })
  const { data: inc3 } = await admin.from('incident')
    .insert({ company_id: A, datum: new Date().toISOString().slice(0, 10), locatie: 'NOTITEST Hal 3', omschrijving: 'NOTITEST incident 3' })
    .select('id').single()
  {
    const { data: lijst } = await admin.from('notificatie').select('user_id').eq('event_type', 'incident_melding').eq('bron_id', inc3.id)
    const kamHeeftLos = lijst?.some(n => n.user_id === kamA.id)
    check('periodiek-gebruiker krijgt GEEN losse rij per incident', kamHeeftLos !== true, JSON.stringify(lijst))
  }
  {
    const { data } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const bundel = (data ?? []).find(n => n.event_type === 'incident_melding' && n.link_pad?.endsWith('/incidenten'))
    check('periodiek-gebruiker krijgt wel een dagbundel via notificaties_ophalen', !!bundel, JSON.stringify(bundel))
  }

  // ===== 6. Acties over termijn (scan, scope 'werk', idempotent) =====
  const { data: actieOver, error: actieErr } = await admin.from('pva_items')
    .insert({ company_id: A, nr: `NOTITEST-${TS}`, onderwerp: 'NOTITEST over termijn', status: 'Open', prio: 'Middel', termijn_datum: '2020-01-01' })
    .select('id').single()
  if (actieErr) throw new Error(`fixture pva_items: ${actieErr.message}`)
  {
    const { data, error } = await teamleiderA.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('teamleider ziet de individuele actie-over-termijn-notificatie (default direct)', !error && heeft(data, 'actie_over_termijn'), error?.message)
  }
  {
    const { count: voor } = await admin.from('notificatie').select('id', { count: 'exact', head: true }).eq('bron_tabel', 'pva_items').eq('bron_id', actieOver.id)
    await teamleiderA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const { count: na } = await admin.from('notificatie').select('id', { count: 'exact', head: true }).eq('bron_tabel', 'pva_items').eq('bron_id', actieOver.id)
    check('nogmaals scannen dupliceert de actie-notificatie niet', voor === na, `voor=${voor} na=${na}`)
  }

  // ===== 7. Geplande audits (scan, scope 'beheer' -- teamleider NIET) =====
  const morgen = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { error: auditErr } = await admin.from('audit')
    .insert({ company_id: A, sjabloon: 'vca', titel: 'NOTITEST audit', status: 'gepland', jaar: 2026, datum: morgen })
  if (auditErr) throw new Error(`fixture audit: ${auditErr.message}`)
  {
    const { data: kamData } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const { data: tlData } = await teamleiderA.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('KAM ziet de geplande-audit-notificatie', heeft(kamData, 'audit_gepland'), JSON.stringify(kamData?.filter(n => n.event_type === 'audit_gepland')))
    check('teamleider ziet GEEN audit-notificatie (audits blijven KAM/admin-only)', !heeft(tlData, 'audit_gepland'), JSON.stringify(tlData?.filter(n => n.event_type === 'audit_gepland')))
  }

  // ===== 8. RI&E-toetsing verloopt (scan, scope 'beheer') =====
  const over10dagen = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
  const { error: rieErr } = await admin.from('rie_versies')
    .insert({ company_id: A, versie: 1, status: 'actief', geldig_tot: over10dagen })
  if (rieErr) throw new Error(`fixture rie_versies: ${rieErr.message}`)
  {
    const { data: kamData } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const { data: tlData } = await teamleiderA.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('KAM ziet de RI&E-toetsing-verloopt-notificatie', heeft(kamData, 'rie_toetsing_verloopt'), JSON.stringify(kamData?.filter(n => n.event_type === 'rie_toetsing_verloopt')))
    check('teamleider ziet die RI&E-notificatie NIET', !heeft(tlData, 'rie_toetsing_verloopt'), JSON.stringify(tlData?.filter(n => n.event_type === 'rie_toetsing_verloopt')))
  }

  // ===== 9. Toolbox-achterstand (scan, scope 'werk' -- ook teamleider; alleen
  //          bij een geactiveerde toolbox-module, anders is elk bedrijf zonder
  //          sessies altijd "achter" volgens de pro-rata-formule) =====
  await admin.from('bedrijf_modules').upsert({ company_id: A, module: 'toolbox', actief: true, module_status: 'actief' })
  await admin.from('bedrijf_toolbox_instelling').upsert({ company_id: A, sessie_doel_per_jaar: 400 })
  {
    const { data: kamData } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const { data: tlData } = await teamleiderA.client.rpc('notificaties_ophalen', { p_company_id: A })
    check('KAM ziet de toolbox-achterstand-notificatie', heeft(kamData, 'toolbox_herinnering'), JSON.stringify(kamData?.filter(n => n.event_type === 'toolbox_herinnering')))
    check('teamleider ziet de toolbox-achterstand-notificatie ook (scope werk)', heeft(tlData, 'toolbox_herinnering'), JSON.stringify(tlData?.filter(n => n.event_type === 'toolbox_herinnering')))
  }
  {
    const { data: kamBData } = await kamB.client.rpc('notificaties_ophalen', { p_company_id: B })
    check('bedrijf B (geen doelstelling gezet) krijgt geen toolbox-achterstand van A besmet', !heeft(kamBData, 'toolbox_herinnering'), JSON.stringify(kamBData?.filter(n => n.event_type === 'toolbox_herinnering')))
  }

  // ===== 10. Gelezen zetten raakt nooit andermans rij; RLS op de rauwe tabel =====
  {
    const { data: kamData } = await kamA.client.rpc('notificaties_ophalen', { p_company_id: A })
    const kamNotifId = kamData?.find(n => n.event_type === 'goedkeuringsverzoek')?.id
    await teamleiderA.client.rpc('notificatie_gelezen_zetten', { p_id: kamNotifId })
    const { data: nog } = await admin.from('notificatie').select('gelezen_op').eq('id', kamNotifId).single()
    check('een ander kan andermans notificatie niet als gelezen markeren', nog?.gelezen_op === null, JSON.stringify(nog))
    await kamA.client.rpc('notificatie_gelezen_zetten', { p_id: kamNotifId })
    const { data: welGelezen } = await admin.from('notificatie').select('gelezen_op').eq('id', kamNotifId).single()
    check('de eigenaar kan zijn eigen notificatie wel als gelezen markeren', welGelezen?.gelezen_op !== null, JSON.stringify(welGelezen))
  }
  {
    const { data: rechtstreeks, error } = await teamleiderA.client.from('notificatie').select('user_id').eq('company_id', A)
    const alleenEigen = (rechtstreeks ?? []).every(n => n.user_id === teamleiderA.id)
    check('RLS op de rauwe tabel: rechtstreeks lezen geeft alleen eigen rijen', !error && alleenEigen, error?.message ?? JSON.stringify(rechtstreeks))
  }
  {
    await kamA.client.rpc('notificaties_alles_gelezen', { p_company_id: A })
    const { data: overAlles } = await admin.from('notificatie').select('gelezen_op').eq('company_id', A).eq('user_id', kamA.id)
    const allemaalGelezen = (overAlles ?? []).every(n => n.gelezen_op !== null)
    check('alles-gelezen markeert alle eigen notificaties van dat bedrijf', allemaalGelezen, JSON.stringify(overAlles))
  }
}

async function cleanup() {
  if (companyIds.length) {
    await admin.from('companies').delete().in('id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
}

console.log('======== Instelbaar in-app notificatiesysteem (B2) ========')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try { await cleanup(); console.log('  opgeruimd.') } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = results.filter(r => !r.ok).length
console.log(`\n## Notificaties (B2) -> ${fail === 0 && setupOk ? 'PASS' : 'FAIL'} (${results.length - fail}/${results.length})`)
process.exit(fail === 0 && setupOk ? 0 : 1)
