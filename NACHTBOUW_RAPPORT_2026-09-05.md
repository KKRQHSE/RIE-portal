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

**Bleek al volledig gebouwd** in migratie 0073 (commit 8d36e42, eerder op 5 sept, vóór deze
nachtsessie begon). Geverifieerd tegen alle drie de eisen uit de opdracht:

- IF = (verzuimongevallen × 1.000.000) / gewerkte uren — klopt (`if_getal_voor_jaar`).
- 0 verzuimongevallen + wél gewerkte uren ingevuld → toont "0" (echte prestatie), geen
  "vul uren in". Bevestigd (Dutch Waste-testgeval, [[dutch-waste-testresidu]]-achtig patroon).
- Gewerkte uren 0 of leeg → `if_getal` wordt NULL (SQL: `if v_uren is null or v_uren = 0`), UI
  toont dan netjes "nog geen urenbasis" + link "Vul de gewerkte uren in →"
  (`components/DashboardClient.tsx`), nooit een gedeeld-door-nul-fout.
- Gewerkte uren zijn per jaar bewaard (`bedrijf_gewerkte_uren(company_id, jaar)`, PK op beide),
  niet alleen "dit jaar" — de UI (`BedrijfsvoeringForm.tsx`) toont/bewerkt dit jaar + vorig jaar,
  maar ieder jaar wordt onder zijn eigen jaartal opgeslagen, dus de IF-historie blijft kloppen
  naarmate de tijd vordert (dit jaar wordt volgend jaar vanzelf "vorig jaar" met de juiste,
  nooit overschreven waarde).

**Enige toevoeging:** één ontbrekend randgeval in `if_getal_test.mjs` — expliciet `uren: 0`
ingevuld (i.p.v. leeg) moet ook `if_getal = null` geven, niet een misleidende 0. Was in de SQL
al correct afgehandeld, nu ook expliciet getest. Suite: 12/12 (was 11/11).

Geen UI/DB-wijziging nodig; alleen testdekking aangevuld. Tsc + build groen.
**Gepusht**: ja.

## Fase 3 — Meerjaren-dashboard (voorbereidend)

Migratie `0075_dashboard_meerjaren_overzicht.sql`: nieuwe RPC `dashboard_meerjaren(p_company_id)`,
zelfde toegangsniveau als het IF-getal (`mag_bedrijf_beheren`: KAM/admin, geen teamleider). Nieuwe
pagina `/[company_id]/dashboard/meerjaren` (`MeerjarenClient.tsx`), link toegevoegd bij
"Bedrijfsvoering" op het hoofddashboard.

**Welke jaren:** elk jaar waarin minstens één van de bestaande bronnen een rij heeft
(inspectie.aangemaakt_op/uitgevoerd_op, incident.datum, toolbox_sessie.datum,
bedrijf_gewerkte_uren met een ingevulde waarde), plus altijd het huidige jaar — ook leeg. Geen
enkel cijfer is verzonnen; alles is een directe aggregatie van bestaande, al per-datum
vastgelegde rijen.

**Vier metrics per jaar:**
- IF-getal: hergebruikt `if_getal_voor_jaar()` ongewijzigd.
- Toolbox-dekking: percentage, `null` (toont "nog geen sessie") als er dat jaar geen
  toolbox-sessie was — nooit een misleidende 0%.
- Inspecties afgerond: harde jaartelling; toont "x/doel" alleen als er een inspectiedoel is
  ingesteld.
- Aantal incidenten: harde jaartelling.

**Twee bewuste ontwerpkeuzes, expliciet zichtbaar in de UI én hier gedocumenteerd voor latere
verfijning** (dit was de "grotere ontwerpkeuze die ik moet maken"-situatie uit de opdracht; ik
heb een eenvoudige eerste versie gebouwd i.p.v. te gokken):
1. **Toolbox-dekking gebruikt het HUIDIGE aantal actieve personen als noemer voor élk jaar** —
   er wordt geen historische personeelsstand bijgehouden. Voor oudere jaren is dit dus een
   benadering (bij personeelsgroei/-krimp klopt het percentage voor het verleden niet exact).
   Voorstel voor verfijning: een snapshot van het aantal actieve personen per jaareinde
   bijhouden, of expliciet documenteren dat dit cijfer een "huidige-maatstaf"-benadering is.
