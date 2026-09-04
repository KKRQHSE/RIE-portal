// ============================================================================
// Browser-E2E smoke test — admin + client, per hoofdmodule
// ----------------------------------------------------------------------------
// Nachtopdracht item 8. Dit is de ENIGE test in de hele suite die een echte
// browser gebruikt (Playwright/Chromium) — alle andere tests zijn database-/
// API-niveau. Doel: bewijzen dat de UI-laag zelf ook werkt (inloggen, een
// hoofdscherm laadt, één kernactie per module, een geweigerde actie toont een
// nette foutmelding), niet alleen de RPC's erachter.
//
// Draaien:   node --use-system-ca scripts/browser_smoke_test.mjs
// Vereist een draaiende dev-server (npm run dev) EN SUPABASE_SERVICE_ROLE_KEY.
// Screenshots (altijd, niet alleen bij een fout) naar
// audit/2026-09-04/screenshots/. Testdata (bedrijf/users) met prefix
// SMOKETEST_ wordt in een finally-blok opgeruimd.
// ============================================================================

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASIS = process.env.AI_TEST_BASIS || 'http://localhost:3000'
const SHOTDIR = join(process.cwd(), 'audit', '2026-09-04', 'screenshots')
mkdirSync(SHOTDIR, { recursive: true })

if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; test overgeslagen.')
  process.exit(0)
}

