# Samenvatting — nachtopdracht 4/5 september 2026

Vervolg op `SYSTEEMDOORLICHTING_2026-09-04.md`, `AANSCHERPING_systeemdoorlichting_2026-09-04.md` en
`SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md`. Alles hieronder is uitgevoerd op branch
**`fix/audit-restpunten`** (niet gemerged naar `main` — dat is aan Kees), één commit per item,
telkens ná een groene `npx tsc --noEmit` + `npx next build` + `npm test` (dev-server actief).

**Reproduceerbaarheid.** Git-commit bij afsluiten: `b01c643`. Laatste migratie:
`0068_audit_log.sql`. Supabase-project: `hmoihxsxapzvxfokggad.supabase.co`. Node v24.15.0, npm
11.12.1. Afgesloten: 2026-09-04T23:35 CEST / 21:35 UTC. Volledige testsuite bij afsluiten:
**28/28 scripts groen**.

---

## Per item: wat gefixt, wat getest, wat open

### Item 1 — Audit-logging: GEBOUWD
Nieuwe append-only `audit_log`-tabel (admin-only leesbaar, RLS), met de vijf vooraf afgesproken
correcties (geen FK op wie/company_id, TRUNCATE ook geblokkeerd, expliciete
`search_path=public,pg_temp`, download-logging faalt zichtbaar-niet-blokkerend, legt uitgifte vast
niet het ophalen). Twee onomzeilbare tabel-triggers (`persoon_verwijderd`, `rol_gewijzigd`) plus
vijf RPC-wire-ins (`incident_gewijzigd` ×2, `personen_samengevoegd`, `bewijs_gedownload`/
`foto_gedownload` ×4 routes). **Onderweg gevonden en gefixt:** dit Supabase-project heeft een
default-ACL die elke nieuwe functie standaard anon-EXECUTE geeft — `REVOKE ... FROM PUBLIC` trekt
dat niet in, alleen een expliciete `REVOKE ... FROM anon`. Alle vier nieuwe functies gecorrigeerd.
Test: `audit_log_test.mjs` (15/15). Commit `8a108bd`.

### Item 2 — Teamleider-page-gate audits/[audit_id]: GEFIXT
Pure consistentie-fix: dezelfde expliciete `role === 'teamleider' → notFound()` die de lijstpagina
al had, nu ook op de detailpagina. Geen rechtenmodel gewijzigd. Test: volledige suite (26/26).
Commit `96adc18`.

### Item 3 — pg_policies systematisch: ONDERZOCHT, geen fixes nodig
13 write-capable policies, fris herhaald tegen de huidige DB. Geen nieuwe onverwacht brede policy.
Enige brede `ALL`-policy blijft `personen_write` (bekend, cascade-kant al gefixt in 0061). Rapport +
ruwe data: `item3-4-6-7-onderzoek.md`, `item3_pg_policies_schrijf.json`. Commit `bfa1ab2`.

### Item 4 — Alle FK ON DELETE-acties: ONDERZOCHT, geen fixes nodig
62 CASCADE's, volledige lijst in `item4_fk_cascades.json`. Kernbevestiging:
`toolbox_deelname_persoon_id_fkey` staat niet meer in de CASCADE-lijst — de 0061-fix houdt stand.
Geen nieuwe risicovolle cascade via de teamleider- of audit-log-migraties. Of er al productiedata
verloren is via het oude 4.4-pad blijft **NIET VAST TE STELLEN** (verwijderde rijen laten geen
spoor na — eerlijke, ongewijzigde conclusie uit Ronde 2). Commit `bfa1ab2`.

### Item 5 — Token-flows AANGENOMEN → BEWEZEN: GETEST, permanente regressie
Nieuw script `token_flows_test.mjs` (16/16): `deellink_data` (geldig/verlopen/ingetrokken/
onbestaand/hergebruik-by-design/na-archivering, entropie 144 bit) en
`incident_meldcontext_token`/`incident_melden_token`/`incident_foto_pad_token` (context zonder
incidentdata, cross-company geblokkeerd, correct bedrijf uit het token). Commit `91b3c8c`.

### Item 6 — Kolomnaam toestemming_bevestigd/p_toestemming: BEVESTIGD, geen bug
Normale parameter→kolom-mapping, geen inconsistentie (al opgehelderd in Ronde 2 Deel B, vanavond
herbevestigd). `item3-4-6-7-onderzoek.md`.

### Item 7 — Vergeten testdata MEET_/ONVTEST_: GEÏNVENTARISEERD, niets verwijderd
`MEET_1788246236870`: 1 leeg testaccount, 0 personen/toolbox/pva — geen toegangsrisico.
`ONVTEST_...` bestaat al niet meer. Niet mijn testdata, dus niet opgeruimd — **zie OPENSTAAND.md
is hiervoor niet nodig** (geen businesskeuze, puur een housekeeping-optie voor Kees).
`item3-4-6-7-onderzoek.md`.

