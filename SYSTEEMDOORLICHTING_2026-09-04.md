# Systeemdoorlichting RI&E-portaal — 4 september 2026

*Gecorrigeerd op 4 september 2026 volgens `AANSCHERPING_systeemdoorlichting_2026-09-04.md`
(Deel B). De oorspronkelijke bevindingen/bewijzen zijn inhoudelijk ongewijzigd; deze versie
corrigeert bewijsstatus-labels, nummering, twee overclaims, en voegt reproduceerbaarheids- en
fix-informatie toe. Zie `SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md` voor het vervolgonderzoek.*

**Hoofdvraag genuanceerd.** "Werkt alles?" is met deze doorlichting **niet volledig vastgesteld**.
Wat wél vaststaat: de database-, autorisatie- en integriteitslaag zijn systematisch getoetst (groene
RPC-happy-paths, cross-tenant-isolatie, RLS/anon-EXECUTE, onveranderlijkheid) en twee kritieke gaten
zijn live bewezen en inmiddels gefixt. Wat niet vaststaat: of de UI daadwerkelijk correct rendert,
formulieren submitten, en fouten netjes worden getoond — dat is deze ronde **niet getest** (§1.4).
"Alles werkt" zou de UI-laag meenemen; dat beweert dit rapport niet.

**Reikwijdte/methode.** Doel was verifieerbaar vaststellen (a) hoe de kernmodules zich gedragen op
databaselaag, (b) of elke rol precies ziet/kan wat mag. Dit was een doorlichting, geen bouwronde:
op het moment van deze audit is niets aan productiecode gewijzigd. Twee kritieke bevindingen zijn
**live geëxploiteerd tegen de productie-Supabase-DB** (met eigen, direct opgeruimde testdata) om ze
van AANGENOMEN naar BEWEZEN/GEBROKEN te tillen — toen gedocumenteerd, niet stil gefixt. De fixes
zelf zijn nadien, in een aparte, expliciet goedgekeurde vervolgronde doorgevoerd (zie de
"Update — inmiddels gefixt"-blokken hieronder en Deel A van de aanscherping).

**Reproduceerbaarheid — omgeving ten tijde van deze audit.**

| Wat | Waarde |
|---|---|
| Git-commit (audit-moment) | `f1c5893` |
| Laatste migratie (audit-moment) | `0060_ai_actie_zet_niet_in_orde.sql` |
| Supabase-project | `hmoihxsxapzvxfokggad.supabase.co` |
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| Datum | 4 september 2026 |
| Testcommando's | `--use-system-ca` op alle REST/HTTPS-testscripts (corporate TLS-proxy, zie `[[db-tooling]]`) |

Wie dit onafhankelijk wil naspelen: `git checkout f1c5893`, `npm test`, en de losse commando's per
bevinding hieronder. Bevindingen die ná dit commit-punt zijn gefixt, staan gemarkeerd met de
fix-commit (ná `f1c5893`, op `main`).

**Methode.** Regressie via `npm test` (21 scripts, `--use-system-ca`) + `tsc` + `next build`,
live SQL-introspectie via `node scripts/db_run.mjs`, code-inspectie van route-gating en RLS/RPC's,
en drie gerichte exploit-/integriteitstests tegen ephemere testbedrijven (nooit tegen Alpha/Bravo
of een echte klant — behalve het uitlezen, nooit schrijven, van het bestaande Dutch Waste-record
om cross-tenant-koppeling te bewijzen). Alle zelf aangemaakte testdata (auth-users, `companies`,
`personen`, `toolbox_deelname`) is in dezelfde run weer verwijderd.

**Oordeel-definities (vier statussen, consistent toegepast).**
- **BEWEZEN** — een testscript, query of API-aanroep is *echt uitgevoerd tijdens deze audit* en de
  ruwe uitkomst staat bij de bevinding.
- **CODE BEVESTIGD** — de bewering is geverifieerd door de daadwerkelijke, primaire broncode zelf te
  lezen (niet een aanroeper ervan, niet documentatie), doorgaans systematisch/voor alle instanties —
  maar er is niets uitgevoerd. Sterker dan AANGENOMEN, zwakker dan BEWEZEN.
- **AANGENOMEN** — afgeleid uit indirect bewijs: het gebruik/de aanroep is gezien, niet de
  onderliggende implementatie zelf, of maar één van meerdere instanties is gecontroleerd.
- **NIET GETEST** — expliciet overgeslagen, met reden.
- **GEBROKEN** — een BEWEZEN bevinding die een defect is.

---

## Update — inmiddels gefixt (ná deze audit, vóór publicatie van deze versie)

Drie van de vier kritieke/hoge bevindingen uit deze audit zijn in een aparte, door de opdrachtgever
expliciet goedgekeurde vervolgronde gefixt en getest. De oorspronkelijke bevindingstekst hieronder
(§1.2, §3.1, §3.2, §4.4) is ongewijzigd gelaten als bewijsstuk van de audit zelf; de actuele status
staat hier en bij elke bevinding apart:

