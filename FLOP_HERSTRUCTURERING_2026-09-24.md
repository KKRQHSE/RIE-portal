# FLOP-herstructurering SeysCentra — lopend rapport

> Bedrijf: SeysCentra B.V. (`bd16538b-01e9-41d2-84ad-fe5690917cba`). Zelfstandige sessie,
> gestart 2026-09-24. Werk gebeurt in fases; dit bestand wordt na elke fase bijgewerkt en
> gepusht, zodat de voortgang zichtbaar is ook als de sessie halverwege stilvalt.

## Doel

Van de huidige SeysCentra-RI&E (9 modules: F1-F4 per functiegroep, L1-L4 per vestiging, O1
beleid) een schone FLOP-12-module-structuur maken:
F1 Gevaarlijke stoffen, F2 Fysieke belasting, F3 Schadelijke factoren,
L1 Brandveiligheid en BHV, L2 Mobiliteit en transport, L3 Werken op externe locaties,
O1 Preventiebeleid en arbo-organisatie, O2 PAGO en gezondheidsbeleid, O3 Kwetsbare groepen,
P1 Stress en werkdruk, P2 Intimidatie en ongewenst gedrag, P3 Ingrijpende gebeurtenissen/PSA.

Alle bestaande vragen/antwoorden/bevindingen/PvA-acties blijven behouden — alleen `module_id`
verandert (en voor het L-blok blijft `locatie_id` per vraag ongewijzigd: L1-L3 zijn thema's,
geen vestigingen; de vestiging blijft een attribuut op de vraag, zoals nu al het geval is).
`functiegroep_id` op vragen/pva_items blijft ongewijzigd staan (attribuut, geen module meer).

Alleen SeysCentra wordt geraakt. Andere bedrijven (Dutch Waste, Geissler, testbedrijven) mogen
niets merken — er komt geen schemawijziging voor nodig (module/vraag-koppeling bestaat al),
dus dit is puur databeweging binnen één company_id, geen migratie met schema-impact verwacht.

## Fase 0 — Baseline + veiligheidskopie (voltooid)

**Backup weggeschreven** (vóór enige wijziging) naar
`audit/2026-09-24_flop-herstructurering/`:
- `backup_vragen_full.json` — alle 63 vragen-rijen, alle kolommen
- `backup_pva_items_full.json` — alle 60 pva_items-rijen, alle kolommen
- `backup_modules_full.json` — alle 9 modules-rijen
- `backup_vragen_voor_flop.json` — leesbare export (nr, module, functiegroep, locatie, vraag,
  antwoord, pva, klasse) gebruikt voor de classificatie hieronder

**Baseline-telling (vóór wijziging):**

| Metriek | Aantal |
|---|---|
| Vragen totaal | 63 |
| Vragen met antwoord | 63 |
| Vragen met locatie_id (niet null) | 21 |
| Vragen met functiegroep_id (niet null) | 30 |
| PvA-acties totaal | 60 |
| PvA-acties met locatie_id | 21 |
| Modules totaal | 9 |
| Foto's | 0 |

**Inhouds-hash (controlegetal, moet ná de migratie identiek zijn):**
`md5(nr|vraag|antwoord|bevinding|pva samengevoegd, gesorteerd op nr)` =
`44dba2a0e1a43fb3eb2fe5b892be7ca7`

Als dit getal na de migratie ongewijzigd is, is bewezen dat geen enkele vraag-, antwoord-,
bevinding- of PvA-referentietekst is aangepast — alleen de module-indeling.

## Fase 1 — Classificatie (voltooid)

Alle 63 vragen inhoudelijk beoordeeld en toegewezen aan één van de 12 FLOP-modules. Uitgangspunt:
`module_id` verandert, `nr`/`vraag`/`antwoord`/`bevinding`/`pva`/`locatie_id`/`functiegroep_id`
blijven **letterlijk ongewijzigd** — dit is puur een herindeling, geen contentwijziging.

**Belangrijk, gelezen in de brondata vóór classificatie:** twee vragen (`L1-1` en `L2-1` in de
oude indeling) hebben een vraagtekst die naar de VERKEERDE vestiging verwijst t.o.v. hun eigen
`locatie_id`:
- `L1-1` heeft `locatie_id` = Maastricht, maar de vraagtekst luidt "Is de trap op locatie
  **Malden** structureel beveiligd...".
