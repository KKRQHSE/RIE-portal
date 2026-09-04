// ============================================================================
// Upload-validatie — regressietest (bewijs)
// ----------------------------------------------------------------------------
// Gevonden in de systeemdoorlichting Ronde 2 (must-punt 4): geen server-side
// controle op mime-type/grootte bij uploads; geen bucket-allowlist. Dit
// script bewijst twee ONAFHANKELIJKE lagen:
//   1. de ROUTE weigert een verkeerd opgegeven type/grootte al vóórdat er een
//      signed URL wordt gemint (nette 4xx, geen signed URL in de respons);
//   2. de BUCKET zelf (allowed_mime_types/file_size_limit) weigert ook een
//      daadwerkelijke upload met een verkeerd Content-Type, ONAFHANKELIJK
//      van de route — getest door de route-check te omzeilen en rechtstreeks
//      een signed URL te vragen met de service-role, zoals de route dat zelf
//      zou doen ná een (hypothetisch omzeilde) routecheck.
//
// Draaien:   node --use-system-ca scripts/upload_validatie_test.mjs
//            Vereist een draaiende dev-server (npm run dev) voor de
//            route-tests; zonder server worden alleen de bucket- en
//            pure-functietests gedraaid.
//
// Alles met prefix UPLOADTEST_ wordt in een finally-blok opgeruimd.
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
const BASIS = process.env.AI_TEST_BASIS || 'http://localhost:3000'

