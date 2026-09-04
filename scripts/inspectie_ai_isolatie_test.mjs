// ============================================================================
// AI-foto-analyse bij de werkplekinspectie — negatieve isolatie-tests (bewijs)
// ----------------------------------------------------------------------------
// Toont aan dat het AI-voorwerk de bestaande bedrijfsisolatie niet oprekt en dat
// de mens-beslist-regel ook op databaseniveau afgedwongen wordt:
//
//   * anon kan de twee nieuwe RPC's niet eens aanroepen (Beslissing 62);
//   * bedrijf A kan geen suggestie opslaan op een foto van bedrijf B, en ziet
//     een suggestie van B niet (0 rijen via RLS);
//   * zonder toestemming = true weigert de RPC de opslag;
//   * een foto zonder inspectiepunt (bevinding_id null) wordt geweigerd;
//   * een verse suggestie raakt de bevinding NIET aan — pas het besluit
//     'overgenomen' schrijft de door de mens vastgestelde tekst weg;
//   * 'verworpen' laat de bevinding ongemoeid;
//   * een al beoordeelde suggestie kan niet nog eens beslist worden;
//   * bij een AFGERONDE inspectie kan er geen AI-voorwerk meer bij of af.
//
// Draaien:   node --use-system-ca scripts/inspectie_ai_isolatie_test.mjs
//
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local (om testbedrijven + auth-users
// aan te maken en achteraf op te ruimen). Ontbreekt die sleutel, dan meldt het
// script dat en slaat dit deel over (exit 0).
//
// Er gaat GEEN foto en GEEN aanroep naar een AI-dienst: de test voedt de RPC's
// met verzonnen tekst. Alles wat het script aanmaakt heeft de prefix AITEST_ en
// wordt in een finally-blok opgeruimd, ook als een test faalt.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// --- Mini .env.local-parser (geen extra dependency) ---
function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch {
    // geen .env.local — valt terug op process.env
  }
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
  console.log('  De isolatie-tests worden overgeslagen. Voeg de service-role-sleutel toe en draai opnieuw.')
  process.exit(0)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const PW = 'Aitest!' + TS

const companyIds = []
const userIds = []
const results = []

function check(naam, ok, detail) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// Een compleet bedrijf: inspectie met één bevinding, één foto bij die bevinding
// en één foto los bij de inspectie (bevinding_id null). Er wordt geen echt
// bestand geüpload; alleen de rij, want de RPC's kijken naar de rij.
async function maakBedrijf(label) {
  const { data: comp, error } = await admin
    .from('companies')
    .insert({ name: `AITEST_${label}_${TS}` })
    .select('id')
    .single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(comp.id)

  await admin.from('bedrijf_modules').insert({ company_id: comp.id, module: 'inspectie', actief: true })

  const { data: sjab, error: e1 } = await admin
    .from('inspectie_sjabloon')
    .insert({ company_id: comp.id, naam: `AITEST_sjabloon_${label}`, controlesoort: 'rondgang', actief: true })
    .select('id')
    .single()
  if (e1) throw new Error(`sjabloon insert (${label}): ${e1.message}`)

  const { data: insp, error: e2 } = await admin
    .from('inspectie')
    .insert({
      company_id: comp.id, sjabloon_id: sjab.id, status: 'concept',
      sjabloon_naam_snap: `AITEST_sjabloon_${label}`, controlesoort_snap: 'rondgang',
    })
    .select('id')
    .single()
  if (e2) throw new Error(`inspectie insert (${label}): ${e2.message}`)

  const { data: bev, error: e3 } = await admin
    .from('inspectie_bevinding')
    .insert({
      company_id: comp.id, inspectie_id: insp.id,
      punt_tekst_snap: 'Nooduitgang vrij?', resultaat: 'in_orde', afhandeling: 'geen',
    })
    .select('id')
    .single()
  if (e3) throw new Error(`bevinding insert (${label}): ${e3.message}`)

  // Foto bij het inspectiepunt.
  const { data: foto, error: e4 } = await admin
    .from('inspectie_foto')
    .insert({
      inspectie_id: insp.id, bevinding_id: bev.id, company_id: comp.id,
      storage_pad: `${comp.id}/${insp.id}/aitest_${label}.jpg`,
      bestandsnaam: `aitest_${label}.jpg`, type: 'image/jpeg', grootte: 1234,
    })
    .select('id')
    .single()
  if (e4) throw new Error(`foto insert (${label}): ${e4.message}`)

  // Foto los bij de inspectie (géén inspectiepunt) — mag geen AI-voorwerk krijgen.
  const { data: losseFoto, error: e5 } = await admin
    .from('inspectie_foto')
    .insert({
      inspectie_id: insp.id, bevinding_id: null, company_id: comp.id,
      storage_pad: `${comp.id}/${insp.id}/aitest_los_${label}.jpg`,
      bestandsnaam: `aitest_los_${label}.jpg`, type: 'image/jpeg', grootte: 1234,
    })
    .select('id')
    .single()
  if (e5) throw new Error(`losse foto insert (${label}): ${e5.message}`)

  return {
    companyId: comp.id, sjabloonId: sjab.id, inspectieId: insp.id,
    bevindingId: bev.id, fotoId: foto.id, losseFotoId: losseFoto.id,
  }
}

async function maakGebruiker(label, companyId) {
  const email = `aitest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  const id = created.user.id
  userIds.push(id)

  const { error: e } = await admin
    .from('users')
    .upsert({ id, email, role: 'client', company_id: companyId, naam: `AITEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

// Huidige toelichting van een bevinding, gelezen met de service role (dus zonder
// dat RLS het antwoord kleurt).
async function leesOpmerking(bevindingId) {
  const { data } = await admin
    .from('inspectie_bevinding').select('opmerking').eq('id', bevindingId).single()
  return data?.opmerking ?? null
}

async function leesResultaat(bevindingId) {
  const { data } = await admin
    .from('inspectie_bevinding').select('resultaat').eq('id', bevindingId).single()
  return data?.resultaat ?? null
}

async function run() {
  const A = await maakBedrijf('A')
  const B = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', A.companyId)
  await maakGebruiker('B', B.companyId)

  // --- 1. anon komt er niet eens bij (EXECUTE ingetrokken, Beslissing 62) ---
  {
    const { error } = await anon.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: true,
    })
    check('anon kan inspectie_ai_suggestie_opslaan niet aanroepen', !!error, error?.message?.slice(0, 60))
  }
  {
    const { error } = await anon.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: A.fotoId, p_besluit: 'overgenomen', p_bevindingen_gekozen: ['x'], p_acties_gekozen: [],
    })
    check('anon kan inspectie_ai_suggestie_besluit niet aanroepen', !!error, error?.message?.slice(0, 60))
  }

  // --- 2. Toestemming is geen formaliteit: zonder true weigert de RPC ---
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: false,
    })
    check('opslaan zonder toestemming wordt geweigerd',
      !!error && /toestemming/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: null,
    })
    check('opslaan met toestemming = null wordt geweigerd (null-veilig)',
      !!error && /toestemming/i.test(error.message || ''), error?.message?.slice(0, 60))
  }

  // --- 3. Alleen bij een foto die aan een inspectiepunt hangt ---
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.losseFotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: true,
    })
    check('foto zonder inspectiepunt krijgt geen AI-voorwerk',
      !!error && /inspectiepunt/i.test(error.message || ''), error?.message?.slice(0, 60))
  }

  // --- 4. Cross-company: A op de foto van B ---
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: B.fotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: true,
    })
    check('A kan geen suggestie opslaan op een foto van B', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { data } = await admin.from('inspectie_ai_suggestie').select('id').eq('company_id', B.companyId)
    check('er is bij B ook echt niets aangemaakt', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }

  // --- 5. Positieve controle: A op zijn eigen foto ---
  const AI_BEVINDING = 'AITEST concept: ladder niet vastgezet, valgevaar.'
  const AI_ACTIE = 'AITEST actie: ladder vastzetten aan de gevel.'
  let suggestieA = null
  {
    const { data, error } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId,
      p_beschrijving: 'AITEST beschrijving: ladder tegen een gevel.',
      p_bevindingen: [AI_BEVINDING], p_acties: [AI_ACTIE],
      p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
    })
    suggestieA = data ?? null
    check('A slaat op zijn eigen foto wel een suggestie op (positieve controle)',
      !error && !!suggestieA, error?.message?.slice(0, 60))
  }

  // --- 6. Een concept raakt de bevinding NIET aan (de mens beslist) ---
  {
    const opm = await leesOpmerking(A.bevindingId)
    check('een vers concept laat de toelichting van de bevinding leeg', opm === null, `opmerking=${JSON.stringify(opm)}`)
  }
  {
    const { data } = await admin
      .from('inspectie_ai_suggestie').select('status, toestemming_bevestigd, besluit_tekst')
      .eq('id', suggestieA).single()
    check('de suggestie staat op status concept met toestemming vastgelegd',
      data?.status === 'concept' && data?.toestemming_bevestigd === true && data?.besluit_tekst === null,
      `status=${data?.status} toestemming=${data?.toestemming_bevestigd}`)
  }

  // --- 7. B ziet de suggestie van A niet (RLS) ---
  {
    const clientB2 = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    await clientB2.auth.signInWithPassword({ email: `aitest_B_${TS}@example.test`, password: PW })
    const { data, error } = await clientB2.from('inspectie_ai_suggestie').select('id').eq('id', suggestieA)
    check('B ziet de suggestie van A niet', !error && (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)

    const { error: eB } = await clientB2.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestieA, p_besluit: 'overgenomen', p_bevindingen_gekozen: [AI_BEVINDING], p_acties_gekozen: [],
    })
    check('B kan niet beslissen over de suggestie van A', !!eB, eB ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const opm = await leesOpmerking(A.bevindingId)
    check('de toelichting van A is na de poging van B nog steeds leeg', opm === null, `opmerking=${JSON.stringify(opm)}`)
  }

  // --- 8. Overnemen: alleen wat is aangevinkt landt, niets dat niet was
  //        voorgesteld — de UI biedt checkboxes, geen vrije tekst, en dat
  //        wordt hier serverside vergrendeld (migratie 0059). ---
  {
    // Zelfverzonnen tekst die niet in de AI-suggestie voorkwam wordt geweigerd,
    // ook al staat de suggestie nog open.
    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestieA, p_besluit: 'overgenomen',
      p_bevindingen_gekozen: ['AITEST door mens verzonnen, niet voorgesteld'], p_acties_gekozen: [],
    })
    check('een bevinding die niet uit de AI-suggestie komt wordt geweigerd',
      !!error && /komt niet uit de ai-suggestie/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    const opm = await leesOpmerking(A.bevindingId)
    check('die geweigerde poging heeft niets weggeschreven', opm === null, `opmerking=${JSON.stringify(opm)}`)
  }
  {
    // De échte AI-bevinding + AI-actie aanvinken en overnemen mag wél.
    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestieA, p_besluit: 'overgenomen',
      p_bevindingen_gekozen: [AI_BEVINDING], p_acties_gekozen: [AI_ACTIE],
    })
    check('A kan zijn eigen suggestie overnemen (aangevinkte bevinding + actie)', !error, error?.message?.slice(0, 60))
  }
  {
    const opm = await leesOpmerking(A.bevindingId)
    check('de toelichting bevat exact de aangevinkte bevinding', opm === AI_BEVINDING, `opmerking=${JSON.stringify(opm)}`)
  }
  {
    // A.bevindingId begon als 'in_orde' (testopzet); een meegenomen actie hoort
    // dat te overschrijven naar 'niet_in_orde', ook al stond er al iets anders
    // (migratie 0060 — "er is een actie nodig" kan niet naast "in orde" bestaan).
    const resultaat = await leesResultaat(A.bevindingId)
    check('een meegenomen actie zet het resultaat automatisch op niet_in_orde (ook over een bestaand resultaat heen)',
      resultaat === 'niet_in_orde', `resultaat=${resultaat}`)
  }
  {
    const { data } = await admin
      .from('inspectie_ai_suggestie').select('ai_bevindingen, ai_acties, besluit_tekst, status, besloten_op')
      .eq('id', suggestieA).single()
    check('het oorspronkelijke AI-voorwerk blijft onveranderd bewaard als herkomst',
      JSON.stringify(data?.ai_bevindingen) === JSON.stringify([AI_BEVINDING])
        && JSON.stringify(data?.ai_acties) === JSON.stringify([AI_ACTIE])
        && data?.status === 'overgenomen' && !!data?.besloten_op,
      `status=${data?.status} ai_bevindingen=${JSON.stringify(data?.ai_bevindingen)}`)
  }
  {
    const { data } = await admin
      .from('pva_items').select('id, onderwerp, status, bron_type, bron_id')
      .eq('company_id', A.companyId).eq('bron_type', 'inspectie_bevinding').eq('bron_id', A.bevindingId)
    const actie = (data ?? []).find(p => p.onderwerp === AI_ACTIE)
    check('de aangevinkte actie staat als eigen rij in de actielijst, gekoppeld aan de bevinding',
      !!actie && actie.status === 'Open', `${data?.length ?? 0} rijen`)
  }
  {
    const { data } = await admin
      .from('inspectie_historie').select('wijziging')
      .eq('inspectie_id', A.inspectieId)
    const heeftBevinding = (data ?? []).some(h => /AI-suggestie overgenomen/i.test(h.wijziging || ''))
    const heeftActie = (data ?? []).some(h => /AI-actiesuggestie/i.test(h.wijziging || ''))
    check('zowel het overnemen als de actiesuggestie staan in de historie', heeftBevinding && heeftActie)
  }
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestieA, p_besluit: 'verworpen',
    })
    check('een al beoordeelde suggestie kan niet nog eens beslist worden',
      !!error && /al beoordeeld/i.test(error.message || ''), error?.message?.slice(0, 60))
  }

  // --- 8b. Overnemen kan niet zonder gekozen resultaat (migratie 0051) ---
  // Gevonden in de browsertest: zonder resultaat rendert het invulscherm geen
  // toelichtingveld, dus zou de tekst onzichtbaar worden opgeslagen.
  {
    const { data: bevZonder } = await admin.from('inspectie_bevinding').insert({
      company_id: A.companyId, inspectie_id: A.inspectieId,
      punt_tekst_snap: 'AITEST punt zonder resultaat',
      resultaat: null, afhandeling: 'geen',
    }).select('id').single()
    const { data: fotoZonder } = await admin.from('inspectie_foto').insert({
      inspectie_id: A.inspectieId, bevinding_id: bevZonder.id, company_id: A.companyId,
      storage_pad: `${A.companyId}/${A.inspectieId}/aitest_zonder.jpg`,
      bestandsnaam: 'aitest_zonder.jpg', type: 'image/jpeg', grootte: 1234,
    }).select('id').single()

    const { data: sugId } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: fotoZonder.id, p_beschrijving: 'AITEST',
      p_bevindingen: ['AITEST concept'], p_acties: ['AITEST actie zonder resultaat'],
      p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
    })
    check('een concept opslaan mag wél zonder gekozen resultaat', !!sugId)

    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: sugId, p_besluit: 'overgenomen',
      p_bevindingen_gekozen: ['AITEST concept'], p_acties_gekozen: [],
    })
    check('overnemen van een BEVINDING zonder gekozen resultaat wordt geweigerd',
      !!error && /kies eerst een resultaat/i.test(error.message || ''), error?.message?.slice(0, 60))
    {
      const opm = await leesOpmerking(bevZonder.id)
      check('er is niets stils naar de bevinding geschreven', opm === null, `opmerking=${JSON.stringify(opm)}`)
    }
    {
      // Verwerpen mag wél altijd — een concept weggooien vraagt geen oordeel.
      const { error: eV } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
        p_suggestie_id: sugId, p_besluit: 'verworpen',
      })
      check('verwerpen mag wél zonder gekozen resultaat', !eV, eV?.message?.slice(0, 60))
    }
    {
      // Een ACTIE-ALLEEN (geen bevinding aangevinkt) raakt de toelichting niet
      // en mag daarom WEL zonder gekozen resultaat — nieuw in migratie 0059.
      const { data: sugActie } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
        p_foto_id: fotoZonder.id, p_beschrijving: 'AITEST',
        p_bevindingen: [], p_acties: ['AITEST actie zonder resultaat 2'],
        p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
      })
      const { error: eA } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
        p_suggestie_id: sugActie, p_besluit: 'overgenomen',
        p_bevindingen_gekozen: [], p_acties_gekozen: ['AITEST actie zonder resultaat 2'],
      })
      check('een actie-alleen overnemen lukt ook zonder gekozen resultaat', !eA, eA?.message?.slice(0, 60))
      const { data: acties } = await admin.from('pva_items')
        .select('id').eq('bron_type', 'inspectie_bevinding').eq('bron_id', bevZonder.id)
      check('de actie is aangemaakt, ook zonder resultaat op het punt', (acties?.length ?? 0) === 1)
      const resultaat = await leesResultaat(bevZonder.id)
      check('een actie-alleen zet het resultaat ook automatisch op niet_in_orde (migratie 0060)',
        resultaat === 'niet_in_orde', `resultaat=${resultaat}`)
    }
    {
      // NIEUW (0060): bevinding + actie SAMEN overnemen op een punt dat nog
      // helemaal geen resultaat had, moet in één keer lukken — de actie zet
      // het resultaat vóórdat de resultaat-eis voor de bevinding gecontroleerd
      // wordt. Vóór migratie 0060 was dit exact het geval dat 0051 weigerde.
      const { data: bevSamen } = await admin.from('inspectie_bevinding').insert({
        company_id: A.companyId, inspectie_id: A.inspectieId,
        punt_tekst_snap: 'AITEST punt samen zonder resultaat',
        resultaat: null, afhandeling: 'geen',
      }).select('id').single()
      const { data: fotoSamen } = await admin.from('inspectie_foto').insert({
        inspectie_id: A.inspectieId, bevinding_id: bevSamen.id, company_id: A.companyId,
        storage_pad: `${A.companyId}/${A.inspectieId}/aitest_samen.jpg`,
        bestandsnaam: 'aitest_samen.jpg', type: 'image/jpeg', grootte: 1234,
      }).select('id').single()
      const BEV_SAMEN = 'AITEST concept samen'
      const ACT_SAMEN = 'AITEST actie samen'
      const { data: sugSamen } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
        p_foto_id: fotoSamen.id, p_beschrijving: 'AITEST',
        p_bevindingen: [BEV_SAMEN], p_acties: [ACT_SAMEN],
        p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
      })
      const { error: eSamen } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
        p_suggestie_id: sugSamen, p_besluit: 'overgenomen',
        p_bevindingen_gekozen: [BEV_SAMEN], p_acties_gekozen: [ACT_SAMEN],
      })
      check('bevinding + actie samen overnemen op een blanco punt lukt in één keer',
        !eSamen, eSamen?.message?.slice(0, 60))
      const opmSamen = await leesOpmerking(bevSamen.id)
      const resultaatSamen = await leesResultaat(bevSamen.id)
      check('de toelichting én het automatische resultaat staan allebei goed',
        opmSamen === BEV_SAMEN && resultaatSamen === 'niet_in_orde',
        `opmerking=${JSON.stringify(opmSamen)} resultaat=${resultaatSamen}`)
    }
    {
      // En zodra er een resultaat staat, lukt overnemen van een bevinding gewoon.
      await admin.from('inspectie_bevinding').update({ resultaat: 'in_orde' }).eq('id', bevZonder.id)
      const { data: sug2 } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
        p_foto_id: fotoZonder.id, p_beschrijving: 'AITEST', p_bevindingen: ['AITEST concept 2'], p_acties: [],
        p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
      })
      const { error: eO } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
        p_suggestie_id: sug2, p_besluit: 'overgenomen', p_bevindingen_gekozen: ['AITEST concept 2'], p_acties_gekozen: [],
      })
      const opm = await leesOpmerking(bevZonder.id)
      check('met een resultaat lukt overnemen wél', !eO && opm === 'AITEST concept 2',
        eO?.message?.slice(0, 60) ?? `opmerking=${JSON.stringify(opm)}`)

      // Geen actie aangevinkt: het resultaat blijft precies wat het al was
      // ('in_orde', hierboven expliciet gezet) — de inspecteur kiest zelf.
      const resultaatNa = await leesResultaat(bevZonder.id)
      check('zonder aangevinkte actie blijft het resultaat ongemoeid',
        resultaatNa === 'in_orde', `resultaat=${resultaatNa}`)
    }
  }

  // --- 9. Verwerpen laat de bevinding ongemoeid ---
  {
    const { data: id2 } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'AITEST tweede', p_bevindingen: ['AITEST tweede concept'], p_acties: [],
      p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
    })
    const voor = await leesOpmerking(A.bevindingId)
    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: id2, p_besluit: 'verworpen',
    })
    const na = await leesOpmerking(A.bevindingId)
    check('verwerpen lukt en laat de toelichting ongewijzigd', !error && na === voor,
      error?.message?.slice(0, 60) ?? `voor=${JSON.stringify(voor)} na=${JSON.stringify(na)}`)
  }
  {
    const { error } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestieA, p_besluit: 'iets_anders', p_bevindingen_gekozen: ['x'], p_acties_gekozen: [],
    })
    check('een onbekend besluit wordt geweigerd',
      !!error && /ongeldig besluit/i.test(error.message || ''), error?.message?.slice(0, 60))
  }

  // --- 10. Een afgeronde inspectie is bevroren, ook voor AI-voorwerk ---
  {
    // Een verse suggestie klaarzetten vóór het bevriezen, om óók het besluit te toetsen.
    const { data: id3 } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'AITEST derde', p_bevindingen: ['AITEST derde concept'], p_acties: [],
      p_leverancier: 'groq', p_model: 'aitest-model', p_toestemming: true,
    })
    await admin.from('inspectie').update({ status: 'afgerond' }).eq('id', A.inspectieId)

    const { error: e1 } = await clientA.rpc('inspectie_ai_suggestie_opslaan', {
      p_foto_id: A.fotoId, p_beschrijving: 'x', p_bevindingen: ['y'], p_acties: [],
      p_leverancier: 'groq', p_model: 'test', p_toestemming: true,
    })
    check('bij een AFGERONDE inspectie kan er geen AI-voorwerk meer bij',
      !!e1 && /afgerond/i.test(e1.message || ''), e1?.message?.slice(0, 60))

    const { error: e2 } = await clientA.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: id3, p_besluit: 'overgenomen', p_bevindingen_gekozen: ['AITEST derde concept'], p_acties_gekozen: [],
    })
    check('bij een AFGERONDE inspectie kan een concept niet meer overgenomen worden',
      !!e2 && /afgerond/i.test(e2.message || ''), e2?.message?.slice(0, 60))

    await admin.from('inspectie').update({ status: 'concept' }).eq('id', A.inspectieId)
  }

  // --- 11. Direct schrijven op de tabel kan niet (geen insert/update-policy) ---
  {
    const { error } = await clientA.from('inspectie_ai_suggestie').insert({
      inspectie_id: A.inspectieId, bevinding_id: A.bevindingId, company_id: A.companyId,
      ai_bevindingen: ['directe insert'], leverancier: 'x', model: 'y',
    })
    check('een directe insert op inspectie_ai_suggestie wordt geweigerd', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { data, error } = await clientA
      .from('inspectie_ai_suggestie').update({ status: 'overgenomen' }).eq('id', suggestieA).select('id')
    check('een directe update op inspectie_ai_suggestie raakt geen rij',
      !!error || (data?.length ?? 0) === 0, error ? 'geweigerd' : `${data?.length ?? '?'} rijen geraakt`)
  }
}

async function cleanup() {
  // FK-veilige volgorde. Service role omzeilt RLS.
  if (companyIds.length) {
    for (const tbl of [
      'inspectie_ai_suggestie',
      'pva_items',
      'inspectie_foto',
      'inspectie_historie',
      'inspectie_bevinding',
      'inspectie',
      'inspectie_sjabloon_punt',
      'inspectie_sjabloon',
      'bedrijf_modules',
    ]) {
      await admin.from(tbl).delete().in('company_id', companyIds)
    }
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) {
      try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ }
    }
  }
  if (companyIds.length) {
    await admin.from('companies').delete().in('id', companyIds)
  }
}

let exitCode = 0
try {
  await run()
} catch (e) {
  console.error('\nFOUT tijdens de testopzet:', e.message)
  exitCode = 1
} finally {
  try {
    await cleanup()
    console.log('\nOpgeruimd: alle AITEST_-data en testgebruikers verwijderd.')
  } catch (e) {
    console.error('LET OP — opruimen mislukt:', e.message)
    exitCode = 1
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