- `L2-1` heeft `locatie_id` = Malden, maar de vraagtekst luidt "Zijn meterkasten op locatie
  **Maastricht** (De Horst 12) vrij van opslag...".

Dit lijkt een verwisseling uit de eerdere dummy-content-herschrijving (11 sept). **Ik heb dit
NIET gecorrigeerd** — dat zou vraagtekst of locatiekoppeling wijzigen, wat buiten de opdracht
valt (puur herindelen, niets verzinnen/aanpassen) en een inhoudelijke keuze is die aan jou is.
Beide vragen zijn wel gewoon meeverhuisd naar hun nieuwe FLOP-module (L1 Brandveiligheid en
BHV), met hun bestaande (mogelijk verwisselde) `locatie_id` ongewijzigd. **Graag apart nalopen.**

### Mapping oud → FLOP (per vraag)

| nr | oude module/functiegroep of locatie | → FLOP | zekerheid |
|---|---|---|---|
| F1-1 | Functie Behandelaren | F2 Fysieke belasting | eenduidig |
| F1-2 | Functie Behandelaren | F2 Fysieke belasting | eenduidig |
| F1-3 | Functie Behandelaren | F2 Fysieke belasting | eenduidig |
| F1-4 | Functie Behandelaren | F1 Gevaarlijke stoffen | eenduidig (biologische agentia/PBM) |
| F1-5 | Functie Behandelaren | O2 PAGO en gezondheidsbeleid | twijfelgeval (kan ook F1) |
| F1-6 | Functie Behandelaren | F1 Gevaarlijke stoffen | redelijk eenduidig (hygiëne/besmetting) |
| F1-7 | Functie Behandelaren | O2 PAGO en gezondheidsbeleid | twijfelgeval (kan ook F1) |
| F1-8 | Functie Behandelaren | F3 Schadelijke factoren | eenduidig (binnenklimaat) |
| F1-9 | Functie Behandelaren | L3 Werken op externe locaties | twijfelgeval (kan ook F1/O1) |
| F1-10 | Functie Behandelaren | P3 Ingrijpende gebeurtenissen/PSA | eenduidig (nazorg) |
| F1-11 | Functie Behandelaren | P1 Stress en werkdruk | eenduidig |
| F1-12 | Functie Behandelaren | P2 Intimidatie en ongewenst gedrag | eenduidig |
| F1-13 | Functie Behandelaren | O1 Preventiebeleid en arbo-organisatie | twijfelgeval (kan ook P2/P3) |
| F2-1 | Functie Coördinatoren | F2 Fysieke belasting | eenduidig |
| F2-2 | Functie Coördinatoren | P1 Stress en werkdruk | twijfelgeval (rolbelasting) |
| F2-3 | Functie Coördinatoren | L2 Mobiliteit en transport | eenduidig |
| F2-4 | Functie Coördinatoren | P1 Stress en werkdruk | twijfelgeval (herstel/pauze) |
| F3-1 | Functie Ondersteunende diensten | F3 Schadelijke factoren | eenduidig |
| F3-2 | Functie Ondersteunende diensten | F3 Schadelijke factoren | eenduidig |
| F3-3 | Functie Ondersteunende diensten | F2 Fysieke belasting | eenduidig |
| F3-4 | Functie Ondersteunende diensten | P1 Stress en werkdruk | eenduidig |
| F3-5 | Functie Ondersteunende diensten | O1 Preventiebeleid en arbo-organisatie | twijfelgeval (kan ook P2) |
| F4-1 | Functie Persoonlijk begeleiders | F2 Fysieke belasting | eenduidig |
| F4-2 | Functie Persoonlijk begeleiders | P1 Stress en werkdruk | twijfelgeval (pauzeruimte) |
| F4-3 | Functie Persoonlijk begeleiders | F2 Fysieke belasting | eenduidig |
| F4-4 | Functie Persoonlijk begeleiders | O2 PAGO en gezondheidsbeleid | twijfelgeval (kan ook F1) |
| F4-5 | Functie Persoonlijk begeleiders | F1 Gevaarlijke stoffen | redelijk eenduidig |
| F4-6 | Functie Persoonlijk begeleiders | F3 Schadelijke factoren | eenduidig |
| F4-7 | Functie Persoonlijk begeleiders | P1 Stress en werkdruk | twijfelgeval (pauzeruimte) |
| F4-8 | Functie Persoonlijk begeleiders | P1 Stress en werkdruk | eenduidig |
| L1-1 | Locatie Maastricht | L1 Brandveiligheid en BHV | twijfelgeval + **data-anomalie, zie boven** |
| L2-1 | Locatie Malden | L1 Brandveiligheid en BHV | eenduidig qua thema (brandveiligheidseisen) + **data-anomalie, zie boven** |
| L2-2 | Locatie Malden | L1 Brandveiligheid en BHV | redelijk eenduidig (elektra) |
| L2-3 | Locatie Malden | L1 Brandveiligheid en BHV | eenduidig (evac-chair) |
| L2-4 | Locatie Malden | L1 Brandveiligheid en BHV | eenduidig (EHBO) |
| L2-5 | Locatie Malden | L1 Brandveiligheid en BHV | **restcategorie** (binnenklimaat past inhoudelijk niet bij BHV) |
| L2-6 | Locatie Malden | L1 Brandveiligheid en BHV | **restcategorie** (akoestiek/privacy) |
| L2-7 | Locatie Malden | L1 Brandveiligheid en BHV | eenduidig (trapleuning/valgevaar) |
| L2-8 | Locatie Malden | L1 Brandveiligheid en BHV | redelijk eenduidig (brandgevaarlijke stof-opslag) |
| L3-1 | Locatie Utrecht | L1 Brandveiligheid en BHV | **restcategorie** (fysieke belasting trap/tillen) |
| L3-2 | Locatie Utrecht | L1 Brandveiligheid en BHV | eenduidig (valgevaar trappen) |
| L3-3 | Locatie Utrecht | L1 Brandveiligheid en BHV | **restcategorie** (binnenklimaat) |
| L3-4 | Locatie Utrecht | L1 Brandveiligheid en BHV | **restcategorie** (verlichting) |
| L3-5 | Locatie Utrecht | L1 Brandveiligheid en BHV | **restcategorie** (schoonmaakcapaciteit) |
| L3-6 | Locatie Utrecht | L1 Brandveiligheid en BHV | twijfelgeval (legionella, gezondheid/gebouw) |
| L3-7 | Locatie Utrecht | L1 Brandveiligheid en BHV | **restcategorie** (ergonomie verschoonplekken) |
| L4-1 | Locatie Zwijndrecht | L1 Brandveiligheid en BHV | **restcategorie** (verlichting) |
| L4-2 | Locatie Zwijndrecht | L1 Brandveiligheid en BHV | **restcategorie** (binnenklimaat) |
| L4-3 | Locatie Zwijndrecht | L1 Brandveiligheid en BHV | **restcategorie** (pauzeruimte) |
| L4-4 | Locatie Zwijndrecht | L1 Brandveiligheid en BHV | **restcategorie** (meubilair) |
| L4-5 | Locatie Zwijndrecht | L2 Mobiliteit en transport | eenduidig (vervangend vervoer) |
| O1-1 | Beleid | O1 Preventiebeleid en arbo-organisatie | eenduidig |
| O1-2 | Beleid | P3 Ingrijpende gebeurtenissen/PSA | twijfelgeval (kan ook O1) |
| O1-3 | Beleid | P1 Stress en werkdruk | twijfelgeval (kan ook O1) |
| O1-4 | Beleid | O1 Preventiebeleid en arbo-organisatie | eenduidig |
| O1-5 | Beleid | F1 Gevaarlijke stoffen | twijfelgeval (kan ook O1) |
| O1-6 | Beleid | L1 Brandveiligheid en BHV | eenduidig (BHV-organisatie) |
| O1-7 | Beleid | O1 Preventiebeleid en arbo-organisatie | eenduidig |
| O1-8 | Beleid | O3 Kwetsbare groepen | eenduidig |
| O1-9 | Beleid | O2 PAGO en gezondheidsbeleid | eenduidig |
| O1-10 | Beleid | L2 Mobiliteit en transport | eenduidig |
| O1-11 | Beleid | P2 Intimidatie en ongewenst gedrag | eenduidig |
| O1-12 | Beleid | F1 Gevaarlijke stoffen | twijfelgeval (kan ook O1) |

