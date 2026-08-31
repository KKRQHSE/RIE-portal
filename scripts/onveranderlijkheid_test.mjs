// ============================================================================
// Onveranderlijkheid — blijft vastgelegd bewijs echt vastliggen?
// ----------------------------------------------------------------------------
// Aanleiding (nachttest 31 aug 2026). Het portaal legt dingen vast die later als
// bewijs dienen: een afgeronde toolbox-deelname en een afgeronde inspectie met
// zijn historie. De vraag is niet of de APP ze met rust laat, maar of ze te
// wijzigen zijn langs de app om — met een gewone ingelogde sessie via PostgREST,
// of met de service role.
//
// Het verschil dat dit script blootlegt:
//
//   * toolbox_deelname heeft een BEFORE UPDATE-TRIGGER. Die geldt voor iedereen,
//     ook voor service_role. Echt bevroren.
//   * inspectie / inspectie_bevinding / inspectie_historie hebben een ALL-policy
//     (mag_bedrijf_beheren). De "afgerond = bevroren"-regel zit alléén in de
//     RPC's. Wie de RPC's overslaat, komt er langs.
//
// DEEL 3 en 4 FALEN op dit moment BEWUST. Dat is de openstaande bevinding uit
// NACHTTEST_RAPPORT_2026-08-31.md, niet een kapotte test. Zodra het voorstel uit
// dat rapport is doorgevoerd horen ze groen te worden.
//
// Draaien:  node --use-system-ca scripts/onveranderlijkheid_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles draait op wegwerp-
// bedrijven met prefix ONVTEST_ en wordt in het finally-blok opgeruimd. Er wordt
// geen bestaande data gelezen of gewijzigd.
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

