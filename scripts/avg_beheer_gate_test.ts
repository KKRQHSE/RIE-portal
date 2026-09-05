// ============================================================================
// Gate-test voor /admin/avg — bewijst dat de AVG-beheerpagina ECHT admin-only
// is, tegen een DRAAIENDE app, niet alleen via code-lezen.
// ----------------------------------------------------------------------------
//   1. Geen sessie      -> redirect naar /login (geen 200)
//   2. Client-sessie    -> 404 (notFound(), net als de andere admin-pagina's)
//   3. Teamleider-sessie-> 404
//   4. Admin-sessie     -> 200
//
// Draaien (twee terminals):
//   1) npm run dev
//   2) node --use-system-ca scripts/avg_beheer_gate_test.ts
//
// Wegwerpbedrijf/-gebruikers met prefix AVGGATE_, opgeruimd in het finally-blok.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch { /* geen .env.local */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASIS = (env.AI_TEST_BASIS || 'http://localhost:3000').replace(/\/$/, '')

if (!URL_SB || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local.')
  process.exit(1)
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Avggate!' + TS
const companyIds: string[] = []
const userIds: string[] = []
const results: { naam: string; ok: boolean }[] = []

function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// Zelfde sessiecookie-natekening als scripts/inspectie_ai_route_test.ts.
function base64url(tekst: string): string {
  return Buffer.from(tekst, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function maakSessieCookie(sessie: unknown): string {
  const ref = new URL(URL_SB!).hostname.split('.')[0]
  return `sb-${ref}-auth-token=base64-${base64url(JSON.stringify(sessie))}`
}

async function maakGebruiker(label: string, role: string, companyId: string | null) {
  const email = `avggate_${label}_${TS}@example.invalid`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)

  const { error: e } = await admin.from('users').upsert({
    id: created.user.id, email, role, company_id: companyId, naam: `AVGGATE ${label}`,
  })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2 || !data.session) throw new Error(`signIn (${label}): ${e2?.message ?? 'geen sessie'}`)
  return maakSessieCookie(data.session)
}

async function statusVoor(cookie: string | null): Promise<number> {
  const res = await fetch(`${BASIS}/admin/avg`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  })
  return res.status
}

async function main() {
  const { data: comp, error } = await admin
    .from('companies').insert({ name: `AVGGATE_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert: ${error.message}`)
  companyIds.push(comp.id)

  const anonStatus = await statusVoor(null)
  check('Geen sessie -> geen 200 (redirect naar /login)', anonStatus !== 200, `status ${anonStatus}`)

  const clientCookie = await maakGebruiker('client', 'client', comp.id)
  const clientStatus = await statusVoor(clientCookie)
  check('Client-sessie -> 404', clientStatus === 404, `status ${clientStatus}`)

  const teamleiderCookie = await maakGebruiker('teamleider', 'teamleider', comp.id)
  const teamleiderStatus = await statusVoor(teamleiderCookie)
  check('Teamleider-sessie -> 404', teamleiderStatus === 404, `status ${teamleiderStatus}`)

  const adminCookie = await maakGebruiker('admin', 'admin', null)
  const adminStatus = await statusVoor(adminCookie)
  check('Admin-sessie -> 200', adminStatus === 200, `status ${adminStatus}`)
}

main()
  .catch(e => { console.error('ONVERWACHTE FOUT:', e); process.exitCode = 1 })
  .finally(async () => {
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* best effort */ } }
    for (const id of companyIds) { try { await admin.from('companies').delete().eq('id', id) } catch { /* best effort */ } }
    const mislukt = results.filter(r => !r.ok)
    console.log('\n' + '─'.repeat(60))
    console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
    if (mislukt.length) process.exitCode = 1
  })
