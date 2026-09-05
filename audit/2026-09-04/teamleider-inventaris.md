# Teamleider-rol — inventaris (geen rechtenmodel-oordeel, puur bestandsopname)

Onderzoek tegen de huidige code op branch `fix/audit-restpunten` (ná commits 98a6401/237960f van de
teamleider-bouwsessie). Puur leesonderzoek + live read-only queries; niets gewijzigd.

## 1. Rolwaarde

**BEWEZEN** (live query): `select role, count(*) from users group by role order by 1` →
`admin: 2, client: 9`. **Geen teamleider-account bestaat nog in productie.** De letterlijke waarde
`'teamleider'` is **CODE BEVESTIGD** aanwezig als stringliteral in zowel de page-gates
(`app/[company_id]/*/page.tsx`, zie §2) als de DB-laag (`is_teamleider()`, `mag_bedrijf_werken()`,
`db/schema.sql`) — geen RPC/scherm gevonden waar een admin dit toekent (geen "rol wijzigen"-UI in
deze inventaris aangetroffen); vermoedelijk (niet geverifieerd) via directe DB/service-role, zoals
de bestaande demo-accounts.

## 2. Page-gates — alle 15 `app/[company_id]/**/page.tsx` + 3 `app/admin/**/page.tsx`

**CODE BEVESTIGD**, elke regel hieronder zelf gelezen.

| Pagina | Gate (regel) | Teamleider |
|---|---|---|
| `modules/page.tsx:37-40` | `magBeheren` = admin\|\|client | **MAG NIET** |
| `personen/page.tsx:70-73` | `magBeheren` = admin\|\|client | **MAG NIET** |
| `dashboard/page.tsx:72-75` | `magBeheren` = admin\|\|client | **MAG NIET** |
| `dashboard/bedrijfsvoering/page.tsx:33-36` | `magBeheren` = admin\|\|client | **MAG NIET** |
| `admin/{bibliotheek,huisstijl,toolboxen}/page.tsx` | `role!=='admin'→notFound()` | **MAG NIET** (irrelevant, admin-only) |
| `rie/page.tsx:62` | los: `role!=='admin' && company_id!==company_id` | **MAG** (company-match volstaat, geen rolcheck) |
| `toolbox/overzicht/page.tsx:36` | idem los | **MAG** |
| `toolbox/bewijs/[deelname_id]/page.tsx:27` | idem los | **MAG** — niet expliciet genoemd in de bouw-memory, zie §6 |
| `inspecties/[inspectie_id]/page.tsx:31` | idem los | **MAG** |
| `inspecties/page.tsx:81-87` | expliciet `magWerken` (incl. teamleider) → `notFound()` | **MAG** |
| `incidenten/page.tsx:46-48` | expliciet `magWerken` → `notFound()` | **MAG** (medisch gemaskeerd, zie §5) |
| `toolbox/page.tsx:42-44` | expliciet `magWerken` → `notFound()` | **MAG** |
| `pva/page.tsx:36` | los gate; `magWerken` (regel 50) wordt berekend maar NIET gebruikt om te gaten | **MAG** (op paginaniveau; écht onderscheid zit in RLS/RPC, zie §4) |
| `actielijst/page.tsx:33` | idem, `magWerken` (regel 39) niet gebruikt om te gaten | **MAG** |
| `audits/page.tsx:36-41` | los gate + **expliciet** `if (role==='teamleider') notFound()` | **MAG NIET** (bewuste blokkade) |
| `audits/[audit_id]/page.tsx:34` | **alleen** het losse gate, GEEN expliciete teamleider-blokkade | **Zie §6 — inconsistentie** |

## 3. API-routes — alle 14 `app/api/**/route.ts`

**BEWEZEN**: `grep -rln "teamleider" app/api/` → **geen enkele treffer**. Geen route behandelt een
teamleider-sessie anders in de routecode zelf; alle 14 routes leunen volledig op de RLS/RPC-laag
erachter (zelfde patroon als voor admin/client, zie Ronde-2-rapport punt 4). Dat betekent: het
onderscheid "mag teamleider dit wel/niet" wordt uitsluitend bepaald door welke RPC de route aanroept
en of díe RPC `mag_bedrijf_werken` of `mag_bedrijf_beheren` gebruikt (zie §4). Niet elke route se
onderliggende RPC is in dit onderzoek individueel herverifieerd — dat zou punt 4 (systematisch) grotendeels
dupliceren.

