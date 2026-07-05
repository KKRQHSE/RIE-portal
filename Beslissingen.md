# Beslissingen — QVOX RI&E-portaal

> **Let op — repo-lokaal log.** Dit bestand is op 20 juni 2026 in de repo gestart.
> De canonieke besluitenlijst (Beslissingen 1–59) beheert Kees buiten deze repo;
> die is leidend. Nieuwe besluiten die in de codebase landen leggen we vanaf nu
> hier vast, zodat ze reviewbaar naast de code staan. **Nummering 60+ is
> voorlopig** en moet bij gelegenheid met het externe log worden afgestemd.

---

## Beslissing 60 — Laad-optimalisatie van het portaal (20 juni 2026)

**Aanleiding.** Het managementdashboard voelde "net niet 100% interactief": na een
klik op een tegel gebeurde er zichtbaar even niets. Diagnose toonde aan dat dit
geen kapotte tegel was (elke tegel is een echte `<Link>`), maar een
laad-ervaring: pagina's gaven geen directe feedback en haalden hun data traag op.

**Besluit.** Drie additieve optimalisaties, zonder de werking of beveiliging te
wijzigen:

1. **Loading-skeletten.** Elke beveiligde route (`/[company_id]/dashboard`, `/pva`,
   `/rie`, `/inspecties`, `/personen` en het admin-`/dashboard`) krijgt een
   `loading.tsx` die een gedeeld skelet (`components/LaadSkeleton.tsx`) toont. Next
   prefetcht deze fallback, waardoor een klik meteen reageert in plaats van op de
   oude pagina te blijven hangen.
2. **Parallelle queries.** Onafhankelijke Supabase-leesacties per pagina draaien
   samen in één `Promise.all` in plaats van een waterval van losse round-trips
   naar de database (EU/Ierland). De autorisatie-gating (`redirect`/`notFound`)
   gebeurt onveranderd ná het ophalen.
3. **Minder schrijfacties.** `koppel_mij_als_persoon` draaide bij élke PvA-/
   Personen-lading. Via `lib/personen-data.ts` wordt die (idempotente) RPC nog
   alleen aangeroepen als de ingelogde KAM nog niet in de personenlijst staat.

**Afwegingen.**
- **Veilige standaard gehandhaafd** (vgl. werkwijze in `Projectstand.md`): puur
  frontend/data-ophaling, geen gedrags- of schemawijziging; `tsc` + `next build`
  groen.
- **Bewuste tradeoff van de skeletten:** door streaming kan een `notFound()` ná de
  await geen echte HTTP 404-status meer zetten. De gebruiker ziet wél de
  niet-gevonden-pagina (gemarkeerd `noindex`). Voor dit interne portaal
  acceptabel; alleen relevant als er ooit een harde 404-status nodig is.
- **Niet aangeraakt:** de `auth.getUser()`-aanroep in de middleware bij elke
  request blijft staan — dat is een bewuste beveiligingskeuze, geen
  prestatieprobleem om weg te optimaliseren.

**Bewijs.** Browsergetest op het KAM-dashboard (alle tegels navigeren correct);
`tsc --noEmit` en `next build` groen. Commits `6e6c378` (optimalisatie) en de
voorafgaande dashboard-reparatie `d3dc2b5` (RI&E-geldigheid-tegel → `/rie`).

---

## Beslissing 61 — Module-zelfbeheer per bedrijf (20 juni 2026)

**Aanleiding.** Modules (te beginnen met de werkplekinspectie) moeten per bedrijf
aan/uit kunnen, maar "een module gebruiken" en "een module bewust in gebruik nemen"
zijn twee verschillende dingen. Tot nu toe was er alleen één platte `actief`-vlag in
`bedrijf_modules` — niet genoeg om later facturatie op te laten leunen.

**Besluit.** Drie expliciete toestanden per module per bedrijf, bovenop de
bestaande gebruiks-toggle:

1. **Niet actief** (`module_status = 'geen'`, default) — nooit geactiveerd, niet
   bruikbaar, niet zichtbaar.
