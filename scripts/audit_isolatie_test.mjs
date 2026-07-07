// ============================================================================
// Auditmodule — isolatie-tests
// ----------------------------------------------------------------------------
// Bewijst de bedrijfsisolatie van de audit-tabellen + RPC's: een KAM van bedrijf
// A ziet/muteert niet de audits van B, een anonieme bezoeker kan geen audit
// aanmaken (EXECUTE ingetrokken, Beslissing 62), en A mag zijn eigen audit wél
// aanmaken/vullen (positieve controle) inclusief "maak actie van bevinding".
//
// Draaien:   node --use-system-ca scripts/audit_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles met prefix AUDITTEST_
// wordt in finally opgeruimd.
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
if (!URL || !ANON) { console.error('SUPABASE URL/ANON ontbreken.'); process.exit(1) }
if (!SERVICE) { console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt. Overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Audittest!' + TS
const companyIds = []
const userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ naam, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `AUDITTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId) {
  const email = `audittest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: e } = await admin.from('users').upsert({ id: created.user.id, email, role: 'client', company_id: companyId, naam: `AUDITTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const aId = await maakBedrijf('A')
  const bId = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', aId)
  await maakGebruiker('B', bId)
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

  // Seed: B heeft een audit + verbeterpunt (service role omzeilt RLS).
  const { data: bAudit, error: seedErr } = await admin.from('audit')
    .insert({ company_id: bId, sjabloon: 'iso', titel: 'AUDITTEST_B', jaar: 2026, status: 'gepland' }).select('id').single()
  if (seedErr) throw new Error(`seed audit B: ${seedErr.message}`)
  const { data: bVp } = await admin.from('audit_verbeterpunt')
    .insert({ audit_id: bAudit.id, company_id: bId, constatering: 'AUDITTEST_B_vp', soort: 'verbeterpunt' }).select('id').single()

  // Positief: A maakt eigen VCA-audit aan (RPC kopieert de catalogus).
  let aAudit = null
  {
    const { data, error } = await clientA.rpc('audit_aanmaken', { p_company_id: aId, p_sjabloon: 'vca', p_titel: 'AUDITTEST_A', p_jaar: 2026 })
    aAudit = data
    check('A maakt eigen audit aan (positieve controle)', !error && !!data, error ? error.message : 'ok')
  }
  {
    const { data } = await clientA.from('audit_vca_bevinding').select('id').eq('audit_id', aAudit)
    check('VCA-catalogus gekopieerd naar eigen audit', (data?.length ?? 0) === 35, `${data?.length ?? '?'} bevindingen`)
  }
  {
    const { data } = await clientA.from('audit').select('id').eq('company_id', aId)
    check('A ziet eigen audits', (data?.length ?? 0) >= 1, `${data?.length ?? '?'} audits`)
  }
  // Isolatie lezen: A ziet B's audit niet.
  {
    const { data } = await clientA.from('audit').select('id').eq('company_id', bId)
    check('A ziet audits van B niet', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data } = await clientA.from('audit_verbeterpunt').select('id').eq('id', bVp.id)
    check('A ziet verbeterpunt van B niet', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  // Isolatie muteren: A kan geen audit voor B aanmaken (RPC guard).
  {
    const { error } = await clientA.rpc('audit_aanmaken', { p_company_id: bId, p_sjabloon: 'iso', p_titel: 'HACK', p_jaar: 2026 })
    check('A kan geen audit voor B aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Isolatie muteren: A kan geen audit-rij voor B direct inserten (RLS with check).
  {
    const { error } = await clientA.from('audit').insert({ company_id: bId, sjabloon: 'iso', titel: 'HACK', jaar: 2026 })
    check('A kan geen audit-rij voor B inserten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Isolatie: A kan van B's verbeterpunt geen actie maken.
  {
    const { error } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'verbeterpunt', p_bron_id: bVp.id })
    check('A kan van B-verbeterpunt geen actie maken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Anon: geen audit aanmaken (EXECUTE ingetrokken).
  {
    const { error } = await anon.rpc('audit_aanmaken', { p_company_id: bId, p_sjabloon: 'iso', p_titel: 'HACK', p_jaar: 2026 })
    check('Anon kan geen audit aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { data } = await anon.from('audit').select('id').eq('company_id', bId)
    check('Anon ziet geen audits', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen`)
  }
  // Positief: A maakt van EIGEN verbeterpunt een actie (RPC → pva_items).
  {
    const { data: vp } = await clientA.from('audit_verbeterpunt')
      .insert({ audit_id: aAudit, company_id: aId, constatering: 'AUDITTEST_A_vp', soort: 'afwijking' }).select('id').single()
    const { data: actieId, error } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'verbeterpunt', p_bron_id: vp.id })
    check('A maakt actie van eigen verbeterpunt (positieve controle)', !error && !!actieId, error ? error.message : 'ok')
    if (actieId) {
      const { data: pva } = await admin.from('pva_items').select('bron_type, bron_id').eq('id', actieId).single()
      check('Actie heeft bron_type=audit_bevinding + bron_id=audit', !!pva && pva.bron_type === 'audit_bevinding' && pva.bron_id === aAudit,
        pva ? `${pva.bron_type}/${pva.bron_id === aAudit ? 'audit' : 'ander'}` : 'geen rij')
    }
  }
  // Defensief: B's audit ongewijzigd.
  {
    const { data } = await admin.from('audit').select('titel').eq('id', bAudit.id).single()
    check('B-audit bleef ongewijzigd', !!data && data.titel === 'AUDITTEST_B')
  }
}

async function cleanup() {
  if (companyIds.length) {
    await admin.from('pva_items').delete().in('company_id', companyIds)
    await admin.from('audit').delete().in('company_id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

let exitCode = 0
try { await run() }
catch (e) { console.error('\nFOUT tijdens de testopzet:', e.message); exitCode = 1 }
finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle AUDITTEST_-data en testgebruikers verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
