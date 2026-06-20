// ============================================================================
// NACHTTEST — Storage-isolatie (bewijs-bucket)
// ----------------------------------------------------------------------------
// Toetst of een ingelogde gebruiker van bedrijf A via de Supabase Storage-API
// RECHTSTREEKS (buiten de app om) bij de bewijsbestanden van bedrijf B kan.
// Pad-conventie: bewijs/<company_id>/<actieId>/<random>.<ext> (bedrijf-geprefixt).
//
// De app zelf gebruikt service-role signed URLs (na geguarde RPC's), dus deze test
// gaat over het ONDERLIGGENDE storage.objects-RLS: dekt dat de bedrijfsgrens af?
//
//   node scripts/nachttest_storage.mjs
// Maakt NACHTTEST_-bedrijven + één testbestand aan en ruimt alles op.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
      let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch {}
  return { ...env, ...process.env }
}
const env = loadEnv()
const { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = env
if (!URL || !ANON || !SERVICE) { console.error('env ontbreekt'); process.exit(2) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Nachttest!' + TS
const companyIds = []
const userIds = []
const paden = []
const rows = []
function rec(naam, ok, detail) { rows.push({ naam, ok }); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${naam}${detail ? ` — ${detail}` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `NACHTTEST_ST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, cid) {
  const email = `nachttest_st_${label}_${TS}@example.test`
  const { data: c, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(c.user.id)
  await admin.from('users').upsert({ id: c.user.id, email, role: 'client', company_id: cid, naam: `NACHTTEST ST ${label}` })
  const cl = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await cl.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signin ${label}: ${e2.message}`)
  return cl
}

async function run() {
  console.log('\n=== SETUP ===')
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const cA = await maakGebruiker('A', A)
  console.log(`  A=${A}  B=${B}`)

  // Service-role legt een "geheim" bewijsbestand van B neer (zoals de app dat doet).
  const actie = randomUUID()
  const bPad = `${B}/${actie}/geheim_${TS}.txt`
  const aPad = `${A}/${randomUUID()}/eigen_${TS}.txt`
  paden.push(bPad, aPad)
  {
    const { error } = await admin.storage.from('bewijs').upload(bPad, Buffer.from('GEHEIM bewijs van bedrijf B'), { contentType: 'text/plain', upsert: true })
    if (error) throw new Error(`upload B-bestand: ${error.message}`)
    await admin.storage.from('bewijs').upload(aPad, Buffer.from('eigen bestand A'), { contentType: 'text/plain', upsert: true })
  }

  console.log('\n=== STORAGE-ISOLATIE (ingelogde A vs bewijs van B) ===')
  // 1. A downloadt B's bestand rechtstreeks via de Storage-API
  {
    const { data, error } = await cA.storage.from('bewijs').download(bPad)
    const tekst = data ? await data.text() : null
    const kreegB = !!data && tekst?.includes('GEHEIM')
    rec('A kan B-bewijsbestand NIET rechtstreeks downloaden', !kreegB, kreegB ? `LAS B's bestand: "${tekst}"` : (error ? `geweigerd (${error.message})` : 'geen data'))
  }
  // 2. A somt B's bewijsmap op (enumeratie)
  {
    const { data, error } = await cA.storage.from('bewijs').list(`${B}/${actie}`)
    const ziet = (data?.length ?? 0) > 0
    rec('A kan B-bewijsmap NIET opsommen (list)', !ziet, ziet ? `LISTTE ${data.length} bestand(en) van B` : (error ? `geweigerd (${error.message})` : 'leeg'))
  }
  // 3. A schrijft een bestand in B's map
  {
    const indringer = `${B}/${actie}/INDRINGER_${TS}.txt`
    const { data, error } = await cA.storage.from('bewijs').upload(indringer, Buffer.from('A schrijft in B'), { contentType: 'text/plain' })
    const gelukt = !!data && !error
    if (gelukt) paden.push(indringer)
    rec('A kan GEEN bestand in B-bewijsmap schrijven', !gelukt, gelukt ? 'UPLOAD in B GELUKT' : `geweigerd (${error?.message})`)
  }
  // positieve controle: A mag z'n EIGEN map wel (als bedrijf-scoping bestaat); anders info
  {
    const { data, error } = await cA.storage.from('bewijs').download(aPad)
    rec('positieve controle: A kan EIGEN bewijsbestand downloaden', !!data, error ? `(${error.message})` : 'ok')
  }
}

async function cleanup() {
  try { if (paden.length) await admin.storage.from('bewijs').remove(paden) } catch {}
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch {} }
  }
  if (companyIds.length) {
    for (const t of ['bewijs', 'pva_items', 'personen']) await admin.from(t).delete().in('company_id', companyIds)
    await admin.from('companies').delete().in('id', companyIds)
  }
}
async function residu() {
  const { data: c } = await admin.from('companies').select('id').ilike('name', 'NACHTTEST_ST%')
  const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const restAuth = (au?.users ?? []).filter(u => (u.email || '').startsWith('nachttest_st_'))
  // storage: probeer B-map nogmaals te listen via service
  let stRest = 0
  for (const cid of companyIds) { const { data } = await admin.storage.from('bewijs').list(cid); stRest += (data?.length ?? 0) }
  return { companies: c?.length ?? 0, authUsers: restAuth.length, storageObjs: stRest }
}

console.log('================ NACHTTEST — Storage-isolatie ================')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try {
    await cleanup()
    const r = await residu()
    const schoon = r.companies === 0 && r.authUsers === 0 && r.storageObjs === 0
    console.log(`  Residu: companies=${r.companies}, auth.users=${r.authUsers}, storage-objecten=${r.storageObjs}`)
    console.log(schoon ? '  ✅ Opruimen compleet.' : '  ❌ Residu aangetroffen!')
  } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = rows.filter(r => !r.ok).length
console.log(`\n## Storage-isolatie -> ${fail === 0 ? 'PASS' : 'FAIL'} (${rows.length - fail}/${rows.length})`)
console.log(fail === 0 ? 'Storage-laag isoleert per bedrijf.' : `${fail} bevinding(en): de bewijs-bucket scope't NIET per bedrijf.`)
process.exit(fail === 0 && setupOk ? 0 : 1)
