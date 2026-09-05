// ============================================================================
// Rate limiting (migratie 0069) — telt correct, weigert bij overschrijding,
// isoleert per sleutel/actie, fail-closed op een lege sleutel.
// ----------------------------------------------------------------------------
// Draaien:  node --use-system-ca scripts/rate_limiet_test.mjs
// Alles met prefix RLTEST_ (de sleutel-waarden) is wegwerp — de teller zelf
// (rate_limiet_log) is er om te blijven, hier ruimen we alleen de eigen rijen
// via de sleutel op (geen directe tabeltoegang nodig: de teller vervalt vanzelf
// buiten het venster, en de sleutels hieronder komen nooit meer terug).
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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !ANON) { console.error('SUPABASE-URL/ANON ontbreken.'); process.exit(1) }

const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const TS = Date.now()
const results = []
const check = (naam, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`) }

async function toegestaan(sleutel, actie, max, venster) {
  const { data, error } = await anon.rpc('rate_limiet_toegestaan', {
    p_sleutel: sleutel, p_actie: actie, p_max: max, p_venster_seconden: venster,
  })
  if (error) throw new Error(error.message)
  return data === true
}

async function run() {
  const sleutelA = `RLTEST_A_${TS}`
  const sleutelB = `RLTEST_B_${TS}`
  const actie = 'test_actie'

  // 1. Eerste 3 aanroepen (max=3) mogen allemaal door.
  {
    const uitkomsten = []
    for (let i = 0; i < 3; i++) uitkomsten.push(await toegestaan(sleutelA, actie, 3, 60))
    check('eerste 3 aanroepen binnen max=3 worden toegestaan', uitkomsten.every(Boolean), JSON.stringify(uitkomsten))
  }

  // 2. De 4e aanroep (nog steeds max=3) wordt geweigerd.
  {
    const ok = await toegestaan(sleutelA, actie, 3, 60)
    check('4e aanroep boven max=3 wordt geweigerd', ok === false)
  }

  // 3. Andere sleutel, zelfde actie: eigen teller, niet beïnvloed door sleutelA.
  {
    const ok = await toegestaan(sleutelB, actie, 3, 60)
    check('andere sleutel heeft een eigen, onafhankelijke teller', ok === true)
  }

  // 4. Andere actie, zelfde sleutel (A): eigen teller per actie.
  {
    const ok = await toegestaan(sleutelA, 'andere_actie', 3, 60)
    check('andere actie op dezelfde sleutel heeft een eigen teller', ok === true)
  }

  // 5. Lege sleutel: fail-closed (geweigerd, niet stilzwijgend toegestaan).
  {
    const ok = await toegestaan('', actie, 100, 60)
    check('lege sleutel wordt fail-closed geweigerd', ok === false)
  }

  // 6. Klein venster: na het venster mag het weer (venster=1s, korte wacht).
  {
    const sleutelC = `RLTEST_C_${TS}`
    const eerst = await toegestaan(sleutelC, actie, 1, 1)
    await new Promise(r => setTimeout(r, 1300))
    const daarna = await toegestaan(sleutelC, actie, 1, 1)
    check('na afloop van het venster mag het weer', eerst === true && daarna === true, `eerst=${eerst}, daarna=${daarna}`)
  }

  // 7. anon mag de RPC aanroepen (nodig voor de gast-uploadroutes).
  {
    const ok = await toegestaan(`RLTEST_ANON_${TS}`, actie, 5, 60)
    check('anon kan de RPC aanroepen (nodig voor gast-uploadroutes)', ok === true)
  }
}

console.log('======== RATE LIMITING (migratie 0069) ========')
try { await run() } catch (e) { console.error('FOUT:', e.message); results.push({ ok: false }) }
const fail = results.filter(r => !r.ok).length
console.log(`\n${results.length - fail}/${results.length} tests geslaagd.`)
process.exit(fail === 0 ? 0 : 1)
