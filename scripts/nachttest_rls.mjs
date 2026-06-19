// ============================================================================
// NACHTTEST — uitputtende tenant-isolatietest (RLS, RPC, token, de rem, edge)
// ----------------------------------------------------------------------------
// Bewijst of bedrijf A bij bedrijf B kan, over ALLE tenant-tabellen en ALLE
// security-definer-RPC's, plus token-isolatie, de herinner-rem (max 2/7 dagen)
// en edge cases (anon, admin).
//
// Authentiek: gebruikt de Supabase JS-client met echte ingelogde sessies
// (signInWithPassword -> echte JWT via PostgREST), exact zoals de app.
// De service-role-client maakt/ruimt testdata op (omzeilt RLS).
//
// Alles wat wordt aangemaakt heeft de prefix NACHTTEST_ en wordt in een
// finally-blok volledig opgeruimd, ook bij een fout. GEEN echte mail
// (createUser met email_confirm), GEEN app-wijziging.
//
//   node scripts/nachttest_rls.mjs
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

// Lokale omgeving onderschept TLS (zelfde reden als ssl.rejectUnauthorized:false bij de
// directe pg-verbinding). De fetch-gebaseerde Supabase-client respecteert deze vlag.
// Alleen voor dit lokale testscript tegen onze eigen Supabase.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* valt terug op process.env */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local.')
  process.exit(2)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Nachttest!' + TS
const tok = () => (randomUUID() + randomUUID()).replace(/-/g, '')

// Registers voor opruimen
const companyIds = []
const userIds = []
const extraCompanyIds = [] // bv. via import_company aangemaakt