2. **Actief** (`'actief'`) — de beheerder zet het *gebruik* vrij aan/uit via de
   bestaande kolom `actief`. "Uit" pauzeert alleen het gebruik; de module blijft
   actief.
3. **Gestopt** (`'gestopt'`) — een aparte, bewuste handeling die de module
   beëindigt. Daarna niet meer bruikbaar; opnieuw aanzetten is een nieuwe activatie.

De eerste activatie is een bewuste stap (bevestiging in de UI; `geactiveerd_op`
vastgelegd). Stopzetten heeft een eigen knop + bevestiging (`gestopt_op`).

**Terminologie (expliciete keuze).** Bewust **geen 'abonnement'-taal** — niet in de
UI en niet in de DB/code. Klanten zien neutrale termen (Activeren / Aan-Uit /
Stopzetten; status Niet actief / Actief / Gestopt). Dit is ná de eerste build
doorgevoerd via een aparte hernoem-migratie (zie hieronder), zodat het woord nergens
blijft hangen.

**Afbakening.** *Nu géén* betaalintegratie of incasso (geen Stripe e.d.). We leggen
alleen de status en de momenten vast, zodat facturatie er later op kan leunen. De
activeringsstap is een bewuste statuswijziging, geen betaling.

**Datamodel.** Migratie `0004_module_abonnement.sql` (additief) zette het model neer
op `bedrijf_modules` + nieuwe loggende tabel `module_historie` (RLS via
`mag_bedrijf_beheren`). De bestaande Alpha-rij (inspectie, actief=true) is
geïnterpreteerd als actieve module (`module_status='actief'`, `geactiveerd_op`
gestempeld op het migratiemoment — er was geen historisch startmoment bewaard —,
`actief` bleef true). Migratie `0005_module_terminologie.sql` (niet-additief, vooraf
getoond en na akkoord gedraaid) hernoemde de terminologie: kolom
`abonnement_status → module_status`, `opgezegd_op → gestopt_op`, waarde
`'opgezegd' → 'gestopt'`, en de RPC's (zie onder). `0004` blijft als historie staan;
de huidige kolomnamen zijn die van `0005`.

**Autorisatie & RPC's.** Alleen wie het bedrijf mag beheren (KAM/admin, bestaande
`mag_bedrijf_beheren`-check) mag schakelen; gewone gebruikers en gast-actiehouders
zien hooguit de status. Drie SECURITY DEFINER-RPC's
(`db/module_zelfbeheer_rpcs.sql`), elk met een regel in `module_historie`:
`module_activeren` (eerste of hernieuwde activatie), `module_gebruik_zetten`
(aan/uit), `module_stopzetten`.

**UI & gating.** Beheerscherm `/[company_id]/modules` (`ModuleBeheer`) met per
module de status, "actief sinds"-datum en de juiste actieknop (echte buttons/links,
bevestiging bij activeren en stopzetten). Nav én dashboard tonen een module alleen
als `module_status='actief'` én `actief=true` — dezelfde gating als waarmee de
inspectie-tegel al verscheen.

**Bewijs.** Isolatietest `scripts/module_isolatie_test.mjs` 8/8 groen (bedrijf A
kan de modules van bedrijf B niet zien of muteren), testdata opgeruimd;
`tsc --noEmit` en `next build` groen. Commits `369b845` (model + UI) en de
terminologie-hernoeming (0005).

## Beslissing 62 — Per-bedrijf-RPC's: null-veilige guard aan de bron + anon-EXECUTE standaard ingetrokken (28 juni 2026)

**Context.** Tijdens de toolbox-export bleek een tenant-lek in het RPC-patroon.
`mag_bedrijf_beheren(...)` gaf voor een caller zónder auth (anon, geen token) NULL
terug (`is_admin() or p_company_id = my_company_id()` = `false or null` = null), en
de standaardguard `if not mag_bedrijf_beheren(...) then raise` ving die NULL niet af
(`not null` = null → de IF werd overgeslagen → de raise gemist). Daarbij krijgt een
nieuwe SECURITY DEFINER-functie standaard EXECUTE voor anon/PUBLIC. Combinatie: een
anonieme caller met de publieke anon-key kon per-bedrijf-RPC's bereiken zónder dat de
guard raiste.

