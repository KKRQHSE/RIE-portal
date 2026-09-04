// ============================================================================
// Teamleider-rol — rol-voor-rol testmatrix (Pakket 1)
// ----------------------------------------------------------------------------
// Bewijst per rol (admin/KAM/teamleider/token) zowel de MAG- als de MAG-NIET-
// kant, plus cross-company isolatie voor de nieuwe poort mag_bedrijf_werken:
//  - inspecties: teamleider start/vult in/rondt af (eigen bedrijf, elke
//    inspectie); niet cross-company.
//  - toolbox-sessies: teamleider registreert/bewerkt elke sessie van het
//    bedrijf, maar verwijdert alleen EIGEN sessies; niet cross-company.
//  - incidenten: teamleider leest via incident_overzicht met medische velden
//    op null; de rauwe tabel blijft dicht; incident_oorzaak_opslaan raakt de
//    medische velden nooit aan; incident_deel2_opslaan blijft KAM/admin-only.
//  - acties: teamleider zet status via de smalle RPC (elke actie), maar kan
//    NIET rechtstreeks op pva_items UPDATEn (alleen KAM/admin, via RLS dicht).
//  - personen: teamleider leest, maar kan NIET aanmaken/wijzigen.
//  - doelstellingen: teamleider leest, maar kan NIET wijzigen.
//  - audits: blijven volledig dicht voor teamleider (lezen én aanmaken).
//  - RI&E: teamleider leest vragen/modules van het EIGEN bedrijf, niet van
//    een ander bedrijf.
// Regressie: KAM (client) en admin behouden hun bestaande toegang.
//
// Draaien:  node --use-system-ca scripts/teamleider_rol_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix TLTEST_ wordt opgeruimd.
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