| Bevinding | Status audit-moment | Status nu | Fix-commit | Regressietest |
|---|---|---|---|---|
| §3.1/3.2 — signup-privilege-escalatie | GEBROKEN, kritiek | **GEFIXT** | `d9e73ce` (migratie 0062) | `signup_privilege_isolatie_test.mjs` 9/9 |
| §4.4 — toolbox-bewijs cascade-delete | GEBROKEN, kritiek | **GEFIXT** | `18085e0` (migratie 0061) | `onveranderlijkheid_test.mjs` 41/41 (DEEL 5) |
| §1.2 — heartbeat dood | GEBROKEN | **GEFIXT** | `8061d5c` (migratie 0064) | `heartbeat_rpc_test.mjs` 4/4 |

Zie `SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md` voor het vervolgonderzoek dat ná deze fixes is
uitgevoerd (o.a. end-to-end-verificatie van de signup-fix, historische misbruiksporen, en zes
overige ronde-2-punten).

---

## Samenvattende matrix — top bevindingen

ID's hieronder zijn de paragraafnummers uit de tekst — geen apart letter-schema meer.

| § | Categorie | Bevinding | Oordeel (audit-moment) | Status nu |
|---|---|---|---|---|
| 3.1/3.2 | Beveiliging + rol-toegang | Publieke signup kan zichzelf `role=admin` of een willekeurig bestaand `company_id` (bv. Dutch Waste) toekennen | **GEBROKEN — kritiek** | GEFIXT (`d9e73ce`) |
| 4.4 | Data-integriteit | Bevroren `toolbox_deelname`-bewijsstuk is permanent te vernietigen door de gekoppelde persoon direct te verwijderen (cascade, geen spoor) | **GEBROKEN — kritiek** | GEFIXT (`18085e0`) |
| 1.2 | Werkt (functioneel) | Automatische herinner-heartbeat verstuurt niets | GEBROKEN | GEFIXT (`8061d5c`) |
| §5 | Regressie | tsc 0 fouten, build groen, 21/21 tests groen | BEWEZEN | — |
| 3.3–3.5 | Beveiliging | Geen onbedoelde anon-EXECUTE op bedrijfs-RPC's, RLS overal aan, storage per bedrijf afgeschermd | BEWEZEN | — |
| 2.1–2.3 | Rol-toegang | Alle 18 pagina's consistent gate't (CODE BEVESTIGD); cross-tenant isolatie op databaselaag (BEWEZEN) | CODE BEVESTIGD / BEWEZEN | — |
| 4.1–4.3 | Data-integriteit | Bevroren inspectiedata + correctiespoor personen werken zoals bedoeld | BEWEZEN | — |
| 3.6 | Beveiliging | AI-foto-opt-in: code dwingt 'm af (CODE BEVESTIGD), 6/6 productierijen zonder bypass (BEWEZEN) | CODE BEVESTIGD / BEWEZEN | — |
| 4.5 | Data-integriteit | Twee vergeten testbedrijven (`MEET_...`, `ONVTEST_...`) uit eerdere sessies staan nog in `companies` | Housekeeping (niet door mij aangemaakt, niet verwijderd) | zie Ronde 2 |
| 1.4 | UI | Geen browserinteractie deze ronde | NIET GETEST | nog steeds niet getest |

---

## 1. Werkt alles (functioneel per module)

**1.1 — Regressie- en isolatietestsuite.**
Oordeel: **BEWEZEN**. Commando: `npm test` (draait 21 scripts met `--use-system-ca`, dev-server
actief zodat ook de app-tests meedraaien). Ruwe eindregels, letterlijk:

```
PASS  security_hardening_test.mjs                26/26 tests geslaagd. (7s)
PASS  anon_execute_audit_test.mjs                20/20 controles geslaagd. (3s)
PASS  onveranderlijkheid_test.mjs                38/38 controles geslaagd. (8s)
PASS  nachttest_rls.mjs                          EINDOORDEEL: GEEN cross-tenant datalek aangetoond (15s)
PASS  nachttest_storage.mjs                      Storage-laag isoleert per bedrijf. (4s)
PASS  toolbox_isolatie_test.mjs                  64/64 tests geslaagd. (9s)
PASS  inspectie_isolatie_test.mjs                51/51 tests geslaagd. (7s)
PASS  inspectie_ai_isolatie_test.mjs             39/39 tests geslaagd. (7s)
PASS  centrale_bibliotheek_isolatie_test.mjs     34/34 tests geslaagd. (6s)
PASS  audit_isolatie_test.mjs                    43/43 tests geslaagd. (6s)
PASS  dashboard_isolatie_test.mjs                17/17 tests geslaagd. (3s)
PASS  dashboard_test.mjs                         7/7 tests geslaagd. (2s)
PASS  incident_isolatie_test.mjs                 ## Incident-isolatie -> PASS (20/20) (5s)
PASS  module_isolatie_test.mjs                   8/8 tests geslaagd. (3s)
PASS  persoon_merge_isolatie_test.mjs            20/20 tests geslaagd. (5s)
PASS  inspectie_e2e_test.mjs                     18/18 tests geslaagd. (3s)
PASS  inspectie_foto_selftest.mjs                16/16 controles geslaagd. (4s)
PASS  qr_selftest.ts                             ## QR-zelftest -> PASS (0 fout) (0s)
PASS  ai_analyse_selftest.ts                     17/17 checks geslaagd. (1s)
PASS  inspectie_ai_route_test.ts                 21/21 tests geslaagd. (6s)
PASS  inspectie_ai_robuustheid_test.ts           49/49 controles geslaagd. (16s)
```
Eindregel: **21/21 scripts groen**, geen "Niet groen"-sectie. Beide app-tests draaiden mee (dev-server
bereikbaar), niet overgeslagen. Reproduceerbaar: `npm run dev` in één terminal, `npm test` in een
tweede. Dit dekt de kern-RPC's happy-path voor RI&E-import, PvA/actielijst, toolbox (incl. sessies),
werkplekinspectie (incl. AI-suggestie), incidenten, audits (VCA+ISO), dashboard, personen-samenvoegen,
QR, en AI-fotoanalyse. **Dit is databaselaag/RPC-happy-path, geen UI-bewijs** (zie §1.4).