## 4. RLS/RPC-laag — waar is `mag_bedrijf_werken` daadwerkelijk gebruikt?

**BEWEZEN** (live `pg_policies`-query + `grep` op `db/schema.sql`). Tabellen met een SELECT-policy op
`mag_bedrijf_werken` (dus leesbaar voor teamleider): `bedrijf_doelstelling`, `bedrijf_inspectie_doel`,
`bedrijf_modules`, `bedrijf_toolbox_instelling`, `inspectie`, `inspectie_ai_suggestie`,
`inspectie_bevinding`, `inspectie_foto`, `inspectie_historie`, `inspectie_sjabloon`,
`inspectie_sjabloon_punt`, `rie_versies`, `toolbox_deelname`, `toolbox_sessie`.

**Blijven dicht** (nog steeds uitsluitend `mag_bedrijf_beheren`, teamleider dus RLS-uitgesloten):
`incident`, `incident_foto`, `audit`, `audit_vca_bevinding`, `audit_iso_observatie`,
`audit_verbeterpunt`. RPC's `bewijs_registreren`/`bewijs_verwijderen`: **BEWEZEN** (prosrc gelezen)
gebruiken uitsluitend `mag_bedrijf_beheren`, geen `mag_bedrijf_werken` — RPC-niveau dicht, niet alleen
een verborgen knop.

**`pva_items`** heeft een aparte constructie: de SELECT-policy is `company_id = my_company_id() OR
is_admin()` — **geen rolcheck überhaupt**, dus élke rol (ook teamleider) met een matchend
`company_id` kon dit altijd al lezen; er was voor lezen geen verbreding nodig. De UPDATE-policy blijft
wél `mag_bedrijf_beheren`-only (teamleider kan de tabel niet rechtstreeks bewerken); de nieuwe RPC
`actie_status_zetten` gebruikt `mag_bedrijf_werken` en geeft zo een smalle, RPC-afgedwongen
schrijfbevoegdheid (status+opmerking) zonder de brede UPDATE-policy open te zetten.

**Vergelijking gate ↔ RLS — geen "dooie pagina's" gevonden**: elke pagina die teamleider op
paginaniveau doorlaat (rie, toolbox/overzicht, inspecties, toolbox, incidenten, pva, actielijst) heeft
ook daadwerkelijk minstens één onderliggende `mag_bedrijf_werken`-tabel/RPC om iets te tonen — geen
lege pagina zonder data aangetroffen. **Eén RLS-breder-dan-UI geval**: `bedrijf_inspectie_doel` en
`bedrijf_doelstelling` zijn leesbaar voor teamleider (mag_bedrijf_werken) maar worden — voor zover in
dit onderzoek nagegaan — nergens rechtstreeks vanuit een teamleider-bereikbare pagina uitgelezen buiten
de `toolbox_dashboard`/`dashboard_overzicht`-achtige aggregatie-RPC's die zelf ook al
`mag_bedrijf_werken`-gated zijn; geen apart gevaar geconstateerd, maar niet exhaustief nagelopen welke
UI-component dit precies aanroept.

## 5. Gerichte verificatie van de bouw-memory

- **`incident_overzicht`** — **BEWEZEN**, volledige RPC-body gelezen (`db/schema.sql`): `case when
  is_teamleider() then null else i.functie_slachtoffer end` en idem voor `medische_dienst_bezocht` —
  server-side gemaskeerd in de RPC zelf, niet client-side. RPC is `SECURITY DEFINER`, gate
  `mag_bedrijf_werken` (dus voor élke rol dezelfde functie, met masking alleen voor teamleider) —
  klopt met de memory. `incident_foto` blijft `mag_bedrijf_beheren`-only (bevestigd §4) — foto's dus
  ook RLS-technisch dicht, niet alleen verborgen in de UI.
