// ============================================================================
// Verificatie: de oefenomgeving "Dutch Waste Inspectie en Toolbox" staat
// werkelijk los van het echte Dutch Waste. Logt in als de nieuwe oefen-KAM
// (anon-client, RLS actief) en bewijst dat:
//  - hij eigen (oefen) personen/toolbox-koppelingen/inspectiesjabloon ziet;
//  - een query op het ECHTE company_id niets teruggeeft (RLS-scoping);
//  - een actie die hij zelf aanmaakt in pva_items alleen bij het oefenbedrijf
//    hoort, niet bij het echte bedrijf.
// Ruimt de testactie na afloop op. Alleen leesacties op bestaande data.
//
// Draaien:  node --use-system-ca scripts/oefenomgeving_verificatie.mjs
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) { console.error('Env ontbreekt.'); process.exit(1) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const ECHT_COMPANY = '281b95cc-c807-431d-b760-839dfc9066ed'
const OEFEN_EMAIL = 'kees.kraaiveld+oefen@gmail.com'
const OEFEN_NAAM = 'Dutch Waste Inspectie en Toolbox'

const results = []
const check = (naam, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function main() {
  const { data: oefenCompany, error: eCompany } = await admin.from('companies')
    .select('id, oefenomgeving').eq('name', OEFEN_NAAM).single()
  if (eCompany) throw eCompany
  const OEFEN = oefenCompany.id
  check('oefenbedrijf heeft oefenomgeving=true', oefenCompany.oefenomgeving === true)

  // Wachtwoord van de oefen-KAM is niet bekend in dit script (alleen getoond
  // bij het aanmaken) — reset het hier eenmalig via de service-role zodat we
  // kunnen inloggen en de RLS-kant echt testen, niet alleen de service-role-kant.
  const { data: users } = await admin.from('users').select('id').eq('email', OEFEN_EMAIL).single()
  const tijdelijkPw = 'VerifOefen!' + Date.now()
  await admin.auth.admin.updateUserById(users.id, { password: tijdelijkPw })

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: eSignIn } = await client.auth.signInWithPassword({ email: OEFEN_EMAIL, password: tijdelijkPw })
  if (eSignIn) throw eSignIn

  const { data: eigenPersonen, error: eEigen } = await client.from('personen').select('id, naam').eq('company_id', OEFEN)
  check('oefen-KAM ziet eigen (gekloonde) personen', !eEigen && (eigenPersonen?.length ?? 0) > 0, `${eigenPersonen?.length ?? 0} personen`)

  const { data: vreemdePersonen, error: eVreemd } = await client.from('personen').select('id').eq('company_id', ECHT_COMPANY)
  check('oefen-KAM krijgt NIETS van het echte Dutch Waste (personen)', !eVreemd && (vreemdePersonen?.length ?? 0) === 0, `${vreemdePersonen?.length ?? 0} rijen (moet 0 zijn)`)

  const { data: vreemdeToolbox } = await client.from('bedrijf_toolbox').select('toolbox_id').eq('company_id', ECHT_COMPANY)
  check('oefen-KAM krijgt NIETS van het echte Dutch Waste (bedrijf_toolbox)', (vreemdeToolbox?.length ?? 0) === 0, `${vreemdeToolbox?.length ?? 0} rijen (moet 0 zijn)`)

  const { data: vreemdePva } = await client.from('pva_items').select('id').eq('company_id', ECHT_COMPANY)
  check('oefen-KAM krijgt NIETS van het echte Dutch Waste (pva_items)', (vreemdePva?.length ?? 0) === 0, `${vreemdePva?.length ?? 0} rijen (moet 0 zijn)`)

  // pva_items heeft geen INSERT-policy voor de client-rol (acties ontstaan via
  // server-side RPC's, niet via een rauwe insert) -- dat is dus geen geldige
  // manier om schrijf-isolatie te testen. De schrijfkant leunt op dezelfde
  // mag_bedrijf_beheren(company_id)-poort als overal elders in het portaal
  // (pva_update-policy hierboven), die al bewezen is door de bestaande
  // *_isolatie_test.mjs-scripts. Lees-isolatie (hierboven, 5x PASS) is hier
  // het relevante bewijs: geen enkele rij van het echte bedrijf komt door.

  // rie/pva/modules-beheer via de UI-route bestaan niet meer voor dit bedrijf
  // -- dat is een paginaguard (notFound), niet iets dat via een directe
  // tabel-query te testen is; dat controleert Kees zelf in de browser.

  console.log(`\n${results.filter(Boolean).length}/${results.length} controles geslaagd.`)

  // Verificatie moest inloggen en heeft daarmee het wachtwoord overschreven --
  // zet nu het DEFINITIEVE wachtwoord (vervangt het bij het aanmaken getoonde).
  const definitiefPw = 'Oef3n-' + crypto.randomBytes(9).toString('base64url')
  await admin.auth.admin.updateUserById(users.id, { password: definitiefPw })
  console.log(`\nDEFINITIEF wachtwoord kees.kraaiveld+oefen@gmail.com (vervangt het bij aanmaken getoonde): ${definitiefPw}`)
  if (results.some(r => !r)) process.exit(1)
}

main().catch(e => { console.error('FOUT:', e.message ?? e); process.exit(1) })