**Belangrijkste inhoudelijke observatie:** de 21 vragen die aan een specifieke vestiging hangen
(voorheen L1-L4 "Locatie ...") gaan inhoudelijk bijna allemaal over gebouw-conditie (binnenklimaat,
verlichting, akoestiek, schoonmaak, meubilair, ergonomie) en NIET over de drie FLOP-L-thema's
(brandveiligheid/BHV, mobiliteit, extern werken). Ik heb ze noodgedwongen als restcategorie in
L1 Brandveiligheid en BHV geplaatst omdat ze linked moeten blijven aan hun vestiging en het
L-blok het enige locatie-specifieke blok is — maar inhoudelijk kloppen ze niet als "BHV". Dit is
een structureel punt, geen foutje: de brondocumenten (`import/RIE MEERDERE LOCATIE EN NIVEAU/
Locatie RIE - *.docx`) zijn nooit volgens FLOP-thema's opgesteld. **Aanbeveling:** bij een
volgende revisie een vierde soort blok overwegen (bv. "L0 Locatie-gebonden gebouwconditie") of
deze content bewust bij een echte assessment laten vervangen — buiten scope van deze opdracht.

## Fase 2 — Migratie gebouwd, dry-run getest, toegepast (voltooid)

**Migratie:** `supabase/migrations/0089_seyscentra_flop_herstructurering.sql`. Puur datamigratie
(geen schemawijziging, dus geen REVOKE-regel van toepassing). Werkwijze in één transactie:
1. Oude modulecodes (F1-F4, L1-L4, O1) tijdelijk hernoemd naar `OUD-<code>` (nodig omdat
   `modules_company_id_code_key` een company+code-unique-constraint is en de FLOP-codes
   deels overlappen met de oude).