const TS = Date.now()
const PW = 'Tltest!' + TS
const companyIds = [], userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `TLTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `tltest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `TLTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('KAMA', A, 'client')
  const teamleiderA = await maakGebruiker('TLA', A, 'teamleider')
  const teamleiderA2 = await maakGebruiker('TLA2', A, 'teamleider')
  const teamleiderB = await maakGebruiker('TLB', B, 'teamleider')

  // ===== Fixtures op bedrijf A (via service-role, buiten de RPC's om) =====
  const { data: sjabloon } = await admin.from('inspectie_sjabloon')
    .insert({ company_id: A, naam: 'TLTEST sjabloon', controlesoort: 'Werkplek' }).select('id').single()
  await admin.from('inspectie_sjabloon_punt')
    .insert({ company_id: A, sjabloon_id: sjabloon.id, volgorde: 1, tekst: 'Is de vluchtweg vrij?', verplicht: true })

  const { data: actieA } = await admin.from('pva_items')
    .insert({ company_id: A, nr: '9001', onderwerp: 'TLTEST actie', status: 'Open', prio: 'Middel' }).select('id').single()

  const { data: incidentA } = await admin.from('incident')
    .insert({ company_id: A, datum: '2026-07-01', locatie: 'Hal 1', omschrijving: 'TLTEST incident', functie_slachtoffer: 'Monteur', medische_dienst_bezocht: 'ja' })
    .select('id').single()

  const { data: fgA } = await admin.from('functiegroep')
    .insert({ company_id: A, naam: 'TLTEST functiegroep' }).select('id').single()

  // ===== 1. Inspecties: teamleider start/vult in/rondt af (eigen bedrijf) =====
  let inspectieId = null
  {
    const { data, error } = await teamleiderA.rpc('inspectie_start', { p_sjabloon_id: sjabloon.id })
    inspectieId = data
    check('teamleider start een inspectie in eigen bedrijf', !error && !!data, error?.message)
  }
  let bevindingId = null
  if (inspectieId) {
    const { data: bevindingen } = await admin.from('inspectie_bevinding').select('id').eq('inspectie_id', inspectieId)
    bevindingId = bevindingen?.[0]?.id
    const { error } = await teamleiderA.rpc('bevinding_opslaan', { p_bevinding_id: bevindingId, p_resultaat: 'in_orde' })
    check('teamleider vult een bevinding in', !error, error?.message)
    const { error: afrondErr } = await teamleiderA.rpc('inspectie_afronden', { p_inspectie_id: inspectieId, p_conclusie: 'TLTEST klaar' })
    check('teamleider rondt de inspectie zelf af (geen extra KAM-stap)', !afrondErr, afrondErr?.message)
  }
  {
    const { error } = await teamleiderB.rpc('inspectie_start', { p_sjabloon_id: sjabloon.id })
    check('teamleider van bedrijf B kan GEEN inspectie starten op sjabloon van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 2. Toolbox-sessies: registreren/bewerken breed, verwijderen smal =====
  let sessieVanTLA = null, sessieVanTLA2 = null
  {
    const { data, error } = await teamleiderA.rpc('toolbox_sessie_opslaan', {
      p_company_id: A, p_sessie_id: null, p_datum: '2026-07-02', p_onderwerp: 'TLTEST sessie TLA', p_notitie: null,
    })
    sessieVanTLA = data
    check('teamleider registreert een toolbox-sessie', !error && !!data, error?.message)
  }
  {
    const { data, error } = await teamleiderA2.rpc('toolbox_sessie_opslaan', {
      p_company_id: A, p_sessie_id: null, p_datum: '2026-07-03', p_onderwerp: 'TLTEST sessie TLA2', p_notitie: null,
    })
    sessieVanTLA2 = data
    check('tweede teamleider (zelfde bedrijf) registreert eigen sessie', !error && !!data, error?.message)
  }
  {
    const { error } = await teamleiderA.rpc('toolbox_sessie_opslaan', {
      p_company_id: A, p_sessie_id: sessieVanTLA2, p_datum: '2026-07-03', p_onderwerp: 'TLTEST sessie TLA2 (bewerkt door TLA)', p_notitie: null,
    })
    check('teamleider mag EEN ANDERE sessie van het bedrijf bewerken', !error, error?.message)
  }
  {
    const { error } = await teamleiderA.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessieVanTLA2 })
    check('teamleider mag NIET andermans sessie verwijderen (alleen eigen werk)', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await teamleiderA.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessieVanTLA })
    check('teamleider mag EIGEN sessie verwijderen', !error, error?.message)
  }
  {
    const { error } = await kamA.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessieVanTLA2 })
    check('regressie: KAM mag nog elke sessie verwijderen', !error, error?.message)
  }
  {
    const { error } = await teamleiderB.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieVanTLA2, p_persoon_id: null, p_aanwezig: true })
    check('teamleider van bedrijf B kan GEEN toolbox-sessie van A raken', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 3. Incidenten: masking + oorzaakanalyse zonder medische velden =====
  {
    const { data, error } = await teamleiderA.rpc('incident_overzicht', { p_company_id: A })
    const row = data?.find(r => r.id === incidentA.id)
    const ok = !error && !!row && row.functie_slachtoffer === null && row.medische_dienst_bezocht === null && row.omschrijving === 'TLTEST incident'
    check('teamleider leest incidenten met medische velden op null', ok, error?.message ?? JSON.stringify(row))
  }
  {
    const { data, error } = await kamA.rpc('incident_overzicht', { p_company_id: A })
    const row = data?.find(r => r.id === incidentA.id)
    const ok = !error && row?.functie_slachtoffer === 'Monteur' && row?.medische_dienst_bezocht === 'ja'
    check('regressie: KAM leest incidenten MET medische velden', ok, error?.message ?? JSON.stringify(row))
  }
  {
    const { data } = await teamleiderA.from('incident').select('id').eq('id', incidentA.id)
    check('teamleider kan de rauwe incident-tabel NIET rechtstreeks lezen (RLS dicht)', (data?.length ?? 0) === 0, `${data?.length ?? 0} rij(en)`)
  }
  {
    const { data, error } = await teamleiderA.rpc('incident_oorzaak_opslaan', {
      p_company_id: A, p_incident_id: incidentA.id, p_status: 'in_onderzoek',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: 'TLTEST oorzaak door teamleider',
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null, p_besproken_in_toolbox_datum: null,
    })
    const ok = !error && data?.oorzaak_toelichting === 'TLTEST oorzaak door teamleider' && data?.functie_slachtoffer === null && data?.medische_dienst_bezocht === null
    check('teamleider slaat oorzaakanalyse op; medische velden komen null terug', ok, error?.message ?? JSON.stringify(data))
    const { data: row } = await admin.from('incident').select('functie_slachtoffer, medische_dienst_bezocht').eq('id', incidentA.id).single()
    check('medische velden in de DB blijven ONGEWIJZIGD na oorzaakanalyse door teamleider', row?.functie_slachtoffer === 'Monteur' && row?.medische_dienst_bezocht === 'ja', JSON.stringify(row))
  }
  {
    const { error } = await teamleiderA.rpc('incident_deel2_opslaan', {
      p_company_id: A, p_incident_id: incidentA.id, p_status: 'afgehandeld',
      p_directe_oorzaken: [], p_basis_oorzaken: [], p_oorzaak_toelichting: null,
      p_onderzoeksrapportage_bijgevoegd: false, p_telefonische_melding_directie: false, p_telefonische_melding_aan: null,
      p_maatregelen_in_actielijst: false, p_tra_aanpassen: false, p_andere_maatregelen: null,
      p_besproken_in_toolbox_datum: null, p_functie_slachtoffer: 'HACK', p_medische_dienst_bezocht: 'nee',
    })
    check('teamleider kan incident_deel2_opslaan (medische velden) NIET aanroepen', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { data, error } = await teamleiderB.rpc('incident_overzicht', { p_company_id: A })
    check('teamleider van bedrijf B kan incidenten van A NIET lezen', !!error, error ? 'geweigerd' : `${data?.length ?? 0} rij(en)`)
  }

  // ===== 4. Acties: status-only RPC breed, rechtstreekse UPDATE dicht =====
  {
    const { data, error } = await teamleiderA.rpc('actie_status_zetten', { p_actie_id: actieA.id, p_status: 'In behandeling', p_opm: 'TLTEST' })
    check('teamleider zet actiestatus via de smalle RPC', !error && data?.status === 'In behandeling', error?.message)
  }
  {
    const { data } = await teamleiderA.from('pva_items').select('onderwerp').eq('id', actieA.id)
    check('teamleider mag acties WEL lezen (rechtstreeks)', (data?.length ?? 0) === 1, `${data?.length ?? 0} rij(en)`)
  }
  {
    const { error } = await teamleiderA.from('pva_items').update({ onderwerp: 'HACK' }).eq('id', actieA.id)
    const { data: row } = await admin.from('pva_items').select('onderwerp').eq('id', actieA.id).single()
    check('teamleider kan pva_items NIET rechtstreeks UPDATEn (alleen via de smalle RPC)', row?.onderwerp !== 'HACK', error ? 'geweigerd' : `onderwerp=${row?.onderwerp}`)
  }
  {
    // pva_items heeft sowieso geen UPDATE-grant voor de authenticated-rol (alleen
    // postgres/service_role) — rechtstreeks updaten kon dus al niet, voor niemand.
    // De echte regressie zit in de bestaande RPC's: geef_actie_vrij blijft werken.
    const { error } = await kamA.rpc('geef_actie_vrij', { p_actie_id: actieA.id, p_opmerking: 'TLTEST KAM vrijgave' })
    check('regressie: KAM kan een actie nog vrijgeven via geef_actie_vrij', !error, error?.message)
  }
  {
    const { error } = await teamleiderB.rpc('actie_status_zetten', { p_actie_id: actieA.id, p_status: 'Afgerond' })
    check('teamleider van bedrijf B kan GEEN status zetten op actie van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 5. Personen: lezen wel, beheren niet =====
  {
    const { data } = await teamleiderA.from('personen').select('id')
    check('teamleider mag personen WEL lezen', Array.isArray(data), data ? `${data.length} rij(en)` : 'geen data')
  }
  {
    const { error } = await teamleiderA.from('personen').insert({ company_id: A, naam: 'TLTEST HACK persoon' })
    check('teamleider mag GEEN persoon aanmaken', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.from('personen').insert({ company_id: A, naam: 'TLTEST KAM persoon' })
    check('regressie: KAM mag nog personen aanmaken', !error, error?.message)
    if (!error) await admin.from('personen').delete().eq('company_id', A).eq('naam', 'TLTEST KAM persoon')
  }

  // ===== 6. Doelstellingen: lezen wel, zetten niet =====
  {
    const { data, error } = await teamleiderA.from('bedrijf_doelstelling').select('company_id').eq('company_id', A)
    check('teamleider mag doelstellingen WEL lezen', !error, error?.message)
  }
  {
    const { error } = await teamleiderA.rpc('doelstelling_zetten', { p_company_id: A, p_functiegroep_id: fgA.id, p_doel_per_jaar: 5 })
    check('teamleider mag doelstellingen NIET wijzigen', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.rpc('doelstelling_zetten', { p_company_id: A, p_functiegroep_id: fgA.id, p_doel_per_jaar: 5 })
    check('regressie: KAM mag doelstellingen nog wijzigen', !error, error?.message)
  }

  // ===== 7. Audits: volledig dicht voor teamleider =====
  {
    const { data } = await teamleiderA.from('audit').select('id').eq('company_id', A)
    check('teamleider ziet GEEN audits (rechtstreekse tabel)', (data?.length ?? 0) === 0, `${data?.length ?? 0} rij(en)`)
  }
  {
    const { error } = await teamleiderA.rpc('audit_aanmaken', { p_company_id: A, p_sjabloon: 'vca', p_titel: 'TLTEST audit', p_jaar: 2026 })
    check('teamleider kan GEEN audit aanmaken', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.rpc('audit_aanmaken', { p_company_id: A, p_sjabloon: 'vca', p_titel: 'TLTEST audit KAM', p_jaar: 2026 })
    check('regressie: KAM kan nog audits aanmaken', !error, error?.message)
  }

  // ===== 8. RI&E doorbladeren: eigen bedrijf wel, ander bedrijf niet =====
  await admin.from('modules').insert({ company_id: A, code: 'tltest', titel: 'TLTEST module' })
  {
    const { data } = await teamleiderA.from('modules').select('id').eq('company_id', A)
    check('teamleider leest RI&E-modules van EIGEN bedrijf', (data?.length ?? 0) >= 1, `${data?.length ?? 0} rij(en)`)
  }
  {
    const { data } = await teamleiderB.from('modules').select('id').eq('company_id', A)
    check('teamleider van bedrijf B leest GEEN RI&E-modules van A', (data?.length ?? 0) === 0, `${data?.length ?? 0} rij(en)`)
  }

  // ===== 9. Statuskop: bedrijf_modules + dashboard_overzicht/dashboard_pva_rie =====
  await admin.from('bedrijf_modules').insert({ company_id: A, module: 'toolbox', module_status: 'actief', actief: true })
  {
    const { data } = await teamleiderA.from('bedrijf_modules').select('module').eq('company_id', A)
    check('teamleider leest bedrijf_modules (nav/module-check blijft gevuld)', (data?.length ?? 0) >= 1, `${data?.length ?? 0} rij(en)`)
  }
  {
    const { data, error } = await teamleiderA.rpc('dashboard_pva_rie', { p_company_id: A })
    check('teamleider krijgt dashboard_pva_rie (statuskop PvA/RI&E)', !error && !!data, error?.message)
  }
  {
    const { data, error } = await teamleiderA.rpc('dashboard_overzicht', { p_company_id: A })
    const ok = !error && !!data && data.instellingen === null && data.rie !== undefined && data.inspecties !== undefined
    check('teamleider krijgt dashboard_overzicht met instellingen op null', ok, error?.message ?? JSON.stringify(data?.instellingen))
  }
  {
    await admin.from('bedrijf_dashboard_instelling').insert({ company_id: A, klachten_aantal: 3, tevredenheid_score: 8 })
    const { data } = await kamA.rpc('dashboard_overzicht', { p_company_id: A })
    check('regressie: KAM krijgt dashboard_overzicht MET instellingen', data?.instellingen?.klachten_aantal === 3, JSON.stringify(data?.instellingen))
  }
  {
    const { error } = await teamleiderB.rpc('dashboard_overzicht', { p_company_id: A })
    check('teamleider van bedrijf B krijgt GEEN dashboard_overzicht van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 10. Toolbox-onderwerpen + norm-overzicht (migratie 0065) =====
  {
    const { data, error } = await teamleiderA.rpc('bedrijf_toolbox_overzicht', { p_company_id: A })
    check('teamleider krijgt bedrijf_toolbox_overzicht (toolboxen kiezen bij registreren)', !error && Array.isArray(data), error?.message)
  }
  {
    const { error } = await teamleiderB.rpc('bedrijf_toolbox_overzicht', { p_company_id: A })
    check('teamleider van bedrijf B krijgt GEEN bedrijf_toolbox_overzicht van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { data, error } = await teamleiderA.rpc('bedrijf_norm_overzicht', { p_company_id: A })
    check('teamleider krijgt bedrijf_norm_overzicht (norm-inspectie kunnen starten)', !error && Array.isArray(data), error?.message)
  }
  {
    const { error } = await teamleiderB.rpc('bedrijf_norm_overzicht', { p_company_id: A })
    check('teamleider van bedrijf B krijgt GEEN bedrijf_norm_overzicht van A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { data: sess } = await admin.from('toolbox_sessie')
      .insert({ company_id: A, datum: '2026-07-04', onderwerp: 'TLTEST aangemaakt_door-check', aangemaakt_door: null })
      .select('id').single()
    const { data, error } = await teamleiderA.rpc('toolbox_sessies_overzicht', { p_company_id: A })
    const rij = data?.sessies?.find(s => s.sessie_id === sess.id)
    check('toolbox_sessies_overzicht geeft aangemaakt_door mee', !error && rij && 'aangemaakt_door' in rij, error?.message ?? JSON.stringify(rij))
  }
}

async function cleanup() {
  if (companyIds.length) {
    // Cascade via FK's op company_id ruimt inspectie/toolbox/pva/incident/personen/modules/audit op.
    await admin.from('companies').delete().in('id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
}

console.log('======== TEAMLEIDER-ROL — rol-voor-rol testmatrix (Pakket 1) ========')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try { await cleanup(); console.log('  opgeruimd.') } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = results.filter(r => !r.ok).length
console.log(`\n## Teamleider-rol -> ${fail === 0 && setupOk ? 'PASS' : 'FAIL'} (${results.length - fail}/${results.length})`)
process.exit(fail === 0 && setupOk ? 0 : 1)
