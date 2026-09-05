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

(wordt aangevuld)

## Fase 2 — IF-getal netjes

(wordt aangevuld)

## Fase 3 — Meerjaren-dashboard

(wordt aangevuld)

## Wat te testen in de browser (ook mobiel)

(wordt aangevuld per fase)

## Openstaand voor jou (met voorstel)

(wordt aangevuld)
