// ============================================================================
// Personen samenvoegen — isolatie- en gedragstests (bewijs)
// ----------------------------------------------------------------------------
// Bewijst vier dingen over personen_samenvoegen (migratie 0048):
//   1. de LEVENDE koppelingen verschuiven naar de doel-persoon en de bron is weg;
//   2. de BEVROREN naam op een ondertekend toolbox-bewijsstuk blijft ongewijzigd
//      (bevestigde_naam + handtekening + snapshots), alleen persoon_id schuift op;
//   3. cross-company samenvoegen is onmogelijk (persoon van A + persoon van B);
//   4. alleen een admin mag samenvoegen — de KAM van het eigen bedrijf niet.
// Plus: de onveranderlijkheid van toolbox_deelname geldt nog steeds voor élke
// andere kolom, en de merge WEIGERT als beide personen bij dezelfde sessie
// hebben getekend (dan zijn er twee bewijsstukken die niet mogen verdwijnen).
//
// Draaien:   node --use-system-ca scripts/persoon_merge_isolatie_test.mjs
//            (--use-system-ca: zie de TLS-notitie in de andere isolatietests)
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om testbedrijven + auth-users
// aan te maken en achteraf op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit over (exit 0).
//
// Alles met prefix MERGETEST_ wordt in een finally-blok opgeruimd — óók bij een
// fout. Er wordt geen echte mail verstuurd (auth-users via de admin-API met
// email_confirm). De RPC's draaien hier puur tegen testbedrijven.
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
  } catch {
    // geen .env.local — valt terug op process.env
  }
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
  console.log('  De merge-isolatie-test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Mergetest!' + TS

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies').insert({ name: `MERGETEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  return comp.id
}