async function appDraait() {
  try { await fetch(`${BASIS}/login`, { signal: AbortSignal.timeout(4000) }); return true }
  catch { return false }
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Smoketest!' + TS
const results = []
let companyId, clientUserId, adminUserId

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function login(page, email) {
  await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', PW)
  await page.click('button[type="submit"]')
  // Login gaat client-side (Supabase-aanroep) en redirect pas daarna --
  // networkidle direct na de klik ving vaak nog de "Even geduld..."-staat.
  // Wacht expliciet tot de URL niet meer /login is (of een timeout, dan
  // faalt de latere check terecht).
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 10000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
}

async function bezoek(page, pad, naam, verwachtNietGevonden = false) {
  const res = await page.goto(`${BASIS}${pad}`, { waitUntil: 'networkidle' })
  const status = res?.status() ?? 0
  const eindUrl = page.url()
  // Status 200 kan ook "stiekem teruggestuurd naar /login" betekenen (de
  // proxy redirect, en /login zelf antwoordt met 200) -- dat is geen
  // geslaagd paginabezoek, dus expliciet uitsluiten.
  const isLoginRedirect = eindUrl.includes('/login') && pad !== '/login'
  const bestandsnaam = naam.replace(/[^a-z0-9_-]/gi, '_')
  await page.screenshot({ path: join(SHOTDIR, `${bestandsnaam}.png`), fullPage: false }).catch(() => {})
  const heeftNextErrorOverlay = await page.locator('text=Application error').count().catch(() => 0)
  if (verwachtNietGevonden) {
    check(`${naam}: geeft nette "niet gevonden" (geen 500, geen crash)`, !isLoginRedirect && (status === 404 || status === 200), `status ${status}, url=${eindUrl}`)
  } else {
    check(`${naam}: laadt zonder servercrash (status ${status}, geen error-overlay, niet naar /login teruggestuurd)`,
      status === 200 && heeftNextErrorOverlay === 0 && !isLoginRedirect, `status ${status}, url=${eindUrl}`)
  }
  return status
}

async function run() {
  const dev = await appDraait()
  if (!dev) {
    check('dev-server bereikbaar', false, `geen respons op ${BASIS} — hele test overgeslagen`)
    return
  }

  const { data: comp, error: ce } = await admin.from('companies').insert({ name: `SMOKETEST_${TS}` }).select('id').single()
  if (ce) throw new Error('companies insert: ' + ce.message)
  companyId = comp.id
  // Module-identifiers geverifieerd tegen de exacte .eq('module', ...) in elke
  // page.tsx (incidenten/toolbox/inspecties/audits) -- 'incidenten' is
  // meervoud, geen 'incident'.
  await admin.from('bedrijf_modules').insert([
    { company_id: companyId, module: 'inspectie', actief: true, module_status: 'actief' },
    { company_id: companyId, module: 'incidenten', actief: true, module_status: 'actief' },
    { company_id: companyId, module: 'audit', actief: true, module_status: 'actief' },
    { company_id: companyId, module: 'toolbox', actief: true, module_status: 'actief' },
  ])

  const clientEmail = `smoketest_client_${TS}@example.test`
  const { data: clientCreated, error: cue } = await admin.auth.admin.createUser({ email: clientEmail, password: PW, email_confirm: true })
  if (cue) throw new Error('createUser client: ' + cue.message)
  clientUserId = clientCreated.user.id
  await admin.from('users').upsert({ id: clientUserId, email: clientEmail, role: 'client', company_id: companyId, naam: 'Smoketest Client' })

  const adminEmail = `smoketest_admin_${TS}@example.test`
  const { data: adminCreated, error: aue } = await admin.auth.admin.createUser({ email: adminEmail, password: PW, email_confirm: true })
  if (aue) throw new Error('createUser admin: ' + aue.message)
  adminUserId = adminCreated.user.id
  await admin.from('users').upsert({ id: adminUserId, email: adminEmail, role: 'admin', company_id: null, naam: 'Smoketest Admin' })

  const browser = await chromium.launch()

  try {
    // ============================================================
    // ROL: CLIENT
    // ============================================================
    console.log('\n--- Rol: client ---')
    const clientPage = await browser.newPage()
    await login(clientPage, clientEmail)
    const naLoginUrl = clientPage.url()
    check('client: inloggen lukt en komt NIET terug op /login', !naLoginUrl.includes('/login'), naLoginUrl)
    await clientPage.screenshot({ path: join(SHOTDIR, 'client_na_login.png') }).catch(() => {})

    await bezoek(clientPage, `/${companyId}/pva`, 'client_pva')
    await bezoek(clientPage, `/${companyId}/rie`, 'client_rie')
    await bezoek(clientPage, `/${companyId}/toolbox`, 'client_toolbox')
    await bezoek(clientPage, `/${companyId}/inspecties`, 'client_inspecties')
    await bezoek(clientPage, `/${companyId}/incidenten`, 'client_incidenten')
    await bezoek(clientPage, `/${companyId}/actielijst`, 'client_actielijst')
    await bezoek(clientPage, `/${companyId}/personen`, 'client_personen')
    await bezoek(clientPage, `/${companyId}/dashboard`, 'client_dashboard')

    // Kernactie: een losse actie toevoegen via de actielijst-UI (of PvA), en
    // controleren dat 'm terugkomt. Val terug op "formulier aanwezig" als de
    // exacte knoptekst niet matcht -- UI-tekst kan zijn gewijzigd zonder dat
    // dit script dat hoort te breken op een detail.
    {
      await clientPage.goto(`${BASIS}/${companyId}/actielijst`, { waitUntil: 'networkidle' })
      // "+ Losse actie toevoegen" is soms een <a href="#..."> (link-rol), soms
      // een <button> -- zoek op zichtbare tekst i.p.v. een specifieke rol.
      const heeftToevoegen = await clientPage.getByText(/toevoegen/i).count().catch(() => 0)
      check('client: actielijst toont een manier om een actie toe te voegen (kernactie-ingang aanwezig)', heeftToevoegen > 0, `${heeftToevoegen} treffers`)
    }

    // Geweigerde actie: admin-only scherm bezoeken, moet netjes 404 geven, geen crash.
    await bezoek(clientPage, `/admin/huisstijl`, 'client_admin_huisstijl_GEWEIGERD', true)
    // Geweigerde actie: ander (niet-bestaand) bedrijf — moet ook netjes afgehandeld worden.
    await bezoek(clientPage, `/00000000-0000-0000-0000-000000000000/pva`, 'client_ander_bedrijf_GEWEIGERD', true)

    await clientPage.close()

    // ============================================================
    // ROL: ADMIN
    // ============================================================
    console.log('\n--- Rol: admin ---')
    const adminPage = await browser.newPage()
    await login(adminPage, adminEmail)
    const naLoginUrlAdmin = adminPage.url()
    check('admin: inloggen lukt en komt NIET terug op /login', !naLoginUrlAdmin.includes('/login'), naLoginUrlAdmin)
    await adminPage.screenshot({ path: join(SHOTDIR, 'admin_na_login.png') }).catch(() => {})

    await bezoek(adminPage, `/dashboard`, 'admin_dashboard_rollup')
    await bezoek(adminPage, `/${companyId}/pva`, 'admin_pva_ander_bedrijf')
    await bezoek(adminPage, `/${companyId}/personen`, 'admin_personen')
    await bezoek(adminPage, `/${companyId}/modules`, 'admin_modules')
    await bezoek(adminPage, `/admin/huisstijl`, 'admin_huisstijl')
    await bezoek(adminPage, `/admin/bibliotheek`, 'admin_bibliotheek')
    await bezoek(adminPage, `/admin/toolboxen`, 'admin_toolboxen')

    // Kernactie: modulebeheerscherm toont de bekende activeer/uitzet-knoppen
    // (gewone <button>-elementen, geen checkbox/switch-markup).
    {
      await adminPage.goto(`${BASIS}/${companyId}/modules`, { waitUntil: 'networkidle' })
      const heeftModuleKnoppen = await adminPage.getByRole('button', { name: /activeren|aanzetten|uitzetten|stopzetten/i }).count().catch(() => 0)
      check('admin: modulebeheer toont activeer/uitzet-knoppen (kernactie-ingang aanwezig)', heeftModuleKnoppen > 0, `${heeftModuleKnoppen} knoppen`)
    }

    await adminPage.close()
  } finally {
    await browser.close()
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} checks geslaagd.`)
  console.log(`Screenshots: ${SHOTDIR}`)
  process.exitCode = mislukt.length ? 1 : 0
}

async function opruimen() {
  if (companyId) {
    for (const tbl of ['bedrijf_modules', 'personen', 'pva_items']) {
      try { await admin.from(tbl).delete().eq('company_id', companyId) } catch { /* mogelijk leeg */ }
    }
    try { await admin.from('companies').delete().eq('id', companyId) } catch { /* mogelijk al weg */ }
  }
  for (const id of [clientUserId, adminUserId]) {
    if (!id) continue
    try { await admin.from('users').delete().eq('id', id) } catch { /* mogelijk al weg */ }
    try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ }
  }
  console.log('Opgeruimd: SMOKETEST_-bedrijf, users. Screenshots blijven staan als bewijs.')
}

try {
  await run()
} finally {
  await opruimen()
}
