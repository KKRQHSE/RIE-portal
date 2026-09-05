// ============================================================================
// Anon-EXECUTE audit — welke RPC's kan een niet-ingelogde caller aanroepen?
// ----------------------------------------------------------------------------
// Aanleiding (nachttest 31 aug 2026). security_hardening_test.mjs bewaakt een
// HANDGESCHREVEN lijst van 61 RPC's uit migratie 0023. RPC's die daarna zijn
// bijgekomen staan er niet in en worden dus door niets gecontroleerd — en een
// nieuwe SECURITY DEFINER-functie krijgt van Supabase standaard EXECUTE voor
// anon én authenticated. Precies het gat dat Beslissing 62 wilde dichten.
//
// BELANGRIJK (bevestigd 5 sept 2026, tijdens het bouwen van migratie 0070):
// `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` — het
// door de Postgres-documentatie voorgeschreven standaardpatroon om dit
// structureel bij de bron te dichten — heeft in DEZE Supabase-omgeving GEEN
// waarneembaar effect. Getest: vier varianten (impliciete rol, FROM anon,
// FROM public, expliciet FOR ROLE postgres, en atomisch binnen dezelfde
// transactie als de proef-CREATE FUNCTION) — een nieuwe functie krijgt
// telkens toch een kale `=X/<eigenaar>`-vermelding (PUBLIC) in zijn `proacl`,
// waar `anon` vervolgens automatisch van meeprofiteert. Vermoedelijk hardcoded
// in Supabase's eigen postgres-image, niet bevestigd waarom. Zie
// [[default-acl-werkt-niet]] in memory.
//
// Conclusie: er is GEEN database-level manier gevonden om dit bij de bron te
// voorkomen. DEZE TEST (met name DEEL 1's handmatige allowlist) is daarmee niet
// een backup-slot naast een structurele fix, maar HET ENIGE bestaande vangnet.
// Vergeet niet: `npm test` (dus deze test) hoort vóór elke merge te draaien.
//
// Deze test doet daarom twee dingen die de bestaande test niet doet:
//
//   DEEL 1 — INVENTARIS. Leest LIVE uit de database welke public-functies
//   anon mag aanroepen, en vergelijkt dat met de lijst hieronder. Duikt er iets
//   op wat hier niet staat, dan faalt de test. Zo wordt een nieuwe RPC met een
//   vergeten revoke meteen betrapt in plaats van over een half jaar.
//
//   DEEL 2 — DE TWEEDE SLOT. Voor elke per-bedrijf-RPC die anon nog mág
//   aanroepen: bewijs dat een anon-caller er tegen een ECHT bestaand (wegwerp-)
//   bedrijf niets mee kan. De guard (mag_bedrijf_beheren, coalesce naar false
//   sinds migratie 0022) hoort hem te weigeren. Zolang dit groen is, is de open
//   EXECUTE hygiëne-schuld en geen open deur — maar het is wel één slot in
//   plaats van twee.
//
// Draaien:  node --use-system-ca scripts/anon_execute_audit_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL in .env.local. Alles draait
// op een wegwerpbedrijf met prefix ANONTEST_ en wordt in het finally-blok
// opgeruimd. Er wordt niets van bestaande data gelezen of aangeraakt: elke
// probe gebruikt het eigen testbedrijf of een willekeurige, niet-bestaande uuid.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
  } catch { /* geen .env.local */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const DBURL = env.DATABASE_URL

if (!URL || !ANON) { console.error('SUPABASE-URL/ANON ontbreken in .env.local.'); process.exit(1) }
if (!SERVICE || !DBURL) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY of DATABASE_URL ontbreekt; test overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

// ---------------------------------------------------------------------------
// Wat anon MAG aanroepen, met de reden erbij. Alles wat hier niet staat en toch
// anon-EXECUTE heeft, is een vergeten revoke.
// ---------------------------------------------------------------------------

// Bewuste uitzondering: de login-loze flows. De beveiliging zit in het token,
// dat de SECURITY DEFINER-functie zelf valideert (Beslissing 62).
const TOKENFLOWS = {
  deellink_data: 'gast-deellink: actiehouder zonder account',
  deellink_actie_doorgeven: 'gast-deellink',
  deellink_actie_historie: 'gast-deellink',
  deellink_bewijs_lijst: 'gast-deellink',
  deellink_bewijs_pad: 'gast-deellink',
  deellink_bewijs_registreren: 'gast-deellink',
  deellink_concept_update: 'gast-deellink',
  toolbox_voor_token: 'werknemer-toolboxflow /tb/[token]',
  toolbox_afronden_token: 'werknemer-toolboxflow /tb/[token]',
  incident_meldcontext_token: 'open meldflow /melden/[token]',
  incident_melden_token: 'open meldflow /melden/[token]',
  incident_foto_pad_token: 'open meldflow /melden/[token]',
  incident_foto_registreren_token: 'open meldflow /melden/[token]',
  // Toegevoegd 5 sept 2026: gevonden via de nieuwe pre-push-gate zelf (zie
  // scripts/hooks/pre-push) — geen gat, dit is de rate-limiet-RPC (migratie
  // 0069_rate_limiet.sql op main, lib/rate-limit.ts) die de sessieloze
  // gast-upload-routes aanroepen MET de anon-client:
  // app/api/bewijs/gast-upload/route.ts en app/api/incident/foto-upload/
  // route.ts. Fail-closed bij een lege sleutel/actie (retourneert dan false).
  rate_limiet_toegestaan: 'rate-limiet voor sessieloze gast-upload-routes (bewijs/incident-foto)',
}

// RLS-helpers en triggerfuncties: draaien binnen policies/triggers en moeten
// voor elke rol aanroepbaar zijn, ook anon. Ze lekken zelf niets.
const HELPERS = {
  is_admin: 'RLS-helper',
  my_company_id: 'RLS-helper',
  mag_bedrijf_beheren: 'RLS-helper (coalesce naar false, migratie 0022)',
  mag_herinneren: 'RLS-helper',
  jaar_utc: 'pure datumhelper, geen data',
  gen_deellink_token: 'tokengenerator, geen data',
  handle_new_user: 'trigger op auth.users',
  toolbox_deelname_immutable: 'BEFORE UPDATE-trigger',
  rate_limiet_toegestaan: 'rate-limit-teller, geen data, bewust ook voor anon (gast-uploadroutes)',
}

// INGETROKKEN in migratie 0053 (nachttest 31 aug 2026). Deze per-bedrijf-RPC's
// zijn na migratie 0023 toegevoegd en hielden daardoor hun standaard
// anon-EXECUTE; ze vielen buiten de handmatige lijst van de hardening-test. Geen
// lek geweest — de guard weigerde anon al — maar wel een slot in plaats van twee.
// LEEG HOUDEN: alles wat hier bij komt te staan is nieuwe schuld.
const BEKENDE_SCHULD = {}

// Waar DEEL 2 op probet. Blijft ook na de revoke draaien: de weigering hoort nu
// van de permissielaag te komen in plaats van van de guard — dat is het tweede
// slot dat 0053 heeft teruggezet.
const INGETROKKEN_0053 = [
  'audit_aanmaken', 'audit_bevinding_naar_actie', 'dashboard_instelling_zetten',
  'dashboard_pva_rie', 'huisstijl_van_bedrijf', 'inspectie_doel_zetten',
  'toolbox_sessie_aanwezigheid_zetten', 'toolbox_sessie_doel_zetten',
  'toolbox_sessie_opslaan', 'toolbox_sessie_verwijderen', 'toolbox_sessies_overzicht',
  'zet_mijn_naam',
]

const TOEGESTAAN = { ...TOKENFLOWS, ...HELPERS, ...BEKENDE_SCHULD }

const results = []
const check = (naam, ok, detail) => {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

const companyIds = []
const userIds = []

async function leesAnonFuncties() {
  const client = new pg.Client({ connectionString: DBURL })
  await client.connect()
  try {
    const { rows } = await client.query(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1`)
    return rows
  } finally {
    await client.end()
  }
}

async function maakTestbedrijf() {
  const ts = Date.now()
  const { data: comp, error } = await admin.from('companies')
    .insert({ name: `ANONTEST_${ts}` }).select('id').single()
  if (error) throw new Error(`company: ${error.message}`)
  companyIds.push(comp.id)

  // Een persoon en een toolboxsessie, zodat de probes iets ECHTS als doelwit
  // hebben: anders zou "geen data terug" ook kunnen betekenen "niets te halen".
  const { data: pers } = await admin.from('personen')
    .insert({ company_id: comp.id, naam: 'ANONTEST persoon', status: 'actief' })
    .select('id').single()

  const { data: sessie } = await admin.from('toolbox_sessie')
    .insert({ company_id: comp.id, datum: '2026-01-15', onderwerp: 'ANONTEST sessie' })
    .select('id').single()
    .then(r => r, () => ({ data: null }))

  await admin.from('bedrijf_modules').insert({
    company_id: comp.id, module: 'inspectie', actief: true, module_status: 'actief',
  })

  // Een ECHTE auditbevinding. Met een willekeurige uuid struikelt de RPC al over
  // "Bron niet gevonden" en raak je de bedrijfsguard nooit — dan test je niets.
  const { data: aud } = await admin.from('audit')
    .insert({ company_id: comp.id, sjabloon: 'vca', titel: 'ANONTEST audit', jaar: 2026 })
    .select('id').single()
  const { data: bev } = aud ? await admin.from('audit_vca_bevinding')
    .insert({
      audit_id: aud.id, company_id: comp.id, code: 'ANONTEST', hoofdstuk: '1',
      hoofdstuk_titel: 'ANONTEST', titel: 'ANONTEST bevinding', volgorde: 1,
    })
    .select('id').single() : { data: null }

  return {
    companyId: comp.id,
    persoonId: pers?.id ?? randomUUID(),
    sessieId: sessie?.id ?? randomUUID(),
    vcaBevindingId: bev?.id ?? null,
  }
}

async function opruimen() {
  if (companyIds.length) {
    for (const tbl of [
      'toolbox_sessie_aanwezigheid', 'toolbox_sessie', 'bedrijf_doelstelling',
      'bedrijf_inspectie_doel', 'dashboard_instelling', 'pva_items',
      'audit_vca_bevinding', 'audit_verbeterpunt', 'audit',
      'bedrijf_modules', 'personen',
    ]) {
      try { await admin.from(tbl).delete().in('company_id', companyIds) } catch { /* tabel bestaat mogelijk niet */ }
    }
    await admin.from('companies').delete().in('id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
}

// Een probe is GESLAAGD als anon geen data terugkrijgt en/of een fout krijgt.
// Een RPC die stilletjes data teruggeeft aan anon is het ergste geval, want dat
// levert geen foutmelding op waar iemand over struikelt.
async function probe(naam, args, opties = {}) {
  const { data, error } = await anon.rpc(naam, args)
  const leeg = data === null || data === undefined
    || (Array.isArray(data) && data.length === 0)
    || (typeof data === 'object' && data !== null && Object.keys(data).length === 0)
  const geweigerd = !!error
  const ok = geweigerd || leeg || !!opties.leegIsGoed
  check(`anon krijgt niets uit ${naam}`, ok,
    geweigerd ? `geweigerd: ${String(error.message).slice(0, 55)}` : `data=${JSON.stringify(data)?.slice(0, 70)}`)
  return { data, error }
}

async function run() {
  // ---------------- DEEL 1 — inventaris ----------------
  console.log('DEEL 1 — welke public-functies mag anon aanroepen?\n')
  const rijen = await leesAnonFuncties()
  const namen = [...new Set(rijen.map(r => r.proname))]
  console.log(`  ${namen.length} functies met anon-EXECUTE gevonden.\n`)

  const onbekend = namen.filter(n => !(n in TOEGESTAAN))
  check('geen ONVERWACHTE functie met anon-EXECUTE',
    onbekend.length === 0,
    onbekend.length ? `nieuw en niet verklaard: ${onbekend.join(', ')}` : `${namen.length} stuks, allemaal verklaard`)

  // Andersom: staat er iets in de lijst dat inmiddels is ingetrokken? Dan mag
  // deze lijst opgeschoond worden — geen fout, wel het melden waard.
  const verdwenen = Object.keys(TOEGESTAAN).filter(n => !namen.includes(n))
  if (verdwenen.length) {
    console.log(`  (opruimtip: niet meer anon-aanroepbaar, mag uit de lijst: ${verdwenen.join(', ')})`)
  }

  const teruggekomen = INGETROKKEN_0053.filter(n => namen.includes(n))
  check('de intrekkingen van migratie 0053 staan nog',
    teruggekomen.length === 0,
    teruggekomen.length ? `weer anon-aanroepbaar: ${teruggekomen.join(', ')}` : `${INGETROKKEN_0053.length} stuks dicht`)

  // ---------------- DEEL 2 — houdt de guard? ----------------
  console.log('\nDEEL 2 — kan een anon-caller er iets mee tegen een ECHT bedrijf?\n')
  const T = await maakTestbedrijf()
  console.log(`  wegwerpbedrijf: ${T.companyId}\n`)

  // Lezen: mag niets van dit bedrijf teruggeven.
  await probe('dashboard_pva_rie', { p_company_id: T.companyId })
  await probe('toolbox_sessies_overzicht', { p_company_id: T.companyId })

  // Schrijven: moet weigeren. Alle doelwitten zijn eigen testdata.
  await probe('audit_aanmaken', {
    p_company_id: T.companyId, p_sjabloon: 'vca', p_titel: 'ANONTEST inbraak',
    p_jaar: 2026, p_status: 'concept',
  })
  await probe('dashboard_instelling_zetten', {
    p_company_id: T.companyId, p_klachten_aantal: 99, p_tevredenheid_score: null,
    p_tevredenheid_toelichting: null, p_audit_intern_gedaan: null, p_audit_intern_totaal: null,
    p_audit_extern_omschrijving: null, p_audit_status: null, p_doelstelling_tekst: null,
    p_iso_taken_tekst: null, p_if_dit_jaar: null, p_if_vorig_jaar: null,
  })
  await probe('inspectie_doel_zetten', {
    p_company_id: T.companyId, p_persoon_id: T.persoonId, p_doel_per_jaar: 99,
  })
  await probe('toolbox_sessie_doel_zetten', { p_company_id: T.companyId, p_doel: 99 })
  await probe('toolbox_sessie_opslaan', {
    p_company_id: T.companyId, p_sessie_id: null, p_datum: '2026-02-02',
    p_onderwerp: 'ANONTEST inbraak', p_notitie: null, p_toolbox_id: null,
  })
  await probe('toolbox_sessie_aanwezigheid_zetten', {
    p_sessie_id: T.sessieId, p_persoon_id: T.persoonId, p_aanwezig: true,
  })
  await probe('toolbox_sessie_verwijderen', { p_sessie_id: T.sessieId })
  if (T.vcaBevindingId) {
    await probe('audit_bevinding_naar_actie', { p_soort: 'vca', p_bron_id: T.vcaBevindingId })
    const { data: acties } = await admin.from('pva_items').select('id').eq('company_id', T.companyId)
    check('anon heeft van die echte auditbevinding geen actie kunnen maken',
      (acties?.length ?? 0) === 0, `${acties?.length ?? 0} acties`)
  } else {
    check('audit_bevinding_naar_actie getoetst met een echte bron', false, 'seeden van de bevinding mislukt')
  }
  await probe('zet_mijn_naam', { p_naam: 'ANONTEST' })

  {
    // Gaf vóór 0053 nog merkinstellingen terug aan anon (kleur/logo/lettertype —
    // niet vertrouwelijk, maar wel van een klant). Hoort nu geweigerd te worden.
    const { data, error } = await anon.rpc('huisstijl_van_bedrijf', { p_company_id: T.companyId })
    const velden = data && typeof data === 'object' && data ? Object.keys(data) : []
    const gevoelig = velden.filter(v => /email|naam_contact|telefoon|adres|kvk/i.test(v))
    check('anon krijgt niets uit huisstijl_van_bedrijf',
      !!error || velden.length === 0,
      error ? `geweigerd: ${String(error.message).slice(0, 55)}` : `velden: ${velden.join(', ')}`)
    check('huisstijl_van_bedrijf bevat sowieso geen gevoelige velden',
      gevoelig.length === 0, velden.join(', ') || 'geen data')
  }

  // ---------------- Controle: is er echt niets veranderd? ----------------
  // Let op: er staat al één audit — die heeft de testopzet zelf geseed als
  // doelwit. Kijken naar de TITEL van de inbraakpoging, niet naar het aantal.
  const { data: audits } = await admin.from('audit').select('id, titel').eq('company_id', T.companyId)
  const inbraakAudit = (audits ?? []).some(a => /ANONTEST inbraak/.test(a.titel ?? ''))
  check('anon heeft geen audit kunnen aanmaken', !inbraakAudit,
    `${audits?.length ?? 0} audits, waarvan door anon: ${inbraakAudit ? 'JA' : 'geen'}`)

  const { data: sessies } = await admin.from('toolbox_sessie').select('id, onderwerp').eq('company_id', T.companyId)
  const inbraak = (sessies ?? []).some(s => /ANONTEST inbraak/.test(s.onderwerp ?? ''))
  check('anon heeft geen toolboxsessie kunnen aanmaken', !inbraak, `${sessies?.length ?? 0} sessies`)
  check('anon heeft de bestaande toolboxsessie niet verwijderd', (sessies?.length ?? 0) >= 1,
    `${sessies?.length ?? 0} sessies over`)

  const { data: inst } = await admin.from('dashboard_instelling').select('klachten_aantal').eq('company_id', T.companyId)
  check('anon heeft geen dashboard-instelling kunnen zetten', (inst?.length ?? 0) === 0, `${inst?.length ?? 0} rijen`)
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de test:', e.message)
  exitCode = 1
} finally {
  try { await opruimen(); console.log('\nOpgeruimd: alle ANONTEST_-data verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} controles geslaagd.`)
if (falen > 0) exitCode = 1
process.exitCode = exitCode
