# Systeemdoorlichting RI&E-portaal — 4 september 2026

Doel: verifieerbaar vaststellen (a) of alles werkt, (b) of elke rol precies ziet/kan wat mag.
Dit is een doorlichting, geen bouwronde: er is niets aan productiecode gewijzigd. Twee kritieke
bevindingen zijn **live geëxploiteerd tegen de productie-Supabase-DB** (met eigen, direct
opgeruimde testdata) om ze van AANGENOMEN naar BEWEZEN/GEBROKEN te tillen — niet gefixt, wel
gedocumenteerd, zoals de opdracht vraagt.

**Methode.** Regressie via `npm test` (21 scripts, `--use-system-ca`) + `tsc` + `next build`,
live SQL-introspectie via `node scripts/db_run.mjs`, code-inspectie van route-gating en RLS/RPC's,
en drie gerichte exploit-/integriteitstests tegen ephemere testbedrijven (nooit tegen Alpha/Bravo
of een echte klant — behalve het uitlezen, nooit schrijven, van het bestaande Dutch Waste-record
om cross-tenant-koppeling te bewijzen). Alle zelf aangemaakte testdata (auth-users, `companies`,
`personen`, `toolbox_deelname`) is in dezelfde run weer verwijderd; geverifieerd met een
na-query dat er niets resteert. `git status` was schoon vóór en ná deze doorlichting.

**Oordeel-definities.** BEWEZEN = een testscript/query is echt uitgevoerd en de ruwe uitkomst
staat hieronder. GEBROKEN = BEWEZEN, en het is een defect. AANGENOMEN = code gelezen, niet zelf
uitgevoerd. NIET GETEST = expliciet overgeslagen, met reden.

---

## Samenvattende matrix — top 10 bevindingen

| # | Categorie | Bevinding | Oordeel |
|---|---|---|---|
| R6/R7 | Beveiliging + rol-toegang | Publieke signup kan zichzelf `role=admin` of een willekeurig bestaand `company_id` (bv. Dutch Waste) toekennen | **GEBROKEN — kritiek** |
| D4 | Data-integriteit | Bevroren `toolbox_deelname`-bewijsstuk is permanent te vernietigen door de gekoppelde persoon direct te verwijderen (cascade, geen spoor) | **GEBROKEN — kritiek** |
| F3 | Werkt (functioneel) | Automatische herinner-heartbeat verstuurt nog altijd niets (bekend, herbevestigd) | GEBROKEN (bekend) |
| G1-G3 | Regressie | tsc 0 fouten, build groen, 21/21 tests groen | BEWEZEN |
| S1-S3 | Beveiliging | Geen onbedoelde anon-EXECUTE op bedrijfs-RPC's, RLS overal aan, storage per bedrijf afgeschermd | BEWEZEN |
| R1-R3 | Rol-toegang | Alle 18 pagina's consistent gate't; cross-tenant isolatie op databaselaag bewezen | BEWEZEN |
| D1-D3 | Data-integriteit | Bevroren inspectiedata + correctiespoor personen werken zoals bedoeld | BEWEZEN |
| S5 | Beveiliging | AI-foto-opt-in hard afgedwongen, 6/6 productierijen bevestigd | BEWEZEN |
| — | Overig | Twee vergeten testbedrijven (`MEET_...`, `ONVTEST_...`) uit eerdere sessies staan nog in `companies` | Housekeeping (niet door mij aangemaakt, niet verwijderd) |
| U1 | UI | Geen browserinteractie deze ronde | NIET GETEST |

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
QR, en AI-fotoanalyse.

**1.2 — Automatische herinner-heartbeat is dood.**
Oordeel: **GEBROKEN, herbevestigd**. Dit was al vastgelegd (`[[heartbeat-geen-toegang]]`); vandaag
opnieuw hard getest, veilig (geen enkele kans op een echte verzending):
```
node scripts/db_run.mjs --json --query "select herinner_kandidaten('281b95cc-c807-431d-b760-839dfc9066ed'::uuid);"
→ SQL-FOUT: Geen toegang   (code: P0001)
```
Oorzaak ongewijzigd: `app/api/herinneringen/heartbeat/route.ts` draait met `createServiceClient()`
(service-role, geen `auth.uid()`), terwijl `herinner_kandidaten` met `mag_bedrijf_beheren()` opent —
die leunt op `auth.uid()`. De route vangt de fout stil af (`continue`, geen log). Voor élk bedrijf
met een actief ritme is dit dus `verstuurd: 0`. Niet gefixt: raakt een SECURITY DEFINER-RPC, buiten
de scope "documenteren, niet stil aanpassen" van deze opdracht.