2. De 12 FLOP-modules aangemaakt (nieuwe UUID's, `volgorde` 1-12 in FLOP-volgorde).
3. Elke vraag verhuisd naar zijn nieuwe `module_id` op basis van de mapping hierboven —
   `nr`/`vraag`/`antwoord`/`bevinding`/`pva`/`locatie_id`/`functiegroep_id` ongemoeid.
4. Verplichte assertie in de migratie zelf (DO-block, breekt af met `raise exception` bij een
   afwijking): aantal vragen vóór = aantal vragen ná, en geen enkele vraag mag nog aan een
   `OUD-*`-module hangen. Bij een fout was er GEEN wijziging opgeslagen (alles in `begin;…commit;`).
5. Pas na een geslaagde assertie: de nu lege oude modules gearchiveerd (`archived_at = now()`,
   **geen DELETE** — de rijen bestaan nog, `app/[company_id]/rie/page.tsx` filtert modules al op
   `archived_at is null`, dus ze verdwijnen uit de weergave zonder dataverlies).

**Eerst een droge run** (dezelfde migratie met `rollback;` in plaats van `commit;`) liep foutloos
door — geen enkele `raise exception` geraakt, wat bewijst dat de mapping compleet en zonder
weeskinderen is. Pas daarna is de migratie echt toegepast (`commit;`).

**Telling vooraf (Fase 0) vs. ná migratie:**

| Metriek | Vooraf | Ná migratie | Klopt? |
|---|---|---|---|
| Vragen totaal | 63 | 63 | ✅ |
| Vragen met antwoord | 63 | 63 | ✅ |
| Vragen met locatie_id | 21 | 21 | ✅ |
| Vragen met functiegroep_id | 30 | 30 | ✅ |
| PvA-acties totaal | 60 | 60 | ✅ |
| PvA-acties met locatie_id | 21 | 21 | ✅ |
| Inhouds-hash (nr+vraag+antwoord+bevinding+pva) | `44dba2a0e1a43fb3eb2fe5b892be7ca7` | `44dba2a0e1a43fb3eb2fe5b892be7ca7` | ✅ **identiek** |

De identieke hash is het harde bewijs dat geen enkele vraagtekst, antwoord, bevinding of
PvA-referentie is aangepast — alleen `module_id` is verplaatst. PvA-items zelf zijn nul keer
aangeraakt: die koppelen aan een vraag via het tekstuele `pva`/`nr`-veld, niet via `module_id`,
dus die koppeling (en de locatiekoppeling van PvA-acties) volgt automatisch mee.

**Nieuwe FLOP-structuur (12 actieve modules):**

| Module | Titel | Vragen |
|---|---|---|
| F1 | Gevaarlijke stoffen | 5 |
| F2 | Fysieke belasting | 7 |
| F3 | Schadelijke factoren | 4 |
| L1 | Brandveiligheid en BHV | 21 |
| L2 | Mobiliteit en transport | 3 |
| L3 | Werken op externe locaties | 1 |
| O1 | Preventiebeleid en arbo-organisatie | 5 |
| O2 | PAGO en gezondheidsbeleid | 4 |
| O3 | Kwetsbare groepen | 1 |
| P1 | Stress en werkdruk | 8 |
| P2 | Intimidatie en ongewenst gedrag | 2 |
| P3 | Ingrijpende gebeurtenissen en PSA | 2 |
| **Totaal** | | **63** |

**Lege/dunne modules (zoals expliciet gevraagd te melden):** geen enkele FLOP-module is
volledig leeg gebleven, maar drie zijn zeer dun bezet en dat is een eerlijke afspiegeling van de
brondata, niet verzonnen: **L3 Werken op externe locaties (1 vraag)**, **O3 Kwetsbare groepen
(1 vraag)**, **L2 Mobiliteit en transport (3 vragen)**. Er was geen enkele brondocument-content
die specifiek over "werken op externe locaties" of "kwetsbare groepen" ging — de ene vraag die
er nu in staat, is een grensgeval overgenomen uit een ander blok (zie mappingtabel). Niets is
bijverzonnen om deze modules voller te laten lijken.

**Oude modules:** 9 stuks, allemaal gearchiveerd (`archived_at` gezet), 0 vragen elk, niet
verwijderd — zie de tabel in de volgende sectie zodra de query-uitvoer is bevestigd.

**Dutch Waste:** geen enkele query in deze migratie raakt een andere `company_id` — de hele
migratie is scoped op `v_company_id := 'bd16538b-...'` in zowel de UPDATE- als INSERT-statements.
Steekproef ná migratie: Dutch Waste heeft nog gewoon 14 modules / 149 vragen (aanwezig, niet op
0 of foutmelding).

## Fase 3 — Regressietests (voltooid)

- `npx tsc --noEmit`: **groen**, geen enkele fout (logisch: geen enkel code-/typebestand is
  aangeraakt, alleen data + een migratiebestand + dit rapport).
- `npm run build`: **groen**, alle routes bouwen, incl. `/[company_id]/rie` en `/[company_id]/pva`.
- `node --use-system-ca scripts/run_tests.mjs`: **37/37 scripts groen**, 6 overgeslagen (die
  hebben een lokale dev-server nodig, niet gestart in deze sessie). Relevant voor deze wijziging:
  - `anon_execute_audit_test.mjs` 20/20 — geen nieuwe functie aangemaakt, dus niets te REVOKE'en;
    het vangnet blijft sowieso groen.
  - `module_isolatie_test.mjs` 8/8, `locatie_isolatie_test.mjs` 13/13,
    `dashboard_meerjaren_locatie_test.mjs` 12/12, `rie_locatie_filter_selftest.ts` 6/6 — alle
    vier direct relevant voor wat hier is aangeraakt (modules, locatiekoppeling, RI&E-filter),
    allemaal groen.
  - `dashboard_isolatie_test.mjs`, `dashboard_test.mjs`, `onveranderlijkheid_test.mjs`,
    `nachttest_rls.mjs` (cross-tenant) — allemaal groen, dus geen aanwijzing dat andere
    bedrijven iets merken.
- Geen code-wijziging was nodig: `RieClient`/`ModuleCard` lezen de `modules`-tabel al generiek
  (`.is('archived_at', null)`, gesorteerd op `volgorde`) en tonen per module zijn eigen vragen
  met antwoord, bevinding, locatie-badge en PvA-link — dat mechanisme bestond al voor de oude
  9-modulestructuur en werkt ongewijzigd door voor de nieuwe 12-modulestructuur.
- **Niet gedaan:** interactieve browsercontrole (geen dev-server gestart in deze sessie — zie
  "Te controleren in de browser" hieronder voor wat Kees zelf moet natrekken).

## Openstaande/afgeronde stand

**Alles uit de opdracht is af:**
1. ✅ 12 FLOP-modules staan live voor SeysCentra, in de juiste volgorde.
2. ✅ Functiegroep-modules (F1-F4 oud) zijn weg uit de weergave (gearchiveerd); de
   functiegroep-koppeling zelf (`functiegroep_id` op de vraag) staat nog gewoon in de database
   voor eventueel ander gebruik, exact zoals gevraagd.
3. ✅ Alle 63 vragen, 63 antwoorden en 60 PvA-acties zijn behouden — bewezen via tellingen én
   een letterlijke inhouds-hash die voor en na identiek is.
4. ✅ Multi-locatie: alleen L1 (en incidenteel L2, zie mapping) draagt nog `locatie_id`;
   F/O/P zijn organisatiebreed. PvA-acties volgen automatisch mee (tekstuele koppeling, geen
   `module_id`-afhankelijkheid). Locatiefilter op `/rie` en de bijbehorende auto-open-module-
   logica werken ongewijzigd door.
5. ✅ Ontbrekende FLOP-content: geen enkele module is leeg gebleven, maar L3, O3 en L2 zijn zeer
   dun (1, 1 en 3 vragen) — eerlijk, niet aangevuld met verzonnen vragen. Zie Fase 2.
6. ✅ Weergave: bestaande generieke component toont alle 12 modules met hun vragen, antwoorden
   en PvA-links, ingeklapt startend, volledig uitklapbaar — geen codewijziging nodig gebleken.

**Bewust niet gedaan (binnen de harde grenzen, gedocumenteerd, geen data aangeraakt):**
- De twee vragen met een vraagtekst-vs-locatie-mismatch (`L1-1`, `L2-1`, zie Fase 1) zijn NIET
  gecorrigeerd — puur gedocumenteerd, ligt bij jou.
- De ~20 "restcategorie"-vragen die noodgedwongen in L1 zijn geplaatst omdat ze locatiegebonden
  zijn maar inhoudelijk niet over brandveiligheid/BHV gaan (binnenklimaat, verlichting, akoestiek,
  schoonmaak, meubilair) — zie de aanbeveling in Fase 1.
- Geen interactieve browsertest (geen dev-server gestart).
- `nr`-labels (bv. "F1-1") zijn NIET hernummerd naar hun nieuwe module — een vraag met nr "F1-1"
  kan nu onder een andere FLOP-module staan dan zijn label doet vermoeden (bv. sommige "F1-x"
  nrs staan nu onder F2/O2/P1/P2/P3/L3, zie mappingtabel). Dit is bewust: hernummeren was niet
  expliciet gevraagd, raakt geen data-integriteit, maar wél leesbaarheid. **Losse
  vervolgbeslissing**, geen blokkade voor deze opdracht.

## Te controleren in de browser (voor Kees)

1. Log in bij SeysCentra, ga naar `/rie`. Je ziet nu 12 modules in de volgorde
   F1, F2, F3, L1, L2, L3, O1, O2, O3, P1, P2, P3 — geen "Functie Behandelaren"/"Locatie
   Maastricht"-tegels meer.
2. Klap elke module open: vraag, antwoord, bevinding, risicoklasse en (waar aanwezig) de
   PvA-link staan er nog steeds, woord voor woord hetzelfde als voorheen.
3. L1 (Brandveiligheid en BHV) is de grootste module (21 vragen) en bevat een mix van
   organisatiebrede vragen (geen badge) en locatie-badges (Maastricht/Malden/Utrecht/
   Zwijndrecht) — dat mengen is bewust, zie Fase 1.
4. Locatiefilter bovenaan `/rie`: kies bv. "Malden" — L1 klapt vanzelf open en toont naast de
   Malden-vragen ook alle organisatiebrede vragen; de andere vestigingen se vragen vallen weg.
5. Ga naar `/pva`: alle 60 acties staan er nog, de bestaande locatiefilter/-badges werken
   ongewijzigd (die koppeling is nooit aangeraakt).
6. Controleer specifiek `L1-1` en `L2-1` op `/rie` (zoek op de vraagtekst "trap op locatie
   Malden" resp. "meterkasten op locatie Maastricht") — dit zijn de twee vragen met de
   tekst/locatie-mismatch uit Fase 1. Beslis zelf of/hoe je dat wilt rechtzetten.
7. Dutch Waste (of een ander bedrijf): `/rie` en `/pva` behoren er ongewijzigd uit te zien
   (regressietoets) — deze migratie was scoped op SeysCentra's `company_id` in elke query.

## Bestanden van deze sessie

- `supabase/migrations/0089_seyscentra_flop_herstructurering.sql` — de migratie zelf.
- `audit/2026-09-24_flop-herstructurering/` — veiligheidskopie van vóór de wijziging
  (`backup_vragen_full.json`, `backup_pva_items_full.json`, `backup_modules_full.json`,
  `backup_vragen_voor_flop.json`).
- Dit rapport.
- Geen enkel `.tsx`/`.ts`-bestand gewijzigd.

