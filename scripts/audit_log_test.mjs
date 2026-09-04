// ============================================================================
// Audit-logging — regressietest (bewijs)
// ----------------------------------------------------------------------------
// Bewijst de kerneigenschappen van de nieuwe audit_log-tabel (nachtopdracht,
// item 1 van de vervolgronde op de systeemdoorlichting):
//   1. audit_log_schrijven() legt een regel vast met de juiste 'wie' (auth.uid()
//      van de AANROEPER, niet een opgegeven parameter).
//   2. De tabel is APPEND-ONLY: UPDATE/DELETE/TRUNCATE worden geweigerd, ook
//      met de service-role.
//   3. Alleen admin mag de log LEZEN; een gewone client-sessie niet, anon niet.
//   4. anon mag audit_log_schrijven niet eens AANROEPEN (EXECUTE ingetrokken).
//   5. De twee onomzeilbare triggers vullen de log ook buiten elke RPC om:
//      een persoon rechtstreeks verwijderen, en een rol/company_id-wijziging
//      op users (via de service-role, zoals het echte aanmaakpad).
//
// Draaien:   node --use-system-ca scripts/audit_log_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles met prefix
// AUDITLOG_ wordt in een finally-blok opgeruimd.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; test overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Auditlogtest!' + TS
const results = []
let companyId, adminUserId, kamUserId, kamClient, adminClient, persoonId

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function run() {
  const { data: comp, error: ce } = await admin.from('companies')
    .insert({ name: `AUDITLOG_${TS}` }).select('id').single()
  if (ce) throw new Error('companies insert: ' + ce.message)
  companyId = comp.id

  const kamEmail = `auditlog_kam_${TS}@example.test`
  const { data: kamCreated, error: ke } = await admin.auth.admin.createUser({ email: kamEmail, password: PW, email_confirm: true })
  if (ke) throw new Error('createUser kam: ' + ke.message)
  kamUserId = kamCreated.user.id
  await admin.from('users').upsert({ id: kamUserId, email: kamEmail, role: 'client', company_id: companyId, naam: 'AUDITLOG KAM' })
  kamClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  { const { error } = await kamClient.auth.signInWithPassword({ email: kamEmail, password: PW }); if (error) throw new Error('signIn kam: ' + error.message) }

  const adminEmail = `auditlog_admin_${TS}@example.test`
  const { data: adminCreated, error: ae } = await admin.auth.admin.createUser({ email: adminEmail, password: PW, email_confirm: true })
  if (ae) throw new Error('createUser admin: ' + ae.message)
  adminUserId = adminCreated.user.id
  await admin.from('users').upsert({ id: adminUserId, email: adminEmail, role: 'admin', company_id: null, naam: 'AUDITLOG ADMIN' })
  adminClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  { const { error } = await adminClient.auth.signInWithPassword({ email: adminEmail, password: PW }); if (error) throw new Error('signIn admin: ' + error.message) }

  // --- 1: audit_log_schrijven legt de juiste 'wie' vast ---
  {
    const { error } = await kamClient.rpc('audit_log_schrijven', {
      p_actie: 'AUDITLOG_test_event', p_entiteit: 'test', p_entiteit_id: null,
      p_company_id: companyId, p_detail: { hallo: 'wereld' },
    })
    check('audit_log_schrijven lukt voor een ingelogde sessie', !error, error?.message)
    const { data: rij } = await admin.from('audit_log').select('wie, actie, company_id, detail')
      .eq('actie', 'AUDITLOG_test_event').eq('company_id', companyId).maybeSingle()
    check('de regel staat er met de juiste wie (auth.uid() van de aanroeper)', rij?.wie === kamUserId, `wie=${rij?.wie}`)
    check('detail is bewaard', rij?.detail?.hallo === 'wereld')
  }

  // --- 2: append-only, ook voor service-role ---
  {
    const { data: rij } = await admin.from('audit_log').select('id').eq('actie', 'AUDITLOG_test_event').eq('company_id', companyId).single()
    const { error: updErr } = await admin.from('audit_log').update({ actie: 'GEHACKT' }).eq('id', rij.id)
    check('service-role kan een logregel NIET wijzigen (UPDATE)', !!updErr, updErr?.message)
    const { error: delErr } = await admin.from('audit_log').delete().eq('id', rij.id)
    check('service-role kan een logregel NIET verwijderen (DELETE)', !!delErr, delErr?.message)
    const { data: naPogingen } = await admin.from('audit_log').select('actie').eq('id', rij.id).single()
    check('na beide pogingen is de regel letterlijk ongewijzigd', naPogingen?.actie === 'AUDITLOG_test_event')
  }
  {
    // TRUNCATE kan niet via de PostgREST-clientbibliotheek worden aangeroepen
    // (dat is geen tabel-operatie in die API) -- rechtstreeks via db_run.mjs.
    const { execSync } = await import('node:child_process')
    let faalde = false
    let melding = ''
    try {
      execSync('node scripts/db_run.mjs --query "truncate audit_log;"', { stdio: 'pipe' })
    } catch (e) {
      faalde = true
      melding = e.stdout?.toString().slice(0, 200) ?? e.message
    }
    check('TRUNCATE op audit_log wordt geweigerd (ook via een directe DB-verbinding)', faalde, melding)
  }

  // --- 3: alleen admin leest ---
  {
    const { data, error } = await kamClient.from('audit_log').select('id').limit(1)
    check('een gewone client-sessie leest GEEN logregels (RLS)', !error && (data ?? []).length === 0, error?.message ?? `${(data ?? []).length} rijen`)
    const { data: anonData, error: anonErr } = await anon.from('audit_log').select('id').limit(1)
    check('anon leest GEEN logregels', !anonErr && (anonData ?? []).length === 0, anonErr?.message ?? `${(anonData ?? []).length} rijen`)
    const { data: adminData, error: adminErr } = await adminClient.from('audit_log').select('id').eq('company_id', companyId).limit(5)
    check('admin ziet de logregels van dit testbedrijf wel', !adminErr && (adminData ?? []).length > 0, adminErr?.message ?? `${(adminData ?? []).length} rijen`)
  }

  // --- 4: anon mag de RPC niet eens aanroepen ---
  {
    const { error } = await anon.rpc('audit_log_schrijven', {
      p_actie: 'AUDITLOG_anon_poging', p_entiteit: 'test', p_entiteit_id: null, p_company_id: companyId,
    })
    check('anon kan audit_log_schrijven niet aanroepen (EXECUTE ingetrokken)', !!error, error?.message)
  }

  // --- 5a: trigger vangt een directe persoon-delete (buiten elke RPC om) ---
  {
    const { data: pers, error: pe } = await admin.from('personen')
      .insert({ company_id: companyId, naam: 'AUDITLOG Persoon', status: 'actief' }).select('id').single()
    if (pe) throw new Error('personen insert: ' + pe.message)
    persoonId = pers.id
    const { error: delErr } = await kamClient.from('personen').delete().eq('id', persoonId)
    check('client kan eigen persoon rechtstreeks verwijderen (bestaand, ongewijzigd gedrag)', !delErr, delErr?.message)
    const { data: logRij } = await admin.from('audit_log').select('wie, detail')
      .eq('actie', 'persoon_verwijderd').eq('entiteit_id', persoonId).maybeSingle()
    check('de trigger legt persoon_verwijderd vast, ONGEACHT dat er geen RPC aan te pas kwam',
      logRij?.wie === kamUserId && logRij?.detail?.naam === 'AUDITLOG Persoon', JSON.stringify(logRij))
  }

  // --- 5b: trigger vangt een rol/company_id-wijziging via de service-role ---
  {
    const { error: updErr } = await admin.from('users').update({ role: 'admin', company_id: null }).eq('id', kamUserId)
    check('service-role kan role/company_id op users wijzigen (bestaand aanmaakpad, ongewijzigd)', !updErr, updErr?.message)
    // .maybeSingle() zou hier ten onrechte falen: de upsert tijdens de
    // testopstelling zelf triggert ook al een 'rol_gewijzigd'-regel (de
    // signup-trigger zet eerst een default-rij neer, de upsert daarna is dus
    // zelf al een UPDATE). Pak daarom expliciet de LAATSTE regel.
    const { data: logRijen } = await admin.from('audit_log').select('wie, detail')
      .eq('actie', 'rol_gewijzigd').eq('entiteit_id', kamUserId).order('wanneer', { ascending: false }).limit(1)
    const logRij = logRijen?.[0]
    check('de trigger legt rol_gewijzigd vast met oude/nieuwe waarden (wie=null, want service-role heeft geen auth.uid())',
      logRij?.wie === null && logRij?.detail?.oude_rol === 'client' && logRij?.detail?.nieuwe_rol === 'admin',
      JSON.stringify(logRij))
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
  process.exitCode = mislukt.length ? 1 : 0
}

async function opruimen() {
  if (persoonId) { try { await admin.from('personen').delete().eq('id', persoonId) } catch { /* al weg */ } }
  if (companyId) {
    try { await admin.from('personen').delete().eq('company_id', companyId) } catch { /* mogelijk leeg */ }
    // audit_log zelf is append-only en heeft geen company-FK-cascade: de
    // testregels blijven bewust staan (dat is precies het ontwerp -- een
    // audit-log ruim je niet op). Ze zijn onschadelijk (prefix AUDITLOG_,
    // geen echte gebruikersdata) en tonen bovendien de onveranderlijkheid aan.
    try { await admin.from('companies').delete().eq('id', companyId) } catch { /* mogelijk al weg */ }
  }
  for (const id of [kamUserId, adminUserId]) {
    if (!id) continue
    try { await admin.from('users').delete().eq('id', id) } catch { /* mogelijk al weg */ }
    try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ }
  }
  console.log('Opgeruimd: testbedrijf/users/persoon verwijderd. De AUDITLOG_-logregels zelf blijven')
  console.log('bewust bestaan (append-only per ontwerp) -- onschadelijk testresidu, geen echte data.')
}

try {
  await run()
} finally {
  await opruimen()
}