- **`toolbox_sessie_verwijderen`** — **BEWEZEN**, volledige RPC-body gelezen: eerst
  `mag_bedrijf_werken`-poort, dan `if not mag_bedrijf_beheren(...) and aangemaakt_door is distinct
  from auth.uid() then raise exception 'Een teamleider mag alleen eigen toolbox-sessies
  verwijderen'`. Klopt exact met de memory: eigenaarschap-check geldt alleen als je GEEN
  `mag_bedrijf_beheren` hebt (dus specifiek teamleider), en zit in de RPC, niet in de UI.
- **Bewijs (upload/verwijderen)** — **BEWEZEN**, zie §4: `bewijs_registreren`/`bewijs_verwijderen`
  blijven `mag_bedrijf_beheren`-only op RPC-niveau.

## 6. Gevonden inconsistentie

**`audits/[audit_id]/page.tsx:34`** mist de expliciete `if (profile.role === 'teamleider')
notFound()` die `audits/page.tsx:41` wél heeft, terwijl de comment op regel 20 van het detailbestand
letterlijk zegt *"Zelfde modulegate als het overzicht: een losse deeplink mag er niet omheen"* — dat
klopt dus niet helemaal: het detailbestand gebruikt alleen het losse company-match-gate, niet de
teamleider-specifieke blokkade van het overzicht.

**Praktisch gevolg, geverifieerd via RLS (§4):** géén beveiligingsgat. `audit`/
`audit_vca_bevinding`/`audit_iso_observatie`/`audit_verbeterpunt` staan nog op `mag_bedrijf_beheren`
(niet verbreed), dus de query `select * from audit where id=...` op regel 29 geeft voor een
teamleider-sessie geen rij terug → `if (!audit) notFound()` (regel 36) vangt het alsnog af. Het
eindresultaat (teamleider ziet de auditdetailpagina niet) is dus **hetzelfde** als bedoeld — maar via
een andere, minder expliciete route dan de lijstpagina, en **kwetsbaar voor toekomstige drift**: als
`audit`'s RLS ooit (per ongeluk, analoog aan `bedrijf_modules`) naar `mag_bedrijf_werken` wordt
verbreed, zou deze pagina zonder verdere wijziging alsnog opengaan voor teamleider — in tegenspraak
met de expliciete bedoeling "audits blijven volledig dicht voor teamleider" op de lijstpagina.

**`toolbox/bewijs/[deelname_id]/page.tsx`** laat teamleider door (los gate) en `toolbox_deelname` is
RLS-leesbaar voor `mag_bedrijf_werken` — dit lijkt functioneel te werken (geen crash/lege pagina te
verwachten), maar wordt **nergens expliciet genoemd** in de bouw-memory's overzicht van wat teamleider
wel/niet ziet. Onduidelijk of dit een bewuste keuze was ("teamleider mag toolbox-bewijs inzien") of een
onbedoeld bijproduct van het breed verbreden van `toolbox_deelname`'s SELECT-policy. Geen
beveiligingsrisico op zich (het is leesbaar bewijs binnen het eigen bedrijf), wel een open vraag voor
Kees of dit de bedoeling is.

## Samenvatting: pagina/route × teamleider-toegang

| Pagina/route | Teamleider |
|---|---|
| modules, personen, dashboard, dashboard/bedrijfsvoering, admin/* (3x) | MAG NIET |
| rie, toolbox/overzicht, toolbox/bewijs/[id], inspecties/[id], inspecties, toolbox, incidenten, pva, actielijst | MAG |
| audits (lijst) | MAG NIET (bewust) |
| audits/[audit_id] (detail) | **MAG NIET in de praktijk, maar via RLS-backstop, niet via de bedoelde expliciete pagina-blokkade — inconsistentie, zie §6** |
| Alle 14 API-routes | Geen eigen rolcheck; volgt de RPC/RLS-laag hierboven |

Twee punten voor Kees om te bevestigen, geen technisch oordeel van mijn kant: (1) hoort
`audits/[audit_id]/page.tsx` dezelfde expliciete blokkade te krijgen als de lijstpagina, in plaats van
op de RLS-toevalstreffer te leunen? (2) is toegang tot individuele toolbox-bewijsstukken
(`toolbox/bewijs/[deelname_id]`) voor teamleider bedoeld?
