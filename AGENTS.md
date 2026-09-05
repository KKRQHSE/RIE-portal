<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Elke nieuwe database-functie: expliciete REVOKE, geen vertrouwen op de default

Dit Supabase-project heeft een default-ACL die elke NIEUWE `CREATE FUNCTION` in schema `public`
standaard `EXECUTE` geeft aan `anon`, `authenticated` én `service_role` — vaak ook nog eens via een
PUBLIC-grant die `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` niet
tegenhoudt (bewezen, 5 sept 2026, vier varianten getest — zie migratie
`0070_default_acl_geen_anon_execute.sql` en memory `default-acl-werkt-niet`). Er is **geen
database-level manier gevonden** om dit bij de bron te voorkomen.

**Regel, verplicht voor elke nieuwe `CREATE FUNCTION`/`CREATE OR REPLACE FUNCTION` in een migratie:**
tenzij de functie bewust voor een sessieloze/anonieme aanroeper bedoeld is (een token-route zoals
`deellink_*`/`*_token`, of een RLS-predicate-helper), voeg in dezelfde migratie direct toe:
```sql
revoke execute on function public.<naam>(<argumenttypen>) from public, anon;
```
(niet alleen `from public` — dat trekt de aparte grant aan de rol `anon` zelf niet in.)

**Het enige harde vangnet:** `scripts/anon_execute_audit_test.mjs` (DEEL 1, een handmatig
onderhouden allowlist) draait automatisch vóór elke `git push` via een pre-push-hook
(`scripts/hooks/pre-push`). Dit project heeft geen CI (geen GitHub Actions, geen Vercel-build-
checks) — de hook is de enige gate. **Eenmalig activeren per checkout** (git kopieert hooks niet
mee bij clonen):
```sh
git config core.hooksPath scripts/hooks
```
Een nieuwe, bewust anon-aanroepbare functie hoort thuis in de `TOKENFLOWS`- of `HELPERS`-lijst
bovenin dat testscript, met een reden erbij — nooit stilzwijgend laten staan.
