// Puur, testbaar stukje van app/auth/callback/route.ts — geen geheimen, geen
// server-only-imports, dus ook los te testen (zie scripts/auth_redirect_test.ts).
//
// Valideert een 'next'-vervolgpad ná een auth-callback (wachtwoord-reset/
// uitnodiging). 'next' komt ongefilterd uit de query-string van de aanvrager.
// Zonder deze check zou een waarde als '@evil.com/x' via de WHATWG-URL-parser
// (userinfo@host-syntax, RFC 3986) naar een ander domein redirecten in plaats
// van hierheen — zie SYSTEEMDOORLICHTING_APPLICATIEBEVEILIGING_2026-09-04.md.
//
// Toegestaan: alleen een eigen, relatief pad (begint met exact één '/', geen
// '@', ':' of '\'). Dat sluit het userinfo@host-trucje, protocol-relative
// URL's ('//evil.com'), schema-injectie ('javascript:...') en backslash-
// trucs uit. Alles anders: null (de aanroeper valt dan terug op een veilige,
// rol-gebaseerde default).
export function veiligRedirectPad(next: string | null | undefined): string | null {
  if (
    !!next &&
    next.startsWith('/') && !next.startsWith('//') &&
    !next.includes('@') && !next.includes(':') && !next.includes('\\')
  ) {
    return next
  }
  return null
}