2. **Inspectiedoel (`bedrijf_inspectie_doel.doel_per_jaar`) is een lopende instelling, geen
   jaar-specifieke waarde** — toegepast op elk jaar alsof die instelling altijd al gold. Het
   aantal afgeronde inspecties zelf is wél een harde, jaar-echte telling; alleen de "/doel"-noemer
   is een benadering voor jaren vóórdat het doel op de huidige waarde stond.
3. **Doelstellingen (`bedrijf_dashboard_instelling.doelstelling_tekst`) worden NIET per jaar
   getoond** — dat veld is nooit per jaar opgeslagen, alleen de actuele tekst bestaat. Het
   meerjarenoverzicht toont daarom de huidige doelstellingen los onder de tabel, niet per
   jaarkolom. Voorstel: als een historisch overzicht van doelstellingen per jaar gewenst is, moet
   dat veld eerst een `jaar`-kolom krijgen (additieve migratie, geen data-verlies) vóórdat het
   met terugwerkende kracht zinvol per jaar te tonen is.

**Nieuwe test:** `scripts/dashboard_meerjaren_test.mjs` (12/12) — kaal bedrijf toont alleen het
huidige jaar zonder crash, teamleider/ander-bedrijf dicht, een jaar met data verschijnt met de
juiste cijfers zonder het huidige jaar te vervuilen, toolbox-dekking null vs. percentage.
Handmatig ook echt in de browser gecontroleerd (Playwright, wegwerpbedrijf): pagina rendert
correct, "nog geen urenbasis"/"nog geen sessie" tonen zoals bedoeld. (Twee console-meldingen
gezien — CSP-geblokkeerde `eval()` in dev-mode en een logo-aspect-ratio-waarschuwing — allebei
pre-existing en site-breed, niet door deze wijziging veroorzaakt; geen actie ondernomen.)

**Nulmeting na deze fase:** tsc schoon, build groen (nieuwe route `/[company_id]/dashboard/
meerjaren` gecompileerd), volledige suite **36/36** groen.
**Gepusht**: ja.

## Wat te testen in de browser (ook mobiel)

1. **Project/locatie bij inspecties** (`/[bedrijf]/inspecties`): start een inspectie, vul
   bovenaan "Project / locatie" in, verlaat het veld (onBlur bewaart) — ververs de pagina en
   check dat het blijft staan. Rond de inspectie af en check dat het veld ook op het
   afgeronde rapport staat. Test het filter "Alle projecten/locaties" in de bibliotheeklijst
   zodra er 2+ verschillende waarden zijn.
2. **Automatische persoon-koppeling**: log in als een gebruiker die een gekoppelde
   personen-rij heeft (personen.user_id = jouw account) en start een inspectie — dit is niet
   zichtbaar in de UI, maar bepaalt straks (Fase 3-achtig) of "uitvoerder" en toekomstige
   per-persoon-rapportages goed werken. Geen zichtbare UI-wijziging, dus vooral relevant als
   achtergrondcontrole (getest in `inspectie_project_persoon_test.mjs`).
3. **Meerjarenoverzicht** (`/[bedrijf]/dashboard` → knop "Meerjarenoverzicht" bij
   Bedrijfsvoering, alleen zichtbaar voor KAM/admin): open de pagina, check de tabel
   (IF-getal/toolbox-dekking/inspecties/incidenten per jaar), en check dat een kaal bedrijf
   nette "nog geen..."-teksten toont i.p.v. nullen. Test ook op mobiel — de tabel scrolt
   horizontaal binnen zijn eigen kader; check dat de rest van de pagina niet meescrollt.