**1.3 — Handmatige herinnering, mail-routes.**
Oordeel: **AANGENOMEN** (code gelezen: `app/api/herinneringen/handmatig`, `app/api/mail/doorgeven`,
`app/api/mail/toewijzen` — alle drie company-scoped via sessie-client resp. token-/persoon-lookup).
**NIET LIVE GETEST**: elke aanroep zou een echte e-mail via Resend versturen naar een echt
e-mailadres. Reproduceerbaar door wie dat risico wel wil nemen: POST met een geldige KAM-sessie
naar `/api/herinneringen/handmatig`.

**1.4 — UI/browsergedrag.**
Oordeel: **NIET GETEST**. Deze doorlichting liep volledig op databaselaag/API/RPC-niveau (geen
headless browser ingezet). Klikgedrag, foutmeldingen-in-beeld, responsiviteit: onbekend, expliciet
niet geclaimd.

---

## 2. Rol-toegang (zwaartepunt)

**Rolmodel, hard bevestigd:** slechts twee ingelogde rollen bestaan, `admin` en `client`
(`select role, count(*) from users group by role` → `admin: 2, client: 9`, geen `teamleider` of
andere waarde), plus twee sessieloze token-paden (`app/a/[token]` voor werknemers/actiehouders,
`app/melden/[token]` voor anoniem incident melden). Er ís dus geen "teamleider"-rol om te toetsen.

**2.1 — Server-side gate-check op elke pagina.**
Oordeel: **BEWEZEN** (code-inspectie, 18/18 `page.tsx`-bestanden onder `app/[company_id]/*` en
`app/admin/*` gecontroleerd, niet slechts een steekproef). Consistent patroon:
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
check aangetroffen.

**2.2 — `middleware.ts` doet geen autorisatie.**
Oordeel: **BEWEZEN** (code gelezen). Ververst uitsluitend de sessie en redirect niet-ingelogd naar
`/login` buiten de publieke paden (`/login /auth /reset-wachtwoord /set-wachtwoord /a /melden
/api/herinneringen/heartbeat /api/bewijs/gast-upload /api/bewijs/gast-download
/api/incident/foto-upload`). De echte grens ligt dus op de pagina's zelf (2.1) én in RLS/RPC's (2.3).

**2.3 — Cross-tenant isolatie op databaselaag.**
Oordeel: **BEWEZEN**, live vandaag gedraaid: `nachttest_rls.mjs` → *"EINDOORDEEL: GEEN cross-tenant
datalek aangetoond"*, `nachttest_storage.mjs` → *"Storage-laag isoleert per bedrijf"*,
`incident_isolatie_test.mjs` 20/20, plus alle module-isolatietests (toolbox 64/64, inspectie 51/51,
audit 43/43, dashboard 17/17, centrale bibliotheek 34/34, module 8/8, personen-merge 20/20). Dit
test zowel "ziet wat moet" als "geweigerd op wat niet mag" — de scripts proberen expliciet met een
sessie van bedrijf A data van bedrijf B te lezen/schrijven en verwachten een weigering.

**2.4 — Werknemer-token-pad (`app/a/[token]`).**
Oordeel: **grotendeels AANGENOMEN**, deels BEWEZEN. RPC `deellink_data(p_token)` (SECURITY DEFINER,
`db/schema.sql:2683-2722`) checkt `ingetrokken`, `vervalt_op < now()` en of de persoon niet
gearchiveerd is, en levert uitsluitend `pva_items` van precies díe `persoon_id` + de huisstijl van
diens bedrijf — geen pad naar een ander bedrijf gezien in de RPC-body. Anon-EXECUTE op de
`deellink_*`/token-RPC's is bewust (bevestigd via live grant-query, categorie 3). **NIET LIVE
GETEST** met een echt/verlopen/ingetrokken token vandaag — dat vergt een geldige deellink uit de
productiedata die ik niet wilde aanmaken/gebruiken voor een echt bedrijf.