**1.2 — Automatische herinner-heartbeat is dood.** *(GEFIXT ná deze audit — zie Update-blok
hierboven; commit `8061d5c`, migratie 0064, regressietest `heartbeat_rpc_test.mjs` 4/4.)*

Oordeel op audit-moment: **GEBROKEN, herbevestigd**. Dit was al vastgelegd (`[[heartbeat-geen-toegang]]`);
op audit-moment opnieuw hard getest, veilig (geen enkele kans op een echte verzending):
```
node scripts/db_run.mjs --json --query "select herinner_kandidaten('281b95cc-c807-431d-b760-839dfc9066ed'::uuid);"
→ SQL-FOUT: Geen toegang   (code: P0001)
```
Oorzaak (op audit-moment): `app/api/herinneringen/heartbeat/route.ts` draait met `createServiceClient()`
(service-role, geen `auth.uid()`), terwijl `herinner_kandidaten` met `mag_bedrijf_beheren()` opent —
die leunt op `auth.uid()`. De route ving de fout stil af (`continue`, geen log). Voor élk bedrijf
met een actief ritme was dit dus `verstuurd: 0`.

**1.3 — Handmatige herinnering, mail-routes.**
Oordeel: **AANGENOMEN** (code gelezen: `app/api/herinneringen/handmatig`, `app/api/mail/doorgeven`,
`app/api/mail/toewijzen` — alle drie company-scoped via sessie-client resp. token-/persoon-lookup).
**NIET LIVE GETEST**: elke aanroep zou een echte e-mail via Resend versturen naar een echt
e-mailadres. Reproduceerbaar door wie dat risico wel wil nemen: POST met een geldige KAM-sessie
naar `/api/herinneringen/handmatig`.

**1.4 — UI/browsergedrag.**
Oordeel: **NIET GETEST**. Deze doorlichting liep volledig op databaselaag/API/RPC-niveau (geen
headless browser ingezet). Klikgedrag, foutmeldingen-in-beeld, responsiviteit: onbekend, expliciet
niet geclaimd. Dit is de belangrijkste reden waarom "werkt alles?" hierboven genuanceerd is: een
groene testsuite bewijst dat de RPC's het juiste doen als je ze aanroept zoals de app dat zou doen,
niet dat de app dat zelf ook daadwerkelijk correct doet.

---

## 2. Rol-toegang (zwaartepunt)

**Rolmodel, hard bevestigd:** slechts twee ingelogde rollen bestaan, `admin` en `client`
(`select role, count(*) from users group by role` → `admin: 2, client: 9`, geen `teamleider` of
andere waarde), plus twee sessieloze token-paden (`app/a/[token]` voor werknemers/actiehouders,
`app/melden/[token]` voor anoniem incident melden). Er ís dus geen "teamleider"-rol om te toetsen
*(op audit-moment `f1c5893` — zie Ronde 2 voor de kanttekening dat dit sindsdien, in ongerelateerd
werk, is veranderd)*.

**2.1 — Server-side gate-check op elke pagina.**
Oordeel: **CODE BEVESTIGD** — niet BEWEZEN: er is geen enkele aanroep uitgevoerd, alleen de
broncode zelf systematisch gelezen (18/18 `page.tsx`-bestanden onder `app/[company_id]/*` en
`app/admin/*`, niet slechts een steekproef). Consistent patroon:
```ts
const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
if (!magBeheren) notFound()
```
of de kortere vorm `if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()`.
Citaten (regelnummers): `rie/page.tsx:62`, `personen/page.tsx:71-73`, `incidenten/page.tsx:45-46`,
`dashboard/page.tsx:72-76`, `pva/page.tsx:36`, `actielijst/page.tsx:33`, `modules/page.tsx:38-40`,
`audits/page.tsx:36`, `audits/[audit_id]/page.tsx:34`, `inspecties/page.tsx:81-85`,
`inspecties/[inspectie_id]/page.tsx:31+36` (dubbele check: rol/bedrijf én dat het record zelf bij
dit bedrijf hoort), `toolbox/page.tsx:42-43`, `toolbox/overzicht/page.tsx:36`,
`toolbox/bewijs/[deelname_id]/page.tsx:27+32`, `dashboard/bedrijfsvoering/page.tsx:32-36`,
`admin/{bibliotheek,huisstijl,toolboxen}/page.tsx:9-10` (`role !== 'admin' → notFound()`).
`app/[company_id]/layout.tsx` doet zelf géén gate (bewust — bouwt alleen de topbalk niet op); de
comment daar zegt expliciet "de pagina's doen hun eigen afscherming". Geen enkele pagina zonder
check aangetroffen — maar dit is een statische lezing, geen live HTTP-aanroep die de gate
daadwerkelijk laat afgaan (dat gebeurt indirect wél in §2.3 via de RPC's die de pagina's aanroepen).

