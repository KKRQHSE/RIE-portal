// ============================================================================
// IF-getal als VCA-berekening (Spoor B, B3)
// ----------------------------------------------------------------------------
// Dekt:
//  - IF = (verzuimongevallen x 1.000.000) / gewerkte uren, voor dit jaar en
//    vorig jaar apart;
//  - 0 verzuimongevallen + wél een urenbasis -> if_getal = 0 (Dutch Waste-geval);
//  - geen urenbasis ingevuld -> if_getal = null ("nog geen urenbasis" in de UI),
//    nooit een deling door nul;
//  - alleen incidenten met 'ongeval_met_verzuim' in gevolgen tellen mee, niet
//    'letsel' of 'ongeval_zonder_verzuim' alleen;
//  - het jaar van incident.datum bepaalt of het meetelt, niet het huidige jaar;
//  - gewerkte_uren_zetten: alleen KAM/admin, cross-company dicht;
//  - dashboard_if_getal: alleen KAM/admin, cross-company dicht.
//
// Draaien:  node --use-system-ca scripts/if_getal_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix IFTEST_ wordt opgeruimd.
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
const PW = 'Iftest!' + TS
const companyIds = [], userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

const HUIDIG_JAAR = new Date().getFullYear()
const VORIG_JAAR = HUIDIG_JAAR - 1

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `IFTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `iftest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `IFTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}
async function maakIncident(companyId, jaar, gevolgen) {
  const { error } = await admin.from('incident').insert({
    company_id: companyId, datum: `${jaar}-03-15`, locatie: 'IFTEST locatie',
    omschrijving: 'IFTEST incident', gevolgen,
  })
  if (error) throw new Error(`fixture incident: ${error.message}`)
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('KAMA', A, 'client')
  const kamB = await maakGebruiker('KAMB', B, 'client')

  // ===== 1. Geen urenbasis ingevuld -> if_getal = null, nooit een fout =====
  {
    const { data, error } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    check('zonder urenbasis geen fout, if_getal is null (dit jaar)', !error && data?.dit_jaar?.if_getal === null, error?.message ?? JSON.stringify(data?.dit_jaar))
    check('zonder urenbasis geen fout, if_getal is null (vorig jaar)', !error && data?.vorig_jaar?.if_getal === null, JSON.stringify(data?.vorig_jaar))
  }

  // ===== 2. Alleen KAM/admin, cross-company dicht =====
  {
    const { error } = await kamB.rpc('dashboard_if_getal', { p_company_id: A })
    check('KAM van ander bedrijf krijgt geen IF-getal van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamB.rpc('gewerkte_uren_zetten', { p_company_id: A, p_jaar: HUIDIG_JAAR, p_uren: 1000 })
    check('KAM van ander bedrijf kan geen gewerkte uren zetten voor A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 3. Urenbasis invullen, nog 0 incidenten -> Dutch Waste-geval: if_getal = 0 =====
  {
    const { error } = await kamA.rpc('gewerkte_uren_zetten', { p_company_id: A, p_jaar: HUIDIG_JAAR, p_uren: 100000 })
    check('KAM kan gewerkte uren zetten', !error, error?.message)
  }
  {
    const { data } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    check('0 verzuimongevallen + wel urenbasis -> if_getal = 0 (Dutch Waste-geval)', data?.dit_jaar?.if_getal === 0, JSON.stringify(data?.dit_jaar))
  }

  // ===== 4. 'letsel'/'ongeval_zonder_verzuim' tellen NIET mee =====
  await maakIncident(A, HUIDIG_JAAR, ['letsel'])
  await maakIncident(A, HUIDIG_JAAR, ['ongeval_zonder_verzuim'])
  {
    const { data } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    check('incidenten met alleen letsel/ongeval_zonder_verzuim tellen niet mee', data?.dit_jaar?.verzuimongevallen === 0, JSON.stringify(data?.dit_jaar))
  }

  // ===== 5. 'ongeval_met_verzuim' telt wel mee, berekening klopt =====
  await maakIncident(A, HUIDIG_JAAR, ['ongeval_met_verzuim'])
  {
    const { data } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    // IF = (1 x 1.000.000) / 100.000 = 10
    check('1 verzuimongeval / 100.000 uur -> IF = 10', data?.dit_jaar?.verzuimongevallen === 1 && data?.dit_jaar?.if_getal === 10, JSON.stringify(data?.dit_jaar))
  }

  // ===== 6. Jaar van incident.datum bepaalt of het meetelt =====
  await maakIncident(A, VORIG_JAAR, ['ongeval_met_verzuim'])
  await maakIncident(A, VORIG_JAAR, ['ongeval_met_verzuim'])
  await kamA.rpc('gewerkte_uren_zetten', { p_company_id: A, p_jaar: VORIG_JAAR, p_uren: 50000 })
  {
    const { data } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    // Vorig jaar: 2 verzuimongevallen / 50.000 uur -> IF = 40. Dit jaar blijft 1/100.000 -> 10.
    check('vorig-jaar-incidenten tellen niet mee bij dit jaar', data?.dit_jaar?.verzuimongevallen === 1, JSON.stringify(data?.dit_jaar))
    check('vorig jaar: 2 verzuimongevallen / 50.000 uur -> IF = 40', data?.vorig_jaar?.verzuimongevallen === 2 && data?.vorig_jaar?.if_getal === 40, JSON.stringify(data?.vorig_jaar))
  }

  // ===== 7. Cross-company: incidenten van B raken IF van A niet =====
  await kamB.rpc('gewerkte_uren_zetten', { p_company_id: B, p_jaar: HUIDIG_JAAR, p_uren: 1000 })
  await maakIncident(B, HUIDIG_JAAR, ['ongeval_met_verzuim'])
  await maakIncident(B, HUIDIG_JAAR, ['ongeval_met_verzuim'])
  await maakIncident(B, HUIDIG_JAAR, ['ongeval_met_verzuim'])
  {
    const { data } = await kamA.rpc('dashboard_if_getal', { p_company_id: A })
    check('incidenten van bedrijf B tellen niet mee bij bedrijf A', data?.dit_jaar?.verzuimongevallen === 1, JSON.stringify(data?.dit_jaar))
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

console.log('======== IF-getal als VCA-berekening (B3) ========')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try { await cleanup(); console.log('  opgeruimd.') } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = results.filter(r => !r.ok).length
console.log(`\n## IF-getal (B3) -> ${fail === 0 && setupOk ? 'PASS' : 'FAIL'} (${results.length - fail}/${results.length})`)
process.exit(fail === 0 && setupOk ? 0 : 1)
