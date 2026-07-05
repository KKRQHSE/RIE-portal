// ============================================================================
// DEMO-seed voor de incidenten-module — UITSLUITEND op Testbedrijf Alpha.
// Activeert de module, zorgt voor een meldlink, en seedt ~7 realistische
// incidenten (gespreide datum/gevolg/status/oorzaken, incl. gevoelige velden en
// één foto) zodat het dashboard gevuld is voor de browsertest.
//
// Draaien:  node --use-system-ca scripts/incident_seed_demo.mjs
// Herbruikbaar: verwijdert eerst de bestaande incidenten van Alpha (demo).
// Opruimen later:  node scripts/db_run.mjs --query "delete from incident where company_id='<alpha>'"
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return { ...env, ...process.env }
}
const env = loadEnv()
const { NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = env
if (!URL || !SERVICE) { console.error('env ontbreekt (URL/SERVICE_ROLE)'); process.exit(2) }
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const BUCKET = 'incident-foto'

// 1x1 rode PNG (placeholder-foto) — bewijst de foto-download/-weergave.
const PNG_1x1_ROOD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function main() {
  const { data: alpha, error: cErr } = await admin.from('companies').select('id, name').ilike('name', '%alpha%').single()
  if (cErr || !alpha) { console.error('Testbedrijf Alpha niet gevonden.'); process.exit(1) }
  const A = alpha.id
  console.log(`Alpha = ${A} (${alpha.name})`)

  // Module activeren.
  await admin.from('bedrijf_modules').upsert(
    { company_id: A, module: 'incidenten', module_status: 'actief', actief: true, geactiveerd_op: new Date().toISOString() },
    { onConflict: 'company_id,module' },
  )
  console.log('Module "incidenten" op actief gezet.')

  // Meldlink: bestaande houden, anders aanmaken.
  let { data: link } = await admin.from('incident_meldlink').select('token').eq('company_id', A).maybeSingle()
  if (!link) {
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    await admin.from('incident_meldlink').insert({ company_id: A, token })
    link = { token }
  }
  await admin.from('incident_meldlink').update({ ingetrokken: false }).eq('company_id', A)

  // Schoon demo-incidenten op (cascade ruimt foto's).
  await admin.from('incident').delete().eq('company_id', A)

  const rijen = [
    { datum: '2026-02-12', tijd: '09:15', locatie: 'Werkplaats hal 2', project: 'Nieuwbouw De Meern',
      omschrijving: 'Collega gleed uit over een olievlek bij de draaibank. Geen letsel, wel geschrokken.',
      naam_melder: 'Jan de Vries', gevolgen: ['bijna_incident'], status: 'open' },
    { datum: '2026-03-03', tijd: '14:40', locatie: 'Steiger noordgevel', project: 'Renovatie Domlaan',
      omschrijving: 'Een niet-geborgde steigerplank viel naar beneden. Niemand geraakt, wel schrikreactie.',
      naam_melder: 'Petra Bakker', gevolgen: ['bijna_incident', 'schade_eigendom'], status: 'in_onderzoek',
      directe_oorzaken: [3, 16], basis_oorzaken: [8, 14],
      oorzaak_toelichting: 'Steiger onvoldoende gecontroleerd voor gebruik; toezicht ontbrak.',
      maatregelen_in_actielijst: true },
    { datum: '2026-04-21', tijd: '11:05', locatie: 'Magazijn', project: null,
      omschrijving: 'Medewerker sneed zich aan een defect stanleymes. EHBO toegepast, verband aangelegd.',
      naam_melder: 'Youssef El Amrani', gevolgen: ['letsel', 'ongeval_zonder_verzuim'], status: 'afgehandeld',
      directe_oorzaken: [6, 7], basis_oorzaken: [11, 12],
      oorzaak_toelichting: 'Gereedschap niet tijdig vervangen; verkeerd mes gebruikt.',
      onderzoeksrapportage_bijgevoegd: true, maatregelen_in_actielijst: true, tra_aanpassen: true,
      andere_maatregelen: 'Alle stanleymessen vervangen; snijhandschoenen verplicht gesteld.',
      besproken_in_toolbox_datum: '2026-05-01', functie_slachtoffer: 'Magazijnmedewerker',
      medische_dienst_bezocht: 'nee', afgehandeld_op: '2026-05-06T10:00:00Z' },
    { datum: '2026-05-18', tijd: '16:20', locatie: 'Buitenterrein', project: null,
      omschrijving: 'Kleine brand in een afvalcontainer door een weggegooide peuk. Geblust met poederblusser.',
      naam_melder: 'Petra Bakker', gevolgen: ['brand_explosie', 'schade_eigendom'], status: 'afgehandeld',
      directe_oorzaken: [21, 22], basis_oorzaken: [7],
      oorzaak_toelichting: 'Roken buiten de rookzone; container te dicht bij de gevel.',
      onderzoeksrapportage_bijgevoegd: true, maatregelen_in_actielijst: true,
      andere_maatregelen: 'Rookzone verplaatst en gemarkeerd; extra blusmiddel geplaatst.',
      besproken_in_toolbox_datum: '2026-05-22', afgehandeld_op: '2026-05-23T09:30:00Z' },
    { datum: '2026-06-09', tijd: '08:50', locatie: 'Laadperron', project: 'Logistiek',
      omschrijving: 'Heftruck raakte een stelling bij het achteruitrijden; lading omgevallen.',
      naam_melder: 'Jan de Vries', gevolgen: ['schade_eigendom', 'ongeval_zonder_verzuim'], status: 'in_onderzoek',
      directe_oorzaken: [4, 15], basis_oorzaken: [6, 8],
      oorzaak_toelichting: 'Te hoge snelheid en beperkt zicht; heftruckcertificaat verlopen.',
      telefonische_melding_directie: true, telefonische_melding_aan: 'Bedrijfsleider' },
    { datum: '2026-06-30', tijd: '13:10', locatie: 'Werkplaats', project: 'Onderhoud',
      omschrijving: 'Hydrauliekolie gelekt op de vloer bij een machine. Opgeruimd met absorptiekorrels.',
      naam_melder: null, gevolgen: ['milieuschade'], status: 'open' },
    { datum: '2026-07-01', tijd: '07:45', locatie: 'Trappenhuis kantoor', project: null,
      omschrijving: 'Medewerker verstapte zich op de trap en verzwikte zijn enkel. Doorgestuurd naar de huisarts.',
      naam_melder: 'Sandra Willems', gevolgen: ['letsel'], status: 'open',
      functie_slachtoffer: 'Uitvoerder', medische_dienst_bezocht: 'ja' },
  ]

  const eersteIds = []
  for (const r of rijen) {
    const { data, error } = await admin.from('incident').insert({ company_id: A, ...r }).select('id').single()
    if (error) { console.error('insert faalde:', error.message); continue }
    eersteIds.push({ id: data.id, letsel: r.gevolgen.includes('letsel') })
  }
  console.log(`${eersteIds.length} incidenten geseed.`)

  // Eén foto bij het letsel-ongeval (magazijn) — via het echte bedrijf-geprefixte pad.
  const doel = eersteIds.find(i => i.letsel) ?? eersteIds[0]
  if (doel) {
    const pad = `${A}/${doel.id}/${randomUUID().replace(/-/g, '')}.png`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(pad, PNG_1x1_ROOD, { contentType: 'image/png', upsert: true })
    if (upErr) console.error('foto-upload faalde:', upErr.message)
    else {
      await admin.from('incident_foto').insert({
        incident_id: doel.id, company_id: A, storage_pad: pad,
        bestandsnaam: 'letsel-plek.png', type: 'image/png', grootte: PNG_1x1_ROOD.length,
      })
      console.log('1 demofoto toegevoegd aan het letsel-incident.')
    }
  }

  console.log('\n=== KLAAR ===')
  console.log(`Meld-URL (Deel 1, geen login):  <origin>/melden/${link.token}`)
  console.log(`KAM-scherm (login kam-alpha@demo.nl):  <origin>/${A}/incidenten`)
}

main().catch(e => { console.error('FOUT:', e.message); process.exit(1) })