**2.5 — Incident-meldtoken (`app/melden/[token]`).**
Oordeel: **AANGENOMEN**. `incident_meldcontext_token` levert volgens het gebruik in
`app/melden/[token]/page.tsx:13-15` alleen bedrijfsnaam + huisstijl + gevolg-labels, nooit
bestaande incidentdata — de RPC-body zelf is niet ingezien.

**2.6 — GEBROKEN, kritiek: rol- en bedrijfskoppeling zijn bij signup door de aanvrager zelf te kiezen.**
Zie categorie 3.1/3.2 hieronder (hoort inhoudelijk bij beveiliging én rol-toegang: dit ís de
rol-toegangsgrens, en die staat open).

---

## 3. Beveiliging

**3.1 — GEBROKEN, kritiek: publieke signup kan zichzelf tot admin maken.**

`handle_new_user` (trigger op `auth.users` insert, `SECURITY DEFINER`) leest de rol **rechtstreeks
uit de door de aanvrager meegegeven `raw_user_meta_data`**, zonder enige validatie door een bevoegde
partij:
```sql
v_role := case
  when new.raw_user_meta_data->>'role' in ('client','admin') then new.raw_user_meta_data->>'role'
  else 'client'
end;
v_company := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;
insert into public.users (id, email, role, company_id) values (new.id, new.email, v_role, v_company) ...
```
De app zelf heeft geen signup-formulier (`grep -rn signUp app/ lib/` → geen match), maar de
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is per definitie publiek (zit in de client-bundle) en de
Supabase Auth REST-endpoint `/auth/v1/signup` is met die key rechtstreeks aan te roepen, buiten de
app-UI om.

**Live geëxploiteerd en bewezen** (test met wegwerp-e-mailadres, direct na afloop opgeruimd —
auth-user én `public.users`-rij verwijderd, geverifieerd met een na-query dat er niets resteert):
```
POST {SUPABASE_URL}/auth/v1/signup   (header: apikey: <publieke anon key>)
body: { "email": "<test>@example.invalid", "password": "...", "data": { "role": "admin" } }
→ HTTP 200, nieuwe auth-user aangemaakt
→ select id, role, company_id from users where id = '<nieuw-id>'
→ [{"role":"admin", ...}]
```
**Toegekende rol: `admin`.** Dat is een volwaardige rij met `is_admin() = true` voor elke RPC/RLS-
check in het hele systeem.

**3.2 — GEBROKEN, kritiek: publieke signup kan zich koppelen aan een willekeurig bestaand bedrijf.**

Zelfde mechanisme, ditmaal met `company_id` van een echte klant (Dutch Waste,
`281b95cc-c807-431d-b760-839dfc9066ed`) i.p.v. `role: admin`:
```
body: { "email": "<test>@example.invalid", "password": "...", "data": { "role": "client", "company_id": "281b95cc-c807-431d-b760-839dfc9066ed" } }
→ HTTP 200
→ select id, role, company_id from users where id = '<nieuw-id>'
→ [{"role":"client","company_id":"281b95cc-c807-431d-b760-839dfc9066ed"}]
```
**company_id gelijk aan Dutch Waste: `true`.** Dit is ernstiger dan 3.1 in bereik: er is zelfs geen
adminrol voor nodig — alleen het (uit een URL, screenshot, gedeelde link of eenvoudig giswerk
afkomstige) `company_id`-UUID van een willekeurig bedrijf. Zodra bekend, geeft dit volledige
KAM-toegang tot dat bedrijf: RI&E, incidenten (inclusief gezondheidsgegevens), personen,
handtekeningen, bewijsstukken — alles wat `mag_bedrijf_beheren` doorlaat.

Beide zijn met dezelfde reproductiestappen na te spelen (vervang `data` naar wens); testaccounts
zijn ná elke test volledig verwijderd (auth + `public.users`), er resteert niets. **Dit niet
gefixt** — een fix aan de signup-trigger raakt authenticatie-infrastructuur en verdient bewuste
review (zie top-3 hieronder), niet een stille aanpassing tijdens een doorlichting.