**2.2 — `middleware.ts` doet geen autorisatie.**
Oordeel: **CODE BEVESTIGD** — niet BEWEZEN: broncode gelezen, geen aanroep uitgevoerd. Ververst
uitsluitend de sessie en redirect niet-ingelogd naar `/login` buiten de publieke paden (`/login
/auth /reset-wachtwoord /set-wachtwoord /a /melden /api/herinneringen/heartbeat
/api/bewijs/gast-upload /api/bewijs/gast-download /api/incident/foto-upload`). De echte grens ligt
dus op de pagina's zelf (2.1, CODE BEVESTIGD) én in RLS/RPC's (2.3, BEWEZEN).

**2.3 — Cross-tenant isolatie op databaselaag.**
Oordeel: **BEWEZEN**, op audit-moment live gedraaid: `nachttest_rls.mjs` → *"EINDOORDEEL: GEEN
cross-tenant datalek aangetoond"*, `nachttest_storage.mjs` → *"Storage-laag isoleert per bedrijf"*,
`incident_isolatie_test.mjs` 20/20, plus alle module-isolatietests (toolbox 64/64, inspectie 51/51,
audit 43/43, dashboard 17/17, centrale bibliotheek 34/34, module 8/8, personen-merge 20/20). Dit
test zowel "ziet wat moet" als "geweigerd op wat niet mag" — de scripts proberen expliciet met een
sessie van bedrijf A data van bedrijf B te lezen/schrijven en verwachten een weigering.

**2.4 — Werknemer-token-pad (`app/a/[token]`).**
Gesplitst per deelbewering (was ten onrechte één gemengd oordeel):
- De RPC-body van `deellink_data(p_token)` (SECURITY DEFINER, `db/schema.sql:2683-2722`) is
  **CODE BEVESTIGD** rechtstreeks gelezen (niet slechts het gebruik ervan): checkt `ingetrokken`,
  `vervalt_op < now()` en of de persoon niet gearchiveerd is, en levert uitsluitend `pva_items` van
  precies díe `persoon_id` + de huisstijl van diens bedrijf — geen pad naar een ander bedrijf
  aangetroffen in de RPC-body.
- Dat `anon`-EXECUTE op de `deellink_*`/token-RPC's bewust is, is **BEWEZEN** (live grant-query,
  §3.3).
- Het daadwerkelijke gedrag met een echt/verlopen/ingetrokken token tegen live data is **NIET
  GETEST** op audit-moment — dat vergde een geldige deellink uit de productiedata die op dat moment
  niet werd aangemaakt/gebruikt voor een echt bedrijf. **Zie Ronde 2, punt 5** voor de live tests
  (verlopen/ingetrokken/ongeldig/ander-bedrijf/hergebruik/entropie) die dit alsnog dekken.

**2.5 — Incident-meldtoken (`app/melden/[token]`).**
Oordeel: **AANGENOMEN** — de RPC-body van `incident_meldcontext_token` is NIET ingezien, alleen het
gebruik ervan in `app/melden/[token]/page.tsx:13-15`, waaruit blijkt dat alleen bedrijfsnaam +
huisstijl + gevolg-labels worden getoond, nooit bestaande incidentdata. **Zie Ronde 2, punt 5** voor
het alsnog inzien van de RPC-body zelf.

**2.6 — Rol- en bedrijfskoppeling waren bij signup door de aanvrager zelf te kiezen.**
Zie §3.1/3.2 (hoort inhoudelijk bij beveiliging én rol-toegang: dit wás de rol-toegangsgrens, en
die stond open). **Inmiddels gefixt**, zie Update-blok bovenaan.

---

## 3. Beveiliging

**3.1 — Publieke signup kon zichzelf tot admin maken.** *(GEFIXT ná deze audit — commit `d9e73ce`,
migratie 0062, regressietest `signup_privilege_isolatie_test.mjs` 9/9. Onderstaande tekst is de
oorspronkelijke bevinding op audit-moment `f1c5893`.)*

