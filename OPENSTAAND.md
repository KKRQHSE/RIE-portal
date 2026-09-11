# Openstaand

> Losse, overzichtelijke lijst van punten die nog aandacht nodig hebben. Voor de volledige projectstand zie `Projectstand.md`, voor het waarom van keuzes `Beslissingen.md`.

## SeysCentra: echte vraagzinnen in de RI&E-inzage (2026-09-11)

**Root cause gevonden (geen renderbug).** Kees meldde dat op `/rie` wél het
antwoord en de bevinding te lezen waren, maar niet de vraag. Onderzoek via
een echte, ingelogde browsersessie tegen productie bewees dat de vraagtekst
wél rendert — het probleem zat in de DATA: `vragen.vraag` bevatte voor alle
63 SeysCentra-items alleen een kort thema-label (bv. "Fysieke belasting:
meubilair"), nooit een echte vraagzin. Nagetrokken in alle 9 SeysCentra-
brondocumenten (`import/RIE MEERDERE LOCATIE EN NIVEAU/*.docx`, beleid +
4 locaties + 4 functiegroepen): geen van alle heeft een vraagkolom, ze
gebruiken een thema-tabel (Thema/Huidige situatie/Risico/Maatregel), anders
dan de referentie-RI&E die Kees aanleverde (`import/input/20260724 RIE
RSB.pdf`, QVOX-format met een echte "Nr. / RI&E-vraag / Antw / Bevinding"-
kolom per item).

**Fix (op Kees' expliciete instructie):** alle 63 `vragen.vraag`-velden voor
SeysCentra herschreven naar een echte vraagzin, getransponeerd vanuit de
vraagformulering/-stijl van het RSB/QVOX-referentierapport naar de
SeysCentra-context (thema + bestaande bevinding als basis). **Dit is
dummy-content** (Kees' eigen woorden: "dan is het echt dummy data, maar dat
is prima") — de vraagformulering is nieuw geschreven, bevinding/klasse/actie
zijn ongewijzigd. Query-check: 63/63 eindigen op "?", geen enkele verdacht
kort, geen gedachtestreepjes.

**Bij een echte (niet-demo) revisie van SeysCentra moet dit opnieuw** met
vraagzinnen uit het daadwerkelijke assessment, niet getransponeerde
QVOX-vragen.

**Te testen:** harde refresh op `/rie` bij SeysCentra — elk item toont nu
een volledige vraagzin boven de antwoord-badge, bv. bij F1-1: "Is bij de
inrichting van het werk rekening gehouden met de fysieke belasting van
behandelaren die dagelijks op de hurken of gebogen werken bij jonge
kinderen?"

**Vervolg — modules weer in-/uitklapbaar (zelfde dag).** Eerdere fix
(vragen zichtbaar maken) forceerde alle modules standaard open — met de
echte vraagzinnen nu op hun plek is dat een muur van tekst. `ModuleCard`
start weer dicht, blijft per module (F1, F2, F3, L1, ...) togglebaar.
Kiest de gebruiker een locatie in de locatiefilter, dan klapt precies de
L-module van díe locatie vanzelf open (nooit dicht forceren — hetzelfde
patroon als het bestaande URL-anker-gedrag). Organisatiebrede en
functiegroep-modules blijven onafhankelijk togglebaar, ongeacht de
locatiefilter. tsc/build/testronde groen, commit `b1fc7cb`.

## SeysCentra-huisstijl + Safespot-logo (2026-09-11)

**Gedaan:**
- **Huisstijlmodel uitgebreid** (migratie 0088): naast de bestaande enkele
  `accent_kleur_override` nu ook `accent_kleur_2_override` (secundaire/rustige
  tint) en `accent_kleur_highlight_override` (spaarzaam "vleugje"), per
  bedrijf optioneel. Onvermeld = `null` = de UI valt terug op resp. de
  bestaande ink-tint en de gewone accentkleur — **pixel-identiek** voor elk
  bedrijf dat de nieuwe velden niet gezet heeft (geneste CSS `var()`-
  fallbacks in `lib/huisstijl.ts`, `components/Gauge.tsx`, `app/globals.css`
  `.btn-dark`-hover, `components/NotificatieBel.tsx`). Dutch Waste geverifieerd
  ongewijzigd (query na de migratie).
- **Safespot als nieuw "merk"** (net als het bestaande "QHSE Totaal"-merk) in
  de `merken`-tabel, met het bestaande co-branding-mechanisme (`huisstijl_modus
  = 'co_branding'`) — geen nieuwe logica nodig, alleen data.
- **SeysCentra** (`bd16538b-01e9-41d2-84ad-fe5690917cba`): `merk_id` → Safespot,
  `huisstijl_modus = 'co_branding'`, eigen klantlogo geüpload,
  accent = `#604C3F` (donkerbruin), accent-2 = `#A48A76` (taupe, gebruikt op
  de gaugetrack en de `.btn-dark`-hoverschaduw), accent-highlight = `#931263`
  (magenta, gebruikt op het ongelezen-belletje in `NotificatieBel`).
- Beide logo-PNG's (`import/safespot_logo_badge.png`,
  `import/SeysCentra_Logo-met-payoff.png`) staan op `.gitignore` (regel 91,
  blanket `*.png`-regel) en zijn **niet** gecommit — geüpload naar de
  `merk-assets`-Storage-bucket via een eenmalig, niet-gecommit script.
- tsc + build groen, `anon_execute_audit_test.mjs` 20/20 (de
  `CREATE OR REPLACE` op `huisstijl_van_bedrijf` kreeg de verplichte
  REVOKE-regel), `db/schema.sql` opnieuw gedumpt.

**Nog niet gedaan (bewust buiten scope van deze opdracht):**
- Geen admin-UI voor de twee nieuwe kleurvelden (`accent_kleur_2_override`,
  `accent_kleur_highlight_override`) in `/admin/huisstijl` — alleen via SQL/
  script te zetten. `accent_kleur_override` (het bestaande enkele veld) heeft
  wel een kleurenkiezer in de admin-UI.
- De taupe/magenta-tokens zijn maar op twee plekken toegepast (gaugetrack +
  knop-hoverschaduw resp. het notificatiebelletje) — niet overal waar
  "knoppen/gauges/accenten" zou kunnen gelden, om het aantal geraakte
  gedeelde componenten (en dus het risico voor andere bedrijven) klein te
  houden binnen één sessie.

**Te testen in de browser:**
1. Log in bij SeysCentra → bovenbalk toont het SeysCentra-logo prominent,
   met het Safespot-badge-logo (petrolblauw, ongewijzigd) er bescheiden naast.
2. Knoppen/actieve navigatie/focusringen zijn donkerbruin (`#604C3F`).
3. Een gauge (bv. RI&E-voortgang op het dashboard) heeft een taupe track
   i.p.v. het gebruikelijke grijze.
4. Stuur jezelf (of laat een test-notificatie ontstaan) zodat het
   belletje-badge in de bovenbalk verschijnt — die moet magenta zijn bij
   SeysCentra.
5. Log in bij Dutch Waste → alles zoals voorheen (oranje/hun eigen accent,
   geen taupe track, geen magenta badge, geen Safespot-logo).

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