**Besluit (norm voor alle huidige én toekomstige RPC's).**
1. **Bron-fix (migratie 0022):** `mag_bedrijf_beheren` geeft NOOIT meer NULL terug —
   `coalesce(..., false)`. Daarmee is elke `if not mag_bedrijf_beheren(...)`-guard
   automatisch veilig, ook in later geschreven code. Geen gedragswijziging voor
   admin/KAM; RLS blijft gelijk (null en false weigeren allebei). `is_admin()`
   coalesce't al naar false.
2. **Tweede laag (migratie 0023):** EXECUTE voor anon/PUBLIC wordt INGETROKKEN op
   alle per-bedrijf- (`mag_bedrijf_beheren`) en admin-only (`is_admin`) RPC's; alleen
   `authenticated` (ingelogde KAM/admin) + `service_role` houden EXECUTE. Bewust met
   rust gelaten: de gast/actiehouder- en werknemer-**token-RPC's** (deellink_* en
   toolbox_voor_token / toolbox_afronden_token) en de RLS-helpers (is_admin,
   my_company_id, mag_bedrijf_beheren).
3. **Standaard voor nieuwe RPC's:** een nieuwe per-bedrijf/admin-RPC krijgt bij
   aanmaak `revoke execute ... from public, anon` + `grant ... to authenticated,
   service_role`. Een nieuwe RPC is alleen anon/token-toegankelijk als dat een
   bewuste, gedocumenteerde keuze is (token-flow).

**Bewijs.** `scripts/security_hardening_test.mjs` (25/25): exhaustief (alle 57
gehardende RPC's zonder anon-EXECUTE, 9 token-RPC's mét), runtime (anon afgewezen op
reads/writes/admin), regressie (KAM/admin werkt; token-flow mét token door, zónder
token niet). Bestaande isolatietests blijven groen (toolbox 27, bibliotheek 34,
inspectie 25). Eerder al gedicht voor de export-RPC's in 0021.

## Beslissing 63 — Incidenten-/ongevallen-module, Fase 1: datamodel (5 juli 2026)

**Aanleiding.** Een nieuwe afneembare catalogusmodule 'incidenten' om laagdrempelig
incidenten en bijna-incidenten te melden, af te handelen en op een doorklikbaar
dashboard te tonen. Gebouwd in fasen; dit is het datamodel (STOP-punt vóór de flows).

**Kerngedachte — twee losse delen op één rij, net als het papieren formulier.**
- **Deel 1 (melder):** laagdrempelig, GEEN login, via een vaste bedrijfseigen
  meldlink/QR. Minimale velden zodat de drempel op de werkvloer echt laag is.
- **Deel 2 (VGM-coördinator/KAM):** ingelogd in het portaal — oorzaakclassificatie,
  maatregelen, koppelingen, en de gevoelige slachtoffer-/letselvelden. De melder
  hoeft hier niets van te weten.

Beide delen staan op **één `incident`-rij**. De SELECT-policy is `mag_bedrijf_beheren`:
alleen de KAM/admin van het eigen bedrijf leest de rij (inclusief de gevoelige velden).
De melder INSERT via een SECURITY DEFINER token-RPC (fase 2) en leest de rij nooit
terug. Muteren uitsluitend via RPC's — géén insert/update-policy (patroon van
`toolbox_deelname`, Beslissing rond migratie 0015).

**Besluiten in het datamodel (migratie `0025_incident_datamodel.sql`, additief/idempotent).**
1. **`incident`** draagt Deel 1 (datum, tijd, locatie, project, omschrijving,
   naam_melder optioneel, `gevolgen text[]`) én Deel 2 (status
   open/in_onderzoek/afgehandeld, `directe_oorzaken int[]`, `basis_oorzaken int[]`,
   toelichting, onderzoeksrapportage/telefonische melding/maatregelen/tra-vlaggen,
   andere_maatregelen, besproken_in_toolbox_datum). **Gevoelig (alleen KAM):**
   `functie_slachtoffer`, `medische_dienst_bezocht`. **Gereserveerd** (kolom nu,
   logica later): `actie_ids uuid[]` (haak QHSE-actielijst), `toolbox_push_id`
   (verplichte-toolbox-na-ongeval).
