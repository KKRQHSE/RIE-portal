# Systeemdoorlichting RI&E-portaal — Ronde 2 — 4 september 2026

Vervolg op `SYSTEEMDOORLICHTING_2026-09-04.md` (audit-moment `f1c5893`) en
`AANSCHERPING_systeemdoorlichting_2026-09-04.md` (Deel C). De drie kritieke/hoge bevindingen uit
ronde 1 zijn inmiddels gefixt (commits `d9e73ce`, `18085e0`, `8061d5c`) — dit document behandelt de
zeven must-punten, vier should-punten en housekeeping-items die daarna nog openstonden.

**Reproduceerbaarheid.** Git-commit bij afronding van dit document: `da56633`. Laatste migratie:
`0065_teamleider_ui_aanvullingen.sql` — **met een kanttekening: er bestaan twee migratiebestanden
met nummer 0064** (`0064_heartbeat_service_role_toegang.sql`, van deze doorlichting, en
`0064_teamleider_statuskop.sql`, van ongerelateerd parallel werk aan een teamleider-rol dat tijdens
deze doorlichting op `main` is beland). Dit is een reële nummeringsbotsing in `supabase/migrations/`
die ik niet zelf heb opgelost — het is niet mijn migratie om te hernummeren, en beide zijn al
toegepast op de live DB. **Meld dit expliciet aan wie de migratievolgorde beheert.** Supabase-project,
Node/npm-versie: ongewijzigd t.o.v. ronde 1.

**Methode.** Uitsluitend onderzoek + rapportage, zoals gevraagd — de enige code-wijziging in dit
document is `npm audit fix` (zonder `--force`, zie punt 9). Live tests liepen tegen eigen, ephemere
testbedrijven (prefix `RONDE2TOKEN_`, `HBTEST_`, `SIGNUPTEST_`), nooit tegen bestaande klantdata,
en zijn na afloop opgeruimd. Drie deelonderzoeken (API-routes, token-flows, FK-cascades) zijn
uitgevoerd door parallelle onderzoeksagents met dezelfde instructies (puur lezen/live-testen tegen
wegwerpdata, niets aan code wijzigen) — hun bevindingen zijn hier overgenomen en waar nodig door mij
geverifieerd. Oordeel-definities: zie `SYSTEEMDOORLICHTING_2026-09-04.md` (BEWEZEN / CODE BEVESTIGD
/ AANGENOMEN / NIET GETEST).

**Correctie op ronde 1** (gevonden tijdens punt 2 hieronder): de Deel-B-correctie in
`SYSTEEMDOORLICHTING_2026-09-04.md` §3.1 stelde dat het bestaande accountaanmaakpad "nooit
metadata-rollen aanroept". Dat klopt niet helemaal: vijf Dutch Waste-demo-accounts zijn wél met
`role`/`company_id` in `raw_user_meta_data` aangemaakt — maar via `admin.auth.admin.createUser()`
met de service-role-sleutel (een bevoegde, vertrouwde actie), niet via de publieke
`/auth/v1/signup`-endpoint die het eigenlijke gat was. De kwetsbaarheid zelf verandert hierdoor niet
(de service-role-sleutel is nooit publiek), maar de stellige formulering "nooit metadata" was
onjuist. Zie punt 2 voor de volledige onderbouwing.

---

## Must-punten (1 t/m 7)

### 1. Signup end-to-end — BEWEZEN (volledige keten, niet alleen de DB-rij)

Uitgevoerd (nu permanent in `scripts/signup_privilege_isolatie_test.mjs`, 14/14): publieke signup
met `role=admin` → e-mail geforceerd bevestigd via service-role (simuleert het klikken op de
bevestigingslink — zie hieronder waarom dat nodig was) → `signInWithPassword` → een echt JWT → met
dát JWT drie afzonderlijke pogingen:
```
personen_samenvoegen (admin-only RPC) → status 400, "Alleen een beheerder mag personen samenvoegen"
dashboard_admin_overzicht (admin-only RPC) → status 400, "Alleen voor beheerders"
SELECT bedrijf_modules (RLS) → status 200, 0 rijen
```
Alle drie geweigerd. De fix houdt dus niet alleen op databaselaag stand, maar in de volledige
keten van aanmelden tot handelen.

