# Testronde rie-portal — 1 september 2026

Testronde na de useEffect- en performance-wijzigingen. Uitgevoerd met Playwright
tegen een lokale dev-server (Deel A) en een lokale productiebuild (Deel B).

**Getest op commit `22d0fcc`** ("perf(dashboard): DashboardClient en
AdminDashboardClient zijn server components"), in een aparte git-worktree op
poort 3100. Bewijsmateriaal (schermafdrukken, meetdata, testscripts):
`C:\Users\kees\rie-portal-testronde-2026-09-01\`.

---

## 0. Vooraf — twee dingen die je moet weten

### 0.1 Er werd tijdens de testronde doorontwikkeld in deze repo

Terwijl ik draaide, landden er commits van een andere sessie:

| tijd | commit | |
|---|---|---|
| 09:14 | `9d94cef` | perf(cache): haalHuisstijl en getSessionProfile in React `cache()` |
| 09:18 | `bdeffba` | perf(herinneringen): N+1 uit de heartbeat |
| 09:25 | `22d0fcc` | perf(dashboard): DashboardClient/AdminDashboardClient → server components |
| later | `50ede47` | perf(parallel): onafhankelijke leesacties in admin/huisstijl en personen |

Vanaf dat moment heb ik alles vastgepind op `22d0fcc` in een losse worktree, zodat
de rest van de meting op één bekende versie staat. De eerste losse metingen (vóór
het pinnen) heb ik weggegooid en overgedaan.

### 0.2 De cache()-fix wás al gedaan — de gevraagde nulmeting kon niet meer

De opdracht vraagt de TTFB als **nulmeting vóór** de `cache()`-fix rond
`haalHuisstijl` en `getSessionProfile`. Die fix was bij aanvang al toegepast en is
om 09:14 gecommit als `9d94cef`. De TTFB-cijfers hieronder zijn dus **mét**
`cache()`, niet ervoor. Een echte "voor"-meting zou terugdraaien naar `f2dcd4b`
vereisen; dat heb ik niet gedaan omdat dat werk terugdraaien is en jij hebt gezegd
niets op te lossen zonder overleg.

### 0.3 reactStrictMode

`next.config.ts` zet `reactStrictMode` **niet**. Voor de app-router is de standaard
sinds Next 13.5.1 `true` (bevestigd in `node_modules/next/dist/docs/01-app/.../reactStrictMode.md`).
Effects vuren in dev dus bewust 2x. Empirisch bevestigd: elke client-fetch komt in
dev 2x en op de productiebuild 1x.

---

## 1. Voorwaarden

| | oordeel | |
|---|---|---|
| Inloggen op de lokale app | **GOED** | zie hieronder |
| Testdata aanwezig | **GOED** | zelf aangemaakt |
| Playwright zonder install | **GOED** | zie hieronder |

**Inloggen.** De wachtwoorden van de bestaande demo-accounts (`kam-alpha@demo.nl`
e.d.) staan nergens in de repo. In plaats van gokken heb ik met de service-role een
eigen testgebruiker aangemaakt op Testbedrijf Alpha (`testronde_…@example.test`,
rol `client`) — precies het patroon dat `scripts/*_isolatie_test.mjs` al gebruikt.
Inloggen werkt, `/` stuurt netjes door naar `/<company_id>/pva`.

> **Kanttekening bij de dev-server:** klik je op *Inloggen* vóórdat het formulier
> gehydrateerd is, dan gebeurt er niets — er is geen native form-fallback
> (`app/login/login-form.tsx:42`, alles hangt aan `onSubmit`). Mijn eerste twee
> testruns liepen hierop stuk. Op de productiebuild is het venster veel kleiner.
> Geen bug in de zin van "kapot", wel iets om te weten.

**Testdata.** Aangemaakt en na afloop volledig opgeruimd:
- 4 bewijsstukken (3 png + 1 pdf) op RI&E-actie nr 5 "EHBO-koffer aanvullen"
  (`936c55b8-…`)
- 3 extra incident-foto's op het letsel-incident (`4149c5e4-…`), dat er al 1 had → 4
- een tweede testgebruiker op Testbedrijf Bravo (huisstijl `default`, dus zonder
  eigen klantlogo) voor de logo-test in A5

**Playwright.** `playwright@1.60.0` hergebruikt uit
`C:\Users\kees\Documents\family-planner\node_modules` via `createRequire`, met de al
geïnstalleerde `chromium-1223` uit `%LOCALAPPDATA%\ms-playwright`. Versie en
browser-revisie komen exact overeen. **Er is geen `playwright install` gedraaid.**

---

## 2. Deel A — functioneel (dev-server, StrictMode aan)

### A1 — BewijsBlok en incident-foto's

| # | punt | oordeel | bevinding |
|---|---|---|---|
| 1 | blok + thumbnails verschijnen | GOED | 4 items, 3 afbeeldingen laden echt (`naturalWidth > 0`), 1 pdf-blok |
| 2 | geen dubbele items | GOED | 4 uniek van 4 |
| 3 | geen leeg-gevuld-leeg flikkering | GOED | reeks over 40 metingen: `0…0,4,4,4…` — één overgang, nooit terug naar leeg |
| 4 | **5x open/dicht → geen nieuwe requests** | **FOUT** | **10x** `/api/bewijs/beheerder-download` in dev, **5x** op de productiebuild |
| 5 | verwijderen bewijsstuk | GOED | knop wordt `disabled` en toont "Bezig…", item verdwijnt, komt niet terug |
| 6 | verwijderen incident-foto | **NIET GETEST** | die knop bestaat niet — zie hieronder |
| 7 | na F5 blijft het verwijderd | GOED | volgorde ook stabiel over F5 en 3 navigaties |
| 8 | 3x weg-en-terug | GOED | 3x exact dezelfde lijst, geen verdubbeling |
| 9 | item A → item B | GOED | geen enkel moment de bewijzen van A zichtbaar bij B |
| 10 | leeg item | GOED | "Nog geen bewijs toegevoegd.", geen hangende spinner, geen console-error |
| 11 | **signed URL's na afloop** | **FOUT** | zie A1-signed hieronder |

#### FOUT A1.4 — elke keer opendoen is een nieuwe fetch

`components/PvaCard.tsx:205` rendert de hele onderkant van de kaart als
`{open && ( … )}`. Dichtklappen **unmount** dus `BewijsBlok`. En
`components/BewijsBlok.tsx:54-57` haalt bij elke mount opnieuw op:

```tsx
useEffect(() => {
  haal()
}, [haal])
```

Gevolg: 5 keer dicht-en-open = 5 extra rondjes naar `/api/bewijs/beheerder-download`,
en elk rondje maakt aan de serverkant ook weer **een verse signed URL per bestand**
(`app/api/bewijs/beheerder-download/route.ts:52-60`, een `createSignedUrl` per
bewijsstuk). Op de productiebuild gemeten: **5 fetches na 5 cycli**, dus dit is geen
StrictMode-artefact.

#### NIET GETEST A1.6 — incident-foto's kunnen niet verwijderd worden

`components/IncidentBeheer.tsx:559-583` rendert de foto's read-only: een `<a>` met
een `<img>`, geen verwijderknop. Er bestaat ook geen route
`/api/incident/foto-verwijderen` (wel `/api/inspectie/foto-verwijderen`, voor de
inspectiemodule). Het verwijderen van een **bewijsstuk** is wel getest (A1.5, GOED),
en het toevoegen + verwijderen van een **foto als bewijsstuk** ook (A2, GOED).

#### FOUT A1.11 — signed URL's verlopen na 1 uur en worden nooit ververst

Gemeten, niet geredeneerd:

- De geldigheidsduur staat in `lib/bewijs.ts:11`: `DOWNLOAD_GELDIGHEID_SEC = 60 * 60`.
  Uit het JWT van een echte thumbnail-URL gedecodeerd: `exp - iat = 3600 s`. ✔
- Een verlopen URL wordt geweigerd: ik heb via de service-role dezelfde soort URL
  met 2 s geldigheid gemaakt. Vers: **HTTP 200**. Na 3,5 s: **HTTP 400**,
  `{"error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}`.
- Een `<img>` met zo'n verlopen URL geeft `onerror` — gebroken plaatje.
- **De pagina ververst niets uit zichzelf.** In 45 s idle: 0 nieuwe ophaalacties. Er
  is geen interval, geen refresh-on-focus, geen re-sign; de URL's uit de eerste
  fetch blijven staan tot het component opnieuw mount.

Praktisch: een tabblad dat langer dan een uur open staat toont bij elke
her-render/reload van een `<img>` een gebroken thumbnail, en klikken op een foto
levert een 400. Geldt voor `BewijsLijst` (1 uur), `IncidentDetail` (1 uur) en
`app/tb/[token]/page.tsx:14` (video, 4 uur).

*(Ik heb niet letterlijk een uur gewacht; het bewijs is de gedecodeerde `exp`, de
gemeten 400 op een verlopen token, en het aantoonbaar ontbreken van elke
verversmechaniek.)*

### A2 — Console schoon

Doorloop: `/` → `/pva` → kaart openklappen → BewijsBlok → foto toevoegen → foto
verwijderen → terug.

| punt | oordeel | |
|---|---|---|
| 0 console-errors | GOED | 0 |
| 0 React-warnings | GOED | 0 |
| `unique "key" prop` | GOED | niet voorgekomen |
| `Maximum update depth exceeded` | GOED | niet voorgekomen |
| `Cannot update a component while rendering…` | GOED | niet voorgekomen |
| hydration mismatch | GOED | niet voorgekomen |
| server-side errors in de dev-terminal | GOED | geen errors |

Twee kanttekeningen die buiten deze doorloop vallen maar wel echt zijn:

1. **Dev-warning:** `⚠ The "middleware" file convention is deprecated. Please use
   "proxy" instead.` — `middleware.ts` in de projectroot. Verschijnt bij elke
   `next dev` en `next build`.
2. **Twee next/image-warnings op `/login`** (alleen in dev), beide over
   `app/login/login-form.tsx:39` `<Image src="/logo.jpg" width={180} height={60}>`:
   - *"has either width or height modified, but not the other"* — `className="object-contain"` zonder `w-auto`/`h-auto`
   - *"was detected as the Largest Contentful Paint (LCP). Please add the `loading="eager"` property"*

### A3 — Netwerk

| # | punt | oordeel | bevinding |
|---|---|---|---|
| 1 | detailpagina 1x laden | GOED | inspectie-detail doet **0** client-side API-calls — volledig server-gerenderd. Alleen de 2 publieke logo's uit `merk-assets`. |
| 2 | twee componenten, dezelfde resource | GOED | geen enkele dubbele ophaler gevonden |
| 3 | hover / scroll | GOED | 0 requests |
| 3b | filter-toggle | GOED | 0 requests |
| 4 | typen gedebouncet | **NIET GETEST** | **de app heeft nergens een zoekveld** (geen `type="search"`, geen zoek-placeholder; `FilterBar` is een rij pillen). Als vervanging het opmerkingveld getest: **0 requests tijdens typen, 1 schrijfactie bij blur** → GOED. |
| 5 | 60 s idle | GOED | 0 requests op de gepinde dev-server, 0 op de productiebuild |
| 6 | 5x heen en weer | GOED | **exact 2 requests per bezoek**, 5 rondes lang, zowel lijst als detail — niets loopt op |
| 7 | client-side supabase per navigatie | GOED | zie tabel |
| 8 | TTFB | gemeten | zie §4 |

**A3.7 — client-side calls per navigatie** (na een harde load, 2 s wachten):

| route | `/auth/v1/` | `/rest/v1/` | storage | eigen `/api/` |
|---|---|---|---|---|
| `/<id>/dashboard` | 0 | 0 | 2 | 0 |
| `/<id>/pva` | 0 | 0 | 2 | 0 |
| `/<id>/inspecties` | 0 | 0 | 2 | 0 |
| `/<id>/incidenten` | 0 | 0 | 2 | 0 |

Geen enkel client-component haalt data op die de serverpagina al meegaf. De 2
storage-requests zijn de klant- en merklogo's uit de **publieke** bucket
`merk-assets` — die horen client-side thuis.

> **Eén valse alarm gecorrigeerd.** In een vroege run zag ik 6, later 2 RSC-requests
> naar de eigen URL tijdens 60 s idle. Los reproduceren lukte niet (0 requests), en
> op de productiebuild is het 0. Het zijn RSC-refetches die de dev-server triggert
> nadat hij een andere route heeft gecompileerd. **Geen polling in de app** —
> `grep` bevestigt: geen enkele `setInterval` buiten `YouTubeSpeler.tsx:69`, geen
> `router.refresh()` op een timer, geen `visibilitychange`-handler.

### A4 — Back/forward

| punt | oordeel | bevinding |
|---|---|---|
| overzicht → detail → back: lijst gevuld | GOED | 4 → 4 regels |
| scrollpositie ongeveer terug | GOED | 400 px → 400 px (exact) |
| filter zetten, detail, back, forward | **LET OP** | zie hieronder |
| verwijderd bewijs blijft weg na back | GOED | |
| … en na forward | GOED | |
| detail-URL hard laden in nieuw tabblad | GOED | HTTP 200, volledige inhoud |

**LET OP — de filterkeuze zit niet in de URL.** `FilterBar` wordt volledig
aangestuurd door React-state in `components/PvaClient.tsx:28-29`; de URL verandert
niet bij het filteren. Na wegnavigeren en terug is het filter weg: van 1 zichtbare
actie terug naar 4. Strikt genomen slaagt het criterium *"URL en UI zeggen
hetzelfde"* — beide zeggen "geen filter" — maar de keuze van de gebruiker gaat
stilletjes verloren, en de gefilterde weergave is niet deelbaar of te bookmarken.

### A5 — Responsive

Schermafdrukken: `schermafdrukken/A5_*.png` (4 formaten × 2 schermen + logo-varianten).

| punt | 390×844 | 768×1024 | 1024×768 | 1280×800 |
|---|---|---|---|---|
| geen horizontale scroll — `/pva` + BewijsBlok | **FOUT** (453 px) | GOED | GOED | GOED |
| geen horizontale scroll — fotogalerij | **FOUT** (538 px) | GOED | GOED | GOED |
| thumbnails houden hun verhouding | GOED 64×64 `object-cover` | GOED | GOED | GOED |
| fotoraster valt netjes terug | GOED (4 foto's, 2 rijen) | GOED (1 rij) | GOED | GOED |

#### FOUT A5 — horizontale scroll op telefoonformaat, veroorzaakt door het logo

Op 390 px breed is `document.body.scrollWidth` **453 px** op `/pva` en **538 px** op
de incident-detailpagina. De uitstekende node is elke keer dezelfde:

```
img.h-[46px].w-auto.object-contain  (rechterkant op 453 px)
```

Dat is `components/HuisstijlLogo.tsx:8`:

```tsx
return <img src={src} alt={alt} className="h-[46px] w-auto object-contain" />
```

De hoogte ligt vast op 46 px, de **breedte niet**. Het klantlogo van Testbedrijf
Alpha rendert daardoor 349 px breed, met daarnaast het QHSE-merklogo van 149 px in
een `flex`-rij (`HuisstijlLogo.tsx:34`) zonder `flex-wrap`, `min-w-0` of
`max-w-full`. Samen met de paginapadding loopt dat over de 390 px heen. Op de
schermafdruk `A5_pva_bewijsblok_390x844.png` zie je het QHSE-logo rechts
afgesneden, en de hele pagina schuift horizontaal.

#### Header en navigatie

- **GOED — een lang klantlogo kan de navigatie niet wegduwen.** `HuisstijlLogo` zit
  *niet* in de bovenbalk: `components/CompanyTopBar.tsx:41-43` toont de bedrijfsnaam
  als tekst met `truncate`. Het logo staat in de paginakop eronder
  (`PvaClient.tsx:85`). De navigatie kan er dus niet door verdrongen worden — de
  paginabreedte wél (zie hierboven).
- **GOED — klant zonder eigen logo.** Testbedrijf Bravo (huisstijl `default`,
  `klant_logo = null`) valt netjes terug op alleen het merklogo, 149×46, geen
  overloop. Schermafdruk: `A5_bravo_zonder_klantlogo.png`.
- **FOUT — het logo heeft geen `width`/`height`-attributen.** Alleen CSS
  (`h-[46px] w-auto`). Voor CLS blijkt dat in de praktijk onschadelijk (zie B1),
  omdat de hoogte vastligt; het is wel de reden dat de breedte onbegrensd is.
- **NIET GETEST — lightbox.** Die bestaat niet. Een foto opent via
  `<a target="_blank">` in een nieuw tabblad (`BewijsLijst.tsx:40`,
  `IncidentBeheer.tsx:569`). Er is geen `role="dialog"` in beeld, voor noch na de
  klik.
- **Onbeslist — simulatie van een 1600 px breed klantlogo.** Ik heb de `src` in de
  DOM vervangen door een 1600×46 SVG; de gemeten breedte veranderde niet (453 px),
  dus die simulatie zegt niets. Het echte logo levert het bewijs al.

### A6 — Double-submit (700 ms RTT, 400 kbps)

| punt | oordeel | bevinding |
|---|---|---|
| verwijderen 3x snel | GOED | knop `disabled` + "Bezig…" na de 1e klik, **1** RPC, na refresh precies 1 item weg |
| foto uploaden 3x snel | GOED | label wordt "Bezig met uploaden…", **1** call naar `/api/bewijs/beheerder-upload`, geen dubbele record |
| opslaan 3x snel | GOED | knop `disabled` + "Opslaan…" na de 1e klik, **1** RPC `incident_deel2_opslaan` |
| 2x Enter in een formulierveld | GOED | 0 schrijf-requests |
| 2x op de bevestigknop | GOED (deels) | **1** RPC. De `disabled`-status was achteraf niet te lezen omdat de knop bij succes verdwijnt; de code (`IncidentBeheer.tsx:373`) gebruikt hetzelfde `disabled={bezig}`-patroon dat hierboven wél meetbaar GOED is. |
| mislukte actie (offline) | GOED | knop weer aan, **"Verwijderen mislukt."** zichtbaar, item niet verwijderd |
| 3 klikken in dezelfde JS-tick | **LET OP** | **3** RPC's — zie hieronder |

**LET OP A6 — geen ref-guard, alleen state.** Met `el.click(); el.click(); el.click()`
in één tick vuren er 3 requests. Dat is een kunstmatige ondergrens (een mens haalt
dat niet), maar het laat zien waar de bescherming zit: `setBezig(true)` +
`disabled={bezig}` werkt pas ná de re-render. Een `useRef`-vlag die synchroon aan
het begin van de handler wordt gezet, sluit dat gat.

**Nog een observatie uit een eerdere, gebrekkige run van mij:** klikte ik drie keer
snel op de *plek* van de verwijderknop in plaats van op hetzelfde element, dan
verdwenen er **twee** bewijsstukken. Dat kwam door mijn selector, niet aantoonbaar
door de app — maar het scenario is echt: de lijst schuift onder de cursor door
zodra een rij verdwijnt. De eerste correcte meting (vast element) is GOED.

---

## 3. Deel B — productiebuild (`npm run build && npm start`)

### B0 — Elke endpoint EXACT 1x

**Dit is de echte toets op de useEffect-fixes, en die is geslaagd.**

| punt | oordeel | bevinding |
|---|---|---|
| inspectie-detail, harde load | GOED | geen enkele endpoint > 1x |
| `BewijsBlok` haalt op | GOED | **exact 1x** `/api/bewijs/beheerder-download` |
| `IncidentDetail` haalt foto's op | GOED | **exact 1x** `/api/incident/foto-download` |
| 5x open/dicht | **FOUT** | **5x** `/api/bewijs/beheerder-download` — geen StrictMode, echte bug (zie A1.4) |

### B1 — Slow 3G (400 kbps / 400 ms RTT) + 4x CPU, 390×844

| route | eerste zichtbare inhoud | skelet | CLS | oordeel |
|---|---|---|---|---|
| `/<id>/pva` | 587 ms | ja (`LaadSkeleton`) | **0.0000** | GOED |
| `/<id>/inspecties` | 588 ms | ja | **0.0000** | GOED |
| `/<id>/inspecties/<id>` | 674 ms | niet waargenomen | **0.0002** | GOED |
| `/login` | 623 ms | n.v.t. (geen `loading.tsx`) | **0.0025** | GOED |

- **Skeleton binnen ~0,5 s:** 587–674 ms, dus net erbuiten — maar dat is mét 4x
  CPU-rem én 400 ms RTT, waarvan de RTT alleen al het grootste deel opeet. Geen
  witte pagina, geen lege lijst die "geen resultaten" suggereert. Praktisch GOED.
- **CLS < 0,1: ruim GOED.** Hoogste gemeten waarde 0.0025.
- **De hypothese over `HuisstijlLogo` klopt niet.** Het logo is inderdaad een kale
  `<img>` uit een bucket zonder `width`/`height`-attributen, maar de **hoogte ligt
  vast** op `h-[46px]`. De verticale layout verschuift dus niet als het plaatje
  binnenkomt, en CLS meet alleen verticale/horizontale *verplaatsing* van andere
  elementen. De enige gemeten verschuiving op `/login` (0.0025, na ~6 s) is het
  inlogkaartje `div.w-full.max-w-sm.glass-tile`, en die is verwaarloosbaar.
  De onbegrensde **breedte** is wél een probleem — maar dat uit zich als
  horizontale overloop (A5), niet als CLS.
- **`/login` onder Slow 3G:** het formulier verspringt niet noemenswaardig als het
  logo binnenkomt (CLS 0.0025). Schermafdruk: `B1_login.png`.

### B2 — Bundelgroottes

**Eerst iets belangrijks: de routetabel heeft geen groottes meer.** Next 16.2.7 met
Turbopack print alleen nog route + type, zónder de kolommen *Size* en
*First Load JS* die je gewend was. De volledige tabel staat in
`meetdata/buildtabel.txt`; hier de kern:

```
Route (app)
┌ ƒ /                                     ƒ /api/...            (alle API-routes)
├ ○ /_not-found                           ƒ /auth/callback
├ ƒ /[company_id]/actielijst              ƒ /dashboard
├ ƒ /[company_id]/audits                  ○ /geen-toegang
├ ƒ /[company_id]/audits/[audit_id]       ƒ /login
├ ƒ /[company_id]/dashboard               ƒ /melden/[token]
├ ƒ /[company_id]/dashboard/bedrijfsvoering  ○ /reset-wachtwoord
├ ƒ /[company_id]/incidenten              ○ /set-wachtwoord
├ ƒ /[company_id]/inspecties              └ ƒ /tb/[token]
├ ƒ /[company_id]/inspecties/[inspectie_id]
├ ƒ /[company_id]/modules                 ƒ Proxy (Middleware)
├ ƒ /[company_id]/personen
├ ƒ /[company_id]/pva                     ○  (Static)   prerendered as static content
├ ƒ /[company_id]/rie                     ƒ  (Dynamic)  server-rendered on demand
├ ƒ /[company_id]/toolbox
├ ƒ /[company_id]/toolbox/bewijs/[deelname_id]
├ ƒ /[company_id]/toolbox/overzicht
├ ƒ /a/[token]
├ ƒ /admin/bibliotheek
├ ƒ /admin/huisstijl
└ ƒ /admin/toolboxen
```

Omdat de cijfers ontbreken heb ik ze **empirisch gemeten**: per route een koude
harde load in een verse browsercontext, en alle JS die de browser daarvoor ophaalt
opgeteld. Zie §4 voor de tabel.

| punt | oordeel | bevinding |
|---|---|---|
| First Load JS shared by all < ~130 kB | **FOUT (net)** | **143,7 kB** over de lijn (8 gedeelde JS-chunks, 502,7 kB onverpakt) |
| drie zwaarste routes | — | `/inspecties` 242,9 kB · `/pva` 234,8 kB · `/incidenten` 233,6 kB (over de lijn, incl. CSS) |
| grootste chunk = supabase-js? | **JA** | de grootste chunk is **237,2 kB** en bevat `@supabase/supabase-js` + `@supabase/ssr` |
| supabase-js in ~32 client-bestanden? | **JA, exact 32** | zie lijst hieronder |
| route onbedoeld dynamisch? | GOED | zie hieronder |

**De grootste chunks en wat erin zit:**

| grootte (schijf) | chunk | inhoud |
|---|---|---|
| 237,2 kB | `39-ok_i1e3y4n.js` | `@supabase/supabase-js` + `@supabase/ssr` |
| 222,0 kB | `2cya-h6pss2j9.js` | `react-dom` + next app-router |
| 134,2 kB | `2oh5rha75m2ak.js` | app-code |
| 110,0 kB | `0cz1d0mv5g_q7.js` | app-code |

Alle client-chunks samen: **1 540,2 kB in 39 bestanden**.

**`@supabase/supabase-js` client-side: exact 32 bestanden** importeren
`@/lib/supabase/client`. Je vermoeden klopt precies. 29 componenten plus
`app/login/login-form.tsx`, `app/reset-wachtwoord/page.tsx` en
`app/set-wachtwoord/page.tsx`. Dat de supabase-chunk *niet* in de "gedeeld door
alle routes"-set zit is goed nieuws: `/<id>/audits` (158,0 kB) en de
inspectie-detailpagina (165,8 kB) laden hem niet en zijn daardoor ~75 kB lichter.
Daar zit de winst: hoe minder client-componenten supabase rechtstreeks aanroepen,
hoe meer routes onder die 237 kB-chunk uit komen.

**Onbedoeld dynamisch?** Nee. Alles wat `ƒ` is, leest cookies of `params` en moet
dus dynamisch. Statisch zijn `/_not-found`, `/geen-toegang`, `/reset-wachtwoord` en
`/set-wachtwoord`. De enige die je zou kúnnen omzetten is **`/login`**: die is
dynamisch omdat `app/login/page.tsx:6` `getSessionProfile()` aanroept om al
ingelogde bezoekers door te sturen. Verhuis je die redirect naar de proxy/middleware
(die al op elke request draait), dan kan `/login` statisch. Bewuste keuze nu, geen
fout.

---

## 4. Meetcijfers (nulmeting)

### 4.1 TTFB document-request

Gemeten op de **dev-server** (zoals de opdracht vraagt), commit `22d0fcc`, n=7,
mediaan. **Let op: mét de `cache()`-fix** — zie §0.2.

| route | mediaan | min | max |
|---|---|---|---|
| `/<company_id>/dashboard` | **626,8 ms** | 541,0 | 684,0 |
| `/<company_id>/inspecties` | **482,4 ms** | 434,0 | 661,0 |
| `/<company_id>/pva` | **472,5 ms** | 424,8 | 505,6 |

> Deze getallen zijn **niet geschikt als harde nulmeting**. Op de dev-server
> schommelt dezelfde route enorm tussen runs — `/pva` gaf in drie runs medianen van
> 1 022,9 / 383,6 / 472,5 ms, met een uitschieter naar 2 793 ms. Turbopack compileert
> en cachet tussendoor. Wil je een bruikbare nulmeting voor de cache()-winst, meet
> dan op `npm start` en tegen twee commits (`f2dcd4b` = ervoor, `9d94cef` = erna).
> Zeg het maar, dan doe ik dat.

### 4.2 CLS (productiebuild, Slow 3G + 4x CPU, 390×844)

| route | CLS | grootste verschuiving |
|---|---|---|
| `/<id>/pva` | **0.0000** | 0.00002 op +6 278 ms (bron niet toewijsbaar) |
| `/<id>/inspecties` | **0.0000** | geen |
| `/<id>/inspecties/<id>` | **0.0002** | 0.00019 op +6 354 ms |
| `/login` | **0.0025** | `div.w-full.max-w-sm.glass-tile` op +5 955 ms |

Grens 0,1 — ruimschoots gehaald op alle vier.

### 4.3 Bundelgroottes (productiebuild, commit `22d0fcc`)

First Load JS empirisch: alle JS+CSS die de browser bij een koude harde load ophaalt.

| route | bestanden | over de lijn | onverpakt |
|---|---|---|---|
| `/<id>/inspecties` | 13 | **242,9 kB** | 885,1 kB |
| `/<id>/pva` | 12 | **234,8 kB** | 857,2 kB |
| `/<id>/incidenten` | 13 | **233,6 kB** | 849,8 kB |
| `/<id>/toolbox` | 12 | 233,4 kB | 854,3 kB |
| `/<id>/personen` | 12 | 232,9 kB | 849,3 kB |
| `/<id>/actielijst` | 12 | 229,1 kB | 834,7 kB |
| `/<id>/modules` | 12 | 228,6 kB | 832,1 kB |
| `/login` | 12 | 228,1 kB | 830,4 kB |
| `/<id>/rie` | 12 | 227,7 kB | 829,5 kB |
| `/<id>/dashboard` | 12 | 226,2 kB | 824,3 kB |
| `/<id>/inspecties/<id>` | 11 | 165,8 kB | 593,7 kB |
| `/<id>/audits` | 10 | 158,0 kB | 571,0 kB |

| gedeeld door alle routes | over de lijn | onverpakt |
|---|---|---|
| JS (8 chunks) | **143,7 kB** | 502,7 kB |
| CSS (1 bestand) | 10,8 kB | 60,2 kB |

---

## 5. Samenvatting

### FOUT (4)

1. **`BewijsBlok` haalt opnieuw op bij elke keer opendoen** — `PvaCard.tsx:205`
   unmount het blok bij dichtklappen, `BewijsBlok.tsx:54-57` fetcht bij elke mount.
   5 cycli = 5 extra rondjes op de productiebuild, elk met verse signed URL's.
2. **Signed URL's verlopen na 1 uur en worden nooit ververst** — `lib/bewijs.ts:11`
   (3600 s, geverifieerd in het JWT). Na afloop HTTP 400 `InvalidJWT`; gebroken
   thumbnails op een tabblad dat lang openstaat. Geen enkele verversmechaniek.
3. **Horizontale scroll op 390 px** — `HuisstijlLogo.tsx:8`, `h-[46px] w-auto`
   zonder breedtebegrenzing; het klantlogo van Alpha wordt 349 px breed en duwt de
   pagina naar 453 px (`/pva`) resp. 538 px (incident-detail).
4. **Gedeelde First Load JS 143,7 kB** — net boven de vuistregel van ~130 kB;
   de zwaarste losse chunk is supabase-js + ssr (237,2 kB), client-side
   geïmporteerd in exact 32 bestanden.

### LET OP (3)

5. Filterkeuze op `/pva` staat niet in de URL en gaat verloren bij back
   (`PvaClient.tsx:28-29`).
6. Geen `useRef`-guard tegen drie klikken in dezelfde JS-tick; `disabled={bezig}`
   dekt alleen alles ná de re-render.
7. Deprecation- en next/image-warnings: `middleware.ts` → `proxy`, en twee
   `/logo.jpg`-warnings op `app/login/login-form.tsx:39`.

### NIET GETEST (3)

8. **Verwijderen van een incident-foto** — die knop bestaat niet in
   `IncidentBeheer.tsx`, en er is geen bijbehorende route.
9. **Debounce op een zoekveld** — de app heeft nergens een zoekveld. Als vervanging
   het opmerkingveld gemeten: 0 requests tijdens typen, 1 bij blur (GOED).
10. **Lightbox** — bestaat niet; foto's openen in een nieuw tabblad.

### GOED — het belangrijkste resultaat

**B0 is groen.** Op de productiebuild vuurt elke endpoint **exact 1x**. De
useEffect-fixes doen wat ze moeten doen. Verder: geen console-errors, geen
server-errors, geen polling, geen dubbele ophalers, geen client-component dat
serverdata overdoet, constante requests bij herhaald navigeren, CLS ver onder de
norm, en double-submit-bescherming die onder trage netwerkcondities gewoon werkt.

---

## 6. Wat ik in de omgeving heb aangeraakt

Alles opgeruimd, geverifieerd (`bewijs=0 fotos=0 users=0` met prefix TESTRONDE):

- ✔ 4 bewijsstukken + storage-objecten verwijderd
- ✔ 3 incident-foto's + storage-objecten verwijderd (de oorspronkelijke demo-foto staat er nog)
- ✔ beide testgebruikers verwijderd (auth + `users`)
- ✔ het opmerkingveld van actie nr 5, dat de typtest had gevuld, weer leeggemaakt
  (het bevatte uitsluitend testtekst)
- ✔ de git-worktree `C:\Users\kees\rie-portal-test` verwijderd; `git status` in de
  repo is schoon

**Twee dingen zijn niet terug te draaien, en die moet je weten:**

- De **meldlink van Testbedrijf Alpha is één keer geroteerd** in de
  double-submit-test (A6.5). Een oude QR van dat testbedrijf werkt dus niet meer.
- De **incident-afhandeling van het letsel-incident is een paar keer opgeslagen**
  met ongewijzigde waarden (A6.3/A6.7). Dat heeft historie-regels toegevoegd.

**Nog actief:** er draait nog een dev-server op **poort 3000** vanuit
`C:\Users\kees\rie-portal` (PID 25000). Die heb ik aan het begin gestart en bewust
niet afgeschoten, omdat de andere sessie hem inmiddels in gebruik kan hebben.
Afsluiten kan met `taskkill /PID 25000 /T /F`.

---

*Testscripts, schermafdrukken en ruwe meetdata:
`C:\Users\kees\rie-portal-testronde-2026-09-01\`*

---

## 7. Afhandeling van de vier FOUT-punten (nagekomen, 1 september 2026)

Toegevoegd ná de testronde. Alle vier de punten zijn afgehandeld; drie met een
fix, één met een onderbouwde afsluiting.

| # | punt | uitkomst | commit |
|---|---|---|---|
| 1 | `BewijsBlok` haalt opnieuw op bij elke keer opendoen | **gefixt** | `df56cf5` |
| 2 | signed URL's verlopen en worden nooit ververst | **gefixt** | `04f8a11` |
| 3 | horizontale scroll op 390 px door `HuisstijlLogo` | **gefixt** | `6ed39c8` |
| 4 | gedeelde First Load JS 143,7 kB | **gesloten, geen actie** | dit hoofdstuk |

### 7.1 Punt 1 — `components/PvaCard.tsx`

De kaart onthoudt nu of hij ooit is opengeklapt. Vóór die eerste keer wordt de
onderkant niet gerenderd — anders zou élke kaart op de pagina bij het laden zijn
bewijs ophalen — en daarna blijft hij gemonteerd, zodat dichtklappen hem alleen
verbergt.

Gemeten op de productiebuild, 5× dicht-en-open op dezelfde kaart:

| | eerste keer | totaal na 5 cycli |
|---|---|---|
| voor | 1 fetch | **6** (5 extra) |
| na | 1 fetch | **1** (0 extra) |

### 7.2 Punt 2 — `lib/verse-urls.ts` (nieuw) + vier componenten

`useVerseUrls(herlaad)` houdt de URL's vers via **dezelfde beveiligde route**:
opnieuw ophalen is letterlijk die route nog eens aanroepen, die eerst de
RLS-gescopete select doet en pas daarna met de service role tekent. Geen
publieke bucket, geen nieuwe endpoint, en de geldigheidsduur blijft een uur.

Twee mechanismen: verversen bij terugkeer op het tabblad boven een drempel van
45 minuten (houdt óók de doorklik-links vers), en een begrensd vangnet op
`onError` van een `<img>`. Geen timer, geen polling.

De toolbox-video (4 uur, server-gerenderd) doet bij een fout eerst één
`router.refresh()`, waarna de serverpagina met hetzelfde al gevalideerde token
opnieuw tekent; daarna de bestaande handmatige terugval.

Gemeten op de productiebuild, 7/7: een 1 s-URL is vers 200 en daarna 400
(de aanname uit A1.11 zelf geverifieerd); een verlopen thumbnail leidt tot
precies één herstel-ophaling en is daarna weer zichtbaar; terugkomen met verse
URL's doet niets; met de klok 50 minuten vooruit precies één verversing; direct
daarna weer niets.

### 7.3 Punt 3 — `components/HuisstijlLogo.tsx`

`max-w-full` + `min-w-0` + `shrink` op het logo en op de flexrij. `min-w-0` is
de kern: een `<img>` in een flexcontainer mag standaard niet onder zijn
intrinsieke breedte krimpen.

Gemeten met een klantlogo van 1200×100 in co-branding — extremer dan het geval
uit A5:

| viewport | `body.scrollWidth` voor | na |
|---|---|---|
| 390 px | 756 | **390** |
| 768 px | 1144 | **768** |
| 1024 px | 1272 | **1024** |
| 1280 px | 1400 | **1280** |

### 7.4 Punt 4 — gesloten: dit is de framework-bodem, geen app-code

De gedeelde chunks zijn opengemaakt in plaats van alleen geteld. In de build van
1 september: **7 gedeelde chunks, 556 kB ruw / 168 kB gzip**, en die bestaan
volledig uit framework:

| ruw | gzip | inhoud |
|---|---|---|
| 222 kB | 69 kB | `react-dom` |
| 134 kB | 37 kB | Next app-router internals |
| 110 kB | 39 kB | idem |
| 31 kB | 9 kB | `next/dist` |
| rest | ~11 kB | polyfills, turbopack-runtime |

**Er zit geen regel eigen applicatiecode in de gedeelde set.** De 143,7 kB is de
ondergrens van een Next 16 app-router-app; onder de vuistregel van ~130 kB komen
zou betekenen dat er framework-code weg moet, en die knop bestaat niet.

De wél bestaande knop staat in §3 (B2) van dit rapport zelf: *"hoe minder
client-componenten supabase rechtstreeks aanroepen, hoe meer routes onder die
237 kB-chunk uit komen."* Dat is de supabase-in-32-bestanden-ingreep — een
grote wijziging die bewust is geparkeerd en niet onder deze testronde valt.

**Besluit: punt 4 wordt gesloten als "framework-bodem, geen actie".** De
supabase-ingreep blijft als los verbetertraject op de lijst, met als
tussenvariant het via `next/dynamic` onder die chunk uit halen van de zwaarste
routes.

### 7.5 Migraties

Vóór het werk gecontroleerd of er migraties openstonden: **alle 58 bestanden in
`supabase/migrations` zijn toegepast.** Er is geen migratie-administratie in dit
project, dus dat is bepaald door per bestand te kijken of de objecten die het
aanmaakt (tabellen, functies, policies, triggers, kolommen, buckets) live
bestaan. Vier bestanden leken objecten te missen; dat bleek in alle gevallen
door een látere migratie te komen:

- `0004` → kolommen `abonnement_status`/`opgezegd_op` zijn in **0005** hernoemd
  naar `module_status`/`gestopt_op`
- `0004`, `0006`, `0007`, `0038` → acht policies zijn bewust gedropt door
  **0012**, **0055**, **0056** en **0058**

Er is dus geen migratie toegepast tijdens dit werk, en er stond er ook geen open.
De punt-2-fix is puur frontend en heeft geen migratie nodig.
