// ============================================================================
// Toolbox-module — isolatie-, beveiligings- en naar-rato-tests (bewijs)
// ----------------------------------------------------------------------------
// Bewijst: klant kan centrale toolbox niet muteren (wel lezen); bedrijf A ziet/
// muteert deelname/doel/koppeling van B niet; een werknemer-token kan alleen zijn
// eigen deelname afronden (en niet zonder naam-bevestiging); een afgerond record is
// ONVERANDERLIJK (update geweigerd); en de naar-rato-telling klopt voor instroom
// (half jaar → half doel) en uitstroom (valt uit de noemer).
//
// Draaien:  node --use-system-ca scripts/toolbox_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix TBTEST_ wordt opgeruimd.
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

const TS = Date.now()
const PW = 'Tbtest!' + TS
const companyIds = [], userIds = [], toolboxIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `TBTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `tbtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `TBTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}

// Verwacht naar-rato-doel voor instroom 1 juli, N=12 (zelfde formule als de RPC).
function verwachtDoelJuli(n) {
  const y = new Date().getUTCFullYear()
  const ys = Date.UTC(y, 0, 1), ye = Date.UTC(y, 11, 31), jul1 = Date.UTC(y, 6, 1)
  const yearDays = Math.round((ye - ys) / 86400000) + 1
  const serviceDays = Math.round((ye - jul1) / 86400000) + 1
  return Math.round(n * serviceDays / yearDays)
}

async function run() {
  const aCompany = await maakBedrijf('A')
  const bCompany = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', aCompany, 'client')
  const clientB = await maakGebruiker('B', bCompany, 'client')
  const adminClient = await maakGebruiker('ADMIN', null, 'admin')

  // Admin maakt een centrale toolbox (geen video/quiz vereist → simpel afronden).
  const { data: tbId, error: tbErr } = await adminClient.rpc('centrale_toolbox_opslaan', {
    p_id: null, p_titel: 'TBTEST_toolbox', p_tekst: 'Lees dit.', p_video_url: null,
    p_vereist_video: false, p_vereist_quiz: false, p_quiz_slaaggrens: 70,
    p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 999,
  })
  check('admin maakt centrale toolbox (positieve controle)', !tbErr && !!tbId, tbErr?.message)
  if (tbId) toolboxIds.push(tbId)

  // Klant mag centraal LEZEN maar niet muteren.
  {
    const { data } = await clientA.from('centrale_toolbox').select('id').eq('id', tbId)
    check('klant A leest centrale toolbox (positieve controle)', (data?.length ?? 0) === 1)
  }
  {
    const { error } = await clientA.rpc('centrale_toolbox_opslaan', { p_id: null, p_titel: 'kaap', p_tekst: '', p_video_url: null, p_vereist_video: false, p_vereist_quiz: false, p_quiz_slaaggrens: 70, p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 1 })
    check('klant A kan GEEN centrale toolbox aanmaken', !!error)
  }
  {
    const { error } = await clientA.rpc('centrale_toolbox_archiveren', { p_id: tbId })
    check('klant A kan centrale toolbox niet archiveren', !!error)
  }
  {
    const { error } = await clientA.from('centrale_toolbox').insert({ titel: 'direct' })
    check('klant A kan niet direct in centrale_toolbox schrijven (RLS)', !!error)
  }

  // A richt zijn bedrijf in: functiegroep + doel + koppelen.
  const { data: fgId } = await clientA.rpc('functiegroep_opslaan', { p_id: null, p_company_id: aCompany, p_naam: 'TBTEST_groep', p_volgorde: 1 })
  await clientA.rpc('doelstelling_zetten', { p_company_id: aCompany, p_functiegroep_id: fgId, p_doel_per_jaar: 12 })
  await clientA.rpc('toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbId })

  // Personen: P1 (instroom 1 juli), P2 (uitgestroomd vorig jaar). Beide in groep.
  const y = new Date().getUTCFullYear()
  const { data: p1 } = await admin.from('personen').insert({ company_id: aCompany, naam: 'TBTEST_P1', status: 'actief', functiegroep_id: fgId, datum_in_dienst: `${y}-07-01` }).select('id').single()
  const { data: p2 } = await admin.from('personen').insert({ company_id: aCompany, naam: 'TBTEST_P2', status: 'actief', functiegroep_id: fgId, datum_in_dienst: `${y - 2}-01-01`, datum_uit_dienst: `${y - 1}-06-01` }).select('id').single()

  // Persoonlijke deellink voor P1 (zoals de werknemer hem zou gebruiken).
  const { data: token } = await clientA.rpc('create_deellink', { p_persoon_id: p1.id })

  // Werknemer (anon) ziet zijn toolboxen via het token.
  {
    const { data } = await anon.rpc('toolbox_voor_token', { p_token: token })
    const heeft = Array.isArray(data?.toolboxen) && data.toolboxen.some(t => t.toolbox_id === tbId)
    check('werknemer ziet zijn toolbox via token (positieve controle)', heeft)
  }
  // Naam-mismatch: niet bevestigd → geen record.
  {
    const { error } = await anon.rpc('toolbox_afronden_token', { p_token: token, p_toolbox_id: tbId, p_video_bekeken: false, p_quiz_antwoorden: [], p_naam_bevestigd: false, p_handtekening: 'data:img,x' })
    check('afronden zonder naam-bevestiging wordt geweigerd', !!error)
  }
  // Direct in de tabel schrijven kan niet (geen insert-policy).
  {
    const { error } = await anon.from('toolbox_deelname').insert({ company_id: aCompany, persoon_id: p1.id, titel_snap: 'x', tekst_snap: 'x', bevestigde_naam: 'x', naam_bevestigd: true, handtekening: 'data:img,x', handtekening_gezet_op: new Date().toISOString() })
    check('werknemer kan niet direct in toolbox_deelname schrijven (RLS)', !!error)
  }
  // Echte afronding via token → record voor P1.
  let deelnameId
  {
    const { data, error } = await anon.rpc('toolbox_afronden_token', { p_token: token, p_toolbox_id: tbId, p_video_bekeken: false, p_quiz_antwoorden: [], p_naam_bevestigd: true, p_handtekening: 'data:image/png;base64,AAAA' })
    check('werknemer rondt eigen toolbox af via token (positieve controle)', !error && !!data, error?.message)
    deelnameId = data
  }
  // Het record hoort bij P1 en bedrijf A, met de bevroren naam.
  {
    const { data } = await admin.from('toolbox_deelname').select('persoon_id, company_id, bevestigde_naam, bewijssoort').eq('id', deelnameId).single()
    check('record hoort bij de juiste persoon/bedrijf met bevroren naam', !!data && data.persoon_id === p1.id && data.company_id === aCompany && data.bevestigde_naam === 'TBTEST_P1' && data.bewijssoort === 'digitaal')
  }

  // ÉÉN PER JAAR: tweede afronding zelfde toolbox/persoon/jaar geweigerd (RPC + DB).
  {
    const { error } = await anon.rpc('toolbox_afronden_token', { p_token: token, p_toolbox_id: tbId, p_video_bekeken: false, p_quiz_antwoorden: [], p_naam_bevestigd: true, p_handtekening: 'data:image/png;base64,BBBB' })
    check('tweede afronding zelfde toolbox/jaar geweigerd (RPC)', !!error && /al afgerond/i.test(error.message || ''), error?.message)
  }
  {
    const { error } = await admin.from('toolbox_deelname').insert({ company_id: aCompany, persoon_id: p1.id, toolbox_id: tbId, bewijssoort: 'digitaal', titel_snap: 'x', tekst_snap: 'x', bevestigde_naam: 'TBTEST_P1', naam_bevestigd: true, handtekening: 'data:img', handtekening_gezet_op: new Date().toISOString() })
    check('tweede afronding zelfde toolbox/jaar geweigerd (DB-constraint, ook directe insert)', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    // Een ander kalenderjaar mag wél (toolboxen worden jaarlijks herhaald).
    const vorigJaar = `${new Date().getUTCFullYear() - 1}-06-01T10:00:00Z`
    const { data, error } = await admin.from('toolbox_deelname').insert({ company_id: aCompany, persoon_id: p1.id, toolbox_id: tbId, bewijssoort: 'digitaal', titel_snap: 'x', tekst_snap: 'x', bevestigde_naam: 'TBTEST_P1', naam_bevestigd: true, handtekening: 'data:img', handtekening_gezet_op: vorigJaar, afgerond_op: vorigJaar }).select('id').single()
    check('afronding in een ander kalenderjaar mag wél', !error && !!data, error?.message)
  }

  // SERVER-GATE op video: een vereist_video-toolbox weigert afronden zonder gehaalde video.
  {
    const { data: tbVideo } = await adminClient.rpc('centrale_toolbox_opslaan', {
      p_id: null, p_titel: 'TBTEST_video', p_tekst: 'x', p_video_url: 'https://youtu.be/PLACEHOLDER',
      p_vereist_video: true, p_vereist_quiz: false, p_quiz_slaaggrens: 70,
      p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: 998,
    })
    if (tbVideo) toolboxIds.push(tbVideo)
    await clientA.rpc('toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbVideo })
    const { error } = await anon.rpc('toolbox_afronden_token', { p_token: token, p_toolbox_id: tbVideo, p_video_bekeken: false, p_quiz_antwoorden: [], p_naam_bevestigd: true, p_handtekening: 'data:image/png;base64,CCCC' })
    check('server weigert afronden zonder gehaalde video (vereist_video)', !!error && /video.*bekeken/i.test(error.message || ''), error?.message)
  }

  // ONVERANDERLIJKHEID: zelfs service_role mag het record niet wijzigen.
  {
    const { error } = await admin.from('toolbox_deelname').update({ titel_snap: 'GEHACKT' }).eq('id', deelnameId)
    check('afgerond record is onveranderlijk (update geweigerd)', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }

  // CROSS-COMPANY: B ziet/muteert niets van A.
  {
    const { data } = await clientB.from('toolbox_deelname').select('id').eq('company_id', aCompany)
    check('B ziet deelname van A niet', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { error } = await clientB.rpc('toolbox_dashboard', { p_company_id: aCompany })
    check('B kan dashboard van A niet opvragen', !!error)
  }
  {
    const { error } = await clientB.rpc('doelstelling_zetten', { p_company_id: aCompany, p_functiegroep_id: fgId, p_doel_per_jaar: 99 })
    check('B kan doelstelling van A niet zetten', !!error)
  }
  {
    const { error } = await clientB.rpc('toolbox_koppelen', { p_company_id: aCompany, p_toolbox_id: tbId })
    check('B kan voor A geen toolbox koppelen', !!error)
  }

  // NAAR-RATO: P1 half jaar → half doel; P2 uitgestroomd → uit de noemer.
  {
    const { data } = await clientA.rpc('toolbox_dashboard', { p_company_id: aCompany })
    const pers = data?.personen ?? []
    const dp1 = pers.find(p => p.persoon_id === p1.id)
    const dp2 = pers.find(p => p.persoon_id === p2.id)
    const verwacht = verwachtDoelJuli(12)
    check('P1 naar-rato-doel klopt (instroom 1 juli, N=12)', dp1?.doel === verwacht, `doel ${dp1?.doel}, verwacht ${verwacht}`)
    check('P1 heeft 1 aantoonbaar afgeronde toolbox', dp1?.gedaan === 1, `${dp1?.gedaan}`)
    check('P2 staat als niet meer in dienst', dp2?.status === 'uit_dienst', dp2?.status)
    check('Uitgestroomde P2 valt uit de bedrijfs-noemer', data?.bedrijf?.doel === dp1?.doel, `bedrijf ${data?.bedrijf?.doel} vs P1 ${dp1?.doel}`)
  }

  // --- TOOLBOX-SESSIES (aanwezigheid — tweede telwijze naast naar-rato) ---
  // P3: actief het hele jaar, zelfde functiegroep (dus doel 12), NIET in de sessie.
  const { data: p3 } = await admin.from('personen').insert({ company_id: aCompany, naam: 'TBTEST_P3', status: 'actief', functiegroep_id: fgId, datum_in_dienst: `${y - 1}-01-01` }).select('id').single()

  // KAM A maakt een sessie; B mag dat niet.
  let sessieId
  {
    const { data, error } = await clientA.rpc('toolbox_sessie_opslaan', { p_company_id: aCompany, p_sessie_id: null, p_datum: `${y}-03-15`, p_onderwerp: 'TBTEST_sessie werken op hoogte', p_notitie: 'papieren lijst', p_toolbox_id: null })
    check('KAM A maakt een toolbox-sessie (positieve controle)', !error && !!data, error?.message)
    sessieId = data
  }
  {
    const { error } = await clientB.rpc('toolbox_sessie_opslaan', { p_company_id: aCompany, p_sessie_id: null, p_datum: `${y}-03-15`, p_onderwerp: 'kaap', p_notitie: null, p_toolbox_id: null })
    check('B kan geen sessie voor A maken', !!error)
  }
  {
    const { error } = await clientB.rpc('toolbox_sessies_overzicht', { p_company_id: aCompany })
    check('B kan sessie-overzicht van A niet opvragen', !!error)
  }
  {
    const { error } = await anon.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: p1.id, p_aanwezig: true })
    check('Werknemer (anon) kan geen aanwezigheid registreren', !!error)
  }

  // P1 aanwezig zetten → fysiek_aanwezig-deelname, toolbox_id NULL, sessie_id gezet.
  {
    const { error } = await clientA.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: p1.id, p_aanwezig: true })
    check('KAM A zet P1 aanwezig (positieve controle)', !error, error?.message)
  }
  {
    const { data } = await admin.from('toolbox_deelname').select('bewijssoort, toolbox_id, sessie_id, naam_bevestigd, handtekening, bevestigde_naam').eq('sessie_id', sessieId).eq('persoon_id', p1.id).single()
    check('aanwezigheid = fysiek_aanwezig, toolbox_id NULL, geen handtekening', !!data && data.bewijssoort === 'fysiek_aanwezig' && data.toolbox_id === null && data.sessie_id === sessieId && data.naam_bevestigd === false && data.handtekening === null && data.bevestigde_naam === 'TBTEST_P1')
  }
  // Idempotent: nog eens aanwezig zetten maakt geen tweede rij.
  {
    await clientA.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: p1.id, p_aanwezig: true })
    const { data } = await admin.from('toolbox_deelname').select('id').eq('sessie_id', sessieId).eq('persoon_id', p1.id)
    check('dubbel aanwezig zetten is idempotent (één rij)', (data?.length ?? 0) === 1, `${data?.length}`)
  }
  // Cross-company: P van B kan niet in de sessie van A.
  {
    const { data: pb } = await admin.from('personen').insert({ company_id: bCompany, naam: 'TBTEST_PB', status: 'actief' }).select('id').single()
    const { error } = await clientA.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: pb.id, p_aanwezig: true })
    check('persoon van B kan niet in de sessie van A', !!error)
  }

  // KERN: de sessie-aanwezigheid vervuilt de naar-rato "gedaan" NIET (toolbox_id NULL
  // valt buiten count(distinct toolbox_id)); afwezige P3 loopt NIET achter door de sessie.
  {
    const { data } = await clientA.rpc('toolbox_dashboard', { p_company_id: aCompany })
    const pers = data?.personen ?? []
    const dp1 = pers.find(p => p.persoon_id === p1.id)
    const dp3 = pers.find(p => p.persoon_id === p3.id)
    check('sessie-aanwezigheid telt NIET mee in naar-rato gedaan (P1 blijft 1)', dp1?.gedaan === 1, `${dp1?.gedaan}`)
    check('afwezige P3 loopt niet extra achter door de sessie (gedaan 0)', dp3?.gedaan === 0, `${dp3?.gedaan}`)
  }

  // OVERZICHT: opkomst per sessie + neutraal aantal bijgewoonde sessies per persoon.
  {
    const { data } = await clientA.rpc('toolbox_sessies_overzicht', { p_company_id: aCompany })
    const s = (data?.sessies ?? []).find(x => x.sessie_id === sessieId)
    const per = data?.personen ?? []
    const bp1 = per.find(p => p.persoon_id === p1.id)
    const bp3 = per.find(p => p.persoon_id === p3.id)
    check('overzicht toont opkomst 1 en P1 als aanwezige', s?.opkomst === 1 && Array.isArray(s?.aanwezigen) && s.aanwezigen.includes(p1.id))
    check('P1 bijgewoond = 1, afwezige P3 bijgewoond = 0 (geen achterstand)', bp1?.bijgewoond === 1 && bp3?.bijgewoond === 0, `P1 ${bp1?.bijgewoond}, P3 ${bp3?.bijgewoond}`)
  }

  // Onveranderlijkheid geldt óók voor een aanwezigheidsrij (update geweigerd)…
  {
    const { error } = await admin.from('toolbox_deelname').update({ titel_snap: 'GEHACKT' }).eq('sessie_id', sessieId).eq('persoon_id', p1.id)
    check('aanwezigheidsrij is onveranderlijk (update geweigerd)', !!error)
  }
  // …maar uitvinken (delete) mag en verlaagt de opkomst weer.
  {
    await clientA.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: p1.id, p_aanwezig: false })
    const { data } = await admin.from('toolbox_deelname').select('id').eq('sessie_id', sessieId).eq('persoon_id', p1.id)
    check('P1 uitvinken verwijdert de aanwezigheidsrij', (data?.length ?? 0) === 0, `${data?.length}`)
  }
  // Sessie verwijderen cascadeert (aanwezigheid weg). Eerst P3 aanwezig, dan sessie weg.
  {
    await clientA.rpc('toolbox_sessie_aanwezigheid_zetten', { p_sessie_id: sessieId, p_persoon_id: p3.id, p_aanwezig: true })
    await clientA.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessieId })
    const { data: s } = await admin.from('toolbox_sessie').select('id').eq('id', sessieId)
    const { data: d } = await admin.from('toolbox_deelname').select('id').eq('sessie_id', sessieId)
    check('sessie verwijderen cascadeert (sessie + aanwezigheid weg)', (s?.length ?? 0) === 0 && (d?.length ?? 0) === 0)
  }

  // --- JURIDISCHE EXPORT ---
  const jaar = new Date().getFullYear()

  // Positief: KAM A haalt eigen bewijsstuk + bedrijfsoverzicht op.
  {
    const { data, error } = await clientA.rpc('toolbox_bewijs', { p_deelname_id: deelnameId })
    check('KAM A haalt eigen bewijsstuk op (positieve controle)',
      !error && data?.id === deelnameId && data?.bevestigde_naam === 'TBTEST_P1' && data?.bedrijf_naam?.startsWith('TBTEST_A'),
      error?.message)
  }
  {
    const { data, error } = await clientA.rpc('toolbox_bewijs_overzicht', { p_company_id: aCompany, p_van: `${jaar}-01-01`, p_tot: `${jaar}-12-31` })
    const heeft = Array.isArray(data) && data.some(r => r.id === deelnameId && r.getekend === true)
    check('KAM A haalt eigen bedrijfsoverzicht op (positieve controle)', !error && heeft, error?.message)
  }

  // Cross-company: B mag bewijsstuk/overzicht van A NIET ophalen.
  {
    const { error } = await clientB.rpc('toolbox_bewijs', { p_deelname_id: deelnameId })
    check('B kan bewijsstuk van A niet ophalen', !!error)
  }
  {
    const { error } = await clientB.rpc('toolbox_bewijs_overzicht', { p_company_id: aCompany, p_van: `${jaar}-01-01`, p_tot: `${jaar}-12-31` })
    check('B kan bedrijfsoverzicht van A niet ophalen', !!error)
  }

  // Werknemer-token (anon, niet ingelogd) mag NIET exporteren (RPC niet aan anon gegrant).
  {
    const { error } = await anon.rpc('toolbox_bewijs', { p_deelname_id: deelnameId })
    check('Werknemer (anon) kan geen bewijsstuk exporteren', !!error)
  }
  {
    const { error } = await anon.rpc('toolbox_bewijs_overzicht', { p_company_id: aCompany, p_van: `${jaar}-01-01`, p_tot: `${jaar}-12-31` })
    check('Werknemer (anon) kan geen overzicht exporteren', !!error)
  }

  // Snapshot-only: bewijsstuk blijft VOLLEDIG nadat de centrale toolbox is GEARCHIVEERD.
  {
    await adminClient.rpc('centrale_toolbox_archiveren', { p_id: tbId })
    const { data, error } = await clientA.rpc('toolbox_bewijs', { p_deelname_id: deelnameId })
    const volledig = !error && data?.titel_snap === 'TBTEST_toolbox' && data?.tekst_snap === 'Lees dit.' && data?.bevestigde_naam === 'TBTEST_P1'
    check('Bewijsstuk blijft volledig na archivering centrale toolbox (snapshot-only)', volledig, error?.message)
  }

  // Export muteert niets: het record is onveranderd.
  {
    const { data } = await admin.from('toolbox_deelname').select('titel_snap, bevestigde_naam').eq('id', deelnameId).single()
    check('Export muteert niets (record onveranderd)', !!data && data.titel_snap === 'TBTEST_toolbox' && data.bevestigde_naam === 'TBTEST_P1')
  }
}

async function cleanup() {
  if (companyIds.length) {
    for (const tbl of ['toolbox_deelname', 'toolbox_sessie', 'bedrijf_toolbox_afwijking', 'bedrijf_toolbox', 'bedrijf_doelstelling', 'deellinks', 'personen', 'functiegroep']) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  if (toolboxIds.length) await admin.from('centrale_toolbox').delete().in('id', toolboxIds)
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

let exitCode = 0
try { await run() } catch (e) { console.error('\nFOUT:', e.message); exitCode = 1 }
finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle TBTEST_-data verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