### Item 8 — Browser-E2E smoke test: GEBOUWD EN GEDRAAID
Playwright + Chromium geïnstalleerd (nieuwe devDependency, ~300MB browserbinary lokaal). Nieuw
script `browser_smoke_test.mjs` (21/21): echte login via de UI (client én admin), alle
hoofdmodules bezocht, kernactie-ingang gecontroleerd, twee geweigerde acties (ander bedrijf,
admin-scherm als client) geven een nette 404 i.p.v. een crash. 19 screenshots in
`audit/2026-09-04/screenshots/` — visueel gecontroleerd, tonen echt gerenderde pagina's (incl.
herkenbare bestaande klantnamen in de admin-rollup, dus dit is een levende, realistische
weergave). Commit `b01c643`.

### Bonusronde — bredere applicatiebeveiliging: AL GEDEKT (samenwerking met parallelle sessie)
Tijdens deze nacht liep een tweede Claude-sessie (rie-portal-0c) op dezelfde machine, die
onafhankelijk aan security headers/CSP/rate-limiting/dependency-audit/search_path begon —
gecoördineerd (zie hieronder) zodat er geen dubbel werk ontstond:
- **Door mij** (Ronde 2 + vannacht herbevestigd): security headers/CSP (BEWEZEN AFWEZIG), rate
  limiting (BEWEZEN AFWEZIG, nergens), dependency-audit (item 3 hierboven: 0 vulnerabilities ná de
  Next.js-upgrade), SECURITY DEFINER search_path (127/127 functies veilig, incl. de 3 nieuwe van
  vannacht).
- **Door rie-portal-0c** (op `main`, commit `912c073`, rapport
  `SYSTEEMDOORLICHTING_APPLICATIEBEVEILIGING_2026-09-04.md`): cookie-instellingen,
  session-lifecycle, password-reset-flow, XSS, CSRF. **Nieuwe bevinding daarin, niet door mij
  geverifieerd:** een open redirect in `app/auth/callback/route.ts` (de `next`-queryparameter wordt
  ongevalideerd in een redirect geplakt). Niet gefixt (raakt auth-infra, buiten mijn takenlijst) —
  zie dat rapport voor reproductie + voorgestelde fix.

---

## OPENSTAAND.md — wat NIET is gebouwd (Regel 1)

Zie `audit/2026-09-04/OPENSTAAND.md` voor de volledige tekst. Eén punt vastgelegd:
- **Teamleider-inzage in individuele toolbox-bewijsstukken** (`/[company_id]/toolbox/bewijs/[id]`)
  is technisch mogelijk (page-gate + RLS laten het toe) maar nergens expliciet als bedoeld
  vastgelegd in de teamleider-bouw-memory. Businesskeuze, niet door mij ingevuld.

Daarnaast, niet in OPENSTAAND.md maar wel te vermelden: de open-redirect-bevinding van
rie-portal-0c (hierboven) raakt authenticatie-infra en is dus terecht door die sessie
gedocumenteerd-niet-gefixt, niet door mij opgepakt.

---

## Wat nog open staat voor Kees

1. **Open redirect in `app/auth/callback/route.ts`** (gevonden door rie-portal-0c, op `main`) —
   P2/P3, reproductie + voorgestelde fix in `SYSTEEMDOORLICHTING_APPLICATIEBEVEILIGING_2026-09-04.md`.
2. **Teamleider-inzage in toolbox-bewijsstukken** — bedoeld of niet? (`OPENSTAAND.md`)
3. **`MEET_1788246236870`-testresidu** — opruimen of laten staan? (item 7)
4. **`fix/audit-restpunten` is nog niet gemerged** naar `main` — 8 commits, allemaal los te
   beoordelen (`8a108bd` audit-log, `96adc18` teamleider-gate, `bfa1ab2` onderzoek 3/4/6/7,
   `91b3c8c` token-flows-test, `b01c643` browser-smoke-test, plus de eerdere upload-validatie/
   Next.js-upgrade-commits van eerder vanavond).
5. **Backup/PITR** (Ronde 2, punt 7) — nog steeds alleen in het Supabase-dashboard te
   controleren, niet vanuit code.
6. **De AVG-brede vragen uit Ronde 2** (bewaartermijnen, verwijderrecht, subverwerkers) —
   nog steeds niet technisch te beantwoorden, nog steeds open.
7. **Browser-E2E dekt nu de basis, niet alles** — teamleider-rol en de token-flows zelf (gast-
   uploads, deellink-pagina) zijn NIET via de browser getest, alleen via directe RPC-aanroepen
   (item 5). Een volgende ronde zou dat kunnen uitbreiden.

## Eindconclusie

Alle negen gevraagde items zijn afgerond: twee gebouwd en getest (audit-logging,
teamleider-page-gate-consistentie), vier onderzocht en vastgelegd zonder dat een fix nodig bleek
(pg_policies, FK-cascades, kolomnaam, testresidu), één van AANGENOMEN naar BEWEZEN getild met een
permanente test (token-flows), en de browser-laag is voor het eerst in deze hele doorlichting
écht getest (smoke-test, 21/21, met screenshots). Elke stap is gedekt door tsc + build + de
volledige testsuite, groen vóór elke commit. Niets is stilzwijgend aangepast aan het
health-data-model, het teamleider-rechtenmodel, of de bestaande bevroren-data-triggers/RLS — waar
een keuze niet aan mij was, staat die in `OPENSTAAND.md`.