async function maakGebruiker(label, companyId, role) {
  const email = `mergetest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)

  const { error: e } = await admin.from('users')
    .upsert({ id, email, role, company_id: companyId, naam: `MERGETEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function maakPersoon(companyId, naam) {
  const { data, error } = await admin
    .from('personen').insert({ company_id: companyId, naam, status: 'actief' }).select('id').single()
  if (error) throw new Error(`personen insert (${naam}): ${error.message}`)
  return data.id
}

// Een ondertekend toolbox-bewijsstuk: bevestigde_naam is de naam die de persoon
// zelf bevestigde en moet de merge onveranderd overleven.
async function maakBewijsstuk(companyId, persoonId, naam, sessieId = null) {
  const digitaal = sessieId === null
  const { data, error } = await admin.from('toolbox_deelname').insert({
    company_id: companyId,
    persoon_id: persoonId,
    sessie_id: sessieId,
    bewijssoort: digitaal ? 'digitaal' : 'fysiek_aanwezig',
    titel_snap: `MERGETEST toolbox ${TS}`,
    tekst_snap: 'Testinhoud',
    // Constraint deelname_digitaal_bewijs: een digitaal bewijsstuk MOET een
    // bevestigde naam, een handtekening én een tijdstip hebben.
    naam_bevestigd: true,
    bevestigde_naam: naam,
    handtekening: 'data:image/png;base64,MERGETEST',
    handtekening_gezet_op: digitaal ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) throw new Error(`toolbox_deelname insert (${naam}): ${error.message}`)
  return data.id
}

async function maakSessie(companyId) {
  const { data, error } = await admin.from('toolbox_sessie').insert({
    company_id: companyId,
    datum: '2026-01-15',
    onderwerp: `MERGETEST sessie ${TS}`,
  }).select('id').single()
  if (error) throw new Error(`toolbox_sessie insert: ${error.message}`)
  return data.id
}

async function run() {
  const compA = await maakBedrijf('A')
  const compB = await maakBedrijf('B')
  const adminClient = await maakGebruiker('admin', compA, 'admin')
  const kamA = await maakGebruiker('kamA', compA, 'client')

  // --- Opzet bedrijf A: "Jeroen" (bron) en "Jeroen Schweig" (doel) ---
  const bron = await maakPersoon(compA, `MERGETEST Jeroen ${TS}`)
  const doel = await maakPersoon(compA, `MERGETEST Jeroen Schweig ${TS}`)
  const bronNaam = `MERGETEST Jeroen ${TS}`

  const bewijsId = await maakBewijsstuk(compA, bron, bronNaam)
  const { error: eActie } = await admin.from('pva_items').insert({
    company_id: compA, nr: '9001', onderwerp: `MERGETEST actie ${TS}`,
    status: 'Open', prio: 'Middel', persoon_id: bron,
  })
  if (eActie) throw new Error(`pva_items insert: ${eActie.message}`)

  // --- 4. Alleen admin mag samenvoegen ---
  {
    const { error } = await kamA.rpc('personen_samenvoegen', { p_doel_id: doel, p_bron_id: bron })
    check('KAM van het eigen bedrijf kan NIET samenvoegen', !!error,
      error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await kamA.rpc('personen_merge_voorbeeld', { p_doel_id: doel, p_bron_id: bron })
    check('KAM kan ook het voorbeeld niet opvragen', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- 3. Cross-company samenvoegen is onmogelijk ---
  {
    const vreemde = await maakPersoon(compB, `MERGETEST Bravo ${TS}`)
    const { error } = await adminClient.rpc('personen_samenvoegen', { p_doel_id: doel, p_bron_id: vreemde })
    check('Persoon van bedrijf B kan niet in bedrijf A gemerged worden', !!error,
      error ? 'geweigerd' : 'GEEN fout!')
    const { data } = await admin.from('personen').select('id').eq('id', vreemde)
    check('Persoon van B bestaat nog na de poging', (data?.length ?? 0) === 1)
  }

  // --- Onveranderlijkheid: elke andere kolom blijft geweigerd ---
  {
    const { error } = await admin.from('toolbox_deelname')
      .update({ bevestigde_naam: 'GEHACKT' }).eq('id', bewijsId)
    check('bevestigde_naam wijzigen wordt nog steeds geweigerd', !!error,
      error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { error } = await admin.from('toolbox_deelname')
      .update({ handtekening: 'GEHACKT' }).eq('id', bewijsId)
    check('handtekening wijzigen wordt nog steeds geweigerd', !!error,
      error ? 'geweigerd' : 'GEEN fout!')
  }

  // --- Botsing: beide personen tekenden bij dezelfde sessie → merge weigert ---
  {
    const sessie = await maakSessie(compA)
    const bronSessieBewijs = await maakBewijsstuk(compA, bron, bronNaam, sessie)
    await maakBewijsstuk(compA, doel, `MERGETEST Jeroen Schweig ${TS}`, sessie)

    const { data: vb } = await adminClient.rpc('personen_merge_voorbeeld',
      { p_doel_id: doel, p_bron_id: bron })
    check('Voorbeeld meldt de botsing', (vb?.botsingen?.length ?? 0) > 0,
      `${vb?.botsingen?.length ?? '?'} botsing(en)`)

    const { error } = await adminClient.rpc('personen_samenvoegen', { p_doel_id: doel, p_bron_id: bron })
    check('Merge weigert bij dubbel ondertekende sessie', !!error,
      error ? 'geweigerd' : 'GEEN fout!')

    const { data: naBotsing } = await admin.from('personen').select('id').eq('id', bron)
    check('Bron-persoon bestaat nog na de geweigerde merge', (naBotsing?.length ?? 0) === 1)

    // Botsing opruimen zodat de positieve test hierna wél kan slagen.
    await admin.from('toolbox_deelname').delete().eq('id', bronSessieBewijs)
    await admin.from('toolbox_deelname').delete().eq('sessie_id', sessie)
    await admin.from('toolbox_sessie').delete().eq('id', sessie)
  }

  // --- 1 + 2. De merge zelf ---
  {
    const { error } = await adminClient.rpc('personen_samenvoegen', { p_doel_id: doel, p_bron_id: bron })
    check('Admin kan samenvoegen', !error, error ? error.message : 'geslaagd')

    const { data: bronNa } = await admin.from('personen').select('id').eq('id', bron)
    check('Bron-persoon is verwijderd', (bronNa?.length ?? 0) === 0, `${bronNa?.length ?? '?'} rijen`)

    const { data: doelNa } = await admin.from('personen').select('id').eq('id', doel)
    check('Doel-persoon bestaat nog', (doelNa?.length ?? 0) === 1)

    // De levende koppeling is verschoven...
    const { data: bewijs } = await admin.from('toolbox_deelname')
      .select('persoon_id, bevestigde_naam, handtekening').eq('id', bewijsId).single()
    check('Toolbox-bewijsstuk hangt nu aan de doel-persoon', bewijs?.persoon_id === doel)

    // ...maar de BEVROREN naam niet. Dit is de kern van de ontwerpregel.
    check('Bevroren bevestigde_naam is ONGEWIJZIGD', bewijs?.bevestigde_naam === bronNaam,
      `"${bewijs?.bevestigde_naam}"`)
    check('Handtekening is ongewijzigd', bewijs?.handtekening === 'data:image/png;base64,MERGETEST')

    const { data: actie } = await admin.from('pva_items')
      .select('persoon_id').eq('company_id', compA).eq('nr', '9001').single()
    check('Actie hangt nu aan de doel-persoon', actie?.persoon_id === doel)

    const { data: log } = await admin.from('persoon_merge_log')
      .select('bron_naam, doel_id').eq('company_id', compA)
    check('Merge is gelogd met de bron-naam als tekst',
      (log?.length ?? 0) === 1 && log[0].bron_naam === bronNaam)
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of [
      'persoon_merge_log', 'toolbox_deelname', 'toolbox_sessie', 'pva_items',
      'bedrijf_inspectie_doel', 'deellinks', 'personen',
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
  if (companyIds.length) {
    await admin.from('companies').delete().in('id', companyIds)
  }
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de testopzet:', e.message)
  exitCode = 1
} finally {
  try {
    await cleanup()
    console.log('\nOpgeruimd: alle MERGETEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
