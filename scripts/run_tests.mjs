// ============================================================================
// Alle tests in één keer — draaien: npm test
// ----------------------------------------------------------------------------
// Er staan inmiddels twintig testscripts in scripts/. Ze los moeten aanroepen is
// precies de drempel waardoor ze na een wijziging niet gedraaid worden. Dit
// script zet ze op een rij en vat de uitkomst samen.
//
// Twee soorten:
//   * DATABASE — praten rechtstreeks met Supabase. Draaien altijd.
//   * APP      — hebben een draaiende dev-server nodig (npm run dev). Zonder
//                server worden ze netjes overgeslagen, niet als fout geteld.
//
// Gebruik:
//   npm test                  alles wat kan
//   npm test -- --alleen ai   alleen scripts met 'ai' in de naam
//   npm test -- --lijst       toon wat er zou draaien, draai niets
//
// Elk script ruimt zijn eigen testdata op; dit script maakt zelf niets aan.
// TLS: alles draait met --use-system-ca, want de REST/HTTPS-scripts hebben dat
// achter een bedrijfsproxy nodig (zie Projectstand).
// ============================================================================

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASIS = process.env.AI_TEST_BASIS || 'http://localhost:3000'

// Volgorde: eerst de brede beveiligingstests, dan per module, dan de zelftests.
const TESTS = [
  { naam: 'security_hardening_test.mjs',            soort: 'database' },
  { naam: 'signup_privilege_isolatie_test.mjs',     soort: 'database' },
  { naam: 'heartbeat_rpc_test.mjs',                 soort: 'database' },
  { naam: 'anon_execute_audit_test.mjs',            soort: 'database' },
  { naam: 'onveranderlijkheid_test.mjs',            soort: 'database' },
  { naam: 'nachttest_rls.mjs',                      soort: 'database' },
  { naam: 'nachttest_storage.mjs',                  soort: 'database' },
  { naam: 'toolbox_isolatie_test.mjs',              soort: 'database' },
  { naam: 'inspectie_isolatie_test.mjs',            soort: 'database' },
  { naam: 'inspectie_ai_isolatie_test.mjs',         soort: 'database' },
  { naam: 'centrale_bibliotheek_isolatie_test.mjs', soort: 'database' },
  { naam: 'audit_isolatie_test.mjs',                soort: 'database' },
  { naam: 'dashboard_isolatie_test.mjs',            soort: 'database' },
  { naam: 'dashboard_test.mjs',                     soort: 'database' },
  { naam: 'incident_isolatie_test.mjs',             soort: 'database' },
  { naam: 'teamleider_rol_isolatie_test.mjs',       soort: 'database' },
  { naam: 'module_isolatie_test.mjs',               soort: 'database' },
  { naam: 'persoon_merge_isolatie_test.mjs',        soort: 'database' },
  { naam: 'inspectie_e2e_test.mjs',                 soort: 'database' },
  { naam: 'inspectie_foto_selftest.mjs',            soort: 'database' },
  { naam: 'qr_selftest.ts',                         soort: 'zelftest' },
  { naam: 'ai_analyse_selftest.ts',                 soort: 'zelftest' },
  { naam: 'inspectie_ai_route_test.ts',             soort: 'app' },
  { naam: 'inspectie_ai_robuustheid_test.ts',       soort: 'app' },
]

const args = process.argv.slice(2)
const filter = (() => {
  const i = args.indexOf('--alleen')
  return i >= 0 ? (args[i + 1] ?? '').toLowerCase() : null
})()
const alleenLijst = args.includes('--lijst')

const gekozen = filter ? TESTS.filter(t => t.naam.toLowerCase().includes(filter)) : TESTS

if (gekozen.length === 0) {
  console.error(`Geen test met '${filter}' in de naam.`)
  process.exit(2)
}

async function appDraait() {
  try {
    await fetch(`${BASIS}/login`, { signal: AbortSignal.timeout(4000), redirect: 'manual' })
    return true
  } catch {
    return false
  }
}

function draai(script) {
  return new Promise(resolve => {
    const begin = Date.now()
    const kind = spawn('node', ['--use-system-ca', join('scripts', script)], { cwd: ROOT })
    let uit = ''
    kind.stdout.on('data', d => { uit += d.toString() })
    kind.stderr.on('data', d => { uit += d.toString() })
    // Zonder deze handler eindigt een mislukte spawn als een naamloze FAIL
    // zonder uitvoer, en ga je in het verkeerde script zoeken.
    kind.on('error', e => { uit += `\nSPAWN-FOUT: ${e.message}\n` })
    kind.on('close', (code, signal) => {
      const regels = uit.split(/\r?\n/).filter(Boolean)
      const samenvatting = [...regels].reverse()
        .find(r => /\d+\/\d+\s+(tests|checks|controles)\s+geslaagd|->\s*(PASS|FAIL)|EINDOORDEEL|isoleert per bedrijf/i.test(r))
      resolve({
        code,
        seconden: Math.round((Date.now() - begin) / 1000),
        samenvatting: (samenvatting ?? regels.at(-1)
          ?? `(geen uitvoer — exit ${code}${signal ? `, signaal ${signal}` : ''})`).trim().slice(0, 70),
        fails: regels.filter(r => /^FAIL/i.test(r.trim())).map(r => r.trim().slice(0, 160)),
      })
    })
  })
}

const appOk = gekozen.some(t => t.soort === 'app') ? await appDraait() : false

if (alleenLijst) {
  console.log(`Zou draaien (${gekozen.length}):\n`)
  for (const t of gekozen) {
    const status = t.soort === 'app' && !appOk ? 'OVERGESLAGEN (geen dev-server)' : t.soort
    console.log(`  ${t.naam.padEnd(42)} ${status}`)
  }
  process.exit(0)
}

console.log(`Testronde — ${gekozen.length} scripts\n`)
if (gekozen.some(t => t.soort === 'app')) {
  console.log(appOk
    ? `App bereikbaar op ${BASIS}; de app-tests draaien mee.\n`
    : `Geen dev-server op ${BASIS}; de app-tests worden overgeslagen.\n  (start 'npm run dev' in een tweede terminal om ze mee te nemen)\n`)
}

const uitkomsten = []
for (const t of gekozen) {
  if (t.soort === 'app' && !appOk) {
    uitkomsten.push({ ...t, overgeslagen: true })
    console.log(`SKIP  ${t.naam}`)
    continue
  }
  // Bewust één regel per test ná afloop, zonder \r-truc: dit belandt ook in
  // logbestanden en dan is een half overschreven regel onleesbaar.
  const r = await draai(t.naam)
  uitkomsten.push({ ...t, ...r })
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${t.naam.padEnd(42)} ${r.samenvatting} (${r.seconden}s)`)
  r.fails.slice(0, 6).forEach(f => console.log(`        ${f}`))
}

const gedraaid = uitkomsten.filter(u => !u.overgeslagen)
const stuk = gedraaid.filter(u => u.code !== 0)
const overgeslagen = uitkomsten.filter(u => u.overgeslagen)

console.log('\n' + '─'.repeat(76))
console.log(`${gedraaid.length - stuk.length}/${gedraaid.length} scripts groen`
  + (overgeslagen.length ? `, ${overgeslagen.length} overgeslagen (geen dev-server)` : ''))
if (stuk.length) {
  console.log('\nNiet groen:')
  stuk.forEach(u => console.log(`  · ${u.naam} — ${u.samenvatting}`))
}

process.exitCode = stuk.length ? 1 : 0