2. **Vaste oorzaaklijsten als geseede referentietabellen** — `incident_directe_oorzaak`
   (01-28), `incident_basis_oorzaak` (01-16) en `incident_gevolg_soort` (6 gevolgen).
   Gekozen boven een code-constante omdat het dashboard ze telbaar én labelbaar moet
   maken (join op de ref-tabel is één bron van waarheid); past bij het
   centrale-bibliotheek-patroon (admin-write, iedereen-ingelogd leest). Selecties
   bewaren we als code-arrays op de incident-rij, telbaar via `unnest`.
3. **Bedrijfseigen meldlink `incident_meldlink`** — een EIGEN, intrekbaar/roteerbaar
   token per bedrijf. Bewust géén hergebruik van het werknemer- (`deellinks`) of
   actiehouder-token, zodat de KAM een gedeelde meldlink kan vervangen zonder andere
   tokens te raken. Anon resolvet het token via een SECURITY DEFINER-RPC (fase 2),
   nooit via directe tabeltoegang.
4. **Foto's `incident_foto`** in de bestaande **privé `bewijs`-bucket**, bedrijf-
   geprefixt pad `<company_id>/incident/<incident_id>/<uuid>.<ext>` zodat de bestaande
   per-bedrijf `storage.objects`-RLS ze ook bij directe Storage-API-toegang afschermt.
   Geen publieke URL; toegang uitsluitend via kortlevende service-role signed URLs ná
   `mag_bedrijf_beheren` (KAM) of ná token-validatie (melder bij uploaden) — het
   bestaande `gast-upload`/`bewijs`-patroon. (Alternatief overwogen: aparte bucket
   `incident-foto`; verworpen wegens extra, buiten-migratie beheerde storage-policies.)

**AVG (zwaarste categorie tot nu toe).** `letsel` + `medische_dienst_bezocht` +
`functie_slachtoffer` zijn gezondheidsgegevens (art. 9 AVG); foto's kunnen een
herkenbaar persoon/letsel tonen. Vastgelegd: die velden alleen op de KAM-only-rij
(nooit cross-company, nooit in de open flow), foto's in privé-bucket zonder publieke
URL, bewaartermijn/verwijderroutine te bepalen. Uitgeschreven in Projectstand bij de
module-AVG-punten voor het register/de verwerkingsverklaring.

**Bewijs.** Migratie 0025 toegepast tegen de live DB (6 gevolg-soorten, 28 directe,
16 basis-oorzaken geseed); RLS geverifieerd (alle 6 tabellen RLS aan; `incident`/
`incident_foto`/`incident_meldlink` elk 1 SELECT-policy = `mag_bedrijf_beheren`,
ref-tabellen read + admin-write); schema gedumpt (`db/schema.sql`, 38 tabellen);
`tsc --noEmit` en `next build` groen. Flows + gerichte isolatietest volgen in fase 2/3.

### Fase 2 — open meldflow (Deel 1), migratie 0026

**Route + token.** Een publieke, login-loze meldpagina `/melden/[token]` landt via het
bedrijfstoken (`incident_meldlink`) in de juiste tenant. Mobiel-vriendelijk formulier:
datum/tijd (vooringevuld op nu), locatie, project (optioneel), omschrijving, gevolg
aanvinken, naam melder (optioneel), foto's. Na versturen een nette bevestiging. De open
flow legt bewust GEEN slachtoffer-/letseldetails vast.