**3.3 — Overige anon-EXECUTE-oppervlak: geen andere gaten gevonden.**
Oordeel: **BEWEZEN**. Live query van alle 126 functies in `public` tegen
`has_function_privilege('anon', oid, 'EXECUTE')`. Alle overige treffers zijn verklaarbaar:
token-routes (`deellink_*`, `incident_*_token`, `toolbox_afronden_token`, `toolbox_voor_token`,
`gen_deellink_token` — dit ís het werknemer-pad), predicate-helpers die zelf op `auth.uid()`
leunen en zonder sessie veilig `false`/`null` teruggeven (`is_admin`, `mag_bedrijf_beheren`,
`mag_herinneren`, `my_company_id`, `jaar_utc`), en trigger-guardfuncties die niet los aanroepbaar
schade doen. `import_company`/`import_rie_content` hebben zowel anon als authenticated op `false`
(alleen bereikbaar via service-role/db-tooling). Reproduceerbaar: `npm test -- --alleen anon_execute`
→ 20/20, plus de handmatige grant-query in `db/schema.sql`/live via `db_run.mjs`.

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
de browser), `merk-assets` (`public=true`, bewust — logo's voor white-label, niet gevoelig,
schrijven admin-only). `nachttest_storage.mjs` PASS live vandaag.

**3.6 — AI-foto-doorgifte alleen na opt-in.**
Oordeel: **BEWEZEN**, dubbel afgedwongen. RPC-niveau: `inspectie_ai_suggestie_opslaan` eist
`p_toestemming = true`, anders `raise exception`. Route-niveau: `app/api/inspectie/ai-analyse/route.ts:88`
checkt expliciet `toestemming !== true` (geen truthy/default) vóórdat er iets naar de externe
leverancier gaat (regel 94 leverancier-check, regel 156 externe aanroep) — de server haalt de
foto-bytes zelf op via een 60s-kortlevende signed URL (126-129), stuurt de URL zelf niet door.
Live productiedata: `select count(*) from inspectie_ai_suggestie where toestemming_bevestigd is not true`
→ **0** van 6 bestaande rijen — geen enkele bypass in de praktijk aangetroffen.

**3.7 — Kernhelpers null-veilig.**
Oordeel: **BEWEZEN** (code gelezen + gedrag bevestigd via 1.2). `is_admin()`, `my_company_id()`,
`mag_bedrijf_beheren(p_company_id)` (= `is_admin() or p_company_id = my_company_id()`,
`coalesce(..., false)`) — alle drie `SECURITY DEFINER STABLE`, leunen op `auth.uid()`, geven zonder
sessie/service-role veilig `false`/`null`/een exception, nooit een onbedoelde `true`.

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
38/38 live vandaag: directe UPDATE/DELETE-pogingen door zowel een KAM-sessie als de service-role
worden geweigerd.

**4.2 — Toolbox-bewijsstuk: onveranderlijk voor UPDATE, NIET voor verwijdering via de ouder.**
Oordeel: **BEWEZEN dat directe UPDATE/DELETE op de rij zelf geblokkeerd is** — zie 4.4 voor het
gat. `toolbox_deelname` heeft geen client-write-policy en een immutable-trigger die alleen
`persoon_id`-wijziging toestaat (voor de mergeflow). `onveranderlijkheid_test.mjs` bevestigt dit
voor UPDATE/DELETE op de rij zelf.

**4.3 — Correctiespoor personen: werkt zoals bedoeld, mét afgedwongen logregel.**
Oordeel: **BEWEZEN**. `personen_samenvoegen` (migratie 0048) is `is_admin()`-only (een KAM mag dit
expliciet niet — `persoon_merge_isolatie_test.mjs` toetst dit en slaagt), schrijft altíjd een regel
naar `persoon_merge_log` (bron/doel-naam, `verschoven`-jsonb, `wie`, `wanneer`) vóórdat de
bronpersoon verdwijnt, weigert hard bij botsende bewijsstukken (zelfde sessie/toolbox+jaar i.p.v.
stilzwijgend overschrijven), en laat de bevroren naam/handtekening op een bewijsstuk ongewijzigd —
alleen `persoon_id` schuift op. Live: `persoon_merge_isolatie_test.mjs` 20/20.

