// ============================================================================
// Proxy PUBLIC_PATHS — bereikbaarheid van de gast-routes (geen sessie)
// ----------------------------------------------------------------------------
// Bewijst het bestaan (en de fix) van een categorie bug die verder nergens
// getest werd: een gast-route die WEL gebouwd is maar NIET in PUBLIC_PATHS
// staat, en daardoor door de proxy naar /login wordt geredirect vóórdat de
// pagina zelf ooit rendert. Precies dit overkwam /tb/[token] (de
// toolbox-gastflow, migratie 0017) sinds de feature bestond: geverifieerd met
// een verse, cookie-loze browsersessie tegen een echt geldig token dat de
// bezoeker linea recta naar /login ging, nooit naar de toolbox of zelfs maar
// de "ongeldige link"-pagina. Gefixt in proxy.ts (PUBLIC_PATHS + '/tb').
//
// Test met redirect:'manual' + géén cookies (fetch heeft er sowieso geen) —
// simuleert exact een anonieme bezoeker. Een geldig token is niet nodig: een
// ONGELDIG token hoort nog steeds de pagina zelf te bereiken (status 200, de
// "ongeldige link"-melding), niet een 307 naar /login.
//
// Draaien (dev-server nodig):  node --use-system-ca scripts/proxy_public_paths_test.mjs
// ============================================================================

const BASIS = (process.env.AI_TEST_BASIS || 'http://localhost:3000').replace(/\/$/, '')
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function appDraait() {
  try { await fetch(`${BASIS}/login`, { signal: AbortSignal.timeout(4000) }); return true }
  catch { return false }
}

// Gast-routes die zonder sessie bereikbaar moeten zijn (elk valideert zijn
// eigen token server-side via een SECURITY DEFINER-RPC; de proxy regelt
// alleen bereikbaarheid).
const GAST_ROUTES = [
  { pad: '/a/proxytest-ongeldig-token', naam: '/a (deellink-actiehouder)' },
  { pad: '/tb/proxytest-ongeldig-token', naam: '/tb (toolbox-gastflow)' },
  { pad: '/melden/proxytest-ongeldig-token', naam: '/melden (incident-meldflow)' },
]

// Ter vergelijking: een ECHT beveiligde route hoort nog steeds naar /login te
// gaan zonder sessie -- deze test mag PUBLIC_PATHS niet per ongeluk te breed
// maken.
const BEVEILIGDE_ROUTE = '/dashboard'

async function run() {
  if (!(await appDraait())) {
    check('dev-server bereikbaar', false, `geen respons op ${BASIS} — hele test overgeslagen`)
    return
  }

  for (const { pad, naam } of GAST_ROUTES) {
    const res = await fetch(`${BASIS}${pad}`, { redirect: 'manual' })
    const isRedirectNaarLogin = res.status >= 300 && res.status < 400 &&
      (res.headers.get('location') ?? '').includes('/login')
    check(`${naam}: GEEN redirect naar /login (bereikbaar zonder sessie)`,
      !isRedirectNaarLogin, `status ${res.status}${isRedirectNaarLogin ? `, location=${res.headers.get('location')}` : ''}`)
    check(`${naam}: geeft een echte pagina terug (status 200)`, res.status === 200, `status ${res.status}`)
  }

  const resBeveiligd = await fetch(`${BASIS}${BEVEILIGDE_ROUTE}`, { redirect: 'manual' })
  const gaatNaarLogin = resBeveiligd.status >= 300 && resBeveiligd.status < 400 &&
    (resBeveiligd.headers.get('location') ?? '').includes('/login')
  check(`${BEVEILIGDE_ROUTE}: gaat WEL naar /login zonder sessie (PUBLIC_PATHS niet te breed)`,
    gaatNaarLogin, `status ${resBeveiligd.status}, location=${resBeveiligd.headers.get('location')}`)
}

run()
  .catch(e => { console.error('ONVERWACHTE FOUT:', e.message); process.exitCode = 1 })
  .finally(() => {
    const mislukt = results.filter(r => !r.ok)
    console.log('\n' + '─'.repeat(60))
    console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
    if (mislukt.length) process.exitCode = 1
  })
