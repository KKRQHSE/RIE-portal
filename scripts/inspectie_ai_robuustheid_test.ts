// ============================================================================
// AI-foto-analyse — robuustheid en misbruikbestendigheid (bewijs)
// ----------------------------------------------------------------------------
// inspectie_ai_route_test.ts bewijst de gelukkige gang. Dit script duwt tegen de
// randen: rommelige invoer, kapotte foto's, een leverancier die stukgaat, en
// omwegen om de opt-in of de bedrijfsgrens te omzeilen.
//
// Wat hier bewezen moet worden:
//   1. OPT-IN IS HARD. Geen enkele vorm van "bijna true" komt erdoor — niet
//      "true" als tekst, niet 1, niet [], niet {toestemming:{}} — en er wordt
//      dan ook niets aangemaakt.
//   2. DE SLEUTEL LEKT NOOIT. Ook niet als de leverancier een fout teruggeeft.
//      Elk antwoord van de route wordt gescand op sleutelresten en endpoints.
//   3. BEDRIJFSGRENS HOUDT, via elke omweg die ik kon bedenken.
//   4. KAPOTTE INVOER LANDT NIET HALF. Leeg bestand, te grote foto, bestand dat
//      geen afbeelding is, ontbrekend storage-object: nette foutcode, en
//      aantoonbaar 0 rijen in inspectie_ai_suggestie.
//   5. OVERNEMEN BLIJFT GEWEIGERD zonder gekozen resultaat (migratie 0051),
//      ook rechtstreeks op de RPC langs het scherm om.
//
// Draaien (dev-server moet draaien):
//   1) npm run dev
//   2) node --use-system-ca scripts/inspectie_ai_robuustheid_test.ts
//
// Om ook de leveranciersfout te toetsen, start de server met een model dat niet
// bestaat — dan geeft Groq een 404 en zie je hoe de route zich gedraagt:
//   GROQ_MODEL=bestaat/niet-echt npm run dev
// Het script merkt dat vanzelf en past zijn verwachting aan.
//
// Alles draait op wegwerpbedrijven met prefix AIROB_ en wordt opgeruimd,
// inclusief de geüploade testbestanden.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
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
const SLEUTEL = (env.GROQ_API_KEY || '').trim()

