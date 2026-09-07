// ============================================================================
// Eenmalig kloonscript: oefenomgeving "Dutch Waste Inspectie en Toolbox"
// ----------------------------------------------------------------------------
// Kloont uit het ECHTE Dutch Waste (company_id 281b95cc-c807-431d-b760-
// 839dfc9066ed) alleen structuur — functiegroepen, personen, gekoppelde
// toolboxen, inspectiesjabloon + checklistpunten, inspectiedoelen — naar een
// NIEUW, los bedrijf met companies.oefenomgeving = true (migratie 0078).
// Activeert alleen de modules toolbox + inspectie (rechtstreekse insert in
// bedrijf_modules: de module_*-RPC's vereisen een ingelogde auth.uid(), die
// een service-role-aanroep niet heeft). Incidenten/audit/RI&E/bedrijfsvoering
// blijven volledig buiten beeld — zie migratie 0078 en de guards in
// app/[company_id]/{rie,pva,modules,dashboard/bedrijfsvoering,dashboard/meerjaren}.
//
// Maakt daarna 5 aparte oefen-accounts aan (admin.auth.createUser + upsert op
// public.users), los van de echte Dutch Waste-accounts. De 4 teamleider-
// accounts worden gekoppeld aan hun gekloonde persoon (personen.user_id).
//
// Draaien:  node --use-system-ca scripts/oefenomgeving_dutch_waste_kloon.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Print de inloggegevens aan
// het eind — dit is de ENIGE plek waar de wachtwoorden verschijnen.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import crypto from 'node:crypto'

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
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL) { console.error('NEXT_PUBLIC_SUPABASE_URL ontbreekt.'); process.exit(1) }
if (!SERVICE) { console.error('SUPABASE_SERVICE_ROLE_KEY ontbreekt.'); process.exit(1) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const BRON_COMPANY = '281b95cc-c807-431d-b760-839dfc9066ed'
const NAAM_OEFENBEDRIJF = 'Dutch Waste Inspectie en Toolbox'

function randomPw() {
  return 'Oef3n-' + crypto.randomBytes(9).toString('base64url')
}

const TEAMLEIDERS = [
  { naam: 'Ed de Jong', email: 'ed.dejong.oefen@dutchwaste-oefen.test' },
  { naam: 'Jeroen Schweig', email: 'jeroen.schweig.oefen@dutchwaste-oefen.test' },
  { naam: 'Rob Vernes', email: 'rob.vernes.oefen@dutchwaste-oefen.test' },
  { naam: 'Fatih Tasdemir', email: 'fatih.tasdemir.oefen@dutchwaste-oefen.test' },
]

async function main() {
  const { data: bestaand } = await admin.from('companies').select('id').eq('name', NAAM_OEFENBEDRIJF).maybeSingle()
  if (bestaand) {
    console.error(`Er bestaat al een bedrijf "${NAAM_OEFENBEDRIJF}" (${bestaand.id}). Script niet opnieuw gedraaid — verwijder dat eerst als je opnieuw wilt beginnen.`)
    process.exit(1)
  }

  const { data: company, error: e1 } = await admin.from('companies')
    .insert({ name: NAAM_OEFENBEDRIJF, oefenomgeving: true })
    .select('id').single()
  if (e1) throw e1
  const OEFEN = company.id
  console.log(`Oefenbedrijf aangemaakt: ${OEFEN}`)

  // Functiegroepen
  const { data: bronFg, error: eFg } = await admin.from('functiegroep')
    .select('id, naam, volgorde').eq('company_id', BRON_COMPANY).is('gearchiveerd_op', null)
  if (eFg) throw eFg
  const fgMap = new Map()
  for (const fg of bronFg) {
    const { data: nieuw, error } = await admin.from('functiegroep')
      .insert({ company_id: OEFEN, naam: fg.naam, volgorde: fg.volgorde })
      .select('id').single()
    if (error) throw error
    fgMap.set(fg.id, nieuw.id)
  }
  console.log(`Functiegroepen gekloond: ${fgMap.size}`)

  // Personen (geen e-mail overnemen; user_id komt later alleen bij de 4 teamleiders)
  const { data: bronPersonen, error: ePersonen } = await admin.from('personen')
    .select('id, naam, status, functiegroep_id, datum_in_dienst, datum_uit_dienst')
    .eq('company_id', BRON_COMPANY)
  if (ePersonen) throw ePersonen
  const persoonIdMap = new Map()
  const naamNaarNieuwPersoonId = new Map()
  for (const p of bronPersonen) {
    const { data: nieuw, error } = await admin.from('personen')
      .insert({
        company_id: OEFEN,
        naam: p.naam,
        status: p.status,
        functiegroep_id: p.functiegroep_id ? (fgMap.get(p.functiegroep_id) ?? null) : null,
        datum_in_dienst: p.datum_in_dienst,
        datum_uit_dienst: p.datum_uit_dienst,
      })
      .select('id').single()
    if (error) throw error
    persoonIdMap.set(p.id, nieuw.id)
    naamNaarNieuwPersoonId.set(p.naam, nieuw.id)
  }
  console.log(`Personen gekloond: ${persoonIdMap.size}`)

  // Gekoppelde toolboxen (globale centrale_toolbox-sjablonen, alleen de koppeling zelf)
  const { data: bronBt, error: eBt } = await admin.from('bedrijf_toolbox')
    .select('toolbox_id').eq('company_id', BRON_COMPANY)
  if (eBt) throw eBt
  for (const bt of bronBt) {
    const { error } = await admin.from('bedrijf_toolbox').insert({ company_id: OEFEN, toolbox_id: bt.toolbox_id })
    if (error) throw error
  }
  console.log(`Toolbox-koppelingen gekloond: ${bronBt.length}`)

  // Toolbox-instelling (sessiedoel per jaar)
  const { data: bronInst } = await admin.from('bedrijf_toolbox_instelling')
    .select('sessie_doel_per_jaar').eq('company_id', BRON_COMPANY).maybeSingle()
  if (bronInst) {
    const { error } = await admin.from('bedrijf_toolbox_instelling')
      .insert({ company_id: OEFEN, sessie_doel_per_jaar: bronInst.sessie_doel_per_jaar })
    if (error) throw error
  }

  // Inspectiesjabloon + checklistpunten
  const { data: bronSjabloon, error: eSj } = await admin.from('inspectie_sjabloon')
    .select('id, naam, controlesoort, actief, doel_functiegroep_id').eq('company_id', BRON_COMPANY)
  if (eSj) throw eSj
  const sjabloonMap = new Map()
  for (const s of bronSjabloon) {
    const { data: nieuw, error } = await admin.from('inspectie_sjabloon')
      .insert({
        company_id: OEFEN,
        naam: s.naam,
        controlesoort: s.controlesoort,
        actief: s.actief,
        doel_functiegroep_id: s.doel_functiegroep_id ? (fgMap.get(s.doel_functiegroep_id) ?? null) : null,
      })
      .select('id').single()
    if (error) throw error
    sjabloonMap.set(s.id, nieuw.id)
  }
  let puntenTotaal = 0
  for (const [oudId, nieuwId] of sjabloonMap) {
    const { data: punten, error } = await admin.from('inspectie_sjabloon_punt')
      .select('volgorde, tekst, verplicht').eq('sjabloon_id', oudId)
    if (error) throw error
    for (const punt of punten) {
      const { error: eInsert } = await admin.from('inspectie_sjabloon_punt')
        .insert({ company_id: OEFEN, sjabloon_id: nieuwId, volgorde: punt.volgorde, tekst: punt.tekst, verplicht: punt.verplicht })
      if (eInsert) throw eInsert
      puntenTotaal++
    }
  }
  console.log(`Inspectiesjablonen gekloond: ${sjabloonMap.size} (${puntenTotaal} checklistpunten)`)

  // Inspectiedoelen per persoon (jaar 2026)
  const { data: bronDoelen, error: eDoelen } = await admin.from('bedrijf_inspectie_doel')
    .select('persoon_id, jaar, doel_per_jaar').eq('company_id', BRON_COMPANY)
  if (eDoelen) throw eDoelen
  let doelenTotaal = 0
  for (const d of bronDoelen) {
    const nieuwPersoonId = persoonIdMap.get(d.persoon_id)
    if (!nieuwPersoonId) continue
    const { error } = await admin.from('bedrijf_inspectie_doel')
      .insert({ company_id: OEFEN, persoon_id: nieuwPersoonId, jaar: d.jaar, doel_per_jaar: d.doel_per_jaar })
    if (error) throw error
    doelenTotaal++
  }
  console.log(`Inspectiedoelen gekloond: ${doelenTotaal}`)

  // Modules activeren: alleen toolbox + inspectie. Rechtstreekse insert (geen
  // auth.uid() beschikbaar via service-role voor de module_activeren-RPC),
  // met een module_historie-regel zodat het spoor klopt.
  const nu = new Date().toISOString()
  for (const mod of ['toolbox', 'inspectie']) {
    const { error } = await admin.from('bedrijf_modules')
      .insert({ company_id: OEFEN, module: mod, actief: true, module_status: 'actief', geactiveerd_op: nu })
    if (error) throw error
    const { error: eHist } = await admin.from('module_historie')
      .insert({ company_id: OEFEN, module: mod, wie: null, wanneer: nu, wijziging: `Module ${mod} geactiveerd (oefenomgeving-kloon)` })
    if (eHist) throw eHist
  }
  console.log('Modules geactiveerd: toolbox, inspectie (incidenten/audit blijven uit)')

  // Accounts
  const credentials = []
  async function maakAccount({ naam, email, role, linkPersoonNaam }) {
    const pw = randomPw()
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
    if (error) throw error
    const { error: eUpsert } = await admin.from('users')
      .upsert({ id: created.user.id, email, role, company_id: OEFEN, naam: `${naam} (oefen)` })
    if (eUpsert) throw eUpsert
    if (linkPersoonNaam) {
      const persoonId = naamNaarNieuwPersoonId.get(linkPersoonNaam)
      if (persoonId) {
        const { error: eLink } = await admin.from('personen').update({ user_id: created.user.id }).eq('id', persoonId)
        if (eLink) throw eLink
      }
    }
    credentials.push({ naam, rol: role, email, wachtwoord: pw })
  }

  await maakAccount({ naam: 'Kees Kraaiveld', email: 'kees.kraaiveld+oefen@gmail.com', role: 'client' })
  for (const tl of TEAMLEIDERS) {
    await maakAccount({ naam: tl.naam, email: tl.email, role: 'teamleider', linkPersoonNaam: tl.naam })
  }

  console.log('\n=== OEFENOMGEVING KLAAR ===')
  console.log(`Bedrijf: ${NAAM_OEFENBEDRIJF}`)
  console.log(`Company ID: ${OEFEN}`)
  console.log('\n=== INLOGGEGEVENS (bewaar dit — dit is de enige keer dat ze getoond worden) ===')
  for (const c of credentials) {
    console.log(`${c.naam.padEnd(20)} ${c.rol.padEnd(11)} ${c.email.padEnd(42)} ${c.wachtwoord}`)
  }
}

main().catch(e => { console.error('FOUT:', e.message ?? e); process.exit(1) })