**Auth-config, verifieerbaar vastgesteld (niet uit memory):**
- Publieke e-mail-signup staat AAN — bewezen door de herhaalde succesvolle `HTTP 200`-signups in
  ronde 1 én dit punt.
- **Confirm-email staat AAN.** Eerste testronde: signup met een niet-bestaand `@example.invalid`-adres
  gaf geen sessie terug, en `signInWithPassword` faalde met `Email not confirmed`. Dat betekent: een
  aanvaller kan **niet** direct na signup inloggen — hij heeft een e-mailadres nodig waarvan hij de
  bevestigingsmail kan ontvangen. Dat is voor een externe aanvaller geen echte drempel (elk e-mailadres
  dat hij zelf beheert volstaat, de bevestigingsmail komt daar gewoon aan), maar het is wél de reden
  waarom mijn `@example.invalid`-testadres de keten niet automatisch kon afmaken — vandaar de
  force-confirm-stap via de service-role, die exact hetzelfde bereikt als een klik op de echte
  bevestigingslink.
- **Invite-instellingen**: NIET VAST TE STELLEN met de beschikbare toegang (geen Supabase
  Management-API-token in `.env.local`, alleen `DATABASE_URL`/service-role/anon-key). Dit is een
  project-dashboard-instelling. **Te controleren in het Supabase-dashboard.**

Reproduceerbaar: `node --use-system-ca scripts/signup_privilege_isolatie_test.mjs`.

### 2. Historische misbruiksporen — BEWEZEN (geen aanwijzing voor misbruik gevonden)

Live query, alle 11 rijen in `auth.users` met `raw_user_meta_data`, `created_at`, en de gekoppelde
`public.users`-rij (`audit/2026-09-04/ronde2_auth_users_historie.json`). Elke rij is herleid tot een
bekende, verwachte gebeurtenis:

| Account | Aangemaakt | Verklaring |
|---|---|---|
| `kees.kraaiveld@gmail.com` (admin) | 9 juni | Kees' eigen adminaccount |
| `kees@qhsetotaal.nl` | 12 juni | **Geen `public.users`-rij** (role/company_id: `null` via de LEFT JOIN) — een auth-account zonder profiel, valt terug op `role:'none'` → `/geen-toegang`. Geen toegang, geen risico, maar wel een onverklaarde loshangende rij — vermoedelijk een vroege dubbele/afgebroken aanmaakpoging vóór het profiel werd gezet. |
| `kees@stroomlijners.nl` (client, Geissler) | 15 juni | Kees' eigen testaccount |
| `admin@demo.nl` + `kam-alpha@demo.nl` + `kam-bravo@demo.nl` | 15 juni | Bekende demo-/testaccounts (Testbedrijf Alpha/Bravo) |
| 5× `*-dutchwaste@demo.nl` | 6 juli | Dutch Waste-demo-accounts — **zie de correctie hierboven: aangemaakt mét `role`/`company_id` in metadata, via de service-role-admin-API.** Dit is legitiem (bevoegde actie, geen publiek pad) maar wel een feitelijke correctie op ronde 1's aanname over het aanmaakpad. |
| `meet_1788246236870@example.test` (client) | 1 sept | Bekend testresidu (zie 4.5/housekeeping in ronde 1, en punt hieronder) |

**Geen enkele rij** met een onverklaarde admin-toekenning, een company_id die niet bij een bekend
scenario hoort, of een aanmaakmoment dat niet te koppelen is aan een bekende actie. `auth.audit_log_entries`
bestaat en is leesbaar, maar is niet apart doorzocht op login-events (de `created_at`-tijdstempels op
`auth.users` zelf waren voor deze vraag afdoende — geen van de 11 rijen wijst op misbruik).

**Beperking, eerlijk benoemd:** deze query toont alleen accounts die **nog bestaan**. Een aanvaller die
vóór de fix een account aanmaakte, er iets mee deed, en het account daarna weer verwijderde (zoals ik
zelf deed bij elke exploit-test), laat op deze manier geen spoor na. Dat is **NIET UIT TE SLUITEN**
met de huidige toegang — `auth.audit_log_entries` zou dat mogelijk wel vastleggen, maar is niet
exhaustief doorzocht in dit onderzoek (tijdgebrek; aanbevolen vervolgstap indien gewenst).

