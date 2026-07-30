// ============================================================================
// Foto's bij de werkplekinspectie — zelftest van de hele keten (bewijs)
// ----------------------------------------------------------------------------
// Aanleiding: een browsertest meldde "Bucket not found" bij elke upload. Dit
// script beantwoordt in één klap de vraag "ligt het aan de opslag of aan de app":
// het loopt exact de stappen die de app zelf doet, als een ingelogde beheerder.
//
//   0. bestaat de bucket, en is hij PRIVÉ met de per-bedrijf-leespolicy?
//   1. inspectie_foto_pad        — de RPC reserveert een bedrijf-geprefixt pad
//   2. createSignedUploadUrl     — service role mint een upload-URL
//   3. uploadToSignedUrl         — de browser uploadt met dat token
//   4. inspectie_foto_registreren— de rij komt in inspectie_foto
//   5. createSignedUrl + ophalen — de foto is echt terug te lezen
//   6. publieke toegang faalt    — zonder signed URL komt er niets uit
// Beide niveaus: bij één bevinding én bij de inspectie als geheel.
//
// Draaien:   node --use-system-ca scripts/inspectie_foto_selftest.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles draait op een
// wegwerpbedrijf met prefix FOTOTEST_ en wordt in het finally-blok opgeruimd,
// inclusief de geüploade bestanden in de bucket. Raakt geen klantdata.
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch { /* valt terug op process.env */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'inspectie-foto'

if (!URL || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken in .env.local.')
  process.exit(1)
}
if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local. Zelftest overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Fototest!' + TS
const companyIds = []
const userIds = []
const paden = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// Kleinst mogelijke geldige JPEG (1×1 pixel).
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')

async function run() {
  // ---- 0. De bucket zelf --------------------------------------------------
  const { data: bucket, error: bErr } = await admin.storage.getBucket(BUCKET)
  check(`Bucket "${BUCKET}" bestaat`, !bErr && !!bucket, bErr ? bErr.message : '')
  if (bErr || !bucket) {
    console.log('\n  De bucket ontbreekt. Draai supabase/migrations/0045_inspectie_foto.sql opnieuw;')
    console.log('  die is idempotent (insert ... on conflict do nothing).')
    return
  }
  check('Bucket is PRIVÉ (niet publiek leesbaar)', bucket.public === false,
    `public=${bucket.public}`)
  check('Bucket heeft een groottelimiet', !!bucket.file_size_limit,
    `${bucket.file_size_limit ?? 'geen'} bytes`)

  // ---- Opzet: bedrijf, beheerder, sjabloon, inspectie ---------------------
  const { data: comp } = await admin.from('companies')
    .insert({ name: `FOTOTEST_${TS}` }).select('id').single()
  companyIds.push(comp.id)
  await admin.from('bedrijf_modules').insert({
    company_id: comp.id, module: 'inspectie', actief: true,
    module_status: 'actief', geactiveerd_op: new Date().toISOString(),
  })

  const email = `fototest_${TS}@example.test`
  const { data: created } = await admin.auth.admin.createUser(
    { email, password: PW, email_confirm: true })
  userIds.push(created.user.id)
  await admin.from('users').upsert(
    { id: created.user.id, email, role: 'client', company_id: comp.id, naam: 'FOTOTEST KAM' })
  const kam = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  await kam.auth.signInWithPassword({ email, password: PW })

  const { data: sjabloonId } = await kam.rpc('sjabloon_opslaan', {
    p_sjabloon_id: null, p_company_id: comp.id,
    p_naam: 'FOTOTEST sjabloon', p_controlesoort: 'werkplek',
  })
  await kam.rpc('punt_opslaan', {
    p_punt_id: null, p_sjabloon_id: sjabloonId,
    p_tekst: 'Draagt hesje', p_verplicht: true, p_volgorde: 1,
  })
  const { data: inspectieId } = await kam.rpc('inspectie_start', { p_sjabloon_id: sjabloonId })
  const { data: bevindingen } = await admin.from('inspectie_bevinding')
    .select('id').eq('inspectie_id', inspectieId)
  const bevindingId = bevindingen?.[0]?.id ?? null

  // ---- 1-5. De keten, op beide niveaus ------------------------------------
  for (const [niveau, bev] of [['bij een bevinding', bevindingId], ['bij de inspectie', null]]) {
    const { data: padData, error: padErr } = await kam.rpc('inspectie_foto_pad', {
      p_inspectie_id: inspectieId, p_bevinding_id: bev, p_bestandsnaam: 'test.jpg',
    })
    if (padErr) { check(`Pad reserveren ${niveau}`, false, padErr.message); continue }
    const pad = typeof padData === 'string' ? JSON.parse(padData).pad : padData.pad
    paden.push(pad)
    // Het eerste padsegment MOET het bedrijf zijn: daarop staat de storage-RLS.
    check(`Pad reserveren ${niveau} (bedrijf-geprefixt)`, pad?.startsWith(`${comp.id}/`),
      pad?.slice(0, 40))

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET).createSignedUploadUrl(pad)
    check(`Signed upload-URL ${niveau}`, !signErr && !!signed, signErr?.message)
    if (signErr) continue

    const { error: upErr } = await kam.storage
      .from(BUCKET).uploadToSignedUrl(pad, signed.token, JPEG, { contentType: 'image/jpeg' })
    check(`Uploaden ${niveau}`, !upErr, upErr?.message)
    if (upErr) continue

    const { error: regErr } = await kam.rpc('inspectie_foto_registreren', {
      p_inspectie_id: inspectieId, p_bevinding_id: bev, p_pad: pad,
      p_bestandsnaam: 'test.jpg', p_type: 'image/jpeg', p_grootte: JPEG.length,
    })
    check(`Registreren ${niveau}`, !regErr, regErr?.message)

    const { data: dl } = await admin.storage.from(BUCKET).createSignedUrl(pad, 60)
    const res = dl?.signedUrl ? await fetch(dl.signedUrl) : null
    check(`Terugkijken via signed URL ${niveau}`, res?.status === 200, `HTTP ${res?.status ?? '?'}`)

    // Zonder handtekening in de URL mag er niets uit de privébucket komen.
    const kaal = `${URL}/storage/v1/object/public/${BUCKET}/${pad}`
    const open = await fetch(kaal)
    check(`Publieke toegang geweigerd ${niveau}`, open.status !== 200, `HTTP ${open.status}`)
  }

  const { data: fotos } = await kam.from('inspectie_foto')
    .select('id, bevinding_id').eq('inspectie_id', inspectieId)
  check('Twee foto-rijen: één per niveau',
    (fotos?.length ?? 0) === 2 &&
    (fotos?.filter(f => f.bevinding_id).length ?? 0) === 1 &&
    (fotos?.filter(f => !f.bevinding_id).length ?? 0) === 1,
    `${fotos?.length ?? 0} rijen`)
}

async function cleanup() {
  if (paden.length) await admin.storage.from(BUCKET).remove(paden)
  for (const tbl of ['inspectie_foto', 'inspectie_bevinding', 'inspectie',
    'inspectie_punt', 'inspectie_sjabloon', 'personen', 'bedrijf_modules', 'pva_items']) {
    try { await admin.from(tbl).delete().in('company_id', companyIds) } catch { /* tabel zonder company_id */ }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de zelftest:', e.message)
  exitCode = 1
} finally {
  try {
    await cleanup()
    console.log('\nOpgeruimd: FOTOTEST_-data, testgebruiker en geüploade bestanden verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} controles geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
