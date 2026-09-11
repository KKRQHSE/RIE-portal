# Openstaand

> Losse, overzichtelijke lijst van punten die nog aandacht nodig hebben. Voor de volledige projectstand zie `Projectstand.md`, voor het waarom van keuzes `Beslissingen.md`.

## SeysCentra demo-klaar (2026-09-11)

**Af (punten 1 t/m 4 van de opdracht), migratie 0087, tsc + build groen, schema
gedumpt, volledige testronde 37/37 groen:**

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

**Punt 5 (toetsverslag) — schema + weergave staan, INHOUD nog niet
ingevuld: STOP-PUNT, wacht op 'ja'.** Zie het bericht in de conversatie voor
het datamodel (`rie_versies.toetser_*` + nieuwe tabel `rie_toetsverslag`,
migratie 0087) en waar het verschijnt (`/rie`-badge + nieuwe pagina
`/rie/toetsverslag`, component `RieToetsverslagClient`). De GETOETST-badge
zelf (toetsdatum, naam, certificaatnummer, namens QHSE Totaal B.V.) staat al
in de database en is al zichtbaar op `/rie` — dat is korte, al bekende
metadata. De volledige tekstinhoud (managementsamenvatting, toetsbrief, 8
conclusies, eindoordeel) uit `20252807 Toetsrapport RIE Seyscentra.docx` is
gelezen en klaarstaat, maar nog NIET in `rie_toetsverslag` gezet — vandaar
geen "Bekijk toetsverslag"-link op `/rie` op dit moment.

**Testinstructies (browser), na 'ja' en het invullen van punt 5 opnieuw
doorlopen voor de toetsverslag-onderdelen:**
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
5. `/[seyscentra]/rie`: bovenaan de statuskop staat de groene "Getoetst"-badge
   met datum/naam/certificaatnummer/namens. Er staat GEEN
   "Bekijk toetsverslag"-link (nog geen inhoud) — dat is verwacht tot punt 5
   is afgerond.

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
