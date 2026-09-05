# Nachtbouw-rapport — 5/6 september 2026

Zelfstandige bouwsessie, ik werk door zonder tussentijdse bevestiging. Harde grenzen: geen
destructieve SQL, geen echte klantdata aanraken, alleen additief, ontwerpkeuzes documenteren
i.p.v. zelf beslissen. Alles op `main`, commit + push per fase.

## Fase 0 — Basis op orde

- Main was 1 commit vóór origin/main: `535e427` ("feat(avg): basis-infrastructuur AVG-tab").
  Geverifieerd dat dit de cherry-pick van `a331877` (op `feat/avg-fundament`) is — zelfde
  boodschap, `scripts/avg_beheer_gate_test.ts` en de AVG-pagina staan op main. Main is dus
  compleet; geen extra werk nodig om "de enige waarheid" te zijn.
- Trof een niet-gecommit wijziging aan in `scripts/run_tests.mjs` (regel voor
  `avg_beheer_gate_test.ts` weer toegevoegd). Commit `cf7eeb8` had die regel er eerder uitgehaald
  omdat het bestand toen nog niet op main bestond; nu de AVG-cherry-pick binnen is, bestaat het
  bestand wél. De uncommitted wijziging was dus precies het "komt hier later weer bij" waar
  cf7eeb8 op doelde — legitiem, niet iemands verloren werk. Gecommit.
- Nulmeting:
  - `tsc --noEmit`: schoon, geen fouten.
  - `next build`: groen, 14 routes gecompileerd.
  - Volledige testsuite (`node --use-system-ca scripts/run_tests.mjs`): **34/34 groen** (na het
    starten van een eigen dev-server — de gedeelde dev-server op poort 3000 (PID 2200, niet van
    mij) viel halverwege de eerste run stil, waardoor de drie app-tier tests toen faalden op
    "geen respons"; dat was geen echte regressie, zie [[heartbeat-geen-toegang]]-achtig patroon
    van gedeelde working-directory-coördinatie. Eigen dev-server gestart, alle drie opnieuw
    gedraaid: groen.)
- **Gepusht**: ja.

## Fase 1 — Datagaten dichten

Migratie `0074_inspectie_project_en_uitvoerder_koppeling.sql`, toegepast op de live DB en
`db/schema.sql` opnieuw gedumpt.

**1a. Project/locatie op inspecties.**
- Nieuwe kolom `inspectie.project_locatie` (tekst, nullable — bestaande rijen NULL).
- Nieuwe RPC `inspectie_project_opslaan(p_inspectie_id, p_project_locatie)`, zelfde patroon als
  `inspectie_conclusie_opslaan`: alleen terwijl status concept/ingediend, leeg/witruimte wordt
  NULL. Expliciete `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated, service_role`
  toegevoegd (verplicht per AGENTS.md-regel) — bevestigd met `anon_execute_audit_test.mjs`
  (nog steeds 22 anon-EXECUTE-functies, allemaal verklaard, niets nieuws onverwacht).
- `inspectie_bibliotheek` en `inspectie_rapport` geven het veld nu mee.
- UI: invoerveld "Project / locatie" bovenaan een inspectie tijdens het uitvoeren
  (`InspectieUitvoeren.tsx`, opslaan on-blur, NL+TR vertaald), filter + weergave op de
  bibliotheekkaart (`InspectieClient.tsx`, zelfde patroon als het bestaande sjabloon/
  uitvoerder/jaar-filter), en op het afgeronde rapport (`InspectieRapport.tsx`).

**1b. Persoon-koppeling bij het starten.**
- `inspectie_start` en `inspectie_start_centraal` vullen `inspectie.persoon_id` nu automatisch
  vanuit `personen.user_id = auth.uid()` binnen hetzelfde bedrijf (company-scoped — een
  personen-rij met hetzelfde `user_id` bij een ánder bedrijf telt niet mee). Ontbreekt de
  koppeling (nog geen personen-rij met dit `user_id`), dan blijft `persoon_id` NULL en werkt de
  bestaande omweg (inspectie_historie.wie → users → personen) gewoon door — geen breaking change.
- Vrijgeven-vraag uit de opdracht is met opzet NIET apart gebouwd: afronden door de uitvoerder
  ís het vrijgeven, geen los KAM-goedkeuringsmoment.

**Nieuwe test:** `scripts/inspectie_project_persoon_test.mjs` (15/15), toegevoegd aan
`run_tests.mjs`. Dekt: auto-fill mét/zonder koppeling, cross-company-personen-rij telt niet mee,
project_locatie zichtbaar in bibliotheek+rapport, trim-naar-NULL, geblokkeerd na afronden,
zelfde auto-fill bij `inspectie_start_centraal`.

**Nulmeting na deze fase:** tsc schoon, build groen, volledige suite **35/35** groen.
**Gepusht**: ja.

## Fase 2 — IF-getal netjes

(wordt aangevuld)

## Fase 3 — Meerjaren-dashboard

(wordt aangevuld)

## Wat te testen in de browser (ook mobiel)

(wordt aangevuld per fase)

## Openstaand voor jou (met voorstel)

(wordt aangevuld)
