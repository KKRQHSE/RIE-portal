// ============================================================================
// Incidenten-module — isolatie-/beveiligingstest, Fase 2 (open meldflow)
// ----------------------------------------------------------------------------
// Bewijst:
//  - open melden via het bedrijfstoken werkt en landt in de JUISTE tenant;
//  - meldcontext via token levert bedrijf + gevolg-labels (geen incident-data);
//  - anon ZONDER geldig token kan niet melden; een ingetrokken token weigert;
//  - een melding van bedrijf A is niet zichtbaar/opvraagbaar door bedrijf B;
//  - anon kan de incident-rij (incl. gevoelige velden) NIET lezen; KAM van A wel;
//  - A's token kan geen foto hangen aan een incident van B (cross-incident dicht);
//  - foto's van A zijn NIET leesbaar door B of door anon; KAM van A wel.
//
// Draaien:  node --use-system-ca scripts/incident_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix INCTEST_ wordt opgeruimd.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON) { console.error('SUPABASE-URL/ANON ontbreken.'); process.exit(1) }
if (!SERVICE) { console.log('— SERVICE_ROLE ontbreekt; overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const BUCKET = 'incident-foto'
const TS = Date.now()
const PW = 'Inctest!' + TS
const companyIds = [], userIds = [], padenA = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `INCTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `inctest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `INCTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}
async function maakMeldlink(companyId) {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  const { error } = await admin.from('incident_meldlink').insert({ company_id: companyId, token })
  if (error) throw new Error(`meldlink: ${error.message}`)
  return token
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('KAMA', A, 'client')
  const kamB = await maakGebruiker('KAMB', B, 'client')
  const tokenA = await maakMeldlink(A)
  const tokenB = await maakMeldlink(B)

  // 1. Meldcontext via token: bedrijf + 6 gevolg-labels, geen incident-data.
  {
    const { data } = await anon.rpc('incident_meldcontext_token', { p_token: tokenA })
    const ctx = typeof data === 'string' ? JSON.parse(data) : data
    const ok = !!ctx && ctx.bedrijf === `INCTEST_A_${TS}` && Array.isArray(ctx.gevolg_opties) && ctx.gevolg_opties.length === 6
    check('meldcontext via token levert bedrijf + gevolg-labels', ok, ctx ? `bedrijf=${ctx.bedrijf}, gevolgen=${ctx.gevolg_opties?.length}` : 'geen context')
  }

  // 2. Open melden via bedrijfstoken werkt en landt in de juiste tenant (A).
  let incidentA = null
  {
    const { data, error } = await anon.rpc('incident_melden_token', {
      p_token: tokenA, p_datum: '2026-07-05', p_tijd: '09:30',
      p_locatie: 'Werkplaats', p_project: 'INCTEST', p_omschrijving: 'Bijna uitgegleden',
      p_naam_melder: null, p_gevolgen: ['bijna_incident', 'letsel', 'ONZIN_CODE'],
    })
    incidentA = data
    let landtGoed = false, gevolgenGefilterd = false
    if (data) {
      const { data: row } = await admin.from('incident').select('company_id, gevolgen').eq('id', data).single()
      landtGoed = row?.company_id === A
      // 'ONZIN_CODE' moet weggefilterd zijn; bekende codes blijven.
      gevolgenGefilterd = Array.isArray(row?.gevolgen) && row.gevolgen.includes('letsel') && !row.gevolgen.includes('ONZIN_CODE')
    }
    check('open melden via token maakt incident in de JUISTE tenant', !error && landtGoed, error ? error.message : `company=${A}`)
    check('onbekende gevolg-code wordt server-side weggefilterd', gevolgenGefilterd)
  }

  // Incident voor B (via B's token) — voor de cross-incident-foto-test.
  const { data: incidentB } = await anon.rpc('incident_melden_token', {
    p_token: tokenB, p_datum: '2026-07-05', p_tijd: null,
    p_locatie: 'B-locatie', p_project: null, p_omschrijving: 'B-incident', p_naam_melder: null, p_gevolgen: [],
  })

  // 3. Anon zonder geldig token kan niet melden.
  {
    const { error } = await anon.rpc('incident_melden_token', {
      p_token: 'ongeldig-' + TS, p_datum: '2026-07-05', p_tijd: null,
      p_locatie: 'x', p_project: null, p_omschrijving: 'x', p_naam_melder: null, p_gevolgen: [],
    })
    check('anon ZONDER geldig token kan niet melden', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // 4. Anon kan de incident-rij (incl. gevoelige velden) NIET lezen.
  {
    const { data } = await anon.from('incident').select('id, functie_slachtoffer, medische_dienst_bezocht').eq('id', incidentA)
    check('anon kan incident-rij NIET lezen (RLS)', (data?.length ?? 0) === 0, `${data?.length ?? 0} rij(en)`)
  }

  // 5. Bedrijf B ziet A's melding niet; KAM van A wél (positieve controle).
  {
    const { data: bZiet } = await kamB.from('incident').select('id').eq('id', incidentA)
    check('bedrijf B ziet A-melding NIET', (bZiet?.length ?? 0) === 0, `${bZiet?.length ?? 0} rij(en)`)
    const { data: aZiet } = await kamA.from('incident').select('id, functie_slachtoffer').eq('id', incidentA)
    check('positieve controle: KAM van A leest eigen incident (incl. gevoelig veld)', (aZiet?.length ?? 0) === 1)
  }

  // 6. Ingetrokken token weigert (melden + context).
  {
    await admin.from('incident_meldlink').update({ ingetrokken: true }).eq('company_id', A)
    const { error: e1 } = await anon.rpc('incident_melden_token', {
      p_token: tokenA, p_datum: '2026-07-05', p_tijd: null,
      p_locatie: 'x', p_project: null, p_omschrijving: 'x', p_naam_melder: null, p_gevolgen: [],
    })
    const { data: ctx } = await anon.rpc('incident_meldcontext_token', { p_token: tokenA })
    check('ingetrokken token weigert melden + context', !!e1 && (ctx == null), e1 ? 'geweigerd' : 'TOEGESTAAN!')
    await admin.from('incident_meldlink').update({ ingetrokken: false }).eq('company_id', A)
  }

  // 7. A's token kan geen foto hangen aan een incident van B (cross-incident dicht).
  {
    const { data } = await anon.rpc('incident_foto_pad_token', {
      p_token: tokenA, p_incident_id: incidentB, p_bestandsnaam: 'x.jpg',
    })
    check("A-token kan GEEN foto-pad reserveren voor B's incident", data == null, data ? 'PAD GEGEVEN!' : 'geweigerd')
  }

  // 8. Foto-isolatie in Storage. Service-role legt een foto van A neer (zoals de
  //    signed-URL-flow doet): <A>/<incidentA>/geheim.txt.
  const padA = `${A}/${incidentA}/geheim_${TS}.txt`
  padenA.push(padA)
  {
    const { error } = await admin.storage.from(BUCKET).upload(padA, Buffer.from('GEHEIM incident-foto A'), { contentType: 'text/plain', upsert: true })
    if (error) throw new Error(`upload A-foto: ${error.message}`)

    const { data: bDl } = await kamB.storage.from(BUCKET).download(padA)
    const bTekst = bDl ? await bDl.text() : null
    check('bedrijf B kan A-foto NIET downloaden (storage-RLS)', !(bDl && bTekst?.includes('GEHEIM')), bDl ? `LAS: ${bTekst}` : 'geweigerd')

    const { data: anonDl } = await anon.storage.from(BUCKET).download(padA)
    check('anon kan A-foto NIET downloaden', !anonDl, anonDl ? 'GELEZEN!' : 'geweigerd')

    const { data: aDl } = await kamA.storage.from(BUCKET).download(padA)
    check('positieve controle: KAM van A kan EIGEN foto downloaden', !!aDl)
  }

  // ===== FASE 3 — KAM-afhandeling (Deel 2) + meldlink-beheer =====

  // 9. KAM van A vult Deel 2 in (incl. gevoelige velden); onbekende oorzaakcode gefilterd.
  {
    const { error } = await kamA.rpc('incident_deel2_opslaan', {
      p_company_id: A, p_incident_id: incidentA, p_status: 'in_onderzoek',
      p_directe_oorzaken: [7, 999], p_basis_oorzaken: [5],
      p_oorzaak_toelichting: 'PBM niet gedragen', p_onderzoeksrapportage_bijgevoegd: true,
      p_telefonische_melding_directie: true, p_telefonische_melding_aan: 'Directeur',
      p_maatregelen_in_actielijst: true, p_tra_aanpassen: false, p_andere_maatregelen: 'Extra toezicht',
      p_besproken_in_toolbox_datum: '2026-07-10', p_functie_slachtoffer: 'Monteur', p_medische_dienst_bezocht: 'ja',
    })
    const { data: row } = await admin.from('incident')
      .select('status, directe_oorzaken, medische_dienst_bezocht, afgehandeld_op').eq('id', incidentA).single()
    const ok = !error && row?.status === 'in_onderzoek'
      && Array.isArray(row?.directe_oorzaken) && row.directe_oorzaken.includes(7) && !row.directe_oorzaken.includes(999)
      && row?.medische_dienst_bezocht === 'ja'
    check('KAM van A vult Deel 2 (onbekende oorzaakcode gefilterd, gevoelig veld opgeslagen)', ok, error ? error.message : '')
  }

  // 10. Status 'afgehandeld' zet afgehandeld_op; terugzetten wist het.
  {
    await kamA.rpc('incident_deel2_opslaan', {
      p_company_id: A, p_incident_id: incidentA, p_status: 'afgehandeld',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: null,
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null,
      p_besproken_in_toolbox_datum: null, p_functie_slachtoffer: null, p_medische_dienst_bezocht: null,
    })
    const { data: r1 } = await admin.from('incident').select('afgehandeld_op').eq('id', incidentA).single()
    check('status afgehandeld stempelt afgehandeld_op', !!r1?.afgehandeld_op)
  }

  // 11. KAM van B kan Deel 2 van A NIET muteren — via A's company_id (guard).
  {
    const { error } = await kamB.rpc('incident_deel2_opslaan', {
      p_company_id: A, p_incident_id: incidentA, p_status: 'open',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: 'HACK',
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null,
      p_besproken_in_toolbox_datum: null, p_functie_slachtoffer: null, p_medische_dienst_bezocht: null,
    })
    check('KAM van B kan Deel 2 van A NIET muteren (guard op A)', !!error, error ? 'geweigerd' : 'GEMUTEERD!')
  }

  // 12. KAM van B kan met EIGEN company_id niet aan A's incident komen (niet gevonden).
  {
    const { error } = await kamB.rpc('incident_deel2_opslaan', {
      p_company_id: B, p_incident_id: incidentA, p_status: 'open',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: 'HACK2',
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null,
      p_besproken_in_toolbox_datum: null, p_functie_slachtoffer: null, p_medische_dienst_bezocht: null,
    })
    check('KAM van B kan A-incident niet raken via eigen company_id (niet gevonden)', !!error, error ? 'geweigerd' : 'GEMUTEERD!')
  }

  // 13. anon kan Deel 2 NIET opslaan (anon-EXECUTE ingetrokken).
  {
    const { error } = await anon.rpc('incident_deel2_opslaan', {
      p_company_id: A, p_incident_id: incidentA, p_status: 'open',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: null,
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null,
      p_besproken_in_toolbox_datum: null, p_functie_slachtoffer: null, p_medische_dienst_bezocht: null,
    })
    check('anon kan Deel 2 NIET opslaan', !!error)
  }

  // 14. Meldlink-beheer: KAM van A mag; KAM van B en anon niet (op A).
  {
    const { data: aZorg, error: aErr } = await kamA.rpc('incident_meldlink_zorg', { p_company_id: A })
    check('KAM van A kan eigen meldlink beheren (zorg)', !aErr && !!aZorg)
    const { error: bErr } = await kamB.rpc('incident_meldlink_roteren', { p_company_id: A })
    check('KAM van B kan meldlink van A NIET roteren', !!bErr)
    const { error: anonErr } = await anon.rpc('incident_meldlink_intrekken', { p_company_id: A, p_ingetrokken: true })
    check('anon kan meldlink van A NIET intrekken', !!anonErr)
  }
}

async function cleanup() {
  try { if (padenA.length) await admin.storage.from(BUCKET).remove(padenA) } catch { /* */ }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)  // cascade: incident, incident_foto, incident_meldlink
}

console.log('======== INCIDENT — isolatie/beveiliging (Fase 2) ========')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try { await cleanup(); console.log('  opgeruimd.') } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = results.filter(r => !r.ok).length
console.log(`\n## Incident-isolatie -> ${fail === 0 && setupOk ? 'PASS' : 'FAIL'} (${results.length - fail}/${results.length})`)
process.exit(fail === 0 && setupOk ? 0 : 1)