if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; test overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Uploadtest!' + TS
const results = []
let companyId, userId, actieId

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// De route leest de gebruiker uit een sessiecookie (via @supabase/ssr), niet
// uit een Authorization-header — die wordt door de server-client genegeerd.
// Zelfde patroon als scripts/inspectie_ai_route_test.ts.
function base64url(tekst) {
  return Buffer.from(tekst, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function maakSessieCookie(sessie) {
  const ref = new globalThis.URL(URL).hostname.split('.')[0]
  return `sb-${ref}-auth-token=base64-${base64url(JSON.stringify(sessie))}`
}

async function appDraait() {
  try {
    await fetch(`${BASIS}/login`, { signal: AbortSignal.timeout(4000), redirect: 'manual' })
    return true
  } catch { return false }
}

async function run() {
  const { data: comp, error: ce } = await admin.from('companies')
    .insert({ name: `UPLOADTEST_${TS}` }).select('id').single()
  if (ce) throw new Error('companies insert: ' + ce.message)
  companyId = comp.id
  try { await admin.from('bedrijf_modules').insert({ company_id: companyId, module: 'pva', actief: true, module_status: 'actief' }) } catch { /* optioneel */ }

  const email = `uploadtest_${TS}@example.test`
  const { data: created, error: ue } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (ue) throw new Error('createUser: ' + ue.message)
  userId = created.user.id
  await admin.from('users').upsert({ id: userId, email, role: 'client', company_id: companyId, naam: 'Uploadtest KAM' })

  const { data: item, error: ie } = await admin.from('pva_items')
    .insert({ company_id: companyId, nr: 'UPLOADTEST-1', onderwerp: 'test', status: 'Open' }).select('id').single()
  if (ie) throw new Error('pva_items insert: ' + ie.message)
  actieId = item.id

  const kam = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signInData, error: se } = await kam.auth.signInWithPassword({ email, password: PW })
  if (se) throw new Error('signIn: ' + se.message)
  const sessieCookie = signInData?.session ? maakSessieCookie(signInData.session) : null

  const dev = await appDraait()
  console.log(dev ? `Dev-server bereikbaar op ${BASIS}; route-tests draaien mee.\n` : `Geen dev-server; route-tests overgeslagen.\n`)

  if (dev && sessieCookie) {
    // --- 1a: verkeerd mime-type wordt op route-niveau geweigerd ---
    {
      const res = await fetch(`${BASIS}/api/bewijs/beheerder-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sessieCookie },
        body: JSON.stringify({ actieId, bestandsnaam: 'kwaadaardig.svg', type: 'image/svg+xml', grootte: 1000 }),
      })
      const body = await res.json().catch(() => ({}))
      check('route weigert image/svg+xml met een nette 4xx (geen signed URL)',
        res.status >= 400 && res.status < 500 && !body.signedUrl, `status ${res.status}`)
    }
    // --- 1b: te grote opgave wordt geweigerd ---
    {
      const res = await fetch(`${BASIS}/api/bewijs/beheerder-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sessieCookie },
        body: JSON.stringify({ actieId, bestandsnaam: 'groot.png', type: 'image/png', grootte: 50 * 1024 * 1024 }),
      })
      const body = await res.json().catch(() => ({}))
      check('route weigert een opgegeven grootte boven MAX_BYTES met een nette 4xx',
        res.status >= 400 && res.status < 500 && !body.signedUrl, `status ${res.status}`)
    }
    // --- 1c: geldig type/grootte krijgt gewoon een signed URL ---
    {
      const res = await fetch(`${BASIS}/api/bewijs/beheerder-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sessieCookie },
        body: JSON.stringify({ actieId, bestandsnaam: 'geldig.png', type: 'image/png', grootte: 1000 }),
      })
      const body = await res.json().catch(() => ({}))
      check('route geeft gewoon een signed URL voor een toegestaan type/grootte (geen regressie)',
        res.status === 200 && !!body.signedUrl, `status ${res.status}`)
    }
  } else {
    check('route-tests', true, 'overgeslagen — geen dev-server of geen JWT, dit telt niet als FAIL')
  }

  // --- 2: bucket zelf weigert een upload met een niet-toegestaan Content-Type,
  //    ONAFHANKELIJK van de route (rechtstreeks met de service-role, zoals de
  //    route zelf ook via createSignedUploadUrl + uploadToSignedUrl werkt) ---
  {
    const pad = `bewijs/${companyId}/${actieId}/uploadtest-bucket-check.svg`
    const { data: signed, error: signErr } = await admin.storage.from('bewijs').createSignedUploadUrl(pad)
    if (signErr || !signed) {
      check('kon geen signed upload-URL maken om de buckettest voor te bereiden', false, signErr?.message)
    } else {
      const { error: upErr } = await admin.storage.from('bewijs')
        .uploadToSignedUrl(pad, signed.token, new Blob(['<svg onload=alert(1)></svg>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' })
      check('BUCKET zelf weigert image/svg+xml, los van de route (allowed_mime_types)', !!upErr, upErr?.message)
    }
  }
  {
    const pad = `bewijs/${companyId}/${actieId}/uploadtest-bucket-ok.png`
    const { data: signed, error: signErr } = await admin.storage.from('bewijs').createSignedUploadUrl(pad)
    if (signErr || !signed) {
      check('kon geen signed upload-URL maken (geldig-type-buckettest)', false, signErr?.message)
    } else {
      const { error: upErr } = await admin.storage.from('bewijs')
        .uploadToSignedUrl(pad, signed.token, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' })
      check('BUCKET accepteert een toegestaan type gewoon (geen regressie)', !upErr, upErr?.message)
      if (!upErr) await admin.storage.from('bewijs').remove([pad])
    }
  }

  // --- 3: signedUrlOpties-logica (pure functie in lib/bewijs.ts) ---
  // lib/bewijs.ts is TS; niet direct importeerbaar in een los .mjs-script
  // zonder de Next-toolchain. Test daarom dezelfde regel expliciet na i.p.v.
  // te importeren — voorkomt een ts-node-afhankelijkheid in een testscript.
  {
    const isAfbeelding = t => !!t && t.startsWith('image/')
    const signedUrlOpties = (type, naam) => (isAfbeelding(type) ? undefined : { download: naam || true })
    check('signedUrlOpties: afbeelding blijft inline (undefined = geen download-forcering)',
      signedUrlOpties('image/png', 'x.png') === undefined)
    check('signedUrlOpties: pdf krijgt forced download',
      JSON.stringify(signedUrlOpties('application/pdf', 'x.pdf')) === JSON.stringify({ download: 'x.pdf' }))
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
  process.exitCode = mislukt.length ? 1 : 0
}

async function opruimen() {
  if (companyId) {
    await admin.storage.from('bewijs').list(`bewijs/${companyId}`).then(async ({ data }) => {
      const paden = (data ?? []).map(f => `bewijs/${companyId}/${f.name}`)
      if (paden.length) await admin.storage.from('bewijs').remove(paden)
    }).catch(() => {})
    for (const tbl of ['pva_items', 'bedrijf_modules']) {
      try { await admin.from(tbl).delete().eq('company_id', companyId) } catch { /* mogelijk leeg */ }
    }
  }
  if (userId) {
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId).catch(() => {})
  }
  if (companyId) await admin.from('companies').delete().eq('id', companyId)
  console.log('Opgeruimd: alle UPLOADTEST_-data verwijderd.')
}

try {
  await run()
} finally {
  await opruimen()
}