Oordeel op audit-moment: **GEBROKEN, kritiek.** `handle_new_user` (trigger op `auth.users` insert,
`SECURITY DEFINER`) las de rol **rechtstreeks uit de door de aanvrager meegegeven
`raw_user_meta_data`**, zonder enige validatie door een bevoegde partij — **CODE BEVESTIGD**, letterlijk
gelezen:
```sql
v_role := case
  when new.raw_user_meta_data->>'role' in ('client','admin') then new.raw_user_meta_data->>'role'
  else 'client'
end;
v_company := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;
insert into public.users (id, email, role, company_id) values (new.id, new.email, v_role, v_company) ...
```
De app zelf heeft geen signup-formulier (`grep -rn "signUp\|createUser\|inviteUserByEmail" app/ lib/`
→ geen match — **CODE BEVESTIGD**, gecontroleerd over de hele `app/`- en `lib/`-boom, niet alleen
gestipuleerd), maar de `NEXT_PUBLIC_SUPABASE_ANON_KEY` is per definitie publiek (zit in de
client-bundle) en de Supabase Auth REST-endpoint `/auth/v1/signup` is met die key rechtstreeks aan
te roepen, buiten de app-UI om.

**Live geëxploiteerd en bewezen** (test met wegwerp-e-mailadres):
```
POST {SUPABASE_URL}/auth/v1/signup   (header: apikey: <publieke anon key>)
body: { "email": "<test>@example.invalid", "password": "...", "data": { "role": "admin" } }
→ HTTP 200, nieuwe auth-user aangemaakt
→ select id, role, company_id from users where id = '<nieuw-id>'
→ [{"role":"admin", ...}]
```
**Toegekende rol: `admin`.** Dat is een volwaardige rij met `is_admin() = true` voor elke RPC/RLS-
check in het hele systeem.

Direct na afloop opgeruimd — auth-user én `public.users`-rij verwijderd. Na-opruim-query en
resultaat, letterlijk (voorheen niet getoond — Deel B-correctie):
```
DELETE {SUPABASE_URL}/auth/v1/admin/users/<nieuw-id>          (service-role)  → 200
DELETE {SUPABASE_URL}/rest/v1/users?id=eq.<nieuw-id>           (service-role)  → 204
GET    {SUPABASE_URL}/rest/v1/users?id=eq.<nieuw-id>&select=id (service-role)
→ []
```

**3.2 — Publieke signup kon zich koppelen aan een willekeurig bestaand bedrijf.** *(GEFIXT, zelfde
commit als 3.1 — het is dezelfde functie/dezelfde fix.)*

Oordeel op audit-moment: **GEBROKEN, kritiek.** Zelfde mechanisme, ditmaal met `company_id` van een
echte klant (Dutch Waste, `281b95cc-c807-431d-b760-839dfc9066ed`) i.p.v. `role: admin`:
```
body: { "email": "<test>@example.invalid", "password": "...", "data": { "role": "client", "company_id": "281b95cc-c807-431d-b760-839dfc9066ed" } }
→ HTTP 200
→ select id, role, company_id from users where id = '<nieuw-id>'
→ [{"role":"client","company_id":"281b95cc-c807-431d-b760-839dfc9066ed"}]
```
**company_id gelijk aan Dutch Waste: `true`.** Er is zelfs geen adminrol voor nodig — alleen het
`company_id`-UUID van een willekeurig bedrijf. Een UUID zelf is niet te raden; het lek zit in hoe
zo'n UUID toch bekend kan raken — het staat letterlijk in elke URL onder `/[company_id]/...`, dus
via een gedeelde link, een screenshot, een browserhistorie, of een serverlog is het al genoeg. Zodra
bekend, geeft dit volledige KAM-toegang tot dat bedrijf: RI&E, incidenten (inclusief
gezondheidsgegevens), personen, handtekeningen, bewijsstukken — alles wat `mag_bedrijf_beheren`
doorlaat.

**3.1 maakt 3.2 in praktijk overbodig, maar 3.2 is het laagdrempeliger pad.** Wie zichzelf via 3.1
`role='admin'` geeft, heeft geen `company_id` nodig: `is_admin()` alleen is al voldoende voor
`mag_bedrijf_beheren()` op élk bedrijf, dus 3.1 omvat 3.2 volledig in bereik. 3.2 blijft een apart
te noemen gat omdat het nog laagdrempeliger is: geen adminrol (die opvalt in elke rollenlijst),
alleen een gewone `client`-rij die tussen de negen echte KAM-accounts niet opvalt — voor wie
detectie wil vermijden is 3.2 het aantrekkelijkere pad, ook al is het technisch een deelverzameling
van wat 3.1 al bereikt.

Beide waren met dezelfde reproductiestappen na te spelen (vervang `data` naar wens); testaccounts
zijn ná elke test volledig verwijderd (auth + `public.users`, na-opruim-query hierboven).

