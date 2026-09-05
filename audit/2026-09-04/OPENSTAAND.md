# Openstaand voor Kees — nachtopdracht 4/5 september 2026

Dit bestand verzamelt elke businesskeuze, AVG-afweging, onduidelijke productiestatus of
authenticatie-/migratie-infra-vraag waarbij ik NIETS heb gebouwd, zoals afgesproken (Regel 1).
Per item: de vraag, wat ik aantrof, en mijn aanbevolen richting — geen van deze is doorgevoerd.

---

## 1. Teamleider-inzage in individuele toolbox-bewijsstukken — bedoeld of niet?

**Bron:** `audit/2026-09-04/teamleider-inventaris.md` (fork-onderzoek, zie daar voor de volledige
citaten). `/[company_id]/toolbox/bewijs/[deelname_id]` is voor teamleider toegankelijk — zowel de
page-gate als de RLS op `toolbox_deelname` laten hem door. Dit wordt nergens expliciet genoemd in de
bouw-memory van de teamleider-feature (die wél expliciet benoemt wat teamleider bij toolbox-sessies
mag: bewerken van elke sessie, verwijderen alleen van eigen sessies).

**Wat ik aantrof:** een individueel bewijsstuk toont de bevroren naam, handtekening en
titel/tekst-snapshot van een toolbox-deelname — geen gezondheidsgegevens, wel een handtekening
(persoonsgegeven). Niet per se problematisch, maar ook niet aantoonbaar een bewuste keuze.

**Aanbevolen richting:** geen technisch oordeel van mij — dit is precies het soort "mag teamleider
dit zien"-vraag die bij het rechtenmodel hoort (dat is jouw beslissing, expliciet niet aan mij).
Ik heb hier niets aan gewijzigd.

---

## 2. Open onderzoeksvraag — waarom negeert Supabase `ALTER DEFAULT PRIVILEGES ... REVOKE
   EXECUTE ON FUNCTIONS FROM PUBLIC`?

**Wat er is vastgesteld (hard, live getest, 5 sept 2026):** het door de Postgres-documentatie
voorgeschreven standaardpatroon om te voorkomen dat elke nieuwe functie in `public` standaard
`EXECUTE` krijgt voor `PUBLIC` (en dus impliciet ook `anon`) — `ALTER DEFAULT PRIVILEGES IN SCHEMA
public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` — heeft in dit Supabase-project **geen
waarneembaar effect**. Getest in vier varianten (impliciete rol, `FROM anon`, `FROM public`,
expliciet `FOR ROLE postgres`, en atomisch binnen dezelfde transactie als een proef-
`CREATE FUNCTION`) — zie migratie `supabase/migrations/0070_default_acl_geen_anon_execute.sql` en
memory `default-acl-werkt-niet` voor de volledige reproductie. `pg_default_acl` zelf toont wél de
gewenste, aangepaste lijst — maar een nieuwe functie krijgt de PUBLIC-grant toch, via een
mechanisme dat niet met SQL-introspectie te achterhalen was.

**Niet uitgezocht (bewust, op jouw verzoek):** *waarom* Supabase's postgres-omgeving dit negeert.
Vermoeden, niet bevestigd: iets hardcoded in hun eigen postgres-image/provisioning, mogelijk een
event-trigger of extensie die buiten `pg_event_trigger`/`pg_default_acl` om werkt (de zes bestaande
event-triggers zijn nagelopen en zijn het niet — alleen PostgREST-schema-reload-notificaties en
extensie-specifieke grants voor pg_cron/pg_net/pg_graphql).

**Aanbevolen richting, als je dit ooit wilt uitzoeken:** Supabase-documentatie/support raadplegen,
of vergelijken met een vers, leeg Supabase-project (zonder deze 60+ migraties historie) om te zien
of het daar hetzelfde gedrag vertoont — dat zou uitsluiten dat het aan iets project-specifieks ligt.

**Praktisch gevolg, nu al opgelost:** omdat de database-laag dit niet structureel afdwingt, is
`scripts/anon_execute_audit_test.mjs` (met een pre-push-hook, zie `scripts/hooks/pre-push` en
AGENTS.md) het enige werkende vangnet — dat staat nu, dit onderzoekspunt is puur nieuwsgierigheid
naar de onderliggende oorzaak, geen openstaand risico.

---

## 3. CI-status (5 sept 2026)

Geen CI aanwezig (geen `.github/workflows`, geen `vercel.json`) — het vangnet tegen onverklaarde
anon-EXECUTE loopt daarom alleen via de lokale `scripts/hooks/pre-push`-hook
(`core.hooksPath = scripts/hooks`), niet via een server-side/verplichte check. Bij een nieuwe
checkout of CI-omgeving moet die hook-config apart gezet worden, anders draait het vangnet niet mee.

---

## 4. AVG-data-inventaris (5 sept 2026) — vijf openstaande punten

**Bron:** `audit/2026-09-04/DATA-INVENTARIS.md`, puur uit code/schema opgesteld, geen wijzigingen
aangebracht. Vijf punten die een businessbeslissing vragen, geen technisch dilemma:

**a. `audit_log` is per ontwerp onverwijderbaar.** Triggers blokkeren DELETE/UPDATE/TRUNCATE,
expliciet ook voor service-role. De tabel bevat aantoonbaar persoonsgegevens (naam + e-mail worden
erin gezet zodra een `personen`-rij verwijderd wordt). Als er ooit een "recht op vergetelheid"-
verzoek komt, is er geen technisch pad om dat gegeven daar weg te krijgen. Vraag: is dit een
bewuste keuze (audit-trail moet onveranderlijk zijn) en zo ja, welke bewaartermijn/rechtvaardiging
hoort daarbij volgens de AVG (een onbeperkte bewaartermijn is normaliter niet houdbaar)?

**b. Geen bewaartermijn ingericht op nagenoeg elke tabel met persoonsgegevens.** Met name
`herinnering_log`, `rate_limiet_log` en verlopen `deellinks` groeien ongelimiteerd. Vraag: welke
bewaartermijn hoort hierbij, en is een opschoonproces gewenst?

**c. Geen end-to-end "verwijder deze medewerker volledig"-pad.** Het enige hard-delete-pad op
`personen` zit verstopt in de samenvoeg-functie (voor dubbele records, admin-only) en laat
toolbox-bewijs (naam + handtekening) bewust staan. Vraag: moet er een aparte, AVG-gerichte
verwijderroute komen, en wat moet die wel/niet raken (toolbox-bewijs is bewust onveranderlijk
trainingsbewijs — mag dat blijven staan na een verwijderverzoek, of niet)?

**d. Handtekening in toolbox-bewijs is voor teamleider zichtbaar zonder maskering** — in
tegenstelling tot de gezondheidsvelden bij incidenten, die wél server-side gemaskeerd zijn voor
teamleider. Vraag: is dit bewust (teamleider moet kunnen aantonen wie tekende) of moet dit ook
gemaskeerd/beperkt worden?

**e. Geen route bestaat om een heel bedrijf (`companies`-rij) te verwijderen**, en zou die er komen
dan loopt hij vast op `rie_versies` (geen ON DELETE-actie) en laat hij wezen achter in `audit_log`/
`rate_limiet_log` (geen FK naar companies). Vraag: is een "bedrijf volledig offboarden"-pad nodig
(bv. bij einde klantrelatie), en zo ja, hoe grondig (harde wis vs. gearchiveerd bewaren)?

Geen van deze vijf is door mij ingevuld — puur gesignaleerd.

---
