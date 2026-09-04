// ============================================================================
// AI-foto-analyse — end-to-end test van de server-route (bewijs)
// ----------------------------------------------------------------------------
// De isolatietest bewijst de database, de zelftest bewijst de leverancier. Wat
// daartussen zit — de route met zijn AVG-volgorde — bewijst dit script, tegen
// een DRAAIENDE app en met een ECHTE ingelogde sessie:
//
//   1. GET zonder sessie          -> geen 200 (de middleware laat niemand door)
//   2. GET met sessie             -> wie de leverancier is, ZONDER sleutel erin
//   3. POST zonder toestemming    -> 400, en er wordt niets aangemaakt
//   4. POST op de foto van een ANDER bedrijf -> geweigerd
//   5. POST op een losse foto (geen inspectiepunt) -> geweigerd
//   6. POST met toestemming op de eigen foto:
//        - mét sleutel : 200, concept opgeslagen, bevinding nog ONAANGEROERD
//        - zónder sleutel: 503 met code niet_geconfigureerd, nette tekst,
//          en niets in de database
//
// Stap 6 is de kern van "de mens beslist": zelfs een geslaagde AI-aanroep laat
// de toelichting van de bevinding leeg tot iemand op Overnemen klikt.
//
// Draaien (twee terminals):
//   1) npm run dev
//   2) node --use-system-ca scripts/inspectie_ai_route_test.ts
//
// Om de "nog niet geconfigureerd"-melding te toetsen, start de dev-server met
// een lege sleutel — het script verwacht dan vanzelf het andere gedrag:
//   GROQ_API_KEY= npm run dev
//
// Alles draait op wegwerpbedrijven met prefix AIROUTE_ en wordt in het
// finally-blok opgeruimd, inclusief het geüploade bestand in de bucket.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { maakTestPng } from './_testafbeelding.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BUCKET = 'inspectie-foto'

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
const PW = 'Airoute!' + TS
const companyIds: string[] = []
const userIds: string[] = []
const opslagPaden: string[] = []
const results: { naam: string; ok: boolean }[] = []