if (!URL || !ANON) { console.error('SUPABASE-URL/ANON ontbreken in .env.local.'); process.exit(1) }
if (!SERVICE) { console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt; test overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Onvtest!' + TS
const companyIds = []
const userIds = []
const results = []

const check = (naam, ok, detail) => {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

async function maakOpstelling() {
  const { data: comp, error } = await admin.from('companies')
    .insert({ name: `ONVTEST_${TS}` }).select('id').single()
  if (error) throw new Error(`company: ${error.message}`)
  companyIds.push(comp.id)
  await admin.from('bedrijf_modules').insert({
    company_id: comp.id, module: 'inspectie', actief: true, module_status: 'actief',
  })

  // --- KAM van dit bedrijf, met een echte sessie ---
  const email = `onvtest_${TS}@example.test`
  const { data: created, error: eu } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (eu) throw new Error(`createUser: ${eu.message}`)
  userIds.push(created.user.id)
  await admin.from('users').upsert({
    id: created.user.id, email, role: 'client', company_id: comp.id, naam: 'ONVTEST KAM',
  })
  const kam = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await kam.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn: ${e2.message}`)

  // --- Een inspectie met twee bevindingen ---
  const { data: sjab } = await admin.from('inspectie_sjabloon')
    .insert({ company_id: comp.id, naam: 'ONVTEST rondgang', controlesoort: 'rondgang', actief: true })
    .select('id').single()
  const { data: insp } = await admin.from('inspectie').insert({
    company_id: comp.id, sjabloon_id: sjab.id, status: 'concept',
    sjabloon_naam_snap: 'ONVTEST rondgang', controlesoort_snap: 'rondgang',
  }).select('id').single()
  const { data: bev } = await admin.from('inspectie_bevinding').insert({
    company_id: comp.id, inspectie_id: insp.id, punt_tekst_snap: 'ONVTEST punt',
    verplicht: false, volgorde: 1, resultaat: 'in_orde', afhandeling: 'geen',
    opmerking: 'ONVTEST oorspronkelijke toelichting',
  }).select('id').single()

  // --- Een afgeronde toolbox-deelname (het bewijsrecord) ---
  const { data: pers } = await admin.from('personen')
    .insert({ company_id: comp.id, naam: 'ONVTEST persoon', status: 'actief' })
    .select('id').single()
  const { data: deelname, error: eDeel } = await admin.from('toolbox_deelname').insert({
    company_id: comp.id, persoon_id: pers.id,
    titel_snap: 'ONVTEST toolbox',
    tekst_snap: 'ONVTEST instructietekst',
    bevestigde_naam: 'ONVTEST Bevroren Naam',
    afgerond_op: new Date().toISOString(),
    bewijssoort: 'digitaal',
    naam_bevestigd: true,
    handtekening: 'data:image/png;base64,ONVTESThandtekening',
    // Vereist door de check-constraint deelname_digitaal_bewijs: een digitaal
    // bewijs zonder tijdstempel op de handtekening bestaat niet.
    handtekening_gezet_op: new Date().toISOString(),
  }).select('*').single()
  if (eDeel) console.log(`  (toolbox_deelname insert: ${eDeel.message})`)

  return { companyId: comp.id, kam, inspectieId: insp.id, bevindingId: bev.id, deelname }
}

async function opruimen() {
  if (companyIds.length) {
    for (const tbl of [
      'toolbox_deelname', 'inspectie_ai_suggestie', 'inspectie_foto', 'inspectie_historie',
      'inspectie_bevinding', 'inspectie', 'inspectie_sjabloon_punt', 'inspectie_sjabloon',
      'bedrijf_modules', 'personen', 'pva_items',
    ]) {
      try { await admin.from(tbl).delete().in('company_id', companyIds) } catch { /* mogelijk leeg */ }
    }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

async function run() {
  const T = await maakOpstelling()
  console.log(`Wegwerpbedrijf: ${T.companyId}\n`)

  // =====================================================================
  // DEEL 1 — toolbox_deelname: hard bevroren door een trigger
  // =====================================================================
  console.log('DEEL 1 — het afgeronde toolbox-bewijsrecord\n')
  if (!T.deelname) {
    check('toolbox_deelname kon worden aangemaakt voor de test', false, 'insert mislukt; DEEL 1 overgeslagen')
  } else {
    const id = T.deelname.id
    // Elke kolom apart, met de SERVICE ROLE — die omzeilt RLS, dus als iets
    // hier doorkomt is het record niet echt onveranderlijk.
    const pogingen = [
      ['bevestigde_naam', { bevestigde_naam: 'ONVTEST GEHACKT' }],
      ['handtekening', { handtekening: 'data:image/png;base64,ANDERS' }],
      ['afgerond_op', { afgerond_op: new Date(Date.now() - 86400000).toISOString() }],
      ['bewijssoort', { bewijssoort: 'fysiek_aanwezig' }],
      ['tekst_snap', { tekst_snap: 'ONVTEST vervalste instructietekst' }],
      ['titel_snap', { titel_snap: 'ONVTEST vervalste titel' }],
      ['persoon_id', { persoon_id: null }],
      ['company_id', { company_id: null }],
    ]
    for (const [kolom, patch] of pogingen) {
      const { error } = await admin.from('toolbox_deelname').update(patch).eq('id', id)
      check(`service_role kan ${kolom} NIET wijzigen`, !!error,
        error ? `geweigerd: ${String(error.message).slice(0, 55)}` : 'GELUKT — niet onveranderlijk!')
    }
    {
      const { error } = await T.kam.from('toolbox_deelname')
        .update({ bevestigde_naam: 'ONVTEST KAM GEHACKT' }).eq('id', id)
      const { data: na } = await admin.from('toolbox_deelname').select('bevestigde_naam').eq('id', id).single()
      check('een ingelogde KAM kan het bewijsrecord niet wijzigen',
        !!error || na?.bevestigde_naam === 'ONVTEST Bevroren Naam',
        error ? 'geweigerd' : `naam=${na?.bevestigde_naam}`)
    }
    {
      const { data: na } = await admin.from('toolbox_deelname').select('bevestigde_naam, handtekening').eq('id', id).single()
      check('na alle pogingen is het record letterlijk ongewijzigd',
        na?.bevestigde_naam === 'ONVTEST Bevroren Naam'
        && na?.handtekening === 'data:image/png;base64,ONVTESThandtekening')
    }
    {
      // De trigger dekt UPDATE. Verwijderen is een ander verhaal — vastleggen
      // wat er gebeurt, want "onveranderlijk" en "onverwijderbaar" is niet
      // hetzelfde en dat hoort bewust gekozen te zijn.
      const { error } = await T.kam.from('toolbox_deelname').delete().eq('id', id)
      const { data: na } = await admin.from('toolbox_deelname').select('id').eq('id', id)
      check('een ingelogde KAM kan het bewijsrecord ook niet VERWIJDEREN',
        (na?.length ?? 0) === 1,
        error ? 'geweigerd' : `${na?.length ?? 0} rijen over`)
    }
  }

  // =====================================================================
  // DEEL 2 — afgeronde inspectie: de RPC-kant
  // =====================================================================
  console.log('\nDEEL 2 — afgeronde inspectie via de RPC\'s (de bedoelde weg)\n')
  {
    const { error } = await T.kam.rpc('inspectie_afronden', {
      p_inspectie_id: T.inspectieId, p_conclusie: 'ONVTEST conclusie',
    })
    check('de inspectie kan worden afgerond', !error, error?.message?.slice(0, 60))
  }
  {
    const { error } = await T.kam.rpc('bevinding_opslaan', {
      p_bevinding_id: T.bevindingId, p_resultaat: 'niet_in_orde',
      p_afhandeling: 'geen', p_opmerking: 'ONVTEST via RPC gewijzigd',
    })
    check('bevinding_opslaan weigert op een afgeronde inspectie',
      !!error && /afgerond/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    const { error } = await T.kam.rpc('inspectie_afronden', {
      p_inspectie_id: T.inspectieId, p_conclusie: 'nogmaals',
    })
    check('een tweede keer afronden wordt geweigerd',
      !!error && /al afgerond/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    const { error } = await T.kam.rpc('inspectie_conclusie_opslaan', {
      p_inspectie_id: T.inspectieId, p_conclusie: 'ONVTEST conclusie gewijzigd',
    })
    check('de conclusie van een afgeronde inspectie kan niet meer via de RPC',
      !!error, error ? `geweigerd: ${String(error.message).slice(0, 50)}` : 'GELUKT')
  }

  // =====================================================================
  // DEEL 3 — afgeronde inspectie: langs de RPC's om (PostgREST)
  // =====================================================================
  console.log('\nDEEL 3 — afgeronde inspectie langs de RPC\'s om\n')
  {
    const { error } = await T.kam.from('inspectie_bevinding')
      .update({ opmerking: 'ONVTEST rechtstreeks gewijzigd' }).eq('id', T.bevindingId)
    const { data: na } = await admin.from('inspectie_bevinding')
      .select('opmerking').eq('id', T.bevindingId).single()
    check('KAM kan de toelichting van een AFGERONDE bevinding niet rechtstreeks wijzigen',
      na?.opmerking === 'ONVTEST oorspronkelijke toelichting',
      error ? 'geweigerd' : `opmerking is nu: ${String(na?.opmerking).slice(0, 45)}`)
  }
  {
    // Bewust een ANDERE waarde dan de bestaande ('in_orde'), anders bewijst de
    // controle niets.
    const { error } = await T.kam.from('inspectie_bevinding')
      .update({ resultaat: 'niet_in_orde' }).eq('id', T.bevindingId)
    const { data: na } = await admin.from('inspectie_bevinding')
      .select('resultaat').eq('id', T.bevindingId).single()
    check('KAM kan het RESULTAAT van een afgeronde bevinding niet rechtstreeks wijzigen',
      na?.resultaat === 'in_orde',
      error ? 'geweigerd' : `resultaat is nu: ${na?.resultaat}`)
  }
  {
    const { error } = await T.kam.from('inspectie')
      .update({ status: 'concept' }).eq('id', T.inspectieId)
    const { data: na } = await admin.from('inspectie').select('status').eq('id', T.inspectieId).single()
    check('KAM kan een afgeronde inspectie niet heropenen',
      na?.status === 'afgerond',
      error ? 'geweigerd' : `status is nu: ${na?.status}`)
  }
  {
    const { error } = await T.kam.from('inspectie')
      .update({ conclusie: 'ONVTEST conclusie rechtstreeks vervangen' }).eq('id', T.inspectieId)
    const { data: na } = await admin.from('inspectie').select('conclusie').eq('id', T.inspectieId).single()
    check('KAM kan de conclusie niet rechtstreeks vervangen',
      na?.conclusie === 'ONVTEST conclusie',
      error ? 'geweigerd' : `conclusie is nu: ${String(na?.conclusie).slice(0, 45)}`)
  }
  {
    const { error } = await T.kam.from('inspectie_bevinding').delete().eq('id', T.bevindingId)
    const { data: na } = await admin.from('inspectie_bevinding').select('id').eq('id', T.bevindingId)
    check('KAM kan een bevinding van een afgeronde inspectie niet verwijderen',
      (na?.length ?? 0) === 1,
      error ? 'geweigerd' : `${na?.length ?? 0} rijen over`)
  }

  // =====================================================================
  // DEEL 4 — de historie: het spoor dat wijzigingen zichtbaar maakt
  // =====================================================================
  console.log('\nDEEL 4 — de inspectiehistorie\n')
  {
    const { data: voor } = await admin.from('inspectie_historie')
      .select('id, wijziging').eq('inspectie_id', T.inspectieId)
    check('er staat historie bij deze inspectie', (voor?.length ?? 0) > 0, `${voor?.length ?? 0} regels`)

    if ((voor?.length ?? 0) > 0) {
      const regelId = voor[0].id
      {
        const { error } = await T.kam.from('inspectie_historie')
          .update({ wijziging: 'ONVTEST historie herschreven' }).eq('id', regelId)
        const { data: na } = await admin.from('inspectie_historie')
          .select('wijziging').eq('id', regelId).single()
        check('KAM kan een historieregel niet herschrijven',
          na?.wijziging === voor[0].wijziging,
          error ? 'geweigerd' : `regel is nu: ${String(na?.wijziging).slice(0, 45)}`)
      }
      {
        const { error } = await T.kam.from('inspectie_historie').delete().eq('id', regelId)
        const { data: na } = await admin.from('inspectie_historie').select('id').eq('id', regelId)
        check('KAM kan een historieregel niet verwijderen',
          (na?.length ?? 0) === 1,
          error ? 'geweigerd' : `${na?.length ?? 0} rijen over`)
      }
      {
        const { error } = await T.kam.from('inspectie_historie').insert({
          company_id: T.companyId, inspectie_id: T.inspectieId,
          wie: null, wanneer: new Date().toISOString(),
          wijziging: 'ONVTEST verzonnen historieregel',
        })
        const { data: na } = await admin.from('inspectie_historie')
          .select('id').eq('inspectie_id', T.inspectieId)
          .like('wijziging', 'ONVTEST verzonnen%')
        check('KAM kan geen historieregel VERZINNEN',
          (na?.length ?? 0) === 0,
          error ? 'geweigerd' : `${na?.length ?? 0} verzonnen regels aangemaakt`)
      }
    }
  }
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de test:', e.message)
  exitCode = 1
} finally {
  try { await opruimen(); console.log('\nOpgeruimd: alle ONVTEST_-data verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} controles geslaagd.`)
if (falen > 0) {
  console.log('\nLET OP: falende controles in DEEL 3/4 zijn de bekende openstaande')
  console.log('bevinding uit NACHTTEST_RAPPORT_2026-08-31.md, geen kapotte test.')
  exitCode = 1
}
process.exitCode = exitCode