if (!URL_SB || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local.')
  process.exit(1)
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Airob!' + TS
const companyIds: string[] = []
const userIds: string[] = []
const opslagPaden: string[] = []
const results: { naam: string; ok: boolean }[] = []

function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// Alles wat de route ooit teruggeeft gaat hier langs. Eén centrale scan, zodat
// een nieuw foutpad niet per ongeluk buiten de controle valt.
const SLEUTELRESTEN = [
  /gsk_[A-Za-z0-9]/,          // Groq-sleutelvorm
  /api\.groq\.com/i,          // endpoint
  /Bearer\s+\S/i,             // authorisatieheader
  /eyJ[A-Za-z0-9_-]{20,}/,    // JWT (service-role / anon key)
  /SUPABASE_SERVICE_ROLE/i,
  /GROQ_API_KEY/i,
  /supabase\.co\/storage/i,   // signed storage-URL
  /at .*\\|\/.*:\d+:\d+/,     // stacktrace-regels
]
function scanOpLek(waar: string, tekst: string) {
  const raak = SLEUTELRESTEN.filter(r => r.test(tekst))
  check(`geen sleutel/endpoint/stacktrace in ${waar}`, raak.length === 0,
    raak.length ? `patronen: ${raak.map(String).join(' ')} in ${tekst.slice(0, 120)}` : `${tekst.length} tekens gescand`)
}

function base64url(t: string) {
  return Buffer.from(t, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function maakSessieCookie(sessie: unknown) {
  const ref = new URL(URL_SB!).hostname.split('.')[0]
  return `sb-${ref}-auth-token=base64-${base64url(JSON.stringify(sessie))}`
}

type Foto = { id: string; pad: string }

async function maakBedrijf(label: string) {
  const { data: comp, error } = await admin.from('companies')
    .insert({ name: `AIROB_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company (${label}): ${error.message}`)
  companyIds.push(comp.id)
  await admin.from('bedrijf_modules').insert({
    company_id: comp.id, module: 'inspectie', actief: true, module_status: 'actief',
  })

  const { data: sjab } = await admin.from('inspectie_sjabloon')
    .insert({ company_id: comp.id, naam: `AIROB_${label}`, controlesoort: 'rondgang', actief: true })
    .select('id').single()
  const { data: insp } = await admin.from('inspectie').insert({
    company_id: comp.id, sjabloon_id: sjab!.id, status: 'concept',
    sjabloon_naam_snap: `AIROB_${label}`, controlesoort_snap: 'rondgang',
  }).select('id').single()

  // Twee punten: één mét resultaat, één zonder (voor de 0051-controle).
  const { data: bevMet } = await admin.from('inspectie_bevinding').insert({
    company_id: comp.id, inspectie_id: insp!.id, punt_tekst_snap: 'AIROB punt met resultaat',
    verplicht: false, volgorde: 1, resultaat: 'niet_in_orde', afhandeling: 'geen',
  }).select('id').single()
  const { data: bevZonder } = await admin.from('inspectie_bevinding').insert({
    company_id: comp.id, inspectie_id: insp!.id, punt_tekst_snap: 'AIROB punt zonder resultaat',
    verplicht: false, volgorde: 2, resultaat: null, afhandeling: 'geen',
  }).select('id').single()

  // Een foto met een echt, geldig plaatje erachter.
  const goed = await maakFoto(comp.id, insp!.id, bevMet!.id, 'goed.png', maakTestPng(), 'image/png')

  return {
    companyId: comp.id, inspectieId: insp!.id,
    bevindingMet: bevMet!.id as string, bevindingZonder: bevZonder!.id as string,
    fotoGoed: goed,
  }
}

// Legt een foto-rij aan met een echt storage-object erachter (of, met
// schrijfObject=false, een rij die naar een niet-bestaand pad wijst).
async function maakFoto(
  companyId: string, inspectieId: string, bevindingId: string | null,
  naam: string, inhoud: Buffer, type: string, schrijfObject = true,
): Promise<Foto> {
  const pad = `${companyId}/${inspectieId}/airob_${randomUUID().slice(0, 8)}_${naam}`
  if (schrijfObject) {
    const { error } = await admin.storage.from(BUCKET).upload(pad, inhoud, { contentType: type, upsert: true })
    if (error) throw new Error(`upload ${naam}: ${error.message}`)
    opslagPaden.push(pad)
  }
  const { data, error } = await admin.from('inspectie_foto').insert({
    inspectie_id: inspectieId, bevinding_id: bevindingId, company_id: companyId,
    storage_pad: pad, bestandsnaam: naam, type, grootte: inhoud.length,
  }).select('id').single()
  if (error) throw new Error(`fotorij ${naam}: ${error.message}`)
  return { id: data.id as string, pad }
}

async function maakGebruiker(label: string, companyId: string) {
  const email = `airob_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({
    id: created.user.id, email, role: 'client', company_id: companyId, naam: `AIROB ${label}`,
  })
  const client: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2 || !data.session) throw new Error(`signIn (${label}): ${e2?.message ?? 'geen sessie'}`)
  return { cookie: maakSessieCookie(data.session), client }
}

async function aantalSuggesties(companyId: string) {
  const { data } = await admin.from('inspectie_ai_suggestie').select('id').eq('company_id', companyId)
  return data?.length ?? 0
}

type Antwoord = { status: number; ruw: string; body: Record<string, unknown> }

async function post(cookie: string, payload: unknown): Promise<Antwoord> {
  const res = await fetch(`${BASIS}/api/inspectie/ai-analyse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    redirect: 'manual',
  })
  const ruw = await res.text()
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(ruw) } catch { /* geen JSON */ }
  return { status: res.status, ruw, body }
}

async function run() {
  try {
    const ping = await fetch(`${BASIS}/api/inspectie/ai-analyse`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
    console.log(`Dev-server bereikbaar op ${BASIS} (HTTP ${ping.status} zonder sessie)\n`)
  } catch {
    console.error(`De app draait niet op ${BASIS}. Start hem met \`npm run dev\` en draai opnieuw.`)
    process.exitCode = 1
    return
  }

  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('A', A.companyId)

  // Is er een werkende leverancier? Zo niet, dan zijn de robuustheidscases niet
  // te onderscheiden van de "niet geconfigureerd"-melding.
  const statusRes = await fetch(`${BASIS}/api/inspectie/ai-analyse`, { headers: { Cookie: kamA.cookie } })
  const status = await statusRes.json() as Record<string, unknown>
  const geconfigureerd = status.geconfigureerd === true
  console.log(`Leverancier: ${status.weergavenaam} · model ${status.model} · geconfigureerd=${geconfigureerd}\n`)
  scanOpLek('de GET-status', JSON.stringify(status))

  // ---------------------------------------------------------------------
  // 1. Opt-in is hard — geen enkele "bijna true" komt erdoor
  // ---------------------------------------------------------------------
  console.log('\n--- 1. Opt-in ---')
  const bijnaWaar: [string, unknown][] = [
    ['ontbreekt', undefined],
    ['null', null],
    ['false', false],
    ['de tekst "true"', 'true'],
    ['de tekst "ja"', 'ja'],
    ['het getal 1', 1],
    ['een lege array', []],
    ['een leeg object', {}],
    ['de tekst "TRUE"', 'TRUE'],
  ]
  for (const [naam, waarde] of bijnaWaar) {
    const payload: Record<string, unknown> = { fotoId: A.fotoGoed.id }
    if (waarde !== undefined) payload.toestemming = waarde
    const r = await post(kamA.cookie, payload)
    check(`toestemming ${naam} wordt geweigerd`, r.status === 400, `HTTP ${r.status}`)
    scanOpLek(`de weigering bij toestemming ${naam}`, r.ruw)
  }
  {
    // Ook een payload met de sleutel op een rare plek mag niets doen.
    const r = await post(kamA.cookie, { fotoId: A.fotoGoed.id, toestemming: { waarde: true } })
    check('toestemming als object {waarde:true} wordt geweigerd', r.status === 400, `HTTP ${r.status}`)
  }
  {
    const r = await post(kamA.cookie, '{"fotoId":"' + A.fotoGoed.id + '","toestemming":true,')
    check('kapotte JSON wordt geweigerd', r.status === 400, `HTTP ${r.status}`)
    scanOpLek('de weigering bij kapotte JSON', r.ruw)
  }
  check('na alle opt-in-pogingen staat er niets in de database',
    (await aantalSuggesties(A.companyId)) === 0)

  // ---------------------------------------------------------------------
  // 2. Bedrijfsgrens — elke omweg
  // ---------------------------------------------------------------------
  console.log('\n--- 2. Bedrijfsgrens ---')
  {
    const r = await post(kamA.cookie, { fotoId: B.fotoGoed.id, toestemming: true })
    check('A kan de foto van B niet laten analyseren', r.status === 403, `HTTP ${r.status}`)
    scanOpLek('de cross-company-weigering', r.ruw)
  }
  {
    const r = await post(kamA.cookie, { fotoId: randomUUID(), toestemming: true })
    check('een onbekende fotoId geeft geen 200', r.status !== 200, `HTTP ${r.status}`)
  }
  {
    const r = await post(kamA.cookie, { fotoId: 'niet-eens-een-uuid', toestemming: true })
    check('een fotoId die geen uuid is geeft geen 200', r.status !== 200, `HTTP ${r.status}`)
    scanOpLek('de weigering bij een onzinnige fotoId', r.ruw)
  }
  {
    // Extra velden meesturen mag de server niet op andere gedachten brengen.
    const r = await post(kamA.cookie, {
      fotoId: B.fotoGoed.id, toestemming: true,
      companyId: A.companyId, company_id: A.companyId,
      bevindingId: A.bevindingMet, inspectieId: A.inspectieId,
    })
    check('meegestuurde company/bevinding-velden helpen niet over de grens', r.status === 403, `HTTP ${r.status}`)
  }
  check('bij B is niets aangemaakt', (await aantalSuggesties(B.companyId)) === 0)

  // ---------------------------------------------------------------------
  // 3. Kapotte invoer landt niet half
  // ---------------------------------------------------------------------
  console.log('\n--- 3. Kapotte en grensgevallen ---')
  const leeg = await maakFoto(A.companyId, A.inspectieId, A.bevindingMet, 'leeg.png', Buffer.alloc(0), 'image/png')
  const teGroot = await maakFoto(A.companyId, A.inspectieId, A.bevindingMet, 'groot.png',
    Buffer.alloc(4 * 1024 * 1024 + 1024, 7), 'image/png')
  const geenAfbeelding = await maakFoto(A.companyId, A.inspectieId, A.bevindingMet, 'doc.pdf',
    Buffer.from('%PDF-1.4 dit is geen foto'), 'application/pdf')
  const kwijt = await maakFoto(A.companyId, A.inspectieId, A.bevindingMet, 'kwijt.png',
    maakTestPng(), 'image/png', false)
  const rommel = await maakFoto(A.companyId, A.inspectieId, A.bevindingMet, 'rommel.png',
    Buffer.from('dit zijn geen png-bytes, alleen tekst'), 'image/png')
  const losseFoto = await maakFoto(A.companyId, A.inspectieId, null, 'los.png', maakTestPng(), 'image/png')

  const voor = await aantalSuggesties(A.companyId)

  {
    const r = await post(kamA.cookie, { fotoId: leeg.id, toestemming: true })
    check('een LEEG bestand geeft een nette fout', r.status >= 400 && r.status < 600, `HTTP ${r.status}`)
    scanOpLek('de fout bij een leeg bestand', r.ruw)
  }
  {
    const r = await post(kamA.cookie, { fotoId: teGroot.id, toestemming: true })
    check('een TE GROTE foto wordt geweigerd (413)', r.status === 413, `HTTP ${r.status}`)
    scanOpLek('de fout bij een te grote foto', r.ruw)
  }
  {
    const r = await post(kamA.cookie, { fotoId: geenAfbeelding.id, toestemming: true })
    check('een bestand dat GEEN afbeelding is wordt geweigerd (400)', r.status === 400, `HTTP ${r.status}`)
    scanOpLek('de fout bij een niet-afbeelding', r.ruw)
  }
  {
    const r = await post(kamA.cookie, { fotoId: kwijt.id, toestemming: true })
    check('een rij zonder storage-object geeft een nette fout', r.status >= 400 && r.status < 600, `HTTP ${r.status}`)
    scanOpLek('de fout bij een ontbrekend storage-object', r.ruw)
  }
  {
    const r = await post(kamA.cookie, { fotoId: losseFoto.id, toestemming: true })
    check('een foto zonder inspectiepunt wordt geweigerd', r.status === 400, `HTTP ${r.status}`)
  }
  {
    // Bytes die geen geldige afbeelding zijn maar wél als image/png geregistreerd
    // staan. De leverancier hoort dit te weigeren; wij horen dat netjes door te
    // geven zonder iets half op te slaan.
    const r = await post(kamA.cookie, { fotoId: rommel.id, toestemming: true })
    const netjes = r.status === 200 || (r.status >= 400 && r.status < 600)
    check('rommel-bytes met image/png-type geven geen crash', netjes, `HTTP ${r.status}`)
    scanOpLek('het antwoord bij rommel-bytes', r.ruw)
    if (r.status !== 200) {
      check('bij die mislukte analyse is er niets opgeslagen',
        (await aantalSuggesties(A.companyId)) === voor, 'geen half record')
    }
  }
  {
    const na = await aantalSuggesties(A.companyId)
    check('na alle kapotte invoer staat er hooguit wat er echt gelukt is',
      na >= voor, `voor=${voor} na=${na}`)
  }

  // ---------------------------------------------------------------------
  // 4. Leverancier die stukgaat
  // ---------------------------------------------------------------------
  console.log('\n--- 4. Leverancier stukgaat ---')
  if (!geconfigureerd) {
    check('zonder sleutel: nette 503 met code niet_geconfigureerd', true, 'server draait zonder sleutel')
    const r = await post(kamA.cookie, { fotoId: A.fotoGoed.id, toestemming: true })
    check('en dat is ook wat de route teruggeeft', r.status === 503 && r.body.code === 'niet_geconfigureerd',
      `HTTP ${r.status} code=${r.body.code}`)
    scanOpLek('de niet-geconfigureerd-melding', r.ruw)
  } else if (String(status.model).includes('bestaat/niet')) {
    const r = await post(kamA.cookie, { fotoId: A.fotoGoed.id, toestemming: true })
    check('een niet-bestaand model geeft een nette 502', r.status === 502, `HTTP ${r.status}`)
    check('met een Nederlandse melding, geen leverancierstekst',
      typeof r.body.fout === 'string' && !/model|not found|invalid/i.test(String(r.body.fout)),
      String(r.body.fout))
    scanOpLek('de leveranciersfout', r.ruw)
    check('en er is niets opgeslagen', (await aantalSuggesties(A.companyId)) === voor)
  } else {
    console.log('  (leveranciersfout niet getoetst — start de server met')
    console.log('   GROQ_MODEL=bestaat/niet-echt npm run dev  om dat pad te raken)')
  }

  // ---------------------------------------------------------------------
  // 5. Overnemen zonder resultaat, rechtstreeks op de RPC
  // ---------------------------------------------------------------------
  console.log('\n--- 5. Overnemen zonder gekozen resultaat (migratie 0051) ---')
  {
    // Concept klaarzetten op het punt ZONDER resultaat, via de RPC (dus niet via
    // de route — dan is de AI-leverancier niet nodig voor deze controle).
    const fotoZonder = await maakFoto(A.companyId, A.inspectieId, A.bevindingZonder,
      'zonder.png', maakTestPng(), 'image/png')
    const { data: sugId, error: eOp } = await kamA.client.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: fotoZonder.id, p_beschrijving: 'AIROB', p_concept: 'AIROB concept',
      p_leverancier: 'groq', p_model: 'test', p_toestemming: true,
    })
    check('een concept opslaan mag ook zonder gekozen resultaat', !eOp && !!sugId, eOp?.message?.slice(0, 60))

    const { error } = await kamA.client.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: sugId, p_besluit: 'overgenomen', p_tekst: 'langs het scherm om',
    })
    check('overnemen zonder resultaat wordt ook rechtstreeks op de RPC geweigerd',
      !!error && /kies eerst een resultaat/i.test(error.message || ''), error?.message?.slice(0, 60))

    const { data: bev } = await admin.from('inspectie_bevinding')
      .select('opmerking').eq('id', A.bevindingZonder).single()
    check('en de toelichting is leeg gebleven', bev?.opmerking === null, JSON.stringify(bev?.opmerking))

    const { data: sug } = await admin.from('inspectie_ai_suggestie')
      .select('status, besluit_tekst').eq('id', sugId).single()
    check('de suggestie staat nog op concept, zonder besluittekst',
      sug?.status === 'concept' && sug?.besluit_tekst === null, `status=${sug?.status}`)
  }

  // ---------------------------------------------------------------------
  // 6. Een concept wordt nooit vanzelf definitief
  // ---------------------------------------------------------------------
  console.log('\n--- 6. Geen concept wordt definitief zonder mens ---')
  {
    const { data: alle } = await admin.from('inspectie_ai_suggestie')
      .select('status, besloten_door, besloten_op').eq('company_id', A.companyId)
    const vanzelf = (alle ?? []).filter(s => s.status !== 'concept' && !s.besloten_door)
    check('geen enkele suggestie is van status veranderd zonder een mens erbij',
      vanzelf.length === 0, `${alle?.length ?? 0} suggesties, ${vanzelf.length} zonder besluitnemer`)

    const { data: bevs } = await admin.from('inspectie_bevinding')
      .select('id, opmerking, resultaat').eq('inspectie_id', A.inspectieId)
    const stil = (bevs ?? []).filter(b => b.opmerking && !b.resultaat)
    check('geen bevinding heeft een toelichting zonder resultaat (stille opslag)',
      stil.length === 0, `${stil.length} stille`)
  }
}

async function opruimen() {
  if (opslagPaden.length) {
    try { await admin.storage.from(BUCKET).remove(opslagPaden) } catch { /* al weg */ }
  }
  if (companyIds.length) {
    for (const tbl of [
      'inspectie_ai_suggestie', 'inspectie_foto', 'inspectie_historie',
      'inspectie_bevinding', 'inspectie', 'inspectie_sjabloon_punt',
      'inspectie_sjabloon', 'bedrijf_modules', 'pva_items',
    ]) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de test:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  try { await opruimen(); console.log('\nOpgeruimd: alle AIROB_-data en testbestanden verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e instanceof Error ? e.message : String(e)); process.exitCode = 1 }
}

const falen = results.filter(r => !r.ok).length
if (results.length) console.log(`\n${results.length - falen}/${results.length} controles geslaagd.`)
if (falen > 0) process.exitCode = 1