// Resultaten per pijler
const pijlers = {} // naam -> {pass, fail, info, rows:[]}
function rec(pijler, naam, ok, detail, soort = 'test') {
  const p = (pijlers[pijler] ??= { pass: 0, fail: 0, info: 0, rows: [] })
  if (soort === 'info') p.info++
  else if (ok) p.pass++
  else p.fail++
  p.rows.push({ naam, ok, detail, soort })
  const tag = soort === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${naam}${detail ? ` — ${detail}` : ''}`)
}

// Helper: verwacht 0 zichtbare rijen bij selecteren van B's rij door A.
async function leesIsolatie(pijler, client, tabel, kolom, bId, eigenId) {
  // positieve controle
  if (eigenId) {
    const { data, error } = await client.from(tabel).select(kolom).eq(kolom, eigenId)
    rec(pijler, `A ziet EIGEN ${tabel}`, !error && (data?.length ?? 0) === 1, error ? error.message : `${data?.length} rij`)
  }
  const { data, error } = await client.from(tabel).select(kolom).eq(kolom, bId)
  rec(pijler, `A ziet ${tabel} van B NIET`, !error && (data?.length ?? 0) === 0, error ? `err:${error.message}` : `${data?.length ?? '?'} rijen`)
}

// Helper: RPC moet weigeren (error) wanneer A een B-resource aanvalt.
async function rpcWeigert(pijler, client, fn, args, label) {
  const { data, error } = await client.rpc(fn, args)
  // "weigeren" = error OF een lege/negatieve teruggave: de deellink-RPC's geven bij
  // een vreemde actie netjes false/null/'[]' terug VÓÓR enige schrijfactie.
  const leeg = data === null || data === false ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === 'string' && data === '[]') ||
    (data && typeof data === 'object' && Array.isArray(data) === false && Object.keys(data).length === 0)
  const ok = !!error || leeg
  rec(pijler, `${label}`, ok, error ? 'geweigerd (exception)' : leeg ? 'leeg/null' : `LIET DATA DOOR: ${JSON.stringify(data).slice(0, 120)}`)
}

async function maakBedrijfData(label) {
  const naam = `NACHTTEST_${label}_${TS}`
  const { data: comp, error } = await admin.from('companies').insert({ name: naam }).select('id').single()
  if (error) throw new Error(`companies (${label}): ${error.message}`)
  const cid = comp.id
  companyIds.push(cid)

  await admin.from('bedrijf_modules').insert({ company_id: cid, module: 'inspectie', actief: true })

  const { data: persoon } = await admin.from('personen')
    .insert({ company_id: cid, naam: `NACHTTEST_persoon_${label}`, email: `nachttest_${label}_${TS}@example.test`, status: 'actief' })
    .select('id').single()

  const { data: pva } = await admin.from('pva_items')
    .insert({ company_id: cid, nr: `N-${label}-1`, onderwerp: 'Testactie', status: 'Open', persoon_id: persoon.id })
    .select('id').single()

  const token = tok()
  const { data: deellink } = await admin.from('deellinks')
    .insert({ company_id: cid, persoon_id: persoon.id, token, ingetrokken: false })
    .select('id').single()

  const { data: sjab } = await admin.from('inspectie_sjabloon')
    .insert({ company_id: cid, naam: `NACHTTEST_sjab_${label}`, controlesoort: 'rondgang', actief: true })
    .select('id').single()
  const { data: punt } = await admin.from('inspectie_sjabloon_punt')
    .insert({ company_id: cid, sjabloon_id: sjab.id, volgorde: 1, tekst: 'Nooduitgang vrij?', verplicht: true })
    .select('id').single()
  const { data: insp } = await admin.from('inspectie')
    .insert({ company_id: cid, sjabloon_id: sjab.id, status: 'concept', sjabloon_naam_snap: `NACHTTEST_sjab_${label}`, controlesoort_snap: 'rondgang' })
    .select('id').single()
  const { data: bev } = await admin.from('inspectie_bevinding')
    .insert({ company_id: cid, inspectie_id: insp.id, punt_tekst_snap: 'Nooduitgang vrij?', resultaat: 'in_orde', afhandeling: 'geen', verplicht: true, volgorde: 1 })
    .select('id').single()
  await admin.from('inspectie_historie').insert({ company_id: cid, inspectie_id: insp.id, wijziging: 'aangemaakt door test' })

  await admin.from('bewijs').insert({ company_id: cid, pva_item_id: pva.id, pad: `nacht/${label}/x.pdf`, bestandsnaam: 'x.pdf' })
  await admin.from('actie_historie').insert({ company_id: cid, pva_item_id: pva.id, gebeurtenis: 'aangemaakt' })
  await admin.from('herinner_instelling').insert({ company_id: cid, ritme: 'wekelijks' })
  await admin.from('herinnering_log').insert({ company_id: cid, persoon_id: persoon.id, bron: 'handmatig', aantal_acties: 1, acties: [] })
  await admin.from('fotos').insert({ company_id: cid, nr: 1, locatie: `NACHTTEST_${label}` })
  const { data: rie } = await admin.from('rie_versies').insert({ company_id: cid, versie: 1, status: 'concept' }).select('id').single()
  const { data: mod } = await admin.from('modules').insert({ company_id: cid, code: 'M1', titel: 'Module 1', volgorde: 1 }).select('id').single()
  await admin.from('vragen').insert({ company_id: cid, module_id: mod.id, nr: '1', vraag: 'Test?' })

  return { cid, naam, persoonId: persoon.id, pvaId: pva.id, token, deellinkId: deellink.id,
           sjabloonId: sjab.id, puntId: punt.id, inspectieId: insp.id, bevindingId: bev.id,
           rieId: rie.id, moduleId: mod.id }
}

async function maakGebruiker(label, companyId, role = 'client') {
  const email = `nachttest_user_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)
  const { error: e } = await admin.from('users').upsert({ id, email, role, company_id: companyId, naam: `NACHTTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

// Alle tenant-tabellen met hun id/filter-kolom voor lees-isolatie.
function leesMatrix(A, B) {
  return [
    ['companies', 'id', B.cid, A.cid],
    ['personen', 'id', B.persoonId, A.persoonId],
    ['pva_items', 'id', B.pvaId, A.pvaId],
    ['deellinks', 'id', B.deellinkId, A.deellinkId],
    ['inspectie', 'id', B.inspectieId, A.inspectieId],
    ['inspectie_bevinding', 'id', B.bevindingId, A.bevindingId],
    ['inspectie_sjabloon', 'id', B.sjabloonId, A.sjabloonId],
    ['inspectie_sjabloon_punt', 'id', B.puntId, A.puntId],
    ['inspectie_historie', 'company_id', B.cid, A.cid],
    ['bewijs', 'company_id', B.cid, A.cid],
    ['actie_historie', 'company_id', B.cid, A.cid],
    ['herinner_instelling', 'company_id', B.cid, A.cid],
    ['herinnering_log', 'company_id', B.cid, A.cid],
    ['fotos', 'company_id', B.cid, A.cid],
    ['modules', 'id', B.moduleId, A.moduleId],
    ['vragen', 'company_id', B.cid, A.cid],
    ['rie_versies', 'id', B.rieId, A.rieId],
    ['bedrijf_modules', 'company_id', B.cid, A.cid],
  ]
}

async function run() {
  console.log('\n=== SETUP ===')
  const A = await maakBedrijfData('A')
  const B = await maakBedrijfData('B')
  const cA = await maakGebruiker('A', A.cid, 'client')
  const cB = await maakGebruiker('B', B.cid, 'client')
  const cAdmin = await maakGebruiker('ADMIN', null, 'admin')
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(`  Bedrijf A=${A.cid}  Bedrijf B=${B.cid}  (+admin, +anon)`)
  // sanity: B-gebruiker bestaat echt
  rec('Pijler 3 — RLS lees-isolatie', 'B-gebruiker is geldig (sanity)', !!cB)

  // ---------------- PIJLER 3: RLS lees-isolatie ----------------
  console.log('\n=== PIJLER 3 — RLS lees-isolatie (A mag NIETS van B zien) ===')
  for (const [tabel, kol, bId, aId] of leesMatrix(A, B)) {
    await leesIsolatie('Pijler 3 — RLS lees-isolatie', cA, tabel, kol, bId, aId)
  }
  // users: A mag B-userrij niet zien
  {
    const { data } = await cA.from('users').select('id').eq('company_id', B.cid)
    rec('Pijler 3 — RLS lees-isolatie', 'A ziet users-rij van B NIET', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen`)
  }

  // ---------------- PIJLER 3b: RLS schrijf-isolatie ----------------
  console.log('\n=== PIJLER 3b — RLS schrijf-isolatie (A mag niet in B schrijven) ===')
  {
    const { error } = await cA.from('personen').insert({ company_id: B.cid, naam: 'INDRINGER', status: 'actief' }).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan GEEN persoon in B invoegen', !!error, error ? 'with_check blokkeert' : 'INSERT TOEGESTAAN!')
  }
  {
    const { data } = await cA.from('pva_items').update({ status: 'Afgerond' }).eq('id', B.pvaId).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan pva_item van B niet wijzigen', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen geraakt`)
  }
  {
    const { error } = await cA.from('inspectie').insert({ company_id: B.cid, status: 'concept' }).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan GEEN inspectie in B invoegen', !!error, error ? 'with_check blokkeert' : 'INSERT TOEGESTAAN!')
  }
  {
    const { data } = await cA.from('companies').update({ name: 'GEKAAPT' }).eq('id', B.cid).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan bedrijf B niet hernoemen', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen geraakt`)
  }
  {
    const { data } = await cA.from('personen').delete().eq('id', B.persoonId).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan persoon van B niet verwijderen', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen geraakt`)
  }
  {
    const { error } = await cA.from('bewijs').insert({ company_id: B.cid, pva_item_id: B.pvaId, pad: 'x' }).select()
    rec('Pijler 3b — RLS schrijf-isolatie', 'A kan geen bewijs in B invoegen (geen write-policy)', !!error, error ? 'geblokkeerd' : 'INSERT TOEGESTAAN!')
  }

  // ---------------- PIJLER 4: RPC-robuustheid (A valt B aan) ----------------
  console.log('\n=== PIJLER 4 — RPC-robuustheid (A valt B-resources aan) ===')
  const P = 'Pijler 4 — RPC-robuustheid'
  await rpcWeigert(P, cA, 'create_deellink', { p_persoon_id: B.persoonId }, 'create_deellink op B-persoon')
  await rpcWeigert(P, cA, 'intrek_deellink', { p_persoon_id: B.persoonId }, 'intrek_deellink op B-persoon')
  await rpcWeigert(P, cA, 'sjabloon_opslaan', { p_sjabloon_id: null, p_company_id: B.cid, p_naam: 'X' }, 'sjabloon_opslaan nieuw in B')
  await rpcWeigert(P, cA, 'sjabloon_opslaan', { p_sjabloon_id: B.sjabloonId, p_company_id: A.cid, p_naam: 'X' }, 'sjabloon_opslaan op B-sjabloon')
  await rpcWeigert(P, cA, 'sjabloon_archiveren', { p_sjabloon_id: B.sjabloonId }, 'sjabloon_archiveren op B')
  await rpcWeigert(P, cA, 'punt_opslaan', { p_punt_id: null, p_sjabloon_id: B.sjabloonId, p_tekst: 'X' }, 'punt_opslaan nieuw in B-sjabloon')
  await rpcWeigert(P, cA, 'punt_opslaan', { p_punt_id: B.puntId, p_sjabloon_id: B.sjabloonId, p_tekst: 'X' }, 'punt_opslaan op B-punt')
  await rpcWeigert(P, cA, 'punt_verwijderen', { p_punt_id: B.puntId }, 'punt_verwijderen op B')
  await rpcWeigert(P, cA, 'inspectie_start', { p_sjabloon_id: B.sjabloonId }, 'inspectie_start op B-sjabloon')
  await rpcWeigert(P, cA, 'bevinding_opslaan', { p_bevinding_id: B.bevindingId, p_resultaat: 'in_orde' }, 'bevinding_opslaan op B')
  await rpcWeigert(P, cA, 'bevinding_naar_actie', { p_bevinding_id: B.bevindingId }, 'bevinding_naar_actie op B')
  await rpcWeigert(P, cA, 'inspectie_afronden', { p_inspectie_id: B.inspectieId }, 'inspectie_afronden op B')
  await rpcWeigert(P, cA, 'inspectie_conclusie_opslaan', { p_inspectie_id: B.inspectieId, p_conclusie: 'X' }, 'inspectie_conclusie_opslaan op B')
  await rpcWeigert(P, cA, 'bewijs_lijst', { p_actie_id: B.pvaId }, 'bewijs_lijst op B-actie')
  await rpcWeigert(P, cA, 'bewijs_registreren', { p_actie_id: B.pvaId, p_pad: 'x', p_bestandsnaam: 'x', p_type: 'pdf', p_grootte: 1 }, 'bewijs_registreren op B')
  await rpcWeigert(P, cA, 'actie_doorgeven', { p_actie_id: B.pvaId, p_naam: 'X', p_email: 'x@x.test' }, 'actie_doorgeven op B')
  await rpcWeigert(P, cA, 'actie_historie_ophalen', { p_actie_id: B.pvaId }, 'actie_historie_ophalen op B')
  await rpcWeigert(P, cA, 'geef_actie_vrij', { p_actie_id: B.pvaId, p_opmerking: 'x', p_bewijs: null }, 'geef_actie_vrij op B')
  await rpcWeigert(P, cA, 'stuur_concept_terug', { p_actie_id: B.pvaId, p_opmerking: 'x' }, 'stuur_concept_terug op B')
  await rpcWeigert(P, cA, 'zet_concept_beheerder', { p_actie_id: B.pvaId, p_status: 'akkoord', p_opm: 'x' }, 'zet_concept_beheerder op B')
  await rpcWeigert(P, cA, 'herinner_kandidaten', { p_company_id: B.cid }, 'herinner_kandidaten van B')
  await rpcWeigert(P, cA, 'herinnering_loggen', { p_persoon_id: B.persoonId, p_bron: 'handmatig', p_acties: [], p_email: 'x@x.test' }, 'herinnering_loggen op B-persoon')
  await rpcWeigert(P, cA, 'zet_herinner_ritme', { p_company_id: B.cid, p_ritme: 'dagelijks' }, 'zet_herinner_ritme op B')
  await rpcWeigert(P, cA, 'koppel_mij_als_persoon', { p_company_id: B.cid }, 'koppel_mij_als_persoon in B')
  await rpcWeigert(P, cA, 'dashboard_overzicht', { p_company_id: B.cid }, 'dashboard_overzicht van B')
  await rpcWeigert(P, cA, 'dashboard_admin_overzicht', {}, 'dashboard_admin_overzicht als niet-admin')

  // Positieve controle: A mag dit op EIGEN resources
  {
    const { error } = await cA.rpc('zet_herinner_ritme', { p_company_id: A.cid, p_ritme: 'dagelijks' })
    rec(P, 'positieve controle: A mag eigen ritme zetten', !error, error ? error.message : 'ok')
  }

  // ---------------- PIJLER 4b: voorheen-ongeguarde interne definer-RPC's ----------------
  // Na migratie 0003 hebben anon/authenticated GEEN EXECUTE meer op deze interne helpers.
  // PostgREST hoort de aanroep dus te weigeren (permission denied). De interne aanroepen
  // vanuit de wrappers blijven werken (zie Pijler 4c).
  console.log('\n=== PIJLER 4b — Interne definer-RPCs niet meer direct aanroepbaar (na fix) ===')
  const Q = 'Pijler 4b — Interne RPCs afgeschermd'
  // actie_als_jsonb: was een LEESLEK (volledige actie-rij van elke id). Anon moet nu geweigerd worden.
  {
    const { data, error } = await anon.rpc('actie_als_jsonb', { p_actie_id: B.pvaId })
    rec(Q, 'actie_als_jsonb: anon kan B-actie NIET meer uitlezen (leeslek gedicht)', !!error && !data, error ? `geweigerd (${error.code || 'denied'})` : `LIET DATA DOOR: ${JSON.stringify(data).slice(0, 80)}`)
  }
  // import_rie_content: was DESTRUCTIEF (wist/herimporteert RI&E-inhoud). Anon moet geweigerd worden.
  {
    const { error } = await anon.rpc('import_rie_content', { p_company_id: B.cid })
    rec(Q, 'import_rie_content: anon kan B-RI&E NIET meer wissen/herimporteren', !!error, error ? `geweigerd (${error.code || 'denied'})` : 'TOEGESTAAN!')
  }
  // vind_of_maak_persoon: A mag geen persoon meer in B injecteren (en er mag niets aangemaakt zijn).
  {
    const voor = (await admin.from('personen').select('id', { count: 'exact', head: true }).eq('company_id', B.cid)).count
    const { data, error } = await cA.rpc('vind_of_maak_persoon', { p_company_id: B.cid, p_naam: 'NACHTTEST_INJECT', p_email: `inject_${TS}@x.test`, p_voorgesteld_door: null })
    const na = (await admin.from('personen').select('id', { count: 'exact', head: true }).eq('company_id', B.cid)).count
    rec(Q, 'vind_of_maak_persoon: A geweigerd én geen injectie in B', !!error && na === voor, error ? `geweigerd (${error.code || 'denied'})` : `INJECTEERDE rij ${data}`)
    if (data) { await admin.from('personen').delete().eq('id', data) }
  }
  // import_company: anon kan geen nieuw bedrijf meer aanmaken.
  {
    const { data, error } = await anon.rpc('import_company', { p_dataset: { bedrijf: { naam: `NACHTTEST_import_${TS}` }, planVanAanpak: [], modules: [], fotos: [] } })
    if (data) extraCompanyIds.push(data)
    rec(Q, 'import_company: anon kan GEEN nieuw bedrijf aanmaken', !!error && !data, error ? `geweigerd (${error.code || 'denied'})` : `MAAKTE bedrijf ${data}`)
  }
  // huisstijl_van_bedrijf: bewust nog publiek voor de gastpagina (cosmetisch).
  {
    const { data } = await anon.rpc('huisstijl_van_bedrijf', { p_company_id: B.cid })
    rec(Q, 'huisstijl_van_bedrijf: anon leest branding (BEWUST publiek voor gast, cosmetisch)', true, data ? `modus=${data.modus} (geen bedrijfsnaam/data)` : 'null', 'info')
  }

  // ---------------- PIJLER 4c: regressie — interne aanroepen werken nog ----------------
  // Bewijst dat het intrekken van EXECUTE de legitieme interne definer-aanroepen NIET breekt.
  console.log('\n=== PIJLER 4c — Regressie: interne definer-aanroepen werken nog (eigen bedrijf) ===')
  const C = 'Pijler 4c — Regressie interne aanroepen'
  {
    // actie_doorgeven roept INTERN vind_of_maak_persoon aan; op A's eigen actie moet dit slagen.
    const { data, error } = await cA.rpc('actie_doorgeven', { p_actie_id: A.pvaId, p_naam: 'NACHTTEST_ontvanger', p_email: `ontv_${TS}@example.test` })
    rec(C, 'A: actie_doorgeven (gebruikt intern vind_of_maak_persoon) slaagt', !error && !!data, error ? error.message : 'ok')
  }
  {
    // geef_actie_vrij roept INTERN actie_als_jsonb aan; op A's eigen actie moet dit slagen.
    const { data, error } = await cA.rpc('geef_actie_vrij', { p_actie_id: A.pvaId, p_opmerking: 'nachttest', p_bewijs: null })
    rec(C, 'A: geef_actie_vrij (gebruikt intern actie_als_jsonb) slaagt + geeft jsonb', !error && data && typeof data === 'object', error ? error.message : `actie ${data?.id ? 'ok' : '?'}`)
  }
  {
    // De gast-wrapper deellink_data leunt op huisstijl_van_bedrijf; token A moet nog data geven.
    const { data } = await anon.rpc('deellink_data', { p_token: A.token })
    rec(C, 'gast: deellink_data (eigen token A) werkt nog volledig', !!data && !!data.bedrijf, data ? `bedrijf=${data.bedrijf}` : 'null')
  }

  // ---------------- PIJLER 5: Token-beveiliging ----------------
  console.log('\n=== PIJLER 5 — Token-beveiliging (gast/anon) ===')
  const T = 'Pijler 5 — Token-beveiliging'
  {
    const { data } = await anon.rpc('deellink_data', { p_token: A.token })
    const ok = data && data.persoon && data.bedrijf === A.naam && Array.isArray(data.acties)
    rec(T, 'geldig token A geeft eigen data', ok, ok ? `bedrijf=${data.bedrijf}` : 'geen data')
  }
  {
    const { data } = await anon.rpc('deellink_data', { p_token: 'ditisgeengeldigtoken_' + TS })
    rec(T, 'onzin-token geeft null', data === null, JSON.stringify(data))
  }
  {
    // ingetrokken token -> null (tijdelijk intrekken, daarna herstellen)
    await admin.from('deellinks').update({ ingetrokken: true }).eq('id', A.deellinkId)
    const { data } = await anon.rpc('deellink_data', { p_token: A.token })
    rec(T, 'ingetrokken token geeft null', data === null, JSON.stringify(data))
    await admin.from('deellinks').update({ ingetrokken: false }).eq('id', A.deellinkId)
  }
  {
    // verlopen token -> null
    await admin.from('deellinks').update({ vervalt_op: new Date(Date.now() - 86400000).toISOString() }).eq('id', A.deellinkId)
    const { data } = await anon.rpc('deellink_data', { p_token: A.token })
    rec(T, 'verlopen token geeft null', data === null, JSON.stringify(data))
    await admin.from('deellinks').update({ vervalt_op: null }).eq('id', A.deellinkId)
  }
  // cross-actie: token A mag B's actie NIET raken
  await rpcWeigert(T, anon, 'deellink_actie_historie', { p_token: A.token, p_actie_id: B.pvaId }, 'token A -> historie van B-actie')
  await rpcWeigert(T, anon, 'deellink_bewijs_lijst', { p_token: A.token, p_actie_id: B.pvaId }, 'token A -> bewijslijst van B-actie')
  await rpcWeigert(T, anon, 'deellink_bewijs_pad', { p_token: A.token, p_actie_id: B.pvaId, p_bestandsnaam: 'x' }, 'token A -> bewijspad van B-actie')
  await rpcWeigert(T, anon, 'deellink_actie_doorgeven', { p_token: A.token, p_actie_id: B.pvaId, p_naam: 'X', p_email: 'x@x.test' }, 'token A -> B-actie doorgeven')
  await rpcWeigert(T, anon, 'deellink_concept_update', { p_token: A.token, p_actie_id: B.pvaId, p_status: 'GEKAAPT', p_opm: 'x' }, 'token A -> B-actie concept-update')
  {
    // harde verificatie: B's actie is NIET gewijzigd door de poging hierboven
    const { data: bv } = await admin.from('pva_items').select('concept_status').eq('id', B.pvaId).single()
    rec(T, 'B-actie bleef ongewijzigd na concept-update-poging via token A', !bv?.concept_status, `concept_status=${bv?.concept_status ?? 'null'}`)
  }
  await rpcWeigert(T, anon, 'deellink_bewijs_registreren', { p_token: A.token, p_actie_id: B.pvaId, p_pad: 'x', p_bestandsnaam: 'x', p_type: 'pdf', p_grootte: 1 }, 'token A -> B-actie bewijs registreren')
  // positieve controle: token A mag EIGEN actie wel
  {
    const { data } = await anon.rpc('deellink_actie_historie', { p_token: A.token, p_actie_id: A.pvaId })
    rec(T, 'positieve controle: token A leest eigen actie-historie', Array.isArray(data), Array.isArray(data) ? `${data.length} regels` : JSON.stringify(data))
  }

  // ---------------- PIJLER 6: De rem (max 2/7 dagen) ----------------
  console.log('\n=== PIJLER 6 — De rem (max 2 herinneringen / 7 dagen) ===')
  const R = 'Pijler 6 — De rem'
  // verse persoon in A, geen logs
  const { data: pRem } = await admin.from('personen').insert({ company_id: A.cid, naam: 'NACHTTEST_rem', email: `rem_${TS}@x.test`, status: 'actief' }).select('id').single()
  const remCheck = async () => (await admin.rpc('mag_herinneren', { p_persoon_id: pRem.id })).data
  rec(R, '0 logs -> mag herinneren', (await remCheck()) === true, '0 in venster')
  await admin.from('herinnering_log').insert({ company_id: A.cid, persoon_id: pRem.id, bron: 'handmatig', aantal_acties: 1, acties: [] })
  rec(R, '1 log -> mag nog herinneren', (await remCheck()) === true, '1 in venster')
  await admin.from('herinnering_log').insert({ company_id: A.cid, persoon_id: pRem.id, bron: 'handmatig', aantal_acties: 1, acties: [] })
  rec(R, '2 logs -> REM grijpt (mag NIET meer)', (await remCheck()) === false, '2 in venster')
  // 2 oude logs (>7 dagen) tellen niet
  const { data: pOud } = await admin.from('personen').insert({ company_id: A.cid, naam: 'NACHTTEST_remoud', email: `remoud_${TS}@x.test`, status: 'actief' }).select('id').single()
  const oud = new Date(Date.now() - 8 * 86400000).toISOString()
  await admin.from('herinnering_log').insert([
    { company_id: A.cid, persoon_id: pOud.id, bron: 'handmatig', aantal_acties: 1, acties: [], verzonden_op: oud },
    { company_id: A.cid, persoon_id: pOud.id, bron: 'handmatig', aantal_acties: 1, acties: [], verzonden_op: oud },
  ])
  rec(R, '2 logs ouder dan 7 dagen tellen NIET mee', (await admin.rpc('mag_herinneren', { p_persoon_id: pOud.id })).data === true, 'venster van 7 dagen klopt')
  // herinner_kandidaten respecteert de rem: pRem (2 recente) niet in kandidaten van A
  {
    const { data } = await cA.rpc('herinner_kandidaten', { p_company_id: A.cid })
    const bevatRem = Array.isArray(data) && data.some(r => r.persoon_id === pRem.id)
    rec(R, 'herinner_kandidaten sluit geremde persoon uit', !bevatRem, bevatRem ? 'BEVAT geremde persoon!' : 'correct uitgesloten')
  }

  // ---------------- PIJLER 7: Edge cases ----------------
  console.log('\n=== PIJLER 7 — Edge cases (anon, admin) ===')
  const E = 'Pijler 7 — Edge cases'
  for (const tabel of ['companies', 'personen', 'pva_items', 'inspectie', 'bewijs', 'herinnering_log']) {
    const { data } = await anon.from(tabel).select('id').limit(5)
    rec(E, `anon (geen sessie) ziet geen ${tabel}`, (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen`)
  }
  // admin ziet BEIDE bedrijven
  {
    const { data } = await cAdmin.from('companies').select('id').in('id', [A.cid, B.cid])
    rec(E, 'admin ziet zowel A als B (is_admin-pad werkt)', (data?.length ?? 0) === 2, `${data?.length ?? 0}/2`)
  }
  {
    const { data } = await cAdmin.from('pva_items').select('id').in('company_id', [A.cid, B.cid])
    rec(E, 'admin ziet pva_items van A en B', (data?.length ?? 0) >= 2, `${data?.length ?? 0} rijen`)
  }
  // A's eigen context-functies
  {
    const { data: mc } = await cA.rpc('my_company_id')
    const { data: ia } = await cA.rpc('is_admin')
    rec(E, 'A: my_company_id=A en is_admin=false', mc === A.cid && ia === false, `company=${mc === A.cid ? 'A' : mc}, admin=${ia}`)
  }
}

async function cleanup() {
  const allCompanies = [...companyIds, ...extraCompanyIds]
  const childTabellen = [
    'inspectie_historie', 'inspectie_bevinding', 'inspectie', 'inspectie_sjabloon_punt', 'inspectie_sjabloon',
    'bewijs', 'actie_historie', 'herinnering_log', 'herinner_instelling', 'deellinks',
    'vragen', 'modules', 'fotos', 'rie_versies', 'pva_items', 'personen', 'bedrijf_modules',
  ]
  if (allCompanies.length) {
    for (const tbl of childTabellen) await admin.from(tbl).delete().in('company_id', allCompanies)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (allCompanies.length) await admin.from('companies').delete().in('id', allCompanies)
}

async function residuCheck() {
  // Verifieer dat er NIETS met de NACHTTEST_-prefix of testbedrijven overblijft.
  const bevindingen = []
  const tel = async (label, builder) => {
    const { data, error } = await builder
    if (error) throw new Error(`residu-query (${label}) faalde: ${error.message}`)
    bevindingen.push([label, data?.length ?? 0])
  }
  await tel('companies NACHTTEST_%', admin.from('companies').select('id,name').ilike('name', 'NACHTTEST_%'))
  await tel('personen NACHTTEST%', admin.from('personen').select('id').ilike('naam', 'NACHTTEST%'))
  await tel('users nachttest_%', admin.from('users').select('id').ilike('email', 'nachttest_%'))
  const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) throw new Error(`residu-query (auth.users) faalde: ${authErr.message}`)
  const restAuth = (authUsers?.users ?? []).filter(u => (u.email || '').includes(`_${TS}@example.test`) || (u.email || '').startsWith('nachttest_user_'))
  bevindingen.push(['auth.users nachttest', restAuth.length])
  return bevindingen
}

console.log('================ NACHTTEST — RLS/RPC/token/rem/edge ================')
let setupOk = true
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens test:', e.message)
  setupOk = false
} finally {
  console.log('\n=== OPRUIMEN ===')
  try {
    await cleanup()
    const residu = await residuCheck()
    const schoon = residu.every(([, n]) => n === 0)
    console.log('  Residu-controle:')
    for (const [w, n] of residu) console.log(`    ${n === 0 ? 'OK' : 'LET OP'} — ${w}: ${n}`)
    console.log(schoon ? '  ✅ Opruimen compleet: geen NACHTTEST_-residu.' : '  ❌ Residu aangetroffen!')
  } catch (e) {
    console.error('  LET OP — opruimen/residucheck mislukt:', e.message)
  }
}

// Eindrapport per pijler
console.log('\n================ RAPPORT PER PIJLER ================')
let totaalFail = 0
for (const [naam, p] of Object.entries(pijlers)) {
  totaalFail += p.fail
  const status = p.fail === 0 ? 'PASS' : 'FAIL'
  console.log(`\n## ${naam} -> ${status}  (${p.pass} pass, ${p.fail} fail, ${p.info} info)`)
  for (const r of p.rows.filter(r => !r.ok || r.soort === 'info')) {
    console.log(`   ${r.soort === 'info' ? 'INFO' : 'FAIL'}: ${r.naam} — ${r.detail}`)
  }
}
console.log(`\nEINDOORDEEL: ${totaalFail === 0 ? 'GEEN cross-tenant datalek aangetoond' : totaalFail + ' FAIL(s)'} ${setupOk ? '' : '(setup onvolledig!)'}`)
process.exit(totaalFail === 0 && setupOk ? 0 : 1)