**Vier SECURITY DEFINER token-RPC's, bewust anon-toegankelijk** (token-flow, conform
Beslissing 62 — net als de deellink-/toolbox-token-RPC's): `incident_meldcontext_token`
(bedrijf + huisstijl + gevolg-labels, géén incident-data), `incident_melden_token`
(maakt de incident-rij; bedrijf uit het token; onbekende gevolg-codes worden
server-side weggefilterd; Deel 2 blijft leeg), `incident_foto_pad_token` +
`incident_foto_registreren_token` (reserveren/registreren, valideren dat de incident bij
het bedrijf van het token hoort). Toegevoegd aan de bewust-anon-roster van
`security_hardening_test.mjs` (nu 13 token-RPC's).

**Foto-afscherming — belangrijke correctie op het Fase 1-advies.** In Fase 1 stelde ik
voor foto's in de bestaande `bewijs`-bucket te zetten met een bedrijf-geprefixt pad,
aannemend dat de storage-RLS daar per bedrijf op het eerste padsegment afschermt.
**Die aanname bleek onjuist:** de `bewijs`-bucket-policy dwingt storage-zijdig alleen
`auth.uid() IS NOT NULL` af (elke ingelogde gebruiker van elk bedrijf kan elk
bewijs-object lezen als hij het pad kent; isolatie leunt daar op onraadbare paden + de
app-laag). Voor de AVG-zwaarste incident-foto's te zwak. **Besluit: een eigen PRIVÉ
bucket `incident-foto`** met échte per-bedrijf padscheiding in de storage-RLS
(`(storage.foldername(name))[1] = my_company_id()::text or is_admin()`), pad
`<company_id>/<incident_id>/<uuid>.<ext>`. Geen anon/authenticated insert-policy:
schrijven kan uitsluitend via een service-role signed upload-URL (bypasst RLS voor
exact één pad, ná token-validatie). De melder uploadt via `/api/incident/foto-upload`
(mint de signed URL) → `uploadToSignedUrl` → registratie-RPC — hetzelfde patroon als
`gast-upload`. *(Losstaande observatie voor later, buiten scope: de `bewijs`-bucket
zelf zou baat hebben bij dezelfde per-bedrijf storage-RLS; nu alleen onraadbaar pad.)*

**Bewijs.** Migratie 0026 toegepast; `scripts/incident_isolatie_test.mjs` **12/12**
(open melden landt in juiste tenant; onbekende gevolg-code gefilterd; anon zonder token
kan niet melden; ingetrokken token weigert; B ziet A's melding niet, KAM van A wél incl.
gevoelig veld; A-token kan geen foto aan B's incident hangen; foto van A niet leesbaar
door B of anon, KAM van A wél); `security_hardening_test.mjs` **25/25** (13 token-RPC's);
`tsc` + `next build` groen; schema gedumpt (86 functies). Browsertest van het formulier
(mobiel, foto-upload, bevestiging) is een aanbevolen handmatige stap.

### Fase 3 — KAM-afhandeling (Deel 2, ingelogd), migratie 0027

**Module + route.** 'incidenten' toegevoegd aan `MODULE_CATALOGUS` (pad `incidenten`);
de KAM-pagina `/[company_id]/incidenten` is geguard zoals de andere modules (ingelogd
+ `mag_bedrijf_beheren` + `bedrijf_modules` actief). Lijst van binnengekomen meldingen
(datum, korte omschrijving, locatie, statusbadge) → detailscherm met Deel 1 (lezen) +
foto's + Deel 2-formulier (status, directe/basis oorzaken aanvinken uit de vaste
lijsten + toelichting, maatregel-vlaggen, telefonische melding, besproken-in-toolbox-
datum, en de gevoelige slachtoffer-/letselvelden in een apart gemarkeerd blok).

**Mutatie-RPC's (SECURITY DEFINER, null-veilige guard, anon dicht — Beslissing 62):**
`incident_deel2_opslaan` (guard op `p_company_id`, incident moet bij het bedrijf horen,
status/medische-waarde gevalideerd, onbekende oorzaakcodes weggefilterd, `afgehandeld_op`
gestempeld bij status 'afgehandeld' en gewist bij terugzetten), en meldlink-beheer
`incident_meldlink_zorg` / `_roteren` / `_intrekken`. anon-EXECUTE ingetrokken; toegevoegd
aan de `HARDENED`-lijst van `security_hardening_test.mjs` (nu 61 gehardende RPC's). Lezen
(lijst/detail/foto's) gaat via de RLS-select-policy + de ingelogde sessie; foto's worden
in een KAM-route (`/api/incident/foto-download`) met service-role signed URL's geleverd
ná de RLS-scoped select — cross-company komt er niet doorheen.

**Meldlink + QR.** De meldlink-kaart toont de deelbare URL (`/melden/<token>`) met kopieer-
knop, roteren (met inline bevestiging — géén native `confirm()`) en in-/uitschakelen. De
**QR-code** is een zelfstandige, dependency-vrije encoder (`lib/qr.ts`, EC-niveau L,
versies 1-10, byte-modus) → inline-SVG. Bewust géén npm-dependency en géén externe QR-
service (dat zou het bedrijfstoken naar een derde lekken). Geverifieerd met
`scripts/qr_selftest.ts` (Node 24 strip-types): codeword-totalen per versie == spec,
format-info round-trip, en volledige encode→decode round-trip over kort/lang + byte/
numeriek (0 fouten). Aanbevolen: één keer met een echte scanner bevestigen.

**Bewijs.** Migratie 0027 toegepast; `incident_isolatie_test.mjs` **20/20** (Fase 2 +
Deel-2-guards: B kan A niet muteren via A's of eigen company_id, anon dicht, onbekende
oorzaakcode gefilterd, gevoelig veld opgeslagen, `afgehandeld_op` gestempeld, meldlink-
beheer alleen eigen bedrijf); `security_hardening_test.mjs` **25/25** (61 gehardende, 13
token-RPC's); QR-zelftest groen; `tsc` + `next build` groen. Browsertest van het KAM-
scherm (lijst → detail → Deel 2 opslaan, QR scannen) is een aanbevolen handmatige stap;
de module moet per bedrijf geactiveerd zijn (Modulebeheer).

### Fase 4 — dashboard (doorklikbaar, drie niveaus)

**Opzet.** Bovenaan de KAM-pagina een dashboard met kiesbare periode (Dit jaar /
Laatste 12 maanden / Alles). **Niveau 1 — aantallen:** totaal, uitsplitsing naar status
(open/in onderzoek/afgehandeld) en naar gevolg (letsel/schade/milieu/brand/bijna-
incident/…), plus de vijf meest voorkomende directe- en basisoorzaken (met balkjes).
**Niveau 2:** klikken op een status- of gevolg-tegel filtert de meldingenlijst eronder
(met "toon alle"). **Niveau 3:** klikken op een lijstregel opent het volledige incident
(Deel 1 + Deel 2 + foto's) — het bestaande detailscherm.

**Bewuste keuze — client-side aggregatie.** De KAM-pagina laadt de incidenten al
RLS-gescoped op het eigen bedrijf; het dashboard rekent daarover in de client (tellingen
per status/gevolg/oorzaak, periodefilter). Geen extra RPC/migratie en geen nieuw
serveroppervlak, dus de beveiliging blijft ongewijzigd (de bestaande isolatietest dekt
het). Als het volume per bedrijf groot wordt, kan dit later door een lees-only
aggregatie-RPC vervangen worden (zoals `dashboard_overzicht` bij het managementdashboard)
zonder de UI te wijzigen.

**Bewijs.** `tsc` + `next build` groen (dashboard compileert in de bestaande route). Geen
nieuwe DB-migratie. Browsertest (periodewissel, tegel → gefilterde lijst → detail) is een
aanbevolen handmatige stap.

**Samengevat is de incidenten-module compleet (fasen 1-4):** open melden (Deel 1) →
KAM-afhandeling (Deel 2) → doorklikbaar dashboard, met AVG-borging (gezondheidsgegevens
alleen KAM-only, foto's privé), per-bedrijf-isolatie op elke laag (RLS + guards + storage),
en de gereserveerde haken (`actie_ids`, `toolbox_push_id`) klaar voor de latere koppeling
aan de QHSE-actielijst en de verplichte-toolbox-na-ongeval.
