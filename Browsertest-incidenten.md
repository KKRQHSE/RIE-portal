# Browsertest — Incidenten-/ongevallen-module

Handmatig testprotocol voor de module 'incidenten' (fasen 1-4, migraties 0025-0027).
Vink af; noteer afwijkingen. Automatisch al groen: isolatie 20/20, security 25/25,
QR-zelftest, `tsc` + `next build`. Deze test dekt wat een mens moet zíén.

## 0. Voorbereiding

- [ ] **Code live zetten.** Voor testen op Vercel: eerst de 4 incidenten-commits
      **pushen** (anders draait Vercel een oude build). Voor lokaal testen:
      `npm run dev` → `http://localhost:3000`.
- [ ] **Demo-data staat klaar** op *Testbedrijf Alpha* (via
      `node --use-system-ca scripts/incident_seed_demo.mjs`): module actief,
      7 voorbeeld-incidenten (3 open / 2 in onderzoek / 2 afgehandeld), 1 foto,
      actieve meldlink.
- [ ] **Logins:** KAM = `kam-alpha@demo.nl`. Voor de cross-company-check ook
      `kam-bravo@demo.nl` (Bravo heeft de module niet).

> Vervang hieronder `<origin>` door `http://localhost:3000` of de Vercel-URL.
> De meld-URL (het token) staat in de uitvoer van het seed-script; of haal 'm uit
> het KAM-scherm (Meldlink-kaart → Kopieer).

---

## A. Open meldflow — Deel 1 (melder, GEEN login) — test op je telefoon

Open `<origin>/melden/<token>` (of scan de QR uit het KAM-scherm).

- [ ] Pagina laadt zonder login, toont de bedrijfsnaam/huisstijl van Alpha.
- [ ] Datum en tijd zijn vooringevuld op nu, en aanpasbaar.
- [ ] Verplicht: zonder **locatie** of **omschrijving** kun je niet versturen
      (nette melding, geen crash).
- [ ] Gevolg aanvinken werkt (meerdere tegelijk mogelijk).
- [ ] Naam melder mag leeg blijven.
- [ ] **Foto toevoegen** opent de camera/galerij; gekozen foto verschijnt in de lijst
      en is weer te verwijderen.
- [ ] Versturen → **nette bevestiging** ("Bedankt, je melding is doorgegeven").
- [ ] Er worden **geen** slachtoffer-/letsel-/medische velden gevraagd in deze flow.
- [ ] **Ongeldige link:** `<origin>/melden/onzin` toont "Deze meldlink is niet geldig"
      (geen crash).

---

## B. KAM-afhandeling — Deel 2 (ingelogd)

Log in als `kam-alpha@demo.nl`, ga naar `<origin>/<alpha-id>/incidenten`
(of via Modulebeheer → Incidenten & ongevallen).

- [ ] De **lijst** toont de meldingen (jouw zojuist gemaakte melding staat bovenaan),
      met per regel omschrijving, datum/tijd, locatie en een statusbadge.
- [ ] Klik op een melding → **detail** met Deel 1 (lezen) + eventuele foto's.
- [ ] Bij het letsel-incident (magazijn) is een **foto** zichtbaar; klikken opent 'm
      in een nieuw tabblad (signed URL).
- [ ] **Deel 2 invullen:** status wijzigen, directe + basisoorzaken aanvinken,
      toelichting, maatregel-vinkjes, telefonische melding (+ "aan wie" verschijnt),
      besproken-in-toolbox-datum.
- [ ] De **gevoelige velden** (functie slachtoffer, medische dienst) staan in een
      apart, rood-gemarkeerd blok "alleen zichtbaar voor jou".
- [ ] **Opslaan** → "Opgeslagen ✓"; terug naar de lijst → de statusbadge is bijgewerkt.
- [ ] Zet een melding op **Afgehandeld** en weer terug → geen fouten.

### Meldlink-kaart (bovenaan)

- [ ] Toont de meld-URL + **QR-code** + knop **Kopieer** (kopieert de link).
- [ ] **Vervang link (roteer)** vraagt eerst een inline bevestiging (géén
      browser-popup); na bevestigen verandert de URL/QR.
- [ ] **Intrekken** → de kaart meldt "ingetrokken"; een melding via de oude link
      wordt daarna geweigerd (test in flow A). **Weer inschakelen** herstelt.

---

## C. Dashboard (doorklikbaar, 3 niveaus)

Op hetzelfde KAM-scherm, boven de lijst.

- [ ] **Niveau 1 — aantallen:** totaal + tegels per status (open/in onderzoek/
      afgehandeld) + telling per gevolg + top-5 directe en basisoorzaken (balkjes).
      Met de demo-data: totaal 7, open 3, in onderzoek 2, afgehandeld 2.
- [ ] **Periode wisselen** (Dit jaar / Laatste 12 mnd / Alles) past de cijfers aan.
- [ ] **Niveau 2:** klik op een status- of gevolg-tegel → de lijst eronder filtert;
      titel toont de selectie + aantal; **"toon alle"** wist het filter.
- [ ] **Niveau 3:** klik op een gefilterde regel → het volledige incident opent
      (Deel 1 + Deel 2 + foto's).

---

## D. Beveiliging & AVG — snelle visuele check

- [ ] Log in als `kam-bravo@demo.nl` en ga naar `<origin>/<alpha-id>/incidenten`
      → **geen toegang / niet gevonden** (Bravo mag Alpha niet zien, en heeft de
      module niet).
- [ ] De foto-URL uit stap B is een **signed URL** (bevat een token/handtekening);
      plak 'm in een privévenster → werkt kort, maar het kale pad zonder handtekening
      geeft geen toegang (privé-bucket).
- [ ] De gevoelige gezondheidsvelden zijn nergens in de open meldflow (A) te zien.

---

## E. QR-code

- [ ] Scan de QR uit de Meldlink-kaart met een telefoon → hij opent exact de meld-URL.
      *(De encoder is dependency-vrij en door een round-trip-zelftest bevestigd; deze
      scan is de laatste bevestiging in het echt.)*

---

## Opruimen na de test

De demo-incidenten van Alpha weghalen (foto's cascaden mee):

```
node scripts/db_run.mjs --query "delete from incident where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
```

De module actief laten of stopzetten kan via Modulebeheer. De meldlink blijft staan
(of trek 'm in via de kaart).