**3.3 — Overige anon-EXECUTE-oppervlak: geen andere gaten gevonden.**
Oordeel: **BEWEZEN**. Live query van alle 126 functies in `public` tegen
`has_function_privilege('anon', oid, 'EXECUTE')`. Alle overige treffers zijn verklaarbaar:
token-routes (`deellink_*`, `incident_*_token`, `toolbox_afronden_token`, `toolbox_voor_token`,
`gen_deellink_token` — dit ís het werknemer-pad), predicate-helpers die zelf op `auth.uid()`
leunen en zonder sessie veilig `false`/`null` teruggeven (`is_admin`, `mag_bedrijf_beheren`,
`mag_herinneren`, `my_company_id`, `jaar_utc`), en trigger-guardfuncties die niet los aanroepbaar
schade doen. `import_company`/`import_rie_content` hebben zowel anon als authenticated op `false`
(alleen bereikbaar via service-role/db-tooling). Reproduceerbaar: `npm test -- --alleen anon_execute`
→ 20/20, plus de handmatige grant-query in `db/schema.sql`/live via `db_run.mjs`. De *categorisering*
van elke treffer (token-route/predicate-helper/trigger-guard) is **CODE BEVESTIGD** bovenop de
BEWEZEN ruwe grant-lijst — een interpretatiestap, geen extra query.

**3.4 — RLS overal aan.**
Oordeel: **BEWEZEN**. `select count(*) from pg_class ... where relrowsecurity=false and relkind='r'
and nspname='public'` → 0 van 51 tabellen. Alle 51 hebben ook minstens 1 policy (geen "RLS aan maar
leeg"-gat). Sleuteltabellen (`toolbox_deelname`, `inspectie`, `inspectie_historie`,
`inspectie_bevinding`, `incident`, `incident_foto`, `audit_vca_bevinding`, `users`) hebben
uitsluitend een SELECT-policy — directe client-schrijftoegang is op RLS-niveau onmogelijk, alle
mutatie loopt via SECURITY DEFINER-RPC's.

**3.5 — Storage per bedrijf afgeschermd.**
Oordeel: **BEWEZEN**. 4 buckets: `bewijs`, `incident-foto`, `inspectie-foto` (alle `public=false`,
alleen een SELECT-policy per bedrijf via `(storage.foldername(name))[n] = my_company_id() OR
is_admin()` — uploads verplicht via de server-API-routes met service-role, niet rechtstreeks vanuit
de browser), `merk-assets` (`public=true` — **CODE BEVESTIGD** als bewust: logo's voor white-label,
niet gevoelig, schrijven admin-only; dit is een interpretatie van de policy-inhoud, geen live
uitgevoerde test van de "bewustheid"). `nachttest_storage.mjs` PASS op audit-moment.

**3.6 — AI-foto-doorgifte alleen na opt-in.**
Gesplitst (was ten onrechte één "BEWEZEN, dubbel afgedwongen"):
- **CODE BEVESTIGD** dat de dwang op twee plekken in de code zit: RPC-niveau
  (`inspectie_ai_suggestie_opslaan` eist `p_toestemming = true`, anders `raise exception` — gelezen,
  niet zelf met `false` aangeroepen om de weigering te zien) en route-niveau
  (`app/api/inspectie/ai-analyse/route.ts:88` checkt expliciet `toestemming !== true`, vóór de
  leverancier-check op 94 en de externe aanroep op 156 — de server haalt de foto-bytes zelf op via
  een 60s-kortlevende signed URL, regel 126-129, stuurt de URL zelf niet door).
- **BEWEZEN** met live productiedata dat er in de praktijk geen bypass is:
  `select count(*) from inspectie_ai_suggestie where toestemming_bevestigd is not true` → **0** van
  6 bestaande rijen.
- Let op de kolomnaam-vraag uit de aanscherping (Deel B, klein/housekeeping): de RPC-parameter heet
  `p_toestemming`, de kolom heet `toestemming_bevestigd` — dat is geen inconsistentie maar een
  normale parameter→kolom-mapping (de RPC schrijft het argument naar die kolom); **CODE BEVESTIGD**
  door de RPC-body te lezen, geen taalverschil met een verborgen bug.

**3.7 — Kernhelpers null-veilig.**
Oordeel: **CODE BEVESTIGD** (definities van `is_admin()`, `my_company_id()`,
`mag_bedrijf_beheren(p_company_id)` = `is_admin() or p_company_id = my_company_id()`,
`coalesce(..., false)` — gelezen, niet zelf met randgevallen aangeroepen). Aanvullend, voor één
concreet geval, **BEWEZEN**: §1.2 liet live zien dat `mag_bedrijf_beheren` bij de service-role
(geen `auth.uid()`) hard een exception gaf — niet stilzwijgend `true` — dus geen onbedoelde
doorlaat in die situatie.

---

## 4. Data-integriteit

**4.1 — Bevroren inspectiedata: onveranderlijk, ook voor service-role.**
Oordeel: **BEWEZEN**. Migratie 0055: `inspectie`, `inspectie_bevinding`, `inspectie_historie`,
`module_historie` verliezen hun ALL-policy (geen directe PostgREST-schrijftoegang meer) én krijgen
triggers (`inspectie_bevroren_bewaken`, `inspectie_bevinding_bevroren_bewaken`, append-only op
historie) die ook tegen `service_role` bijten — kolom-agnostische vergelijking
(`to_jsonb(new) - 'kolom' is distinct from to_jsonb(old) - 'kolom'`), dus automatisch
toekomstbestendig bij nieuwe kolommen. Uitzonderingen zijn uitsluitend FK-gedreven (`persoon_id`,
`sjabloon_id`, `actie_id`, `wie` → `NULL` bij verwijderde ouder, zie 4.4). `onveranderlijkheid_test.mjs`
38/38 op audit-moment: directe UPDATE/DELETE-pogingen door zowel een KAM-sessie als de service-role
worden geweigerd. **Zie Ronde 2, punt 6** voor een systematische scan van ALLE FK's met
`ON DELETE CASCADE`, niet alleen deze tabellen.