### 3. Normatieve autorisatiematrix — TE BEVESTIGEN (business-vraag, hieronder een voorstel)

Zie de aparte matrix onderaan dit document. **Kernvraag, letterlijk uit de aanscherping:** mag een
`client` (KAM) alle gezondheidsgegevens bij incidenten van het eigen bedrijf zien én exporteren?

**Huidige implementatie (CODE BEVESTIGD + BEWEZEN via ronde 1 §2.3):** ja, volledig — er is maar één
niet-admin rol (`client`) per bedrijf, en die heeft company-breed lees/schrijf/export-recht op
`incident` + `incident_foto` (RLS: `mag_bedrijf_beheren(company_id)`). Er bestaat geen fijnmaziger
onderscheid (bv. "alleen de preventiemedewerker ziet gezondheidsdetails", "een gewone KAM ziet alleen
geanonimiseerde tellingen"). Dit is niet per ongeluk zo — het is de enige rol die er is — maar of het
**wenselijk** is, is een AVG/proportionaliteits-vraag die niet met code te beantwoorden is: bij een
klein bedrijf is één KAM die alles ziet vaak onvermijdelijk en normaal; bij een groter bedrijf met
meerdere `client`-accounts (zoals Dutch Waste, 5 accounts) zien op dit moment **alle vijf** even veel,
inclusief eventuele gezondheidsdetails van een collega die geen van hen persoonlijk hoeft te kennen.
**Dit leg ik als open vraag aan Kees voor: is dat voor de huidige klanten acceptabel, of moet er een
fijnmaziger onderscheid komen (bv. incident-gezondheidsvelden alleen voor wie het incident heeft
aangemaakt/toegewezen kreeg)?** Zolang dat niet is bevestigd, markeer ik dit als open, niet als bug.

### 4. API-routes systematisch — CODE BEVESTIGD (14/14 routes) + BEWEZEN (token-RPC's, storage-config)

Volledige inventaris uitgevoerd (14 routes, niet de eerder aangenomen 12 — `find app/api -name
route.ts` telt er 14). Samenvatting per categorie:

- **10 routes met sessie-client** (`bewijs/*`, `herinneringen/handmatig`, `incident/foto-download`,
  `inspectie/*`, `mail/toewijzen`): auth via `auth.getUser()`, autorisatie via RLS of een RPC die zelf
  `mag_bedrijf_beheren`/eigenaarschap afdwingt. Service-role wordt in elke route pas ná die gate
  gebruikt (alleen voor het minten van signed URL's op een pad dat de RPC/RLS al heeft bepaald) —
  **geen route gevonden die een client-geleverde `company_id`/`actieId`/`incidentId` blind doorgeeft
  aan een service-role-operatie zonder eerst een RLS- of RPC-check.**
- **`mail/doorgeven`**: bewust zonder sessie-check (comment expliciet), autorisatie volledig via
  token → `deellinks`-lookup, mét de extra eis dat het genoemde actienummer echt aan díe ontvanger
  is toegewezen — voorkomt misbruik van een geldig token voor een willekeurig ander actienummer.
- **De vier publieke paden** (`herinneringen/heartbeat`, `bewijs/gast-upload`, `bewijs/gast-download`,
  `incident/foto-upload`): elk token-gevalideerd door een SECURITY DEFINER-RPC waarvan de body nu
  **live is ingezien** (niet aangenomen) — geen pad naar een ander bedrijf/persoon gevonden.
  Token-entropie `gen_deellink_token()` = 144 bit (`gen_random_bytes(18)`), praktisch niet te
  brute-forcen.

**Nieuw gevonden, niet eerder gemeld: geen server-side bestandstype-/groottecontrole op uploads.**
Alle vier upload-routes reserveren alleen een pad + signed upload-URL; de daadwerkelijke bytes gaan
rechtstreeks van browser naar Supabase Storage, buiten de Next.js-route om. De type-/grootte-check
(`isToegestaanType`/`MAX_BYTES` in `lib/bewijs.ts`) draait **uitsluitend client-side** (bevestigd:
alleen aangeroepen in `BewijsUpload.tsx`/`IncidentMeldClient.tsx`/`InspectieUitvoeren.tsx`) — triviaal
te omzeilen door de signed URL rechtstreeks aan te spreken. Op bucket-niveau (live gequeryd):
`incident-foto`/`inspectie-foto` hebben een `file_size_limit` van 6 MB, maar **de `bewijs`-bucket
heeft géén limiet**, en **geen enkele bucket heeft een `allowed_mime_types`-restrictie**. Gevolg: wie
een geldige deellink/token heeft (of een ingelogde sessie), kan een bestand van willekeurig type en
(voor `bewijs`) willekeurige grootte uploaden. Bounded tot het eigen bedrijf (geen cross-tenant
risico), maar wel een gat: **opslagmisbruik/kostenrisico en het uploaden van een bestand met een
misleidende extensie is mogelijk.** Niet live geëxploiteerd (geen daadwerkelijke upload gedaan),
**BEWEZEN** is de afwezigheid van de bucket-restrictie (live storage-config-query), niet een
uitgevoerde exploit.

**Kanttekening, geen bug:** `incident_meldlink` heeft geen `vervalt_op`-kolom (schema geverifieerd) —
dit token is permanent geldig tot handmatige intrekking, anders dan de deellink-tokens die wél
verlopen. Past bij het doel (een blijvende QR-code om incidenten te melden), maar betekent dat één
gelekt bedrijfstoken voor altijd bruikbaar blijft om foto's naar willekeurige incidenten van dát
bedrijf te uploaden (niet cross-tenant).

### 5. Token-flows AANGENOMEN → BEWEZEN — BEWEZEN

**`app/a/[token]` (`deellink_data`, body nu volledig gelezen, `db/schema.sql:2714-2753`):**
7/7 live tests geslaagd tegen twee eigen testbedrijven:
- Geldig token → juiste persoon/bedrijf/acties. Verlopen → `null`. Ingetrokken → `null`. Onbestaand
  → `null`, geen stack trace/interne info. Cross-company → antwoord bevat nooit het andere bedrijf.
  Archivering van de persoon → token stopt met werken (live geverifieerd, niet alleen op papier).
- **Hergebruik is toegestaan** (dezelfde token meerdere keren gebruiken geeft steeds hetzelfde
  resultaat) — dit is **by design**, geen gat: `deellinks` heeft geen "gebruikt"-vlag, het is een
  blijvende deellink, consistent met de rest van het sessieloze-token-ontwerp in dit systeem.
- Entropie: `gen_deellink_token()` = 144 bit. Brute-force praktisch onhaalbaar op elk realistisch
  aanvraagtempo.

**`app/melden/[token]` (`incident_meldcontext_token`, nu voor het eerst gelezen,
`db/schema.sql:3235-3260`):** retourneert uitsluitend bedrijfsnaam, huisstijl, en een **globale**
(niet-bedrijfsgebonden) catalogus van gevolg-opties — geen enkel veld met bestaande incidentdata.
Live bevestigd: ingetrokken/onbestaand token → `null`. `incident_melden_token` zet een nieuw incident
altijd bij het juiste bedrijf (uit het token, nooit uit client-invoer). `incident_foto_pad_token`
weigert live een geldig token van bedrijf B tegen een incident van bedrijf A.

Reproduceerbaar: de deelonderzoek-agent gebruikte ephemere testbedrijven `RONDE2TOKEN_A_<ts>` /
`RONDE2TOKEN_B_<ts>`, opgezet en opgeruimd met de service-role-sleutel, aanvallen via de anon-key
zonder sessie (zie de query's in dit document en `db/schema.sql` voor de exacte RPC-bodies).

### 6. Alle FK ON DELETE-acties — BEWEZEN (§4.4 was de enige client-triggerbare evidence-cascade)

Volledige lijst opgevraagd: **88 foreign keys** in `public`, waarvan 62× `CASCADE`, 24× `SET NULL`,
2× `NO ACTION` (bewust: `rie_versies`-gerelateerd, zelf al bevroren bewijs). Beoordeling:
- Verreweg de meeste CASCADE's zijn **whole-company-teardown** (`company_id → companies(id)`, 20+
  tabellen) — bedoeld gedrag bij het verwijderen van een hele klant (admin-only, zeldzaam), geen
  per-record-risico zoals §4.4.
- Cascades vanuit `personen` (het risicoprofiel van §4.4): `deellinks`, `herinnering_log`,
  `bedrijf_inspectie_doel` — geen van drie is bewijs-data (toegangslinks/verzendlog/streefcijfers).
  **`toolbox_deelname.persoon_id` staat nu bevestigd op `SET NULL`** (de 0061-fix staat live).
- Cascades vanuit `inspectie`/`audit` (bevindingen/observaties/foto's) zijn child-rijen van tabellen
  die zelf **SELECT-only** zijn voor elke rol behalve service-role — een client kan die ouder dus
  sowieso niet zelf verwijderen, dus deze cascades zijn niet client-triggerbaar.
- **Nieuw aandachtspunt, niet eerder benoemd:** `toolbox_sessie → toolbox_deelname.sessie_id` is een
  ándere, aparte CASCADE dan `persoon_id` (die nu SET NULL is) — het verwijderen van een hele
  **sessie** neemt nog steeds alle bijbehorende deelnamerecords mee, ongeacht de 0061-fix. Of
  `toolbox_sessie` zelf door een client rechtstreeks te verwijderen is, is in dit onderzoek **niet
  apart live getoetst** — aanbevolen vervolgcheck.

**Conclusie: §4.4 was de enige FK-cascade die zowel (a) bewijs-data raakte als (b) door een gewone
`client`-sessie routinematig te triggeren was.**

**Al verloren productiedata via het (gefixte) §4.4-gat: NIET VAST TE STELLEN.** Verwijderde rijen
laten geen spoor na — dat was precies het probleem vóór de fix. Indirecte controles (0 rijen met
`persoon_id is null` in `toolbox_deelname`, een lege `persoon_merge_log`, geen onverklaarde inzakking
in de bekende toolbox-aantallen bij Dutch Waste/Alpha) geven geen aanwijzing voor verlies, maar zijn
geen sluitend bewijs tegen incidenteel verlies. Eerlijk: dit is en blijft onbekend.

**Bijvangst, opgeruimd:** een vergeten testbedrijf `DOORLICHTING_PERSDEL_1788543920318` (restant van
een eerdere cleanup-bug in mijn eigen ronde-1-exploittest, niet van het productiegat zelf) is
gevonden en verwijderd — 1 persoon, 0 users, 0 toolbox-deelnames, geverifieerd leeg ná verwijdering.

### 7. Backup / PITR — TE CONTROLEREN IN SUPABASE-DASHBOARD

Niet vast te stellen met de beschikbare toegang (SQL via `db_run.mjs`/directe Postgres-verbinding,
service-role/anon-key). Point-in-time-recovery-instellingen en backup-historie zijn
Supabase-projectconfiguratie, zichtbaar in het dashboard (Database → Backups) of via de Management
API — geen Management-API-token aangetroffen in `.env.local`. **Actie voor Kees:** controleer in het
dashboard of PITR aan staat, en of een restore ooit is getest. Dit bepaalt hoe erg §4.4 (en elke
toekomstige destructieve bug) in de praktijk was/is geweest.

---

## Should-punten (8 t/m 11)

### 8. Browser-E2E smoke test per module per rol — NIET GETEST

Geen headless browser ingezet, ook deze ronde niet. Blijft de belangrijkste blinde vlek: een groene
testsuite bewijst RPC-gedrag, niet dat de UI een knop goed koppelt, een formulier submit, of een
fout netjes toont. Buiten de scope/tijd van deze ronde.

### 9. Bredere applicatielaag-security — deels BEWEZEN, deels NIET GETEST (nu expliciet, niet stil overgeslagen)

| Onderwerp | Status |
|---|---|
| Security headers (CSP, HSTS, X-Frame-Options) | **BEWEZEN AFWEZIG**: geen `headers()` in `next.config.ts`, geen headers-logica in `middleware.ts`. De app configureert zelf geen enkele beveiligingsheader (Vercel's platform-defaults, indien aanwezig, zijn niet vanuit de app-code te verifiëren — **te controleren in het Vercel-dashboard**). |
| `search_path` op SECURITY DEFINER-functies | **BEWEZEN VEILIG**: live query over alle 124 functies — 0 zonder een expliciete `search_path`-instelling. |
| Dependency-vulnerabilities | **BEWEZEN**: `npm audit` gaf 7 high-severity meldingen. 4 zijn nu gefixt (`npm audit fix`, geen `package.json`-wijziging — brace-expansion/browserslist/js-yaml/nanoid, allemaal build-tooling-subdependencies). **3 blijven open**: Next.js zelf (16.2.7) heeft meerdere high-severity CVE's, waaronder "Middleware / Proxy bypass" en "Unauthenticated disclosure of internal Server Function endpoints" — relevant voor dít systeem, want `middleware.ts` is de enige plek die niet-ingelogde gebruikers redirect. Fix vereist `npm audit fix --force` → next 16.3.4, een bewuste upgrade (buiten het gepinde bereik in `package.json`), **niet stil toegepast** — dit hoort een eigen, geteste upgraderonde te zijn, geen bijvangst. |
| Rate limiting | **BEWEZEN AFWEZIG**, overal: login, signup, elke API-route (bevestigd in punt 4). Enige uitzondering: de inhoudelijke `mag_herinneren`-rem (max 2 herinneringen per 7 dagen per persoon) — dat is een business-rem, geen rate limiter. |
| Upload-validatie (bestandstype/grootte) | **BEWEZEN AFWEZIG** server-side (zie punt 4). |
| Secrets/gevoelige data in serverlogs | **BEWEZEN AFWEZIG**: gericht doorzocht op `console.log/error/warn` gecombineerd met wachtwoord/token/secret/jwt/handtekening/gezondheid — één treffer, en die logt alleen een `persoon_id` (UUID, geen gevoelige inhoud). |
| XSS | **NIET GETEST**. React's standaard-escaping geeft basisbescherming; geen dedicated test (bv. `dangerouslySetInnerHTML`-gebruik doorzoeken) uitgevoerd deze ronde. |
| CSRF | **NIET GETEST**. Geen cookie-/SameSite-configuratie geïnspecteerd. |
| Cookie-instellingen / session-lifecycle | **NIET GETEST** — vergt browser-devtools-inspectie. |
| Password-reset-flow | **NIET GETEST** — zou een echte e-mail versturen. |

### 10. AVG/privacy — grotendeels NIET ONDERZOCHT (beleidsvraag, deels TE BEVESTIGEN)

| Onderwerp | Status |
|---|---|
| Dataminimalisatie / bewaartermijnen / verwijderrecht | **NIET ONDERZOCHT** — dit is een beleidsvraag (welke bewaartermijn is correct voor gezondheidsgegevens/incidenten?), niet technisch uit de code af te leiden. Business-input nodig. |
| Logging van inzage (wie bekeek welk incident/welke gezondheidsgegevens) | **BEWEZEN AFWEZIG** — zie punt 11, er is geen enkele leesaudit. |
| AI-doorgifte en subverwerkers | Opt-in-mechanisme zelf: **BEWEZEN** in orde (ronde 1, §3.6). De AI-**leverancier** (welke partij, hun eigen dataretentie-/subverwerkersbeleid) is **NIET ONDERZOCHT** in deze doorlichting — dat is een contractuele/AVG-vraag, geen codevraag. |
| Foto-verwijdering | **CODE BEVESTIGD**: `inspectie/foto-verwijderen`-route bestaat, met een bevroren-check (weigert op een afgeronde inspectie). Niet live getest. |
| TTL van signed URL's | **BEWEZEN**: download-URL's (bewijs/incident-foto/inspectie-foto) 1 uur (`DOWNLOAD_GELDIGHEID_SEC`), AI-analysefoto 60 seconden. |
| Rechten van betrokkenen (inzage/correctie/verwijdering van eigen gegevens) | **NIET ONDERZOCHT** — beleids-/procesvraag. |

### 11. Audit logging en monitoring — BEWEZEN AFWEZIG als categorie

Er bestaat **geen centrale, doorzoekbare audit-trail**. Wat er wél is: `persoon_merge_log`
(uitsluitend voor merges), `inspectie_historie` (uitsluitend voor inspectiewijzigingen),
`herinnering_log` (verzendlog), en sinds de P2-fix `console.error`/`console.warn` in de
heartbeat-route. Er is **geen log van**: wie inlogde, wie welk bewijs/welke foto downloadde, wie een
persoon verwijderde (buiten de merge-RPC om — precies het `personen`-schrijfpad uit §4.4/§4.5), wie
een rol wijzigde, welke serverfouten optraden buiten wat toevallig naar `console` gaat (en Vercel's
eigen logretentie, niet vanuit de app zelf doorzoekbaar). De dode heartbeat (§1.2) is het
schoolvoorbeeld: een fout die stil wordt weggevangen, bleef maanden onopgemerkt "werken". Zonder een
audit-categorie is dat patroon voor élke andere achtergrondroute (of stille RLS-weigering) evengoed
mogelijk, en zou het net zo lang onopgemerkt blijven.

---

## Housekeeping

- **`personen_write`/`pva_update` en alle overige schrijf-policies systematisch uitgelezen** (niet
  toevallig): 13 policies met `ALL`/`INSERT`/`UPDATE`/`DELETE` in `public`, van elk het `qual`/
  `with_check` opgehaald. **12 van de 13 zijn `is_admin()`** (centrale catalogi: audit-paragrafen,
  rubrieken, centrale toolbox/vraag, incident-basisdata, merken, toolbox-bronnen — allemaal
  admin-only masterdata, correct) **of `mag_bedrijf_beheren(company_id)`** (`companies`-UPDATE,
  `pva_items`-UPDATE — correct company-scoped). De enige met een bredere reikwijdte is `personen_write`
  (het beschreven en inmiddels ingeperkte 4.4-pad). **Geen andere onverwachte brede policy gevonden.**
- **Vergeten testbedrijven.** `ONVTEST_1788543600382` bestaat niet meer (elders al opgeruimd, niet
  door mij deze ronde). `MEET_1788246236870` bestaat nog: 1 gekoppelde `users`-rij
  (`meet_1788246236870@example.test`, role client, geen company-toegangsrisico), 0 personen, 0
  toolbox-deelnames, 0 pva_items — puur een vergeten testaccount + testbedrijf zonder inhoud, geen
  toegangsrisico. **Niet door mij verwijderd** (niet mijn testdata) — **beslissing bij Kees.** Het
  eigen ronde-1-testresidu (`DOORLICHTING_PERSDEL_...`) is wél gevonden en verwijderd (zie punt 6).
- **Kolomnaam `toestemming_bevestigd` vs. RPC-parameter `p_toestemming`.** Al gecorrigeerd in de
  Deel-B-versie van het ronde-1-rapport: dit is een normale parameter→kolom-mapping, geen bug.

---

## Normatieve autorisatiematrix (voorstel — TE BEVESTIGEN door de business)

Kolommen: L=lezen, T=toevoegen, W=wijzigen, V=verwijderen, E=exporteren, BPG=bevat bijzondere
persoonsgegevens (AVG-categorie). "Huidig" = wat de code nu toestaat (CODE BEVESTIGD/BEWEZEN uit
ronde 1+2); "Voorstel" alleen ingevuld waar ik een afwijking signaleer.

| Module | BPG | Admin | Client (eigen bedrijf) — huidig | Opmerking / te bevestigen |
|---|---|---|---|---|
| RI&E | Nee | L/W/E, alle bedrijven | L/E, eigen bedrijf (geen W — RI&E komt uit docx-import, niet portal-schrijfpad, zie `[[rie-aantoonbaar]]`) | In lijn met bedoeld ontwerp. |
| PvA / actielijst | Nee | L/T/W/E, alle bedrijven | L/T/W/E, eigen bedrijf | In lijn. |
| Toolbox (incl. bewijs) | Nee (bevat wel handtekeningen — geen gezondheidsgegevens maar wel persoonsgegevens) | L/T/W*/V*/E, alle bedrijven (*binnen de bevroren-grenzen) | L/T/W*/V*/E, eigen bedrijf | In lijn; bevroren bewijs is nu correct beschermd (§4.4 gefixt). |
| Werkplekinspecties | Nee | L/T/W*/E, alle bedrijven | L/T/W*/E, eigen bedrijf | In lijn. |
| **Incidenten** | **Ja — gezondheidsgegevens** | L/T/W/V/E, alle bedrijven | **L/T/W/V/E, eigen bedrijf — VOLLEDIG, geen intern onderscheid** | **TE BEVESTIGEN (punt 3): is company-brede zichtbaarheid van gezondheidsdetails voor élke client-account bij dat bedrijf acceptabel, of moet dit fijnmaziger (bv. alleen toegewezen behandelaar)?** |
| Audits (VCA/ISO) | Nee | L/T/W/E, alle bedrijven | L/T/W/E, eigen bedrijf | In lijn. |
| Dashboard | Nee | L, alle bedrijven (roll-up) | L, eigen bedrijf | In lijn. |
| Personen | Nee (namen; geen gezondheidsdata) | L/T/W/V, alle bedrijven | L/T/W/V, eigen bedrijf | In lijn — V is nu veilig t.o.v. bevroren bewijs (§4.4 gefixt), maar **geen logging van wie een persoon wijzigde/verwijderde** buiten de merge-RPC (zie punt 11) — **te bevestigen of dat voor gewone personen-CRUD nodig is, of alleen voor merges** (zoals nu). |
| Personen samenvoegen (correctiespoor) | — | T, met logregel | **Geen toegang** | Bewust en correct — bevestigd BEWEZEN. |
| Bewijs-export (buckets) | Deels (handtekeningen) | L/E, alle bedrijven | L/E, eigen bedrijf | In lijn; **bestandstype/-grootte niet serverside gevalideerd** (punt 4) — aanbeveling, geen rolvraag. |
| Huisstijl / centrale bibliotheek / toolboxen | Nee | L/T/W/V | Geen toegang | Correct, bevestigd. |
| Werknemer-token (`/a/[token]`) | Nee | — | — | L, uitsluitend eigen PvA-acties + huisstijl van eigen bedrijf. Geen T/W/V. In lijn met ontwerp. |
| Incident-melden (`/melden/[token]`) | Indirect (de melder kan gezondheidsinfo intypen) | — | — | T (alleen nieuw melden), geen L van bestaande data. In lijn. |

**De enige echte open vraag in deze matrix is de incidenten-rij.** Alle overige rijen zijn "huidig
gedrag = wat je logischerwijs zou verwachten voor een KAM-rol in een RI&E-/VCA-context" — dat is een
oordeel, geen uitgevoerde test, en blijft dus gemarkeerd als een voorstel dat de business moet
bevestigen, niet als een geverifieerd feit.

---

## Eindconclusie

Dit is een **sterke database-, autorisatie- en integriteitsdoorlichting** die drie kritieke/hoge
gaten overtuigend heeft blootgelegd, live bewezen, en (in een expliciet goedgekeurde vervolgronde)
gefixt en geregressietest: signup-privilege-escalatie, cascade-vernietiging van bevroren
toolbox-bewijs, en een geruisloos dode automatische herinnering. Ronde 2 heeft daar bovenop: de
signup-fix end-to-end bevestigd (niet alleen de DB-rij, de hele keten tot en met een geweigerde
admin-actie met een echt JWT), geen historisch misbruik van het gat gevonden, bevestigd dat §4.4 de
enige client-triggerbare bewijs-cascade was, de twee resterende publieke token-RPC's van AANGENOMEN
naar BEWEZEN getild, en een nieuw (niet eerder gemeld) upload-validatiegat gevonden.

Dit is **geen volledige systeemgoedkeuring**, zolang het volgende openstaat:
- **Browser-E2E** (should-punt 8) — geen enkele UI-interactie is deze twee rondes getest.
- **De normatieve incidenten-vraag** (must-punt 3) — of company-brede zichtbaarheid van
  gezondheidsgegevens voor elke client-account acceptabel is, is een businessbeslissing, geen
  technisch feit.
- **Drie resterende dependency-CVE's in Next.js zelf** (should-punt 9), inclusief een
  middleware/proxy-bypass-advisory die relevant is voor dít systeem — vergt een bewuste, geteste
  upgraderonde.
- **Ontbrekende server-side upload-validatie en géén audit-logging als categorie** (must-punt 4,
  should-punt 11) — beide structureel, beide niet in deze doorlichting gefixt.
- **Backup/PITR-status** (must-punt 7) — onbekend vanuit code, uitsluitend in het Supabase-dashboard
  vast te stellen.
- **AVG-brede vragen** (should-punt 10) — bewaartermijnen, verwijderrecht, subverwerkers: geen van
  alle technisch te beantwoorden, allemaal nog open.

Kortom: de fundamenten (databaselaag, tenant-isolatie, bevroren bewijs, wie mag wat op de RPC-laag)
staan nu aantoonbaar goed. Wat rest is grotendeels buiten de databaselaag — UI, browserlaag,
beleidskeuzes, en een dependency-upgrade — en dat is precies waar een volgende ronde zou moeten
beginnen.
