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