**4.2 — Toolbox-bewijsstuk: onveranderlijk voor UPDATE, NIET voor verwijdering via de ouder (op
audit-moment — inmiddels gefixt, zie 4.4).**
Oordeel: **BEWEZEN dat directe UPDATE/DELETE op de rij zelf geblokkeerd is** — zie 4.4 voor het
(inmiddels gefixte) gat. `toolbox_deelname` heeft geen client-write-policy en een immutable-trigger
die alleen `persoon_id`-wijziging toestaat (voor de mergeflow). `onveranderlijkheid_test.mjs`
bevestigt dit voor UPDATE/DELETE op de rij zelf.

**4.3 — Correctiespoor personen: werkt zoals bedoeld, mét afgedwongen logregel.**
Oordeel: **BEWEZEN**. `personen_samenvoegen` (migratie 0048) is `is_admin()`-only (een KAM mag dit
expliciet niet — `persoon_merge_isolatie_test.mjs` toetst dit en slaagt), schrijft altíjd een regel
naar `persoon_merge_log` (bron/doel-naam, `verschoven`-jsonb, `wie`, `wanneer`) vóórdat de
bronpersoon verdwijnt, weigert hard bij botsende bewijsstukken (zelfde sessie/toolbox+jaar i.p.v.
stilzwijgend overschrijven), en laat de bevroren naam/handtekening op een bewijsstuk ongewijzigd —
alleen `persoon_id` schuift op. Live: `persoon_merge_isolatie_test.mjs` 20/20.

**4.4 — Bevroren toolbox-bewijs was permanent te vernietigen zónder spoor, buiten de merge-RPC om.**
*(GEFIXT ná deze audit — commit `18085e0`, migratie 0061, regressietest `onveranderlijkheid_test.mjs`
41/41 met een nieuw DEEL 5-blok. Onderstaande tekst is de oorspronkelijke bevinding.)*

Oordeel op audit-moment: **GEBROKEN, kritiek.** `personen` had een brede `ALL`-policy
(`personen_write`: `company_id = my_company_id() OR is_admin()`, dus élke client-rol mocht
rechtstreeks INSERT/UPDATE/DELETE op personen van het eigen bedrijf) en **geen enkele trigger**.
Tegelijk stond op `toolbox_deelname.persoon_id`:
```sql
FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE
```
Gevolg: een gewone `client`-sessie (geen admin, geen speciale RPC) kon een bevroren, digitaal
ondertekend toolbox-bewijsstuk **permanent vernietigen** door simpelweg de gekoppelde persoon
rechtstreeks te verwijderen — de rij verdween volledig (cascade, geen `SET NULL`), en er ontstond
géén `persoon_merge_log`-regel, want de merge-RPC werd niet aangeroepen.

**Live bewezen op audit-moment** (eigen ephemeer testbedrijf `DOORLICHTING_PERSDEL_<ts>`, één
client-user, één persoon, één bevroren digitaal bewijsstuk met handtekening — alles ná de test
volledig opgeruimd: bewijsstuk, persoon, user, bedrijf):
```
client.from('personen').delete().eq('id', <persoon_id>)   -- ingelogd als 'client' van eigen bedrijf
→ error: (geen), count: 1   → delete slaagde zonder enige weigering

select id from personen where id = <persoon_id>            → []   (persoon weg)
select id, persoon_id, bevestigde_naam from toolbox_deelname where id = <deelname_id>
→ null   (het HELE bewijsstuk was weg, niet alleen ontkoppeld)

select id from persoon_merge_log where bron_persoon_id = <persoon_id>  → []   (geen logregel)
```
Ter vergelijking: `inspectie.persoon_id` had wél `ON DELETE SET NULL` — inspectiebewijs overleefde
het verwijderen van de gekoppelde persoon, ontkoppelde alleen. Dit was dus een inconsistentie tussen
twee bewijssoorten, geen bewust patroon.

**4.5 — Housekeeping (geen bug, wel vermeldenswaard).**
`companies` bevatte op audit-moment twee kennelijk vergeten testrijen uit eerdere, andere sessies:
`MEET_1788246236870` en `ONVTEST_1788543600382`. Niet door mij aangemaakt, niet verwijderd. **Zie
Ronde 2, klein/housekeeping** voor de vervolgcheck of daar ook test-`users`/`personen` aan hangen.

---

## 5. Regressie

