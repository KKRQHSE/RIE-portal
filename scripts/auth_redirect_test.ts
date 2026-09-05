// ============================================================================
// Zelftest voor de open-redirect-fix in app/auth/callback/route.ts
// ----------------------------------------------------------------------------
// Test de ECHTE functie uit lib/auth-redirect.ts (Node 24 strip-types, geen
// build-stap nodig), geen kopie. Geen netwerk, geen database — puur de
// validatielogica die bepaalt of een 'next'-queryparameter als vervolgpad
// mag worden gebruikt.
//
// Draaien:  node scripts/auth_redirect_test.ts
// ============================================================================

import { veiligRedirectPad } from '../lib/auth-redirect.ts'

const results: { naam: string; ok: boolean }[] = []
function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

console.log('--- Bekende bypasses (moeten allemaal null opleveren) ---\n')

check("'@evil.com/phish' (het exacte reproductiegeval) wordt geweigerd",
  veiligRedirectPad('@evil.com/phish') === null)
check("'portal.example.nl@evil.com' wordt geweigerd",
  veiligRedirectPad('portal.example.nl@evil.com') === null)
check("'/@evil.com' (met leading slash, userinfo-truc alsnog) wordt geweigerd",
  veiligRedirectPad('/@evil.com') === null)
check("'//evil.com' (protocol-relative) wordt geweigerd",
  veiligRedirectPad('//evil.com') === null)
check("'///evil.com' wordt geweigerd",
  veiligRedirectPad('///evil.com') === null)
check("'http://evil.com' (absolute externe URL) wordt geweigerd",
  veiligRedirectPad('http://evil.com') === null)
check("'https://evil.com/phish' wordt geweigerd",
  veiligRedirectPad('https://evil.com/phish') === null)
check("'javascript:alert(1)' (schema-injectie) wordt geweigerd",
  veiligRedirectPad('javascript:alert(1)') === null)
check("'/\\\\evil.com' (backslash-truc, met leading slash) wordt geweigerd",
  veiligRedirectPad('/\\evil.com') === null)
check("'\\\\evil.com' (kale backslash) wordt geweigerd",
  veiligRedirectPad('\\evil.com') === null)
check("'dashboard' (geen leading slash) wordt geweigerd",
  veiligRedirectPad('dashboard') === null)
check("lege string wordt geweigerd",
  veiligRedirectPad('') === null)
check("null wordt geweigerd",
  veiligRedirectPad(null) === null)
check("undefined wordt geweigerd",
  veiligRedirectPad(undefined) === null)

console.log('\n--- Positieve controle: bestaand, legitiem gebruik blijft werken ---\n')

check("'/set-wachtwoord' blijft toegestaan (bestaand gebruik, wachtwoord-reset)",
  veiligRedirectPad('/set-wachtwoord') === '/set-wachtwoord')
check("'/dashboard' blijft toegestaan",
  veiligRedirectPad('/dashboard') === '/dashboard')
check("een company-pad blijft toegestaan",
  veiligRedirectPad('/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/pva') === '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/pva')

const mislukt = results.filter(r => !r.ok)
console.log('\n' + '─'.repeat(60))
console.log(`${results.length - mislukt.length}/${results.length} tests geslaagd.`)
process.exitCode = mislukt.length ? 1 : 0