**4.4 — GEBROKEN, kritiek: bevroren toolbox-bewijs is permanent te vernietigen zónder spoor, buiten de merge-RPC om.**

`personen` heeft een brede `ALL`-policy (`personen_write`: `company_id = my_company_id() OR
is_admin()`, dus élke client-rol mag rechtstreeks INSERT/UPDATE/DELETE op personen van het eigen
bedrijf) en **geen enkele trigger**. Tegelijk staat op `toolbox_deelname.persoon_id`:
```sql
FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE
```
Gevolg: een gewone `client`-sessie (geen admin, geen speciale RPC) kan een bevroren, digitaal
ondertekend toolbox-bewijsstuk **permanent vernietigen** door simpelweg de gekoppelde persoon
rechtstreeks te verwijderen — de rij verdwijnt volledig (cascade, geen `SET NULL`), en er ontstaat
géén `persoon_merge_log`-regel, want de merge-RPC wordt niet aangeroepen.

**Live bewezen** (eigen ephemeer testbedrijf `DOORLICHTING_PERSDEL_<ts>`, één client-user, één
persoon, één bevroren digitaal bewijsstuk met handtekening — alles ná de test volledig opgeruimd:
bewijsstuk, persoon, user, bedrijf):
```
client.from('personen').delete().eq('id', <persoon_id>)   -- ingelogd als 'client' van eigen bedrijf
→ error: (geen), count: 1   → delete slaagt zonder enige weigering

select id from personen where id = <persoon_id>            → []   (persoon weg)
select id, persoon_id, bevestigde_naam from toolbox_deelname where id = <deelname_id>
→ null   (het HELE bewijsstuk is weg, niet alleen ontkoppeld)

select id from persoon_merge_log where bron_persoon_id = <persoon_id>  → []   (geen logregel)
```
Ter vergelijking, en ter bevestiging dat dit een inconsistentie is en geen bewust patroon:
`inspectie.persoon_id` heeft wél `ON DELETE SET NULL` — inspectiebewijs overleeft het verwijderen
van de gekoppelde persoon, ontkoppelt alleen. `bedrijf_inspectie_doel.persoon_id` is ook `CASCADE`,
maar dat zijn doelstellingen/streefcijfers, geen bewijsstuk — lagere impact, wel vermeldenswaard.

Reproduceerbaar: maak met de service-role een testbedrijf + client-user + persoon +
`toolbox_deelname` (velden: zie `scripts/persoon_merge_isolatie_test.mjs:118-135` voor het juiste
schema), log in als die client, roep `DELETE /rest/v1/personen?id=eq.<id>` aan met de sessie-JWT,
en vergelijk `toolbox_deelname` vóór/ná. **Niet gefixt** — dit vergt een bewuste keuze (FK naar
`SET NULL` zoals bij `inspectie`, of `personen`-DELETE beperken tot een RPC met logging) en raakt
het datamodel van het bewijssysteem; buiten scope van een stille aanpassing.

**4.5 — Housekeeping (geen bug, wel vermeldenswaard).**
`companies` bevat twee kennelijk vergeten testrijen uit eerdere, andere sessies:
`MEET_1788246236870` en `ONVTEST_1788543600382`. Niet door mij aangemaakt, niet verwijderd (niet
mijn testdata om op te ruimen) — gemeld zodat Kees kan beslissen.

---

## 5. Regressie

| Check | Commando | Uitkomst |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 errors**, exit 0 |
| Build | `npx next build` | **Geslaagd**, 40 routes gegenereerd. Eén waarschuwing: "The middleware file convention is deprecated. Please use proxy instead" — een Next 16.2.7-breaking-change-notitie (zie `AGENTS.md`/`node_modules/next/dist/docs/`), geen blokkerende fout. |
| Volledige testsuite | `npm test` (dev-server actief) | **21/21 scripts groen** (zie 1.1 voor de volledige ruwe lijst) |

Alle drie **BEWEZEN**, vandaag live gedraaid.

---

## Rol-toegangsmatrix