function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// --- De sessiecookie namaken zoals @supabase/ssr hem schrijft --------------
// De route leest de gebruiker uit een cookie, niet uit een Authorization-header.
// Om de route écht als ingelogde inspecteur te raken bouwen we die cookie hier
// na: naam sb-<project-ref>-auth-token, waarde 'base64-' + base64url(JSON van
// de sessie). Zie node_modules/@supabase/ssr/dist/main/cookies.js.
function base64url(tekst: string): string {
  return Buffer.from(tekst, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function maakSessieCookie(sessie: unknown): string {
  const ref = new URL(URL_SB!).hostname.split('.')[0]
  return `sb-${ref}-auth-token=base64-${base64url(JSON.stringify(sessie))}`
}

// --- Testopstelling ---------------------------------------------------------
async function maakBedrijf(label: string) {
  const { data: comp, error } = await admin
    .from('companies').insert({ name: `AIROUTE_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)

  await admin.from('bedrijf_modules').insert({ company_id: comp.id, module: 'inspectie', actief: true })

  const { data: sjab, error: e1 } = await admin
    .from('inspectie_sjabloon')
    .insert({ company_id: comp.id, naam: `AIROUTE_sjabloon_${label}`, controlesoort: 'rondgang', actief: true })
    .select('id').single()
  if (e1) throw new Error(`sjabloon (${label}): ${e1.message}`)

  const { data: insp, error: e2 } = await admin
    .from('inspectie')
    .insert({
      company_id: comp.id, sjabloon_id: sjab.id, status: 'concept',
      sjabloon_naam_snap: `AIROUTE_sjabloon_${label}`, controlesoort_snap: 'rondgang',
    })
    .select('id').single()
  if (e2) throw new Error(`inspectie (${label}): ${e2.message}`)

  const { data: bev, error: e3 } = await admin
    .from('inspectie_bevinding')
    .insert({
      company_id: comp.id, inspectie_id: insp.id,
      punt_tekst_snap: 'Is het werkgebied vrij van struikelgevaar?',
      resultaat: 'in_orde', afhandeling: 'geen',
    })
    .select('id').single()
  if (e3) throw new Error(`bevinding (${label}): ${e3.message}`)

  // Een ECHT bestand in de privé bucket: de route haalt de bytes op via een
  // signed URL, dus met alleen een databaserij zou stap 6 niets bewijzen.
  const png = maakTestPng()
  const pad = `${comp.id}/${insp.id}/airoute_${label}.png`
  const { error: eUp } = await admin.storage.from(BUCKET)
    .upload(pad, png, { contentType: 'image/png', upsert: true })
  if (eUp) throw new Error(`upload (${label}): ${eUp.message}`)
  opslagPaden.push(pad)

  const { data: foto, error: e4 } = await admin
    .from('inspectie_foto')
    .insert({
      inspectie_id: insp.id, bevinding_id: bev.id, company_id: comp.id,
      storage_pad: pad, bestandsnaam: `airoute_${label}.png`, type: 'image/png', grootte: png.length,
    })
    .select('id').single()
  if (e4) throw new Error(`foto (${label}): ${e4.message}`)

  // Losse foto bij de inspectie (geen inspectiepunt) — hoort geweigerd te worden.
  const { data: los, error: e5 } = await admin
    .from('inspectie_foto')
    .insert({
      inspectie_id: insp.id, bevinding_id: null, company_id: comp.id,
      storage_pad: pad, bestandsnaam: `airoute_los_${label}.png`, type: 'image/png', grootte: png.length,
    })
    .select('id').single()
  if (e5) throw new Error(`losse foto (${label}): ${e5.message}`)

  return {
    companyId: comp.id, inspectieId: insp.id, bevindingId: bev.id,
    fotoId: foto.id as string, losseFotoId: los.id as string,
  }
}

async function maakGebruiker(label: string, companyId: string) {
  const email = `airoute_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)

  const { error: e } = await admin.from('users').upsert({
    id: created.user.id, email, role: 'client', company_id: companyId, naam: `AIROUTE ${label}`,
  })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2 || !data.session) throw new Error(`signIn (${label}): ${e2?.message ?? 'geen sessie'}`)
  return maakSessieCookie(data.session)
}

async function opmerkingVan(bevindingId: string) {
  const { data } = await admin
    .from('inspectie_bevinding').select('opmerking').eq('id', bevindingId).single()
  return data?.opmerking ?? null
}

async function aantalSuggesties(companyId: string) {
  const { data } = await admin
    .from('inspectie_ai_suggestie').select('id').eq('company_id', companyId)
  return data?.length ?? 0
}

type Antwoord = { status: number; body: Record<string, unknown> }

async function roep(pad: string, opties: RequestInit): Promise<Antwoord> {
  const res = await fetch(`${BASIS}${pad}`, { ...opties, redirect: 'manual' })
  let body: Record<string, unknown> = {}
  try { body = (await res.json()) as Record<string, unknown> } catch { /* geen JSON */ }
  return { status: res.status, body }
}

async function run() {
  // Draait de app?
  try {
    const ping = await fetch(`${BASIS}/api/inspectie/ai-analyse`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
    console.log(`Dev-server bereikbaar op ${BASIS} (GET zonder sessie: HTTP ${ping.status})\n`)
  } catch {
    console.error(`De app draait niet op ${BASIS}.`)
    console.error('Start hem eerst met `npm run dev` en draai dit script opnieuw.')
    process.exitCode = 1
    return
  }

  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const cookieA = await maakGebruiker('A', A.companyId)
  const jsonHeaders = { 'Content-Type': 'application/json' }

  // --- 1. Zonder sessie komt niemand binnen -------------------------------
  {
    const res = await fetch(`${BASIS}/api/inspectie/ai-analyse`, { method: 'GET', redirect: 'manual' })
    check('GET zonder sessie geeft geen 200', res.status !== 200, `HTTP ${res.status}`)
  }
  {
    const res = await fetch(`${BASIS}/api/inspectie/ai-analyse`, {
      method: 'POST', headers: jsonHeaders, redirect: 'manual',
      body: JSON.stringify({ fotoId: A.fotoId, toestemming: true }),
    })
    check('POST zonder sessie geeft geen 200', res.status !== 200, `HTTP ${res.status}`)
  }

  // --- 2. Met sessie: de status, en géén sleutel in het antwoord ----------
  const status = await roep('/api/inspectie/ai-analyse', { method: 'GET', headers: { Cookie: cookieA } })
  check('GET met sessie geeft de leveranciersstatus', status.status === 200, `HTTP ${status.status}`)

  const geconfigureerd = status.body.geconfigureerd === true
  console.log(`  → leverancier: ${status.body.weergavenaam} · model: ${status.body.model || '(leeg)'} · regio: ${status.body.regio} · geconfigureerd: ${geconfigureerd}\n`)

  {
    const rauw = JSON.stringify(status.body)
    check('de status bevat geen sleutel of endpoint',
      !/gsk_|api\.groq\.com|Bearer/i.test(rauw), rauw.slice(0, 120))
  }
  {
    const heeftVelden = typeof status.body.weergavenaam === 'string'
      && (status.body.regio === 'eu' || status.body.regio === 'buiten_eu')
    check('de status vertelt wie het is en in welke regio (voor de waarschuwing)', heeftVelden)
  }

  // --- 3. Zonder toestemming gebeurt er niets ----------------------------
  {
    const voor = await aantalSuggesties(A.companyId)
    const r1 = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: A.fotoId }),
    })
    check('POST zonder toestemmingsveld wordt geweigerd', r1.status === 400, `HTTP ${r1.status}`)

    const r2 = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: A.fotoId, toestemming: false }),
    })
    check('POST met toestemming=false wordt geweigerd', r2.status === 400, `HTTP ${r2.status}`)

    const r3 = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: A.fotoId, toestemming: 'ja' }),
    })
    check('POST met toestemming="ja" wordt geweigerd (geen truthy-truc)', r3.status === 400, `HTTP ${r3.status}`)

    check('er is na die drie pogingen niets aangemaakt', (await aantalSuggesties(A.companyId)) === voor)
  }

  // --- 4. De foto van een ander bedrijf bestaat niet voor A ---------------
  // Zónder sleutel komt hier 503 uit in plaats van 403, en dat is met opzet: de
  // route controleert de configuratie vóórdat hij de foto opzoekt, zodat er bij
  // een niet-ingestelde AI überhaupt niets uit de bucket wordt gehaald. Beide
  // antwoorden zijn een weigering; alleen de reden verschilt.
  const verwachtGeweigerd = (status: number, metSleutel: number) =>
    geconfigureerd ? status === metSleutel : status === 503
  {
    const r = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: B.fotoId, toestemming: true }),
    })
    check('A krijgt geen AI-analyse op de foto van B',
      verwachtGeweigerd(r.status, 403), `HTTP ${r.status}`)
    check('er is bij B niets aangemaakt', (await aantalSuggesties(B.companyId)) === 0)
  }

  // --- 5. Losse foto zonder inspectiepunt --------------------------------
  {
    const r = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: A.losseFotoId, toestemming: true }),
    })
    check('een foto zonder inspectiepunt wordt geweigerd',
      verwachtGeweigerd(r.status, 400), `HTTP ${r.status}`)
  }

  // --- 6. De echte gang, en wat er daarna NIET gebeurt --------------------
  {
    const r = await roep('/api/inspectie/ai-analyse', {
      method: 'POST', headers: { ...jsonHeaders, Cookie: cookieA },
      body: JSON.stringify({ fotoId: A.fotoId, toestemming: true }),
    })

    if (!geconfigureerd) {
      // Dit is precies het gedrag dat zonder sleutel te zien moet zijn.
      check('zonder sleutel: nette 503 in plaats van een crash', r.status === 503, `HTTP ${r.status}`)
      check('zonder sleutel: code niet_geconfigureerd', r.body.code === 'niet_geconfigureerd', String(r.body.code))
      check('zonder sleutel: nette Nederlandse melding',
        typeof r.body.fout === 'string' && /nog niet geconfigureerd/i.test(r.body.fout), String(r.body.fout))
      check('zonder sleutel: geen technische details in de melding',
        !/gsk_|groq\.com|stack|Error:/i.test(JSON.stringify(r.body)))
      check('zonder sleutel: er staat niets in de database', (await aantalSuggesties(A.companyId)) === 0)
    } else {
      check('met sleutel: de analyse slaagt', r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`)
      const suggestie = r.body.suggestie as Record<string, unknown> | undefined
      check('er komt een suggestie terug met status concept', suggestie?.status === 'concept', String(suggestie?.status))
      const bevindingen = suggestie?.bevindingen as unknown
      const acties = suggestie?.acties as unknown
      check('de suggestie heeft een beschrijving, bevindingen of acties',
        !!(suggestie?.beschrijving || (Array.isArray(bevindingen) && bevindingen.length) || (Array.isArray(acties) && acties.length)))
      check('het antwoord bevat geen sleutel', !/gsk_/i.test(JSON.stringify(r.body)))
      check('de suggestie staat als concept in de database', (await aantalSuggesties(A.companyId)) === 1)

      // De kern: een geslaagde AI-aanroep verandert de bevinding NIET.
      check('DE MENS BESLIST — de toelichting van de bevinding is nog leeg',
        (await opmerkingVan(A.bevindingId)) === null)

      const { data: rij } = await admin
        .from('inspectie_ai_suggestie')
        .select('toestemming_bevestigd, leverancier, model, besluit_tekst')
        .eq('company_id', A.companyId).single()
      check('de toestemming is op de rij vastgelegd', rij?.toestemming_bevestigd === true)
      check('leverancier en model zijn vastgelegd', !!rij?.leverancier && !!rij?.model,
        `${rij?.leverancier} / ${rij?.model}`)
      check('er is nog geen besluittekst', rij?.besluit_tekst === null)

      console.log('\n--- het concept dat de inspecteur te zien krijgt ---')
      console.log('beschrijving :', String(suggestie?.beschrijving ?? '').slice(0, 300))
      console.log('bevindingen  :', JSON.stringify(bevindingen).slice(0, 300))
      console.log('acties       :', JSON.stringify(acties).slice(0, 300))
      console.log('---------------------------------------------------')
    }
  }
}

async function cleanup() {
  if (opslagPaden.length) {
    try { await admin.storage.from(BUCKET).remove(opslagPaden) } catch { /* al weg */ }
  }
  if (companyIds.length) {
    for (const tbl of [
      'inspectie_ai_suggestie', 'inspectie_foto', 'inspectie_historie',
      'inspectie_bevinding', 'inspectie', 'inspectie_sjabloon_punt',
      'inspectie_sjabloon', 'bedrijf_modules',
    ]) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) {
      try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ }
    }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de testopzet:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  try {
    await cleanup()
    console.log('\nOpgeruimd: alle AIROUTE_-data, testgebruikers en testbestanden verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
if (results.length) console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
// Bewust process.exitCode: process.exit() crasht op Windows terwijl de HTTPS-
// verbindingen nog aan het opruimen zijn.
if (falen > 0) process.exitCode = 1
