// ============================================================================
// Werkplekinspectie — end-to-end test met een ECHTE ingelogde KAM-sessie.
// ----------------------------------------------------------------------------
// Doorloopt de volledige RPC-flow als ingelogde 'client' (auth.uid actief, dus
// mag_bedrijf_beheren wordt echt geëvalueerd):
//   sjabloon_opslaan -> punt_opslaan -> inspectie_start -> bevinding_opslaan
//   -> bevinding_naar_actie (+ idempotentie) -> inspectie_conclusie_opslaan
//   -> inspectie_afronden, inclusief de twee afrond-blokkades en de
//   "niet meer bewerkbaar"-check.
//
// Alles draait op een wegwerp-testbedrijf (prefix E2ETEST_) dat in een
// finally-blok volledig wordt opgeruimd, ook bij fouten. Geen echte mail.
// Vereist SUPABASE_SERVICE_ROLE_KEY + DATABASE-onafhankelijk (werkt via de JS-API).
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
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
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
if (!URL || !ANON || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / ANON / SUPABASE_SERVICE_ROLE_KEY ontbreken in .env.local')
  process.exit(2)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'E2etest!' + TS

let companyId = null
let userId = null
const results = []
function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function run() {
  // --- opzet via service role ---
  const { data: comp, error: ec } = await admin
    .from('companies').insert({ name: `E2ETEST_${TS}` }).select('id').single()
  if (ec) throw new Error('companies insert: ' + ec.message)
  companyId = comp.id
  await admin.from('bedrijf_modules').insert({ company_id: companyId, module: 'inspectie', actief: true })

  const email = `e2etest_${TS}@example.test`
  const { data: created, error: eu } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (eu) throw new Error('createUser: ' + eu.message)
  userId = created.user.id
  const { error: eup } = await admin.from('users').upsert({ id: userId, email, role: 'client', company_id: companyId, naam: 'E2E KAM' })
  if (eup) throw new Error('users upsert: ' + eup.message)

  // --- ingelogde KAM-sessie ---
  const kam = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: esi } = await kam.auth.signInWithPassword({ email, password: PW })
  if (esi) throw new Error('signIn: ' + esi.message)

  // 1. Sjabloon aanmaken
  const r1 = await kam.rpc('sjabloon_opslaan', { p_sjabloon_id: null, p_company_id: companyId, p_naam: 'E2E rondgang', p_controlesoort: 'werkplek' })
  check('sjabloon_opslaan maakt sjabloon', !r1.error && !!r1.data, r1.error?.message)
  const sjabloonId = r1.data

  // 2. Punten toevoegen (2 verplicht, 1 niet)
  const p1 = await kam.rpc('punt_opslaan', { p_punt_id: null, p_sjabloon_id: sjabloonId, p_tekst: 'Nooduitgang vrij?', p_verplicht: true, p_volgorde: null })
  const p2 = await kam.rpc('punt_opslaan', { p_punt_id: null, p_sjabloon_id: sjabloonId, p_tekst: 'Blusser gekeurd?', p_verplicht: true, p_volgorde: null })
  const p3 = await kam.rpc('punt_opslaan', { p_punt_id: null, p_sjabloon_id: sjabloonId, p_tekst: 'Koffiehoek netjes?', p_verplicht: false, p_volgorde: null })
  check('punt_opslaan voegt 3 punten toe', !p1.error && !p2.error && !p3.error, p1.error?.message || p2.error?.message || p3.error?.message)

  // 3. Inspectie starten (maakt bevindingen vooraf)
  const r3 = await kam.rpc('inspectie_start', { p_sjabloon_id: sjabloonId })
  check('inspectie_start geeft inspectie_id', !r3.error && !!r3.data, r3.error?.message)
  const inspectieId = r3.data

  // 4. Bevindingen ophalen (RLS: eigen bedrijf) — moeten 3 zijn, resultaat NULL, met snapshots
  const bev = await kam.from('inspectie_bevinding')
    .select('id, punt_tekst_snap, resultaat, afhandeling, verplicht, volgorde, actie_id')
    .eq('inspectie_id', inspectieId).order('volgorde', { ascending: true })
  const rows = bev.data ?? []
  check('3 bevindingen vooraf aangemaakt, resultaat NULL + snapshots',
    !bev.error && rows.length === 3 && rows.every(b => b.resultaat === null) &&
    rows.filter(b => b.verplicht).length === 2 && rows.every(b => b.afhandeling === 'geen'),
    `${rows.length} rijen`)
  const byTekst = t => rows.find(b => b.punt_tekst_snap === t)
  const bNood = byTekst('Nooduitgang vrij?')
  const bBlusser = byTekst('Blusser gekeurd?')

  // 5. Afronden vóór beoordeling → moet FALEN (verplichte punten zonder resultaat)
  const a1 = await kam.rpc('inspectie_afronden', { p_inspectie_id: inspectieId, p_conclusie: null })
  check('afronden geblokkeerd: verplichte punten zonder resultaat', !!a1.error, a1.error ? 'geweigerd' : 'GEEN fout!')

  // 6. Punt 1 → in orde
  const s1 = await kam.rpc('bevinding_opslaan', { p_bevinding_id: bNood.id, p_resultaat: 'in_orde', p_afhandeling: 'geen', p_opmerking: null })
  check('bevinding_opslaan: in orde', !s1.error, s1.error?.message)

  // 7. Punt 2 → niet in orde, nog onafgehandeld (tussenstadium)
  const s2 = await kam.rpc('bevinding_opslaan', { p_bevinding_id: bBlusser.id, p_resultaat: 'niet_in_orde', p_afhandeling: 'geen', p_opmerking: null })
  check('bevinding_opslaan: niet_in_orde (tussenstadium toegestaan)', !s2.error, s2.error?.message)

  // 8. Afronden → moet FALEN (niet_in_orde onafgehandeld)
  const a2 = await kam.rpc('inspectie_afronden', { p_inspectie_id: inspectieId, p_conclusie: null })
  check('afronden geblokkeerd: niet_in_orde onafgehandeld', !!a2.error, a2.error ? 'geweigerd' : 'GEEN fout!')

  // 9. meteen_hersteld zonder toelichting → moet FALEN (bewijs verplicht)
  const s3 = await kam.rpc('bevinding_opslaan', { p_bevinding_id: bBlusser.id, p_resultaat: 'niet_in_orde', p_afhandeling: 'meteen_hersteld', p_opmerking: '   ' })
  check('meteen_hersteld zonder toelichting geweigerd', !!s3.error, s3.error ? 'geweigerd' : 'GEEN fout!')

  // 10. Punt 2 → actie aanmaken (PvA)
  const na = await kam.rpc('bevinding_naar_actie', { p_bevinding_id: bBlusser.id })
  check('bevinding_naar_actie maakt PvA-actie', !na.error && !!na.data, na.error?.message)
  const actieId = na.data

  // 11. Idempotent: nog eens → zelfde actie_id
  const na2 = await kam.rpc('bevinding_naar_actie', { p_bevinding_id: bBlusser.id })
  check('bevinding_naar_actie is idempotent', !na2.error && na2.data === actieId, `${na2.data} vs ${actieId}`)

  // 12. PvA-actie klopt: status Open, juiste bron-koppeling, juist bedrijf
  const pva = await kam.from('pva_items').select('id, company_id, status, bron_type, bron_id, onderwerp').eq('id', actieId).single()
  check('PvA-actie correct (Open, bron=inspectie_bevinding, juist bedrijf)',
    !pva.error && pva.data && pva.data.status === 'Open' && pva.data.bron_type === 'inspectie_bevinding' &&
    pva.data.bron_id === bBlusser.id && pva.data.company_id === companyId, pva.error?.message)

  // 13. Bevinding 2 staat nu op afhandeling 'actie' met actie_id
  const bev2 = await kam.from('inspectie_bevinding').select('afhandeling, actie_id, resultaat').eq('id', bBlusser.id).single()
  check('bevinding op afhandeling=actie met actie_id', !bev2.error && bev2.data.afhandeling === 'actie' && bev2.data.actie_id === actieId && bev2.data.resultaat === 'niet_in_orde')

  // 14. Conclusie opslaan
  const c1 = await kam.rpc('inspectie_conclusie_opslaan', { p_inspectie_id: inspectieId, p_conclusie: 'Algemeen netjes, één punt opgevolgd.' })
  check('inspectie_conclusie_opslaan', !c1.error, c1.error?.message)

  // 15. Afronden → moet nu LUKKEN (verplichte punten beoordeeld + afgehandeld; punt 3 niet verplicht mag leeg)
  const a3 = await kam.rpc('inspectie_afronden', { p_inspectie_id: inspectieId, p_conclusie: null })
  check('inspectie_afronden lukt nu', !a3.error, a3.error?.message)

  // 16. Inspectie is afgerond, uitgevoerd_op gezet, conclusie bewaard
  const insp = await kam.from('inspectie').select('status, uitgevoerd_op, conclusie').eq('id', inspectieId).single()
  check('inspectie afgerond + uitgevoerd_op + conclusie',
    !insp.error && insp.data.status === 'afgerond' && !!insp.data.uitgevoerd_op && !!insp.data.conclusie, insp.error?.message)

  // 17. Historie gevuld (gestart + actie + afgerond)
  const hist = await kam.from('inspectie_historie').select('wijziging').eq('inspectie_id', inspectieId)
  const teksten = (hist.data ?? []).map(h => h.wijziging).join(' | ')
  check('historie bevat gestart/actie/afgerond',
    !hist.error && /gestart/i.test(teksten) && /actie/i.test(teksten) && /afgerond/i.test(teksten), teksten)

  // 18. Na afronden niet meer bewerkbaar
  const s4 = await kam.rpc('bevinding_opslaan', { p_bevinding_id: bNood.id, p_resultaat: 'nvt', p_afhandeling: 'geen', p_opmerking: null })
  check('bewerken na afronden geweigerd', !!s4.error, s4.error ? 'geweigerd' : 'GEEN fout!')
}

async function cleanup() {
  if (companyId) {
    for (const tbl of ['pva_items', 'inspectie_historie', 'inspectie_bevinding', 'inspectie',
                       'inspectie_sjabloon_punt', 'inspectie_sjabloon', 'bedrijf_modules', 'personen']) {
      await admin.from(tbl).delete().eq('company_id', companyId)
    }
  }
  if (userId) {
    await admin.from('users').delete().eq('id', userId)
    try { await admin.auth.admin.deleteUser(userId) } catch { /* */ }
  }
  if (companyId) await admin.from('companies').delete().eq('id', companyId)
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de test:', e.message)
  exitCode = 1
} finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle E2ETEST_-data en testgebruiker verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