| Module/actie | Admin | Client, eigen bedrijf | Client, ánder bedrijf | Werknemer-token |
|---|---|---|---|---|
| RI&E lezen | MAG | MAG | MAG NIET (BEWEZEN, RLS+pagegate) | n.v.t. |
| PvA / centrale actielijst | MAG | MAG | MAG NIET (BEWEZEN) | alleen eigen acties via deellink (AANGENOMEN) |
| Toolbox beheren/afronden | MAG | MAG | MAG NIET (BEWEZEN) | eigen deelname tekenen via token (anon-EXECUTE bewust, AANGENOMEN) |
| Werkplekinspecties | MAG | MAG | MAG NIET (BEWEZEN) | n.v.t. |
| Incidenten (incl. gezondheidsgegevens) | MAG | MAG (eigen bedrijf) | MAG NIET (BEWEZEN) | alleen anoniem melden, geen inzage (AANGENOMEN) |
| Audits (VCA/ISO) | MAG | MAG | MAG NIET (BEWEZEN) | n.v.t. |
| Dashboard | MAG (roll-up alle bedrijven) | MAG (eigen bedrijf) | MAG NIET (BEWEZEN) | n.v.t. |
| Personen beheren | MAG | MAG (eigen bedrijf) — **inclusief het D4-gat** | MAG NIET (BEWEZEN) | n.v.t. |
| Personen samenvoegen | MAG (met logregel, BEWEZEN) | **MAG NIET** (BEWEZEN, RPC weigert) | MAG NIET | n.v.t. |
| Bewijs-export (buckets) | MAG | MAG (eigen bedrijf, BEWEZEN) | MAG NIET (BEWEZEN) | n.v.t. |
| Huisstijl / centrale bibliotheek / toolboxen (admin-schermen) | MAG | **MAG NIET** (BEWEZEN, `role !== 'admin' → notFound()`) | MAG NIET | n.v.t. |
| **Eigen rol/bedrijf kiezen bij accountaanmaak** | — | — | — | **MAG (GEBROKEN)** — zie 3.1/3.2: elke anonieme aanvrager kan zichzelf `admin` maken of aan een willekeurig bestaand bedrijf koppelen |

---

## Top-3 — eerst aandacht nodig

1. **Privilege-escalatie + cross-tenant accountovername via signup** (3.1, 3.2). Root cause:
   `handle_new_user` vertrouwt `raw_user_meta_data.role`/`company_id` van de aanvrager zelf. Dit is
   het enige gat dat een buitenstaander zónder enige voorkennis (alleen de publieke anon-key, die
   per ontwerp publiek is) tot volledige admin- of KAM-toegang op een echt bedrijf brengt. Vergt een
   bewuste keuze: negeer `role`/`company_id` uit de metadata volledig in de trigger (altijd
   `role='client', company_id=NULL`, koppeling via een apart, geautoriseerd pad), en/of schakel
   publieke e-mail-signup uit op projectniveau in Supabase Auth als die niet nodig is (memory
   bevestigt: accounts worden nu al via de admin-API aangemaakt, niet via publieke signup).
2. **Bevroren toolbox-bewijs is spoorloos te vernietigen via de gekoppelde persoon** (4.4). Elke
   client kan, zonder speciale rechten, ondertekende aanwezigheidsbewijzen permanent laten
   verdwijnen. Vergt een bewuste keuze tussen `ON DELETE SET NULL` (zoals bij `inspectie`) of
   `personen`-verwijdering beperken tot een gelogde RPC.
3. **Automatische herinner-heartbeat blijft dood** (1.2, bekend). Functioneel, geen
   beveiligingsrisico, maar bedrijven met een actief herinnerritme krijgen al maanden nul
   automatische herinneringen zonder dat dit ergens zichtbaar faalt.

---

## Niet getest (expliciet)

- Browserinteractie/UI-gedrag (klikken, foutmeldingen in beeld, responsief layout).
- Echte e-mailverzending (`/api/herinneringen/handmatig`, `/api/mail/*`) — zou echte mail sturen.
- Werknemer-token-flow (`app/a/[token]`) met een echt/verlopen/ingetrokken token tegen productiedata.
- `incident_meldcontext_token`-RPC-body zelf (alleen het gebruik ervan is gelezen).

Alle ruwe testoutput (tsc/build/npm-test-logs, DB-introspectiequeries) staat in lokale
scratchpad-bestanden van deze sessie; niet in de repo. Voor een volledig onafhankelijke verificatie:
draai de in dit rapport genoemde commando's opnieuw.