| Check | Commando | Uitkomst (audit-moment `f1c5893`) |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 errors**, exit 0 |
| Build | `npx next build` | **Geslaagd**, 40 routes gegenereerd. Eén waarschuwing: "The middleware file convention is deprecated. Please use proxy instead" — een Next 16.2.7-breaking-change-notitie (zie `AGENTS.md`/`node_modules/next/dist/docs/`), geen blokkerende fout. |
| Volledige testsuite | `npm test` (dev-server actief) | **21/21 scripts groen** (zie 1.1 voor de volledige ruwe lijst) |

Alle drie **BEWEZEN**, op audit-moment live gedraaid. Voor de regressiecijfers ná de drie fixes: zie
de commit-berichten van `18085e0`, `d9e73ce`, `8061d5c` (respectievelijk 41/41, 22/22, 24/24 — het
aantal scripts groeide doordat elke fix een eigen regressietest toevoegde).

---

## Rol-toegangsmatrix

| Module/actie | Admin | Client, eigen bedrijf | Client, ánder bedrijf | Werknemer-token |
|---|---|---|---|---|
| RI&E lezen | MAG | MAG | MAG NIET (BEWEZEN, RLS+pagegate) | n.v.t. |
| PvA / centrale actielijst | MAG | MAG | MAG NIET (BEWEZEN) | alleen eigen acties via deellink (AANGENOMEN → zie Ronde 2 punt 5) |
| Toolbox beheren/afronden | MAG | MAG | MAG NIET (BEWEZEN) | eigen deelname tekenen via token (anon-EXECUTE BEWEZEN, RPC-inhoud CODE BEVESTIGD) |
| Werkplekinspecties | MAG | MAG | MAG NIET (BEWEZEN) | n.v.t. |
| Incidenten (incl. gezondheidsgegevens) | MAG | MAG (eigen bedrijf) — **zie Ronde 2 punt 3: is dit wenselijk?** | MAG NIET (BEWEZEN) | alleen anoniem melden, geen inzage (AANGENOMEN) |
| Audits (VCA/ISO) | MAG | MAG | MAG NIET (BEWEZEN) | n.v.t. |
| Dashboard | MAG (roll-up alle bedrijven) | MAG (eigen bedrijf) | MAG NIET (BEWEZEN) | n.v.t. |
| Personen beheren | MAG | MAG (eigen bedrijf) | MAG NIET (BEWEZEN) | n.v.t. |
| Personen samenvoegen | MAG (met logregel, BEWEZEN) | **MAG NIET** (BEWEZEN, RPC weigert) | MAG NIET | n.v.t. |
| Bewijs-export (buckets) | MAG | MAG (eigen bedrijf, BEWEZEN) | MAG NIET (BEWEZEN) | n.v.t. |
| Huisstijl / centrale bibliotheek / toolboxen (admin-schermen) | MAG | **MAG NIET** (CODE BEVESTIGD, `role !== 'admin' → notFound()`) | MAG NIET | n.v.t. |
| **Eigen rol/bedrijf kiezen bij accountaanmaak** | — | — | — | Was **MAG (GEBROKEN)** — zie 3.1/3.2. **Inmiddels: MAG NIET meer (GEFIXT, `d9e73ce`).** |

---

## Wat toen aandacht nodig had (audit-moment) — nu de status

1. ~~Privilege-escalatie + cross-tenant accountovername via signup~~ (3.1, 3.2) — **GEFIXT**
   (`d9e73ce`). Root cause was: `handle_new_user` vertrouwde `raw_user_meta_data.role`/`company_id`
   van de aanvrager zelf. Verifieerbare bevestiging dat accounts vóór de fix al uitsluitend via de
   admin-API + een aparte upsert werden aangemaakt (nooit via publieke signup-metadata): geen
   enkele `signUp`/`createUser`/`inviteUserByEmail`-aanroep in `app/`/`lib/`
   (`grep -rn "signUp\|createUser\|inviteUserByEmail" app/ lib/` → geen match), en het patroon in
   `scripts/persoon_merge_isolatie_test.mjs:90-106` (dat exact het aanmaakpad van de bestaande
   demo-accounts spiegelt) roept nooit metadata-rollen aan.
2. ~~Bevroren toolbox-bewijs spoorloos vernietigbaar~~ (4.4) — **GEFIXT** (`18085e0`).
3. Automatische herinner-heartbeat — **GEFIXT** (`8061d5c`).

Zie `SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md` voor wat er ná deze fixes nog openstaat vóór een
volledige veiligheidskundige eindconclusie mogelijk is.

---

## Niet getest (expliciet, audit-moment)

- Browserinteractie/UI-gedrag (klikken, foutmeldingen in beeld, responsief layout).
- Echte e-mailverzending (`/api/herinneringen/handmatig`, `/api/mail/*`) — zou echte mail sturen.
- Werknemer-token-flow (`app/a/[token]`) met een echt/verlopen/ingetrokken token tegen productiedata.
- `incident_meldcontext_token`-RPC-body zelf (alleen het gebruik ervan is gelezen).

Zie `SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md` voor welke van deze punten inmiddels alsnog zijn
getest, en de raw output in `audit/2026-09-04/`.
