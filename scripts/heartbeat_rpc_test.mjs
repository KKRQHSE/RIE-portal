// ============================================================================
// Heartbeat-RPC — regressietest (bewijs)
// ----------------------------------------------------------------------------
// Gevonden in de systeemdoorlichting van 4 september 2026 (bevinding 1.2):
// de automatische herinner-heartbeat draait met de service-role, maar
// herinner_kandidaten eiste tot nu toe mag_bedrijf_beheren() — die leunt op
// auth.uid(), dat er bij de service-role niet is. Voor élk bedrijf faalde
// dus élke aanroep, altijd "Geen toegang", verstuurd bleef altijd 0.
//
// Migratie 0064 accepteert nu ook auth.role() = 'service_role'. Dit script
// bewijst op RPC-niveau (geen echte e-mail, geen HTTP-route nodig) dat:
//   1. de service-role nu wél kandidaten terugkrijgt voor een bedrijf met een
//      actief ritme en een openstaande actie;
//   2. het ritme zelf nog steeds filtert (ritme='uit' → geen kandidaten,
//      ook niet voor de service-role — de fix opende geen sluipweg);
//   3. een gewone ingelogde sessie van een ANDER bedrijf nog steeds wordt
//      geweigerd — de fix is een uitzondering voor service_role, geen
//      algemene verruiming.
//
// Draaien:   node --use-system-ca scripts/heartbeat_rpc_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles draait op een
// wegwerpbedrijf met prefix HBTEST_ en wordt in het finally-blok opgeruimd.
// Er wordt GEEN e-mail verstuurd — dit script roept alleen de RPC aan, niet
// de HTTP-route/Resend.
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
  } catch { /* geen .env.local */ }
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
  console.log('  De heartbeat-RPC-test wordt overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Hbtest!' + TS
const results = []
const companyIds = []
const userIds = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label, ritme) {
  const { data: comp, error } = await admin.from('companies')
    .insert({ name: `HBTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)
  await admin.from('herinner_instelling').insert({ company_id: comp.id, ritme })
  return comp.id
}

async function maakKandidaat(companyId, label) {
  const { data: pers, error: pe } = await admin.from('personen')
    .insert({ company_id: companyId, naam: `HBTEST ${label}`, status: 'actief', email: `hbtest_${label}_${TS}@example.test` })
    .select('id').single()
  if (pe) throw new Error(`personen insert: ${pe.message}`)
  const { error: de } = await admin.from('deellinks')
    .insert({ company_id: companyId, persoon_id: pers.id, token: `hbtest_${label}_${TS}`, ingetrokken: false })
  if (de) throw new Error(`deellinks insert: ${de.message}`)
  const { error: ae } = await admin.from('pva_items')
    .insert({ company_id: companyId, persoon_id: pers.id, nr: `HBTEST-${label}`, onderwerp: 'HBTEST openstaande actie', status: 'Open' })
  if (ae) throw new Error(`pva_items insert: ${ae.message}`)
  return pers.id
}

async function maakKamSessie(companyId, label) {
  const email = `hbtest_kam_${label}_${TS}@example.test`
  const { data: created, error: eu } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (eu) throw new Error(`createUser: ${eu.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({ id: created.user.id, email, role: 'client', company_id: companyId, naam: `HBTEST KAM ${label}` })
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn: ${e2.message}`)
  return client
}

async function opruimen() {
  if (companyIds.length) {
    for (const tbl of ['pva_items', 'deellinks', 'herinnering_log', 'personen', 'herinner_instelling']) {
      try { await admin.from(tbl).delete().in('company_id', companyIds) } catch { /* mogelijk leeg */ }
    }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
  console.log('Opgeruimd: alle HBTEST_-data verwijderd.')
}

async function run() {
  const compAan = await maakBedrijf('aan', 'dagelijks')
  await maakKandidaat(compAan, 'kandidaat')

  const compUit = await maakBedrijf('uit', 'uit')

  // --- 1: service-role krijgt nu kandidaten voor een bedrijf met actief ritme ---
  {
    const { data, error } = await admin.rpc('herinner_kandidaten', { p_company_id: compAan, p_alleen_ritme: true })
    check('service-role krijgt GEEN "Geen toegang" meer (was: het gat)', !error, error?.message)
    check('service-role krijgt de openstaande kandidaat terug', (data ?? []).length === 1, `${(data ?? []).length} kandidaten`)
  }

  // --- 2: ritme='uit' blijft nul kandidaten opleveren, ook voor service-role ---
  {
    const { data, error } = await admin.rpc('herinner_kandidaten', { p_company_id: compUit, p_alleen_ritme: true })
    check('ritme=uit levert nog steeds nul kandidaten op (geen sluipweg)', !error && (data ?? []).length === 0,
      error ? error.message : `${(data ?? []).length} kandidaten`)
  }

  // --- 3: een gewone sessie van een ANDER bedrijf wordt nog steeds geweigerd ---
  {
    const kamAnders = await maakKamSessie(compUit, 'buitenstaander')
    const { error } = await kamAnders.rpc('herinner_kandidaten', { p_company_id: compAan, p_alleen_ritme: true })
    check('een KAM van een ANDER bedrijf wordt nog steeds geweigerd (geen algemene verruiming)',
      !!error && /geen toegang/i.test(error.message || ''), error?.message)
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
  process.exitCode = mislukt.length ? 1 : 0
}

try {
  await run()
} finally {
  await opruimen()
}
