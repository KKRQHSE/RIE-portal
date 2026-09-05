// ============================================================================
// Concept-medewerkers + goedkeuring + correctie-spoor (Spoor B, B1)
// ----------------------------------------------------------------------------
// Dekt:
//  - teamleider maakt aan (nieuw + koppelen), andere rol niet;
//  - duplicaat-waarschuwing (match -> niet blokkerend -> override vastgelegd);
//  - zoek-RPC: cross-company dicht, geen gevoelige velden;
//  - koppelen: geen nieuwe personen-rij, partial-unique-index (1 open verzoek
//    per persoon) geeft de tweede poging een DB-fout;
//  - goedkeuren maakt actief, alleen KAM/admin, cross-company dicht;
//  - afwijzen: onvolledige item_keuzes wordt geweigerd, "weggooien" sluit
//    alleen bij een actie de pva_items-rij af, de andere twee laten verder
//    niets aan het item zelf veranderen;
//  - correctie-spoor is onuitwisbaar: elke persoon_id/naam/email-wijziging
//    (ook rechtstreeks via service-role, buiten de RPC's om) laat een
//    correctie_log-regel achter; correctie_log en een behandeld
//    goedkeuringsverzoek zijn zelf onveranderlijk (trigger blokkeert ook
//    service-role).
//
// Draaien:  node --use-system-ca scripts/concept_medewerkers_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY. Alles met prefix CMTEST_ wordt opgeruimd.
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
const PW = 'Cmtest!' + TS
const companyIds = [], userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `CMTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`company ${label}: ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId, role) {
  const email = `cmtest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`user ${label}: ${error.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role, company_id: companyId, naam: `CMTEST ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn ${label}: ${e2.message}`)
  return client
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const kamA = await maakGebruiker('KAMA', A, 'client')
  const kamB = await maakGebruiker('KAMB', B, 'client')
  const teamleiderA = await maakGebruiker('TLA', A, 'teamleider')
  const teamleiderB = await maakGebruiker('TLB', B, 'teamleider')

  // Bestaande actieve persoon in bedrijf A — doel voor koppelen + duplicaat-match.
  const { data: fgA } = await admin.from('functiegroep').insert({ company_id: A, naam: 'CMTEST functiegroep' }).select('id').single()
  const { data: bestaand } = await admin.from('personen')
    .insert({ company_id: A, naam: 'CMTEST Jan Jansen', email: 'jan.jansen@cmtest.example', status: 'actief', functiegroep_id: fgA.id })
    .select('id').single()

  // ===== 1. Alleen teamleider maakt aan =====
  {
    const { data, error } = await kamA.rpc('concept_medewerker_aanmaken', { p_company_id: A, p_naam: 'CMTEST KAM-poging' })
    check('KAM kan GEEN concept-medewerker aanmaken', !!error && !data, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await teamleiderB.rpc('concept_medewerker_aanmaken', { p_company_id: A, p_naam: 'CMTEST cross-company' })
    check('teamleider van ander bedrijf kan NIET aanmaken voor bedrijf A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 2. Nieuw, zonder match =====
  let nieuwPersoonId = null, nieuwVerzoekId = null
  {
    const { data, error } = await teamleiderA.rpc('concept_medewerker_aanmaken', {
      p_company_id: A, p_naam: 'CMTEST Nieuwe Medewerker', p_email: 'nieuw@cmtest.example',
    })
    check('teamleider maakt concept-medewerker aan (geen duplicaat)', !error && data?.aangemaakt === true, error?.message ?? JSON.stringify(data))
    nieuwPersoonId = data?.persoon_id
    nieuwVerzoekId = data?.goedkeuringsverzoek_id
  }
  if (nieuwPersoonId) {
    const { data: p } = await admin.from('personen').select('status').eq('id', nieuwPersoonId).single()
    check('nieuwe concept-persoon staat op status=voorgesteld', p?.status === 'voorgesteld', p?.status)
    const { data: actie } = await admin.from('pva_items').select('bron_type, bron_id').eq('bron_id', nieuwPersoonId).eq('bron_type', 'concept_medewerker').maybeSingle()
    check('goedkeuring verschijnt als actie (bron_type=concept_medewerker)', !!actie, JSON.stringify(actie))
  }

  // ===== 3. Nieuw, MET duplicaat-waarschuwing (niet blokkerend) =====
  let dupPersoonId = null, dupVerzoekId = null
  {
    const { data, error } = await teamleiderA.rpc('concept_medewerker_aanmaken', { p_company_id: A, p_naam: 'CMTEST Jan Jansen' })
    const gevonden = (data?.mogelijke_duplicaten ?? []).some(d => d.id === bestaand.id)
    check('duplicaat op naam wordt gesignaleerd, niet geblokkeerd', !error && data?.aangemaakt === false && gevonden, error?.message ?? JSON.stringify(data))
  }
  {
    const { data, error } = await teamleiderA.rpc('concept_medewerker_aanmaken', {
      p_company_id: A, p_naam: 'CMTEST Jan Jansen', p_negeer_duplicaat_waarschuwing: true,
    })
    check('teamleider kan toch nieuw aanmaken na waarschuwing', !error && data?.aangemaakt === true, error?.message ?? JSON.stringify(data))
    dupPersoonId = data?.persoon_id
    dupVerzoekId = data?.goedkeuringsverzoek_id
    check('override van duplicaat-oordeel wordt vastgelegd op het verzoek', data?.mogelijk_duplicaat_van === bestaand.id, data?.mogelijk_duplicaat_van)
  }

  // ===== 4. KAM-overzicht toont het duplicaat-signaal =====
  if (dupVerzoekId) {
    const { data: overzicht, error } = await kamA.rpc('goedkeuringsverzoek_overzicht', { p_company_id: A })
    const rij = (overzicht ?? []).find(v => v.id === dupVerzoekId)
    check('KAM ziet mogelijk_duplicaat in het overzicht', !error && rij?.mogelijk_duplicaat?.id === bestaand.id, error?.message ?? JSON.stringify(rij))
  }
  {
    const { error } = await teamleiderA.rpc('goedkeuringsverzoek_overzicht', { p_company_id: A })
    check('teamleider krijgt GEEN goedkeuringsverzoek_overzicht (alleen KAM/admin)', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamB.rpc('goedkeuringsverzoek_overzicht', { p_company_id: A })
    check('KAM van ander bedrijf krijgt GEEN overzicht van bedrijf A', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 5. Zoek-RPC: minimale velden, cross-company dicht =====
  {
    const { data, error } = await teamleiderA.rpc('persoon_zoeken_voor_koppeling', { p_company_id: A, p_zoekterm: 'Jansen' })
    const rij = (data ?? [])[0]
    const velden = rij ? Object.keys(rij).sort() : []
    check('zoek-RPC geeft alleen id/naam/functiegroep_naam/in_dienst terug', !error && JSON.stringify(velden) === JSON.stringify(['functiegroep_naam', 'id', 'in_dienst', 'naam']), error?.message ?? JSON.stringify(velden))
    check('zoek-RPC toont functiegroep als onderscheider', rij?.functiegroep_naam === 'CMTEST functiegroep', rij?.functiegroep_naam)
  }
  {
    const { error } = await teamleiderB.rpc('persoon_zoeken_voor_koppeling', { p_company_id: A, p_zoekterm: 'Jansen' })
    check('zoeken cross-company is dicht', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.rpc('persoon_zoeken_voor_koppeling', { p_company_id: A, p_zoekterm: 'Jansen' })
    check('KAM kan NIET via de teamleider-only zoek-RPC (koppelen is teamleiderswerk)', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 6. Koppelen aan bestaand — geen nieuwe personen-rij =====
  let koppelVerzoekId = null
  const { count: aantalVoor } = await admin.from('personen').select('id', { count: 'exact', head: true }).eq('company_id', A)
  {
    const { data, error } = await teamleiderA.rpc('concept_medewerker_koppelen', { p_company_id: A, p_persoon_id: bestaand.id })
    check('teamleider koppelt aan bestaande persoon', !error && !!data?.goedkeuringsverzoek_id, error?.message)
    koppelVerzoekId = data?.goedkeuringsverzoek_id
  }
  {
    const { count: aantalNa } = await admin.from('personen').select('id', { count: 'exact', head: true }).eq('company_id', A)
    check('koppelen maakt GEEN nieuwe personen-rij', aantalNa === aantalVoor, `voor=${aantalVoor} na=${aantalNa}`)
  }
  {
    const { data: v } = await admin.from('goedkeuringsverzoek').select('type, persoon_id').eq('id', koppelVerzoekId).single()
    check('koppel-verzoek heeft type=koppel_bestaand en juiste persoon_id', v?.type === 'koppel_bestaand' && v?.persoon_id === bestaand.id, JSON.stringify(v))
  }
  {
    // Partial unique index: nog een open verzoek voor dezelfde persoon mag niet.
    const { error } = await teamleiderA.rpc('concept_medewerker_koppelen', { p_company_id: A, p_persoon_id: bestaand.id })
    check('maximaal 1 open verzoek per persoon (partial unique index)', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await teamleiderB.rpc('concept_medewerker_koppelen', { p_company_id: A, p_persoon_id: bestaand.id })
    check('koppelen cross-company is dicht', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // Ruim het koppel-verzoek weg zodat 'bestaand' vrij is voor de afwijs-items
  // hieronder (alleen state opruimen, geen nieuw gedrag testen).
  if (koppelVerzoekId) await admin.from('goedkeuringsverzoek').delete().eq('id', koppelVerzoekId)

  // ===== 7. Goedkeuren maakt actief, alleen KAM/admin =====
  {
    const { error } = await teamleiderA.rpc('concept_medewerker_goedkeuren', { p_goedkeuringsverzoek_id: nieuwVerzoekId })
    check('teamleider kan NIET goedkeuren', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamB.rpc('concept_medewerker_goedkeuren', { p_goedkeuringsverzoek_id: nieuwVerzoekId })
    check('KAM van ander bedrijf kan NIET goedkeuren', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.rpc('concept_medewerker_goedkeuren', { p_goedkeuringsverzoek_id: nieuwVerzoekId })
    check('KAM keurt goed', !error, error?.message)
  }
  if (nieuwPersoonId) {
    const { data: p } = await admin.from('personen').select('status').eq('id', nieuwPersoonId).single()
    check('goedkeuren maakt de concept-persoon actief', p?.status === 'actief', p?.status)
    const { data: actie } = await admin.from('pva_items').select('status').eq('bron_id', nieuwPersoonId).eq('bron_type', 'concept_medewerker').maybeSingle()
    check('goedkeuren sluit de bijbehorende actie af', actie?.status === 'Afgerond', actie?.status)
  }
  {
    const { error } = await kamA.rpc('concept_medewerker_goedkeuren', { p_goedkeuringsverzoek_id: nieuwVerzoekId })
    check('een al behandeld verzoek kan niet nogmaals behandeld worden', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }

  // ===== 8. Afwijzen: gekoppelde items + item_keuzes =====
  const { data: deelname, error: deelnameErr } = await admin.from('toolbox_deelname').insert({
    company_id: A, persoon_id: dupPersoonId, bewijssoort: 'fysiek_aanwezig', naam_bevestigd: false,
    bevestigde_naam: 'CMTEST Jan Jansen', titel_snap: 'CMTEST toolbox', tekst_snap: 'CMTEST tekst',
  }).select('id').single()
  if (deelnameErr) throw new Error(`fixture toolbox_deelname: ${deelnameErr.message}`)
  const { data: inspectieRij, error: inspectieErr } = await admin.from('inspectie').insert({
    company_id: A, persoon_id: dupPersoonId, status: 'concept',
  }).select('id').single()
  if (inspectieErr) throw new Error(`fixture inspectie: ${inspectieErr.message}`)
  const { data: actieRij, error: actieErr } = await admin.from('pva_items').insert({
    company_id: A, nr: `CMTEST-${TS}`, onderwerp: 'CMTEST losse actie', status: 'Open', prio: 'Middel', persoon_id: dupPersoonId,
  }).select('id').single()
  if (actieErr) throw new Error(`fixture pva_items: ${actieErr.message}`)

  {
    const { error } = await kamA.rpc('concept_medewerker_afwijzen', {
      p_goedkeuringsverzoek_id: dupVerzoekId,
      p_item_keuzes: [{ item_type: 'toolbox_deelname', item_id: deelname.id, keuze: 'terug_naar_aanmaker' }],
    })
    check('afwijzen weigert bij onvolledige item_keuzes', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await teamleiderA.rpc('concept_medewerker_afwijzen', {
      p_goedkeuringsverzoek_id: dupVerzoekId, p_item_keuzes: [],
    })
    check('teamleider kan NIET afwijzen', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    const { error } = await kamA.rpc('concept_medewerker_afwijzen', {
      p_goedkeuringsverzoek_id: dupVerzoekId,
      p_item_keuzes: [
        { item_type: 'toolbox_deelname', item_id: deelname.id, keuze: 'terug_naar_aanmaker' },
        { item_type: 'inspectie', item_id: inspectieRij.id, keuze: 'opnieuw_aanmaken' },
        { item_type: 'actie', item_id: actieRij.id, keuze: 'weggooien' },
      ],
      p_reden: 'CMTEST reden',
    })
    check('KAM wijst af met volledige item_keuzes', !error, error?.message)
  }
  {
    const { data: t } = await admin.from('toolbox_deelname').select('persoon_id, bevestigde_naam').eq('id', deelname.id).single()
    check('afwijzen (terug_naar_aanmaker) ontkoppelt persoon_id, bewijs blijft ongewijzigd', t?.persoon_id === null && t?.bevestigde_naam === 'CMTEST Jan Jansen', JSON.stringify(t))
    const { data: i } = await admin.from('inspectie').select('persoon_id, status').eq('id', inspectieRij.id).single()
    check('afwijzen (opnieuw_aanmaken) ontkoppelt persoon_id, status blijft ongewijzigd', i?.persoon_id === null && i?.status === 'concept', JSON.stringify(i))
    const { data: a } = await admin.from('pva_items').select('persoon_id, status').eq('id', actieRij.id).single()
    check('afwijzen (weggooien) ontkoppelt persoon_id EN sluit de actie af', a?.persoon_id === null && a?.status === 'Afgerond', JSON.stringify(a))
    const { data: hist } = await admin.from('actie_historie').select('gebeurtenis').eq('pva_item_id', actieRij.id).eq('gebeurtenis', 'concept_medewerker_afgewezen_gesloten').maybeSingle()
    check('weggooien laat een historie-regel achter op de actie', !!hist, JSON.stringify(hist))
  }
  {
    const { data: p } = await admin.from('personen').select('status').eq('id', dupPersoonId).single()
    check('afwijzen zet de concept-persoon op status=afgewezen (nooit hard delete)', p?.status === 'afgewezen', p?.status)
  }
  {
    const { data: v } = await admin.from('goedkeuringsverzoek').select('status').eq('id', dupVerzoekId).single()
    check('het verzoek zelf staat op status=afgewezen', v?.status === 'afgewezen', v?.status)
  }

  // ===== 9. Correctie-spoor: onuitwisbaar, ook buiten de RPC's om =====
  {
    const voor = await admin.from('correctie_log').select('id', { count: 'exact', head: true }).eq('record_id', dupPersoonId)
    await admin.from('personen').update({ naam: 'CMTEST Jan Jansen (gecorrigeerd)' }).eq('id', dupPersoonId)
    const { data: log } = await admin.from('correctie_log').select('van_waarde, naar_waarde').eq('record_id', dupPersoonId).eq('veld', 'naam').order('wanneer', { ascending: false }).limit(1)
    check('directe naam-wijziging (buiten elke RPC om) laat toch een correctie_log-regel achter', log?.[0]?.naar_waarde === 'CMTEST Jan Jansen (gecorrigeerd)', JSON.stringify(log))
    check('setup: er was nog geen correctie_log-regel vóór de wijziging', (voor.count ?? 0) === 0, voor.count)
  }
  {
    const { data: logRij } = await admin.from('correctie_log').select('id').eq('record_id', dupPersoonId).eq('veld', 'naam').limit(1).single()
    const { error: updErr } = await admin.from('correctie_log').update({ naar_waarde: 'geknoeid' }).eq('id', logRij.id)
    check('correctie_log is onveranderlijk, ook voor service-role', !!updErr, updErr ? 'geweigerd' : 'TOEGESTAAN!')
    const { error: delErr } = await admin.from('correctie_log').delete().eq('id', logRij.id)
    check('correctie_log-regel kan niet verwijderd worden, ook niet door service-role', !!delErr, delErr ? 'geweigerd' : 'TOEGESTAAN!')
  }
  {
    // Een reeds behandeld goedkeuringsverzoek ligt vast — ook voor service-role.
    const { error } = await admin.from('goedkeuringsverzoek').update({ reden_afwijzing: 'geknoeid' }).eq('id', dupVerzoekId)
    check('een behandeld goedkeuringsverzoek is bevroren, ook voor service-role', !!error, error ? 'geweigerd' : 'TOEGESTAAN!')
  }
}

async function cleanup() {
  if (companyIds.length) {
    // Cascade via FK's op company_id ruimt personen/pva/toolbox/inspectie/
    // goedkeuringsverzoek/correctie_log op.
    await admin.from('companies').delete().in('id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* */ } }
  }
}

console.log('======== Concept-medewerkers + goedkeuring + correctie-spoor (B1) ========')
let setupOk = true
try { await run() } catch (e) { console.error('FOUT:', e.message); setupOk = false }
finally {
  console.log('\n=== OPRUIMEN ===')
  try { await cleanup(); console.log('  opgeruimd.') } catch (e) { console.error('  opruimen faalde:', e.message) }
}
const fail = results.filter(r => !r.ok).length
console.log(`\n## Concept-medewerkers (B1) -> ${fail === 0 && setupOk ? 'PASS' : 'FAIL'} (${results.length - fail}/${results.length})`)
process.exit(fail === 0 && setupOk ? 0 : 1)
