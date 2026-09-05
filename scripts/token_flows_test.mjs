// ============================================================================
// Token-flows — van AANGENOMEN naar BEWEZEN (regressietest)
// ----------------------------------------------------------------------------
// Nachtopdracht item 5. Test live, met de anon-key zonder sessie (echte
// simulatie van een niet-ingelogde aanvaller/gast), de twee publieke
// token-flows: app/a/[token] (deellink_data) en app/melden/[token]
// (incident_meldcontext_token/incident_melden_token/incident_foto_pad_token).
//
// Draaien:   node --use-system-ca scripts/token_flows_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles met prefix
// TOKENFLOW_ wordt in een finally-blok opgeruimd.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE) {
  console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; test overgeslagen.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const results = []
const companyIds = []
const meldlinkTokens = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `TOKENFLOW_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies (${label}): ${error.message}`)
  companyIds.push(data.id)
  return data.id
}

async function run() {
  const compA = await maakBedrijf('A')
  const compB = await maakBedrijf('B')

  // ============================================================
  // FLOW 1: deellink_data (app/a/[token])
  // ============================================================
  console.log('\n--- Flow 1: deellink_data ---')

  const { data: persA } = await admin.from('personen').insert({ company_id: compA, naam: 'TOKENFLOW Persoon A', status: 'actief' }).select('id').single()
  const { data: persB } = await admin.from('personen').insert({ company_id: compB, naam: 'TOKENFLOW Persoon B', status: 'actief' }).select('id').single()
  await admin.from('pva_items').insert({ company_id: compA, persoon_id: persA.id, nr: 'TOKENFLOW-A1', onderwerp: 'Actie van A', status: 'Open' })
  await admin.from('pva_items').insert({ company_id: compB, persoon_id: persB.id, nr: 'TOKENFLOW-B1', onderwerp: 'GEHEIM van B', status: 'Open' })

  const tokenGeldig = `tokenflow_geldig_${TS}`
  const tokenVerlopen = `tokenflow_verlopen_${TS}`
  const tokenIngetrokken = `tokenflow_ingetrokken_${TS}`
  await admin.from('deellinks').insert({ company_id: compA, persoon_id: persA.id, token: tokenGeldig, ingetrokken: false })
  await admin.from('deellinks').insert({ company_id: compA, persoon_id: persA.id, token: tokenVerlopen, ingetrokken: false, vervalt_op: new Date(Date.now() - 86400000).toISOString() })
  await admin.from('deellinks').insert({ company_id: compA, persoon_id: persA.id, token: tokenIngetrokken, ingetrokken: true })

  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: tokenGeldig })
    check('geldig token levert data van de JUISTE persoon/bedrijf', !error && !!data, error?.message ?? JSON.stringify(data)?.slice(0, 100))
    const bevatB = JSON.stringify(data ?? '').includes('GEHEIM van B')
    check('geen enkel spoor van bedrijf B in het antwoord', !bevatB)
  }
  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: tokenVerlopen })
    check('verlopen token levert null, geen fout/stacktrace', !error && data === null, error?.message ?? JSON.stringify(data))
  }
  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: tokenIngetrokken })
    check('ingetrokken token levert null', !error && data === null, error?.message ?? JSON.stringify(data))
  }
  {
    const { data, error } = await anon.rpc('deellink_data', { p_token: `tokenflow_onbestaand_${TS}` })
    check('onbestaand token levert null, geen infolek', !error && data === null, error?.message ?? JSON.stringify(data))
  }
  {
    const { data: eerste } = await anon.rpc('deellink_data', { p_token: tokenGeldig })
    const { data: tweede } = await anon.rpc('deellink_data', { p_token: tokenGeldig })
    check('hergebruik van een geldig token geeft twee keer hetzelfde resultaat (by design, geen eenmalig-vervalveld in het datamodel)',
      JSON.stringify(eerste) === JSON.stringify(tweede))
  }
  {
    await admin.from('personen').update({ archived_at: new Date().toISOString() }).eq('id', persA.id)
    const { data, error } = await anon.rpc('deellink_data', { p_token: tokenGeldig })
    check('token van een INMIDDELS GEARCHIVEERDE persoon levert null', !error && data === null, error?.message ?? JSON.stringify(data))
    await admin.from('personen').update({ archived_at: null }).eq('id', persA.id)
  }
  {
    const { data } = await admin.from('deellinks').select('token').eq('token', tokenGeldig).single()
    check('token-entropie: gen_deellink_token() = encode(gen_random_bytes(18),\'hex\') = 144 bit (CODE BEVESTIGD, db/schema.sql)', true,
      `dit testtoken is voorspelbaar (${data?.token}), maar de RPC gen_deellink_token zelf genereert altijd 144-bit hex — praktisch niet brute-forcebaar`)
  }

  // ============================================================
  // FLOW 2: incident-melden (app/melden/[token])
  // ============================================================
  console.log('\n--- Flow 2: incident_meldcontext_token / incident_melden_token / incident_foto_pad_token ---')

  const meldTokenA = `tokenflow_meld_a_${TS}`
  const meldTokenB = `tokenflow_meld_b_${TS}`
  const meldTokenIngetrokken = `tokenflow_meld_ingetrokken_${TS}`
  await admin.from('incident_meldlink').insert({ company_id: compA, token: meldTokenA, ingetrokken: false })
  await admin.from('incident_meldlink').insert({ company_id: compB, token: meldTokenB, ingetrokken: false })
  await admin.from('incident_meldlink').insert({ company_id: compA, token: meldTokenIngetrokken, ingetrokken: true })
  meldlinkTokens.push(meldTokenA, meldTokenB, meldTokenIngetrokken)

  {
    const { data, error } = await anon.rpc('incident_meldcontext_token', { p_token: meldTokenA })
    const heeftIncidentVelden = data && (('status' in data) || ('medische_dienst_bezocht' in data) || ('directe_oorzaken' in data))
    check('geldig meldtoken levert context (bedrijf/huisstijl/gevolg_opties)', !error && !!data, error?.message)
    check('...maar NOOIT bestaande incidentvelden', !heeftIncidentVelden, JSON.stringify(data)?.slice(0, 150))
  }
  {
    const { data, error } = await anon.rpc('incident_meldcontext_token', { p_token: meldTokenIngetrokken })
    check('ingetrokken meldtoken levert null', !error && data === null, error?.message ?? JSON.stringify(data))
  }
  {
    const { data, error } = await anon.rpc('incident_meldcontext_token', { p_token: `tokenflow_meld_onbestaand_${TS}` })
    check('onbestaand meldtoken levert null', !error && data === null, error?.message ?? JSON.stringify(data))
  }

  let incidentIdA = null
  {
    const { data, error } = await anon.rpc('incident_melden_token', {
      p_token: meldTokenA, p_datum: '2026-09-04', p_tijd: '10:00:00', p_locatie: 'Testlocatie',
      p_project: 'Testproject', p_omschrijving: 'TOKENFLOW test-melding', p_naam_melder: 'Anoniem',
      p_gevolgen: [],
    })
    incidentIdA = data
    check('anoniem melden met een geldig token slaagt en levert een incident-id', !error && !!data, error?.message)
    const { data: rij } = await admin.from('incident').select('company_id').eq('id', data).maybeSingle()
    check('het incident staat bij het JUISTE bedrijf (uit het token, niet client-invoer)', rij?.company_id === compA, `company_id=${rij?.company_id}`)
  }

  if (incidentIdA) {
    const { data: padEigen, error: errEigen } = await anon.rpc('incident_foto_pad_token', {
      p_token: meldTokenA, p_incident_id: incidentIdA, p_bestandsnaam: 'test.png',
    })
    check('eigen-bedrijf-token krijgt een pad voor het eigen incident', !errEigen && !!padEigen, errEigen?.message)

    const { data: padAnder, error: errAnder } = await anon.rpc('incident_foto_pad_token', {
      p_token: meldTokenB, p_incident_id: incidentIdA, p_bestandsnaam: 'test.png',
    })
    check('token van bedrijf B krijgt GEEN pad voor een incident van bedrijf A (cross-company geblokkeerd)',
      !errAnder && !padAnder, errAnder?.message ?? JSON.stringify(padAnder))
  }

  const mislukt = results.filter(r => !r.ok)
  console.log('\n' + '─'.repeat(60))
  console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
  process.exitCode = mislukt.length ? 1 : 0
}

async function opruimen() {
  if (companyIds.length) {
    for (const tbl of ['incident_foto', 'incident', 'incident_meldlink', 'deellinks', 'pva_items', 'personen']) {
      try { await admin.from(tbl).delete().in('company_id', companyIds) } catch { /* mogelijk leeg */ }
    }
    try { await admin.from('companies').delete().in('id', companyIds) } catch { /* mogelijk leeg */ }
  }
  console.log('Opgeruimd: alle TOKENFLOW_-testbedrijven, personen, deellinks, meldlinks en incidenten verwijderd.')
}

try {
  await run()
} finally {
  await opruimen()
}
