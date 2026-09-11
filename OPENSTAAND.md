# Openstaand

> Losse, overzichtelijke lijst van punten die nog aandacht nodig hebben. Voor de volledige projectstand zie `Projectstand.md`, voor het waarom van keuzes `Beslissingen.md`.

## SeysCentra demo-klaar (2026-09-11)

**Alle 5 punten van de opdracht af**, migratie 0087, tsc + build groen, schema
gedumpt, volledige testronde 37/37 groen, twee commits gepusht (`5bcbd12`,
`be9aaa9`).

**Twee dingen bijgekomen na de eerste ronde (Kees testte, vond een echte bug
+ een stijlwens):**
- **Bug: vragen niet zichtbaar.** `ModuleCard` startte standaard dichtgeklapt
  (alleen open bij een URL-anker) — dus op `/rie` zag je alleen de
  moduletitels, geen vraaginhoud, tot je per module klikte. Nu start elke
  module open (blijft togglebaar). Dit gold voor alle bedrijven, niet alleen
  SeysCentra.
- **Gedachtestreepjes (—) eruit.** Gedaan voor: de SeysCentra-brondata
  (9 moduletitels, 17 vraagtitels, 17 PvA-onderwerpen — allemaal "X — Y"
  vervangen door "X: Y"), en de RI&E-schermen die ik deze sessie zelf bouwde
  (RieClient, RieToetsverslagClient, drie plekken in DashboardClient).
  **Bewust NIET aangepast:** de letterlijke citaten uit het toetsverslag
  (één zin bevat "–" middenin een citaat; dat veranderen zou "letterlijk
  overnemen" tegenspreken — zie punt 5). **Nog niet gedaan:** de rest van de
  app (~30 andere componenten, o.a. Incidenten/Toolbox/Audits/AVG/Huisstijl)
  gebruikt het gedachtestreepje overal als vast stijlmiddel, zowel als
  interpunctie als als symbool voor "geen waarde" (`'—'`). Daar is bewust
  niet aan gezeten zonder expliciete vraag — zie de vraag in de conversatie.

**Punt 5 (toetsverslag) — AFGEROND.** `rie_toetsverslag` bevat nu de
letterlijke tekst uit `20252807 Toetsrapport RIE Seyscentra.docx`:
managementsamenvatting, toetsbrief, 8 conclusies, eindoordeel. De
"Bekijk toetsverslag"-link verschijnt nu op `/rie` en leidt naar
`/rie/toetsverslag`.

**Punten 1 t/m 4:**

1. **Dashboard opgeschoond.** SeysCentra had al géén rij in `bedrijf_modules`
   → toolbox/inspecties/incidenten/audits stonden al standaard uit (nergens
   geactiveerd, dus niets te wijzigen in modulebeheer). Nieuw: kolom
   `companies.toon_bedrijfsvoering` (NULL/true = huidig gedrag, alleen
   expliciet `false` verbergt de sectie) ontkoppelt de Bedrijfsvoering-sectie
   + IF-getal-tegel van `toonRie`/oefenomgeving — die twee stonden voorheen
   aan elkaar vast, waardoor je ze niet apart kon uitzetten zonder ook de
   RI&E-inzage zelf te blokkeren (en SeysCentra is bewust GEEN oefenomgeving).
   SeysCentra staat op `false`; alle andere bedrijven (incl. Dutch Waste) zijn
   ongewijzigd (default = tonen, zoals altijd).
2. **Personen toegevoegd.** Nieuwe functiegroep "Facilitaire taken". Nieuw
   veld `personen.functietitel` (bestond nog niet — er was geen plek voor een
   specifieke titel los van de grovere functiegroep). Ivo Mutsaers
   ("Coördinator Vastgoed & Facilitair (tevens Preventiemedewerker ARBO)")
   en Charlotte van Herel ("Projectleider Vastgoed & Facilitair") toegevoegd,
   zichtbaar onder de naam op `/personen`.
3. **PvA-voortgang is DEMO-DATA.** 30 van de 60 PvA-acties (precies de helft)
   staan op "Afgerond" met een afhandelaar (Ivo Mutsaers, Charlotte van
   Herel, of een van de demo-accounts) en een spreiding aan vrijgave-data
   over de afgelopen ~11 maanden, verdeeld over organisatiebreed/locatie/
   functiegroep. **De RI&E-inhoud zelf (vragen, bevindingen, Kinney-
   klasse) is NIET aangeraakt — alleen de afhandelingsstatus is verzonnen.**
   Bij een echte revisie moet deze voortgang eruit (of worden vervangen door
   echte data) voordat SeysCentra een productiebedrijf wordt i.p.v. een demo.
4. **Vragen leesbaar.** Al zo: `ModuleCard` toont vraag/bevinding altijd
   volledig (geen CSS-truncatie), en de SeysCentra-data zelf is niet
   afgekapt (63 vragen gecontroleerd, geen enkele verdacht kort). Geen
   codewijziging nodig, alleen geverifieerd.

1. Dashboard opgeschoond (`companies.toon_bedrijfsvoering`, alleen SeysCentra
   op `false`).
2. Ivo Mutsaers + Charlotte van Herel toegevoegd (functiegroep "Facilitaire
   taken", nieuw veld `personen.functietitel`).
3. PvA-voortgang is DEMO-DATA (30/60 op "Afgerond", RI&E-inhoud zelf
   ongewijzigd — bij een echte revisie moet dit eruit of vervangen worden).
4. Vragen leesbaar — was al zo qua tekst, bug (zie boven) zat in de
   standaard-inklapstand, niet in de tekst zelf.

**Openstaande vraag aan Kees:** geldt "alle gedachtestreepjes eruit" ook voor
de rest van de app (buiten SeysCentra en de schermen van deze sessie)? Dat
raakt tientallen bestanden en twee soorten gebruik (interpunctie én het
`'—'`-symbool voor een lege waarde) — bewust niet zelf besloten.

**Testinstructies (browser):**
1. Log in als `kees+seyscentra@qhsetotaal.nl` (client/KAM). Dashboard toont
   geen Bedrijfsvoering-sectie, geen IF-getal-tegel, geen toolbox/inspecties/
   incidenten/audits-tegels — wel RI&E, Centrale actielijst, Termijn PvA,
   Openstaand per prioriteit, Bewijslast.
2. Log in als admin of dezelfde KAM op een ANDER bedrijf (bv. Dutch Waste):
   Bedrijfsvoering-sectie + IF-getal staan er nog gewoon — regressietoets.
3. `/[seyscentra]/personen`: Ivo Mutsaers en Charlotte van Herel staan in de
   lijst met hun functietitel onder de naam, functiegroep "Facilitaire taken".
4. `/[seyscentra]/pva`: ongeveer de helft van de acties staat op afgerond,
   verspreid over organisatie/locaties/functiegroepen — geen visueel cluster.
5. `/[seyscentra]/rie`: elke module staat standaard open met de volledige
   vraagtekst, bevinding, risicoklasse en actielink zichtbaar. Bovenaan de
   groene "Getoetst"-badge, met een werkende "Bekijk toetsverslag"-link naar
   de volledige tekst.

## Talen per bedrijf (2026-09-10)

**Af:** `companies.beschikbare_talen` (migratie 0086) bepaalt per bedrijf welke
talen de NL/TR-vlaggentoggle toont op de werknemer-facing schermen (`/tb`,
`/melden`, het inspectie-invulscherm). `NULL` = geen instelling = alle talen
(ongewijzigd gedrag). SeysCentra staat op `['nl']`, Dutch Waste (echt bedrijf
+ de oefenomgeving-kloon) op `['nl','tr']`. Beheerplekje: `/admin/huisstijl`
→ kies een bedrijf → sectie "Talen" (vinkje "Turks ook beschikbaar", NL staat
altijd aan). `tsc` + `next build` groen, schema gedumpt, bestaande tests
(anon-execute-audit 20/20, token-flows 16/16, toolbox-isolatie 64/64) groen.

**Nog niet gedaan:**
- Niet browsergetest (zie testinstructies hieronder — nog door Kees te doen).
- De checkbox-UI staat op de Huisstijl-pagina (enige bestaande per-bedrijf-
  admin-selector); geen aparte "Bedrijven"-pagina gemaakt, dat leek
  overbodig voor één instelling. Als er later meer per-bedrijf-instellingen
  bijkomen kan een aparte `/admin/bedrijven`-pagina de moeite waard worden.
- Alleen `admin` kan dit wijzigen, geen KAM-zelfbediening. Niet gevraagd,
  maar zou later kunnen als een klant dit zelf wil beheren.
- TR-teksten in `lib/i18n-werknemer.ts` blijven machinevertalingen, nog niet
  nagekeken door een moedertaalspreker (bestaand punt, zie bestandskop).

**Testinstructies (browser):**
1. Log in als admin, ga naar `/admin/huisstijl`, kies "SeysCentra B.V." in de
   dropdown → sectie "Talen" toont het TR-vinkje UIT. Kies "Dutch Waste
   Collectors & Cleaning" → vinkje AAN.
2. Open een geldige werknemerslink van SeysCentra op `/tb/[token]` (of
   `/melden/[token]` als er een meldlink is): rechtsboven verschijnt GEEN
   vlaggentoggle (alleen NL, dus niets te wisselen) en de tekst is Nederlands.
3. Open dezelfde pagina's voor Dutch Waste: de NL/TR-vlaggentoggle verschijnt
   wél, en wisselt de UI-tekst.
4. Open `/tb/[token]` of het inspectie-invulscherm voor een bedrijf zonder
   instelling (bijv. Geissler): gedraagt zich zoals vóór deze wijziging (NL/TR
   toggle gewoon aanwezig) — dit is de regressietoets.
5. In `/admin/huisstijl`: zet het TR-vinkje voor een testbedrijf aan/uit,
   klik Opslaan, herlaad de pagina → de stand blijft staan (persisteert echt
   naar de database, niet alleen lokale state).