4. **IF-getal op het hoofddashboard**: ongewijzigd, maar goed om te bevestigen dat "0" en "nog
   geen urenbasis" zich nog steeds correct gedragen na de schema-wijzigingen van vannacht.

Alle bovenstaande zijn ECHTE, geteste RPC's/schermen — geen mockdata. Test bij voorkeur op een
testbedrijf (Alpha/Bravo), niet op Dutch Waste/Geissler.

## Openstaand voor jou (met voorstel)

1. **Toolbox-dekking in het meerjarenoverzicht rekent met het HUIDIGE personeelsaantal voor
   elk jaar** (geen historische personeelsstand bijgehouden) — voor oudere jaren dus een
   benadering. *Voorstel:* als dit precies moet kloppen, een jaarlijkse personeels-snapshot
   toevoegen (additief); anders is de huidige benadering prima voor een "voorbereidend"
   overzicht — ik zou het zo laten tot iemand er concreet op vertrouwt.
2. **Inspectiedoel in het meerjarenoverzicht is de huidige instelling, met terugwerkende
   kracht toegepast** op elk jaar (geen jaar-specifieke doel-historie). *Voorstel:* alleen
   relevant zodra doelen echt jaarlijks wijzigen; dan `bedrijf_inspectie_doel` een `jaar`-kolom
   geven (additief, geen bestaande data verwijderen).
3. **Doelstellingen (`doelstelling_tekst`) zijn niet per jaar opgeslagen** — het
   meerjarenoverzicht toont daarom alleen de huidige tekst, los van de jaartabel. *Voorstel:*
   als een historisch overzicht van doelstellingen per jaar gewenst is, dat veld eerst een
   `jaar`-kolom geven (additieve migratie) vóórdat het met terugwerkende kracht te tonen is —
   verzin in de tussentijd geen historische doelstellingen.
4. **Gewerkte-uren-UI blijft beperkt tot "dit jaar" + "vorig jaar"** (Fase 2). De onderliggende
   tabel (`bedrijf_gewerkte_uren`) ondersteunt elk jaar al, en het venster schuift vanzelf mee
   naarmate de tijd vordert, dus de IF-historie blijft kloppen. Alleen als je ooit uren van
   3+ jaar terug met terugwerkende kracht wilt invullen (bijv. bij migratie van een ander
   systeem) is een los invoerscherm per jaar nodig — dat heb ik NIET gebouwd, want dat zou
   "oude data invoeren" zijn geweest, expliciet buiten de opdracht.
5. **Gedeelde working-directory-coördinatie**: halverwege de nulmeting bleek een NIET-van-mij
   dev-server op poort 3000 te zijn weggevallen (drie app-tests faalden tijdelijk op "geen
   respons"); een andere sessie was tegelijk bezig met een mobiele safe-area-fix (commit
   f7c2e06, niet van mij, inmiddels afgerond en gepusht vóórdat ik aan Fase 1 begon). Geen
   actie nodig — puur ter info voor de ochtend, mocht je je afvragen waar die commit vandaan
   komt.

## Top-lijst voor vanochtend

1. Lees dit rapport door; alle drie de fases staan **gecommit én gepusht** op `main`
   (commits `31ae099`, `0d0f681`, `3912dd2`, bovenop `42fd3de` voor Fase 0).
2. Bekijk het meerjarenoverzicht op een testbedrijf en oordeel of de twee benaderingen
   (toolbox-dekking, inspectiedoel) voor jou acceptabel zijn zoals ze nu zijn, of dat je een
   van de verfijningen uit "Openstaand" alsnog wilt.
3. Vul bij een testbedrijf een keer project/locatie in bij een inspectie en bevestig dat het
   filter/de weergave bevalt.
4. Niets is stilzwijgend blijven staan: geen destructieve SQL, geen echte klant-data
   aangeraakt (Dutch Waste/Geissler ongemoeid), alles additief. Volledige testsuite bij
   afronden: **36/36 groen**, tsc + build groen.
