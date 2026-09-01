// ============================================================================
// Auditmodule — isolatie-tests
// ----------------------------------------------------------------------------
// Bewijst de bedrijfsisolatie van de audit-tabellen + RPC's: een KAM van bedrijf
// A ziet/muteert niet de audits van B, een anonieme bezoeker kan geen audit
// aanmaken (EXECUTE ingetrokken, Beslissing 62), en A mag zijn eigen audit wél
// aanmaken/vullen (positieve controle) inclusief "maak actie van bevinding".
//
// Draaien:   node --use-system-ca scripts/audit_isolatie_test.mjs
// Vereist SUPABASE_SERVICE_ROLE_KEY in .env.local. Alles met prefix AUDITTEST_
// wordt in finally opgeruimd.
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
if (!URL || !ANON) { console.error('SUPABASE URL/ANON ontbreken.'); process.exit(1) }
if (!SERVICE) { console.log('— SUPABASE_SERVICE_ROLE_KEY ontbreekt. Overgeslagen.'); process.exit(0) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const TS = Date.now()
const PW = 'Audittest!' + TS
const companyIds = []
const userIds = []
const results = []
const check = (naam, ok, detail) => { results.push({ naam, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function maakBedrijf(label) {
  const { data, error } = await admin.from('companies').insert({ name: `AUDITTEST_${label}_${TS}` }).select('id').single()
  if (error) throw new Error(`companies insert (${label}): ${error.message}`)
  companyIds.push(data.id); return data.id
}
async function maakGebruiker(label, companyId) {
  const email = `audittest_${label}_${TS}@example.test`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error) throw new Error(`createUser (${label}): ${error.message}`)
  userIds.push(created.user.id)
  const { error: e } = await admin.from('users').upsert({ id: created.user.id, email, role: 'client', company_id: companyId, naam: `AUDITTEST ${label}` })
  if (e) throw new Error(`users upsert (${label}): ${e.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW })
  if (e2) throw new Error(`signIn (${label}): ${e2.message}`)
  return client
}

async function run() {
  const aId = await maakBedrijf('A')
  const bId = await maakBedrijf('B')
  const clientA = await maakGebruiker('A', aId)
  await maakGebruiker('B', bId)
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

  // Seed: B heeft een audit + verbeterpunt (service role omzeilt RLS).
  const { data: bAudit, error: seedErr } = await admin.from('audit')
    .insert({ company_id: bId, sjabloon: 'iso', titel: 'AUDITTEST_B', jaar: 2026, status: 'gepland' }).select('id').single()
  if (seedErr) throw new Error(`seed audit B: ${seedErr.message}`)
  const { data: bVp } = await admin.from('audit_verbeterpunt')
    .insert({ audit_id: bAudit.id, company_id: bId, constatering: 'AUDITTEST_B_vp', soort: 'verbeterpunt' }).select('id').single()

  // Positief: A maakt eigen VCA-audit aan (RPC kopieert de catalogus).
  let aAudit = null
  {
    const { data, error } = await clientA.rpc('audit_aanmaken', { p_company_id: aId, p_sjabloon: 'vca', p_titel: 'AUDITTEST_A', p_jaar: 2026 })
    aAudit = data
    check('A maakt eigen audit aan (positieve controle)', !error && !!data, error ? error.message : 'ok')
  }
  {
    const { data } = await clientA.from('audit_vca_bevinding').select('id').eq('audit_id', aAudit)
    check('VCA-catalogus gekopieerd naar eigen audit', (data?.length ?? 0) === 35, `${data?.length ?? '?'} bevindingen`)
  }
  {
    const { data } = await clientA.from('audit').select('id').eq('company_id', aId)
    check('A ziet eigen audits', (data?.length ?? 0) >= 1, `${data?.length ?? '?'} audits`)
  }
  // Isolatie lezen: A ziet B's audit niet.
  {
    const { data } = await clientA.from('audit').select('id').eq('company_id', bId)
    check('A ziet audits van B niet', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  {
    const { data } = await clientA.from('audit_verbeterpunt').select('id').eq('id', bVp.id)
    check('A ziet verbeterpunt van B niet', (data?.length ?? 0) === 0, `${data?.length ?? '?'} rijen`)
  }
  // Isolatie muteren: A kan geen audit voor B aanmaken (RPC guard).
  {
    const { error } = await clientA.rpc('audit_aanmaken', { p_company_id: bId, p_sjabloon: 'iso', p_titel: 'HACK', p_jaar: 2026 })
    check('A kan geen audit voor B aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Isolatie muteren: A kan geen audit-rij voor B direct inserten (RLS with check).
  {
    const { error } = await clientA.from('audit').insert({ company_id: bId, sjabloon: 'iso', titel: 'HACK', jaar: 2026 })
    check('A kan geen audit-rij voor B inserten', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Isolatie: A kan van B's verbeterpunt geen actie maken.
  {
    const { error } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'verbeterpunt', p_bron_id: bVp.id })
    check('A kan van B-verbeterpunt geen actie maken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  // Anon: geen audit aanmaken (EXECUTE ingetrokken).
  {
    const { error } = await anon.rpc('audit_aanmaken', { p_company_id: bId, p_sjabloon: 'iso', p_titel: 'HACK', p_jaar: 2026 })
    check('Anon kan geen audit aanmaken', !!error, error ? 'geweigerd' : 'GEEN fout!')
  }
  {
    const { data } = await anon.from('audit').select('id').eq('company_id', bId)
    check('Anon ziet geen audits', (data?.length ?? 0) === 0, `${data?.length ?? 0} rijen`)
  }
  // Positief: A maakt van EIGEN verbeterpunt een actie (RPC → pva_items).
  {
    // Via de RPC's (0057/0058): rechtstreeks inserten kan niet meer.
    const { data: vp, error: eVp } = await clientA.rpc('audit_verbeterpunt_toevoegen', { p_audit_id: aAudit })
    if (eVp || !vp?.id) throw new Error(`verbeterpunt toevoegen: ${eVp?.message ?? 'geen rij terug'}`)
    await clientA.rpc('audit_verbeterpunt_opslaan', {
      p_id: vp.id, p_patch: { constatering: 'AUDITTEST_A_vp', soort: 'afwijking' },
    })
    const { data: actieId, error } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'verbeterpunt', p_bron_id: vp.id })
    check('A maakt actie van eigen verbeterpunt (positieve controle)', !error && !!actieId, error ? error.message : 'ok')
    if (actieId) {
      const { data: pva } = await admin.from('pva_items').select('bron_type, bron_id').eq('id', actieId).single()
      check('Actie heeft bron_type=audit_bevinding + bron_id=audit', !!pva && pva.bron_type === 'audit_bevinding' && pva.bron_id === aAudit,
        pva ? `${pva.bron_type}/${pva.bron_id === aAudit ? 'audit' : 'ander'}` : 'geen rij')
    }
  }
  // END-TO-END actielijst-koppeling (fase 2). Een bevinding uit een audit moet
  // via "maak hier een actie van" in de centrale actielijst landen, met een
  // klikbare herkomst terug naar de bronaudit.
  {
    // 1. Een VCA-bevinding met toelichting → de toelichting wordt het onderwerp.
    const { data: bev } = await clientA.from('audit_vca_bevinding')
      .select('id').eq('audit_id', aAudit).eq('code', '11.1').single()
    await clientA.rpc('audit_vca_bevinding_opslaan', {
      p_id: bev.id, p_patch: { status: 'verbeterpunt', toelichting: 'AUDITTEST_melden stimuleren' },
    })

    const { data: actieId, error } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'vca', p_bron_id: bev.id })
    check('A maakt actie van eigen VCA-bevinding', !error && !!actieId, error ? error.message : 'ok')

    // 2. De actie staat in de centrale actielijst van A, met de toelichting als onderwerp.
    const { data: pva } = await clientA.from('pva_items')
      .select('id, onderwerp, status, bron_type, bron_id, company_id').eq('id', actieId).single()
    check('Actie staat in de actielijst van A', !!pva && pva.company_id === aId)
    check('Onderwerp = de toelichting van de bevinding', pva?.onderwerp === 'AUDITTEST_melden stimuleren', pva?.onderwerp)
    check('Actie opent als Open', pva?.status === 'Open', pva?.status)

    // 3. De herkomst is klikbaar terug naar de BRONAUDIT. bepaalHerkomst() in
    //    lib/actie-herkomst.ts bouwt de href uit bron_type + bron_id; die twee
    //    velden zijn hier het hele contract.
    check('Herkomst wijst naar de bronaudit (bron_type + bron_id)',
      pva?.bron_type === 'audit_bevinding' && pva?.bron_id === aAudit,
      `${pva?.bron_type}/${pva?.bron_id === aAudit ? 'bronaudit' : 'FOUT doel'}`)

    // 4. actie_id is teruggestempeld op de bevinding (UI toont "✓ Actie gekoppeld").
    const { data: naStempel } = await clientA.from('audit_vca_bevinding').select('actie_id').eq('id', bev.id).single()
    check('actie_id teruggestempeld op de bevinding', naStempel?.actie_id === actieId)

    // 5. Idempotent: nog een keer klikken maakt GEEN tweede actie.
    const { data: nogmaals } = await clientA.rpc('audit_bevinding_naar_actie', { p_soort: 'vca', p_bron_id: bev.id })
    check('Tweede keer koppelen hergebruikt dezelfde actie', nogmaals === actieId, `${nogmaals === actieId ? 'zelfde' : 'NIEUWE actie!'}`)

    const { data: alle } = await clientA.from('pva_items').select('id').eq('bron_id', aAudit)
    check('Geen dubbele acties voor deze audit (1 vca + 1 verbeterpunt)', (alle?.length ?? 0) === 2, `${alle?.length ?? '?'} acties`)
  }

  // Kopregels 0041: Aan/Van bestaan en zijn per bedrijf afgeschermd.
  {
    const { error } = await clientA.rpc('audit_opslaan', {
      p_audit_id: aAudit, p_patch: { gericht_aan: 'AUDITTEST_directie', auditor: 'AUDITTEST_auditor' },
    })
    check('A kan Aan/Van van eigen audit vullen', !error, error?.message)
    const { data } = await clientA.from('audit').select('gericht_aan, auditor').eq('id', aAudit).single()
    check('Aan/Van bewaard', data?.gericht_aan === 'AUDITTEST_directie' && data?.auditor === 'AUDITTEST_auditor')
  }
  {
    await clientA.rpc('audit_opslaan', { p_audit_id: bAudit.id, p_patch: { auditor: 'HACK' } })
    const { data } = await admin.from('audit').select('auditor').eq('id', bAudit.id).single()
    check('A kan Aan/Van van B niet overschrijven', data?.auditor === null, data?.auditor ?? 'null')
  }

  // ---------------------------------------------------------------------
  // Schrijf-RPC's van de auditmodule (migratie 0057) en het dichtzetten van de
  // directe schrijftoegang (0058). Dit was de laatste plek in het portaal waar
  // de client rechtstreeks in de database schreef.
  // ---------------------------------------------------------------------
  {
    // --- witte lijst: een onbekend veld is een fout, geen stille no-op ---
    const { error: eOnbekend } = await clientA.rpc('audit_opslaan', {
      p_audit_id: aAudit, p_patch: { company_id: bId },
    })
    check('audit_opslaan weigert een veld buiten de witte lijst',
      !!eOnbekend && /onbekend veld/i.test(eOnbekend.message || ''), eOnbekend?.message?.slice(0, 60))

    const { data: naPoging } = await admin.from('audit').select('company_id').eq('id', aAudit).single()
    check('en het bedrijf van de audit is niet verschoven', naPoging?.company_id === aId)
  }
  {
    // --- waardecontrole ---
    const { error } = await clientA.rpc('audit_opslaan', {
      p_audit_id: aAudit, p_patch: { status: 'verzonnen' },
    })
    check('audit_opslaan weigert een ongeldige status',
      !!error && /ongeldige status/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    const { data: bev } = await clientA.from('audit_vca_bevinding')
      .select('id').eq('audit_id', aAudit).limit(1).single()
    const { error } = await clientA.rpc('audit_vca_bevinding_opslaan', {
      p_id: bev.id, p_patch: { status: 'bestaat_niet' },
    })
    check('audit_vca_bevinding_opslaan weigert een ongeldige status',
      !!error && /ongeldige bevindingstatus/i.test(error.message || ''), error?.message?.slice(0, 60))
  }
  {
    // --- cross-company via de RPC's ---
    // B heeft een ISO-audit, dus geen VCA-bevindingen; het verbeterpunt is hier
    // het doelwit.
    const { error: e2 } = await clientA.rpc('audit_verbeterpunt_opslaan', {
      p_id: bVp.id, p_patch: { constatering: 'HACK' },
    })
    check('A kan een verbeterpunt van B niet bijwerken', !!e2, e2 ? 'geweigerd' : 'GEEN fout!')

    const { error: e3 } = await clientA.rpc('audit_verbeterpunt_verwijderen', { p_id: bVp.id })
    check('A kan een verbeterpunt van B niet verwijderen', !!e3, e3 ? 'geweigerd' : 'GEEN fout!')

    const { data: nog } = await admin.from('audit_verbeterpunt').select('id').eq('id', bVp.id)
    check('het verbeterpunt van B bestaat nog', (nog?.length ?? 0) === 1)

    const { error: e4 } = await clientA.rpc('audit_iso_observatie_toevoegen', { p_audit_id: bAudit.id })
    check('A kan geen observatie toevoegen aan een audit van B', !!e4, e4 ? 'geweigerd' : 'GEEN fout!')
  }
  {
    // --- anon komt er niet bij (Beslissing 62) ---
    for (const [naam, params] of [
      ['audit_opslaan', { p_audit_id: aAudit, p_patch: { auditor: 'HACK' } }],
      ['audit_iso_observatie_toevoegen', { p_audit_id: aAudit }],
      ['audit_verbeterpunt_toevoegen', { p_audit_id: aAudit }],
    ]) {
      const { error } = await anon.rpc(naam, params)
      check(`anon kan ${naam} niet aanroepen`, !!error, error?.message?.slice(0, 50))
    }
  }
  {
    // --- de gelukkige gang: toevoegen, bijwerken, verwijderen ---
    const { data: obs, error: eToe } = await clientA.rpc('audit_iso_observatie_toevoegen', { p_audit_id: aAudit })
    check('A kan een observatie toevoegen aan de eigen audit', !eToe && !!obs?.id, eToe?.message?.slice(0, 60))

    if (obs?.id) {
      const { error: eOp } = await clientA.rpc('audit_iso_observatie_opslaan', {
        p_id: obs.id, p_patch: { thema: 'AUDITTEST_thema', observatie: 'AUDITTEST_waarneming' },
      })
      const { data: na } = await admin.from('audit_iso_observatie')
        .select('thema, observatie').eq('id', obs.id).single()
      check('en bijwerken landt in de database',
        !eOp && na?.thema === 'AUDITTEST_thema' && na?.observatie === 'AUDITTEST_waarneming',
        eOp?.message?.slice(0, 60))

      const { error: eWeg } = await clientA.rpc('audit_iso_observatie_verwijderen', { p_id: obs.id })
      const { data: weg } = await admin.from('audit_iso_observatie').select('id').eq('id', obs.id)
      check('en verwijderen werkt', !eWeg && (weg?.length ?? 0) === 0, eWeg?.message?.slice(0, 60))
    }

    const { data: vp, error: eVp } = await clientA.rpc('audit_verbeterpunt_toevoegen', { p_audit_id: aAudit })
    check('A kan een verbeterpunt toevoegen aan de eigen audit', !eVp && !!vp?.id, eVp?.message?.slice(0, 60))
    if (vp?.id) {
      await clientA.rpc('audit_verbeterpunt_opslaan', { p_id: vp.id, p_patch: { soort: 'afwijking' } })
      const { data: na } = await admin.from('audit_verbeterpunt').select('soort').eq('id', vp.id).single()
      check('soort van een verbeterpunt is bij te werken', na?.soort === 'afwijking', na?.soort)
      await clientA.rpc('audit_verbeterpunt_verwijderen', { p_id: vp.id })
    }
  }
  {
    // --- 0058: rechtstreeks schrijven kan niet meer ---
    const { error } = await clientA.from('audit')
      .update({ auditor: 'AUDITTEST_rechtstreeks' }).eq('id', aAudit)
    const { data: na } = await admin.from('audit').select('auditor').eq('id', aAudit).single()
    check('A kan de audit niet meer RECHTSTREEKS bijwerken (alleen via de RPC)',
      na?.auditor === 'AUDITTEST_auditor',
      error ? 'geweigerd' : `auditor is nu: ${na?.auditor}`)

    const { data: bevA } = await clientA.from('audit_vca_bevinding')
      .select('id, toelichting').eq('audit_id', aAudit).limit(1).single()
    await clientA.from('audit_vca_bevinding').update({ toelichting: 'RECHTSTREEKS' }).eq('id', bevA.id)
    const { data: naBev } = await admin.from('audit_vca_bevinding')
      .select('toelichting').eq('id', bevA.id).single()
    check('en een VCA-bevinding evenmin', naBev?.toelichting !== 'RECHTSTREEKS',
      `toelichting: ${String(naBev?.toelichting).slice(0, 30)}`)

    const { data: nogSteeds } = await clientA.from('audit').select('id').eq('id', aAudit)
    check('lezen kan nog gewoon (de select-policy blijft)', (nogSteeds?.length ?? 0) === 1)
  }

  // Defensief: B's audit ongewijzigd.
  {
    const { data } = await admin.from('audit').select('titel').eq('id', bAudit.id).single()
    check('B-audit bleef ongewijzigd', !!data && data.titel === 'AUDITTEST_B')
  }
}

async function cleanup() {
  if (companyIds.length) {
    await admin.from('pva_items').delete().in('company_id', companyIds)
    await admin.from('audit').delete().in('company_id', companyIds)
  }
  if (userIds.length) {
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) { try { await admin.auth.admin.deleteUser(id) } catch { /* al weg */ } }
  }
  if (companyIds.length) await admin.from('companies').delete().in('id', companyIds)
}

let exitCode = 0
try { await run() }
catch (e) { console.error('\nFOUT tijdens de testopzet:', e.message); exitCode = 1 }
finally {
  try { await cleanup(); console.log('\nOpgeruimd: alle AUDITTEST_-data en testgebruikers verwijderd.') }
  catch (e) { console.error('LET OP — opruimen mislukt:', e.message); exitCode = 1 }
}
const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} tests geslaagd.`)
if (falen > 0) exitCode = 1
process.exit(exitCode)
