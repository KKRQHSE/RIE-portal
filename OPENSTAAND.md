# Openstaand

> Losse, overzichtelijke lijst van punten die nog aandacht nodig hebben. Voor de volledige projectstand zie `Projectstand.md`, voor het waarom van keuzes `Beslissingen.md`.

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
