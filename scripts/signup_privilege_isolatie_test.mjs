// ============================================================================
// Signup-privilege-escalatie — regressietest (bewijs)
// ----------------------------------------------------------------------------
// Gevonden in de systeemdoorlichting van 4 september 2026
// (SYSTEEMDOORLICHTING_2026-09-04.md, categorie 3.1/3.2): handle_new_user las
// role/company_id rechtstreeks uit raw_user_meta_data — data die de aanvrager
// zelf meegeeft bij POST /auth/v1/signup, met alleen de publieke anon-key.
// Zo kon iedereen zichzelf role='admin' geven, of company_id op een
// bestaand bedrijf zetten en zo als KAM binnenkomen. Migratie 0062 negeert
// die metadata nu volledig: elk nieuw account krijgt altijd
// role='client', company_id=NULL.
//
// Dit script bewijst dat BEIDE aanvallen nu mislukken, met een echte publieke
// signup-aanroep (geen bestaand account nodig) tegen /auth/v1/signup — precies
// het pad dat tijdens de doorlichting werd geëxploiteerd.
//
// Draaien:   node --use-system-ca scripts/signup_privilege_isolatie_test.mjs
//            (--use-system-ca: zie de TLS-notitie in de andere isolatietests)
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om het resultaat te lezen
// en de testaccounts op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit over (exit 0).
//
// Alles met prefix SIGNUPTEST_ / e-mails onder example.invalid wordt in een
// finally-blok opgeruimd, ook bij een fout. Er wordt geen echte mail
// verstuurd (auth.users direct via de publieke signup-endpoint, met een
// wegwerp @example.invalid-adres).
// ============================================================================

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
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken in .env.local.')
  process.exit(1)
}
if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local.')
  console.log('  De signup-privilege-test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const TS = Date.now()
const results = []
const createdUserIds = []
let testCompanyId = null

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function restApi(path, opts = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function publiekeSignup(data) {
  const email = `signuptest_${TS}_${Math.random().toString(36).slice(2)}@example.invalid`
  const password = `Signuptest!${TS}${Math.random().toString(36).slice(2)}Aa1`
  const { status, body } = await restApi('/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON },
    body: JSON.stringify({ email, password, data }),
  })
  const userId = body?.id ?? body?.user?.id
  if (userId) createdUserIds.push(userId)
  return { status, userId, email }
}

async function publicUsersRij(id) {
  const { body } = await restApi(`/rest/v1/users?id=eq.${id}&select=id,role,company_id`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  return body?.[0] ?? null
}

async function opruimen() {
  for (const id of createdUserIds) {
    try {
      await fetch(`${URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      })
    } catch { /* al weg */ }
    try {
      await fetch(`${URL}/rest/v1/users?id=eq.${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'return=minimal' },
      })
    } catch { /* al weg */ }
  }
  if (testCompanyId) {
    await fetch(`${URL}/rest/v1/companies?id=eq.${testCompanyId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'return=minimal' },
    }).catch(() => {})
  }
  console.log('Opgeruimd: alle SIGNUPTEST_-testaccounts (en testbedrijf) verwijderd.')
}

async function run() {
  // --- Aanval 1: role='admin' meegeven bij signup ---
  {
    const { status, userId } = await publiekeSignup({ role: 'admin' })
    check('publieke signup met role=admin lukt (verwacht: account ontstaat gewoon)', status === 200, `status ${status}`)
    if (userId) {
      const rij = await publicUsersRij(userId)
      check('de toegekende rol is GEEN admin (was het gat: role uit metadata)',
        rij?.role !== 'admin', `rol=${rij?.role}`)
      check('de toegekende rol is de onbevoegde standaard client',
        rij?.role === 'client', `rol=${rij?.role}`)
      check('er is GEEN company_id gekoppeld (dus ook geen KAM-toegang ergens)',
        rij?.company_id === null, `company_id=${rij?.company_id}`)
    } else {
      check('kon de nieuwe rij niet controleren — signup gaf geen user-id terug', false)
    }
  }

  // --- Aanval 2: company_id van een bestaand bedrijf meegeven bij signup ---
  {
    // Eigen wegwerpbedrijf, niet Dutch Waste/Alpha/Bravo — dit toont exact
    // hetzelfde gat (elk bestaand bedrijf werkt), zonder een gedeeld
    // testbedrijf te raken.
    const { body: comp } = await restApi('/rest/v1/companies', {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'return=representation' },
      body: JSON.stringify({ name: `SIGNUPTEST_${TS}` }),
    })
    testCompanyId = comp?.[0]?.id
    if (!testCompanyId) {
      check('kon geen wegwerpbedrijf aanmaken voor aanval 2 — overgeslagen', false)
    } else {
      const { status, userId } = await publiekeSignup({ role: 'client', company_id: testCompanyId })
      check('publieke signup met een bestaand company_id lukt (verwacht: account ontstaat gewoon)', status === 200, `status ${status}`)
      if (userId) {
        const rij = await publicUsersRij(userId)
        check('de company_id komt NIET overeen met het opgegeven bedrijf (was het gat: company_id uit metadata)',
          rij?.company_id !== testCompanyId, `company_id=${rij?.company_id}`)
        check('er is helemaal geen bedrijf gekoppeld',
          rij?.company_id === null, `company_id=${rij?.company_id}`)
      } else {
        check('kon de nieuwe rij niet controleren — signup gaf geen user-id terug', false)
      }
    }
  }

  // --- Positieve controle: gewone signup zonder opgegeven rol werkt nog ---
  {
    const { status, userId } = await publiekeSignup({})
    check('een gewone signup zonder rol/bedrijf werkt nog gewoon (geen regressie)', status === 200, `status ${status}`)
    if (userId) {
      const rij = await publicUsersRij(userId)
      check('...en komt terecht als machteloze client zonder bedrijf',
        rij?.role === 'client' && rij?.company_id === null, `rol=${rij?.role} company_id=${rij?.company_id}`)
    }
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
  process.exitCode = mislukt.length ? 1 : 0
}

try {
  await run()
} finally {
  await opruimen()
}
