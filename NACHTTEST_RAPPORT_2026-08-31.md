# NACHTTEST-rapport — 31 augustus 2026

_Autonome, onbewaakte run op branch `main`._

_Dit rapport staat bewust in de repo-root en niet in `test-nacht/`: die map staat in
`.gitignore` ("lokaal, niet committen"), en jij vroeg om een rapport dat gepusht
wordt. De eerdere rapporten daar zijn niet aangeraakt._

**Grenzen die ik heb aangehouden:** geen verwijderende of overschrijvende acties op
bestaande data, geen productie-/klantdata (Dutch Waste, Geissler) aangeraakt, alle
eigen testdata achteraf opgeruimd, en riskante of grote wijzigingen alleen
gedocumenteerd — niet gebouwd.

> **Status: afgerond.** Alle onderdelen uit de opdracht zijn gedraaid.

---

## ⚠️ BELANGRIJKSTE BEVINDING — bekijk dit als eerste

### De `bewijs`-bucket schermt niet per bedrijf af (cross-tenant storage-lek)

`scripts/nachttest_storage.mjs` faalt, en terecht. Een **ingelogde gebruiker van
bedrijf A** kan bij de bewijsbestanden van bedrijf B:

```
[FAIL] A kan B-bewijsbestand NIET rechtstreeks downloaden — LAS B's bestand: "GEHEIM bewijs van bedrijf B"
[FAIL] A kan B-bewijsmap NIET opsommen (list)          — LISTTE 1 bestand(en) van B
[FAIL] A kan GEEN bestand in B-bewijsmap schrijven      — UPLOAD in B GELUKT
[PASS] positieve controle: A kan EIGEN bewijsbestand downloaden
```

Dat `list` werkt is het ergste deel: een aanvaller hoeft geen pad te raden, hij kan
de map van een ander bedrijf gewoon opsommen en daarna gericht downloaden.

**Oorzaak.** Op `storage.objects` staan drie policies voor deze bucket die alléén
"ben je ingelogd" eisen, zonder enige bedrijfsafbakening:

| policy | cmd | voorwaarde |
| --- | --- | --- |
| `bewijs beheerder leest` | SELECT | `bucket_id = 'bewijs' AND auth.uid() IS NOT NULL` |
| `bewijs beheerder schrijft` | INSERT | `bucket_id = 'bewijs' AND auth.uid() IS NOT NULL` |
| `bewijs beheerder update` | UPDATE | `bucket_id = 'bewijs' AND auth.uid() IS NOT NULL` |

Ter vergelijking — `incident-foto` en `inspectie-foto` doen het wél goed:

```sql
bucket_id = 'inspectie-foto'
AND ((storage.foldername(name))[1] = my_company_id()::text OR is_admin())
```

Migratie 0026 merkte destijds al op dat de `bewijs`-bucket "storage-zijdig alleen
'ingelogd' afdwingt, te zwak voor deze AVG-categorie" — maar dat leidde tot een
nieuwe bucket voor incidentfoto's, niet tot het dichten van `bewijs` zelf. Het
staat nergens als open punt vastgelegd; in `Projectstand.md` en `Beslissingen.md`
komt het niet voor.

**Waarom dit veilig te dichten is (maar ik het niet zelf heb gedaan).** Ik heb
nagelopen wat er van die policies afhangt:

- **Geen enkele app-flow gebruikt ze.** Alle vier de bewijs-routes
  (`beheerder-upload`, `beheerder-download`, `gast-upload`, `gast-download`) minten
  met de **service role** een signed URL; de service role omzeilt RLS. De browser
  uploadt met `uploadToSignedUrl(pad, uploadToken, …)` — die gebruikt het token,
  niet de policy. De policies bedienen dus alleen directe, ongescope'te
  client-toegang: precies het lek.
- **De padconventie is bekend en consistent.** `deellink_bewijs_pad` en
  `beheerder-upload` bouwen allebei `bewijs/<company_id>/<actie_id>/<uuid>.<ext>`.
  **Let op:** het eerste segment is de letterlijke string `bewijs`, dus de company
  staat op **positie 2** — een policy die `[1]` gebruikt (zoals bij de fotobuckets)
  zou hier álles blokkeren.
- **Er staat op dit moment 1 object in de bucket**, en dat volgt de conventie
  (segment 1 = `bewijs`, segment 2 = een uuid, diepte 3). Geverifieerd met een
  aggregerende query; ik heb geen bestandsinhoud of klantpaden ingezien.

Toch **niet gebouwd**: dit vervangt bestaande policies op een bucket met
klantbewijs, en dat valt onder "riskant" uit de opdracht. Fout gaan betekent dat
niemand meer bij bewijsmateriaal kan.

**Voorstel (na jouw akkoord uit te voeren als migratie 0053).** Zelfde regime als
`inspectie-foto`: één select-policy per bedrijf, en géén insert/update-policy —
schrijven gaat toch al uitsluitend via service-role signed URL's.

```sql
begin;

-- De drie te ruime policies eruit.
drop policy if exists "bewijs beheerder leest"   on storage.objects;
drop policy if exists "bewijs beheerder schrijft" on storage.objects;
drop policy if exists "bewijs beheerder update"  on storage.objects;

-- Terug met een echte per-bedrijf-afbakening. LET OP de index [2]: het pad is
-- bewijs/<company_id>/<actie_id>/<bestand>, dus segment 1 is 'bewijs'.
create policy "bewijs eigen bedrijf leest" on storage.objects
  as permissive for select to public using (
    bucket_id = 'bewijs'
    and ((storage.foldername(name))[2] = my_company_id()::text or is_admin())
  );

commit;
```

**Vooraf te draaien controle** (moet 0 rijen geven; anders volgt niet alles de
conventie en zou de policy bestaande bestanden onbereikbaar maken):

```sql
select count(*) from storage.objects
 where bucket_id = 'bewijs'
   and ((storage.foldername(name))[1] is distinct from 'bewijs'
        or (storage.foldername(name))[2] !~ '^[0-9a-f-]{36}$');
```

**Achteraf:** `node --use-system-ca scripts/nachttest_storage.mjs` moet 4/4 groen
worden, en `scripts/inspectie_foto_selftest.mjs` + de bewijs-flows in de browser
(beheerder-upload/download én een gast-deellink) moeten blijven werken.

---

## ⚠️ TWEEDE BELANGRIJKE BEVINDING — de inspectiehistorie is vervalsbaar

### Een afgeronde inspectie is alleen in de RPC's bevroren, niet in de database

`scripts/onveranderlijkheid_test.mjs` (nieuw). Een **gewone ingelogde KAM van het
eigen bedrijf** kan de RPC's volledig overslaan en rechtstreeks via PostgREST:

| poging op een AFGERONDE inspectie | uitkomst |
| --- | --- |
| toelichting van een bevinding wijzigen | **gelukt** |
| resultaat van een bevinding wijzigen (in orde → niet in orde) | **gelukt** |
| de inspectie heropenen (`status` → `concept`) | **gelukt** |
| de conclusie vervangen | **gelukt** |
| een bevinding verwijderen | **gelukt** |
| een historieregel herschrijven | **gelukt** |
| een historieregel verwijderen | **gelukt** |
| een historieregel **verzinnen** | **gelukt** |

Dit is géén cross-tenant lek — `mag_bedrijf_beheren` scope't netjes op het eigen
bedrijf. Het is een **integriteits- en onweerlegbaarheidsprobleem**: het spoor dat
zou moeten laten zien dát er iets is gewijzigd, is zelf te herschrijven en te
verwijderen. In een module die als bewijs dient en waarvan het rapport als PDF
wordt gedeeld, is dat het verkeerde uitgangspunt.

**Oorzaak.** `inspectie`, `inspectie_bevinding` en `inspectie_historie` hebben elk
één **`ALL`-policy** (`mag_bedrijf_beheren(company_id)` als USING én WITH CHECK).
De regel "afgerond = bevroren" bestaat alleen ín `bevinding_opslaan`,
`inspectie_afronden` en `inspectie_conclusie_opslaan` — en die zijn niet de enige
weg naar binnen.

**Het project doet het elders wél goed**, en dat maakt dit een uitschieter:

| tabel | policies | gevolg |
| --- | --- | --- |
| `toolbox_deelname` | select + **BEFORE UPDATE-trigger** | echt bevroren, ook voor service_role |
| `persoon_merge_log` | alleen SELECT | logregels niet te vervalsen |
| `herinnering_log` | alleen SELECT | idem |
| `inspectie_foto` | alleen SELECT | muteren alleen via RPC |
| `inspectie_ai_suggestie` | alleen SELECT | muteren alleen via RPC |
| `inspectie_historie` | **ALL** | herschrijfbaar, verwijderbaar, verzinbaar |
| `module_historie` | **ALL** | zelfde vorm, zelfde risico |

Ter vergelijking: `toolbox_deelname` weigerde in dezelfde test **elke** kolom, ook
met de service role — bevestigde_naam, handtekening, afgerond_op, bewijssoort,
titel/tekst-snapshot, persoon_id, company_id (11/11 PASS). Zo hoort het.

**Niet gebouwd** — dit vervangt policies op de kerntabellen van een hele module en
valt daarmee onder "riskant/groot". Het uitzoekwerk is wel gedaan:

**Voorstel (migratie 0054, na jouw akkoord).** Elke schrijfactie in de app loopt al
via een SECURITY DEFINER-RPC; die draaien als de owner en trekken zich niets van
RLS aan. Ik heb de hele codebase nagelopen op directe schrijfacties naar deze drie
tabellen — er zijn er **geen**, alleen selects (`InspectieUitvoeren.tsx:108/113`,
`app/api/inspectie/ai-analyse/route.ts:121`). De ALL-policy kan dus vervangen
worden door een select-policy, precies zoals bij `inspectie_foto`:

```sql
begin;

-- Lezen blijft; schrijven gaat uitsluitend via de RPC's (die als owner draaien).
drop policy if exists inspectie_wr            on public.inspectie;
drop policy if exists inspectie_bevinding_wr  on public.inspectie_bevinding;
drop policy if exists inspectie_historie_wr   on public.inspectie_historie;

-- module_historie heeft dezelfde vorm en hetzelfde risico.
drop policy if exists module_historie_wr      on public.module_historie;

commit;
```

De bestaande `*_sel`-policies blijven staan, dus lezen verandert niet.

**Overweeg daarnaast een append-only-trigger op `inspectie_historie` en
`module_historie`** (in de geest van `toolbox_deelname_immutable`): UPDATE en
DELETE weigeren voor iedereen, ook service_role. Dan is het spoor pas echt een
spoor. Dat is een aparte afweging — het maakt ook opschonen onmogelijk.

**Achteraf te draaien:** `node --use-system-ca scripts/onveranderlijkheid_test.mjs`
moet 24/24 groen worden, plus `inspectie_isolatie_test.mjs` (51),
`inspectie_e2e_test.mjs` (18), `inspectie_ai_isolatie_test.mjs` (29) en
`module_isolatie_test.mjs` (8) om te bewijzen dat de RPC-weg intact is. En de
inspectieflow één keer door de browser halen.


---

## Deel 1 — Alle bestaande test-/zelftestscripts opnieuw gedraaid

Alle scripts uit `scripts/` die een test of zelftest zijn. Seed-scripts
(`incident_seed_demo.mjs`) en gereedschap (`db_run`, `dump_schema`) bewust
overgeslagen: die maken of wijzigen data.

| Script | Uitkomst |
| --- | --- |
| `security_hardening_test.mjs` | **PASS** — 26/26 |
| `toolbox_isolatie_test.mjs` | **PASS** — 64/64 |
| `inspectie_isolatie_test.mjs` | **PASS** — 51/51 |
| `inspectie_ai_isolatie_test.mjs` | **PASS** — 29/29 |
| `centrale_bibliotheek_isolatie_test.mjs` | **PASS** — 34/34 |
| `audit_isolatie_test.mjs` | **PASS** — 24/24 |
| `dashboard_isolatie_test.mjs` | **PASS** — 17/17 |
| `dashboard_test.mjs` | **PASS** — 7/7 |
| `incident_isolatie_test.mjs` | **PASS** — 20/20 |
| `module_isolatie_test.mjs` | **PASS** — 8/8 |
| `persoon_merge_isolatie_test.mjs` | **PASS** — 20/20 |
| `inspectie_e2e_test.mjs` | **PASS** — 18/18 |
| `inspectie_foto_selftest.mjs` | **PASS** — 16/16 |
| `nachttest_rls.mjs` | **PASS** — geen cross-tenant datalek aangetoond |
| `nachttest_storage.mjs` | **FAIL** — 1/4, zie de bevinding hierboven |
| `qr_selftest.ts` | **PASS** — 0 fout |
| `ai_analyse_selftest.ts` | **PASS** — 15/15 (incl. echte Groq-aanroep) |
| `rie_aantoonbaar_migratie_check.mjs` | **n.v.t.** — geen test maar een migratiehulp; vereist `--basislijn` of `--vergelijk`. Exit 2 is bedoeld gedrag, geen fout. |

**16 van de 17 echte tests groen.** De enige echte FAIL is de bewijs-bucket.


---

## Deel 2 — Anon-EXECUTE audit: 12 RPC's stonden onbedoeld open (GEFIXT)

**Wat ik vond.** 33 public-functies waren aanroepbaar door de `anon`-rol. Daarvan
horen er 21 open te staan: 13 token-flows (deellink, toolbox, incident-meldflow)
en 8 RLS-helpers/triggerfuncties. De overige **12 waren per-bedrijf-RPC's die daar
niet horen**:

`audit_aanmaken`, `audit_bevinding_naar_actie`, `dashboard_instelling_zetten`,
`dashboard_pva_rie`, `huisstijl_van_bedrijf`, `inspectie_doel_zetten`,
`toolbox_sessie_aanwezigheid_zetten`, `toolbox_sessie_doel_zetten`,
`toolbox_sessie_opslaan`, `toolbox_sessie_verwijderen`,
`toolbox_sessies_overzicht`, `zet_mijn_naam`.

**Waarom dit kon gebeuren — dit is de eigenlijke bevinding.** Migratie 0023 trok
anon-EXECUTE in op de toen bestaande 57 RPC's. Maar `security_hardening_test.mjs`
bewaakt sindsdien een **handgeschreven lijst** uit die tijd, terwijl Supabase bij
elke nieuwe functie standaard EXECUTE aan `anon` toekent. Alles wat daarna is
gebouwd — auditmodule, dashboard-instelling, toolboxsessies, inspectiedoel — viel
dus buiten élke controle. Bij `audit_bevinding_naar_actie` stond zelfs een
expliciete `grant ... to anon` in de migratie.

**Was het een lek?** Nee, en dat heb ik niet aangenomen maar getest. Tegen een
echt bestaand (wegwerp-)bedrijf weigerde elke RPC de anon-caller met "Geen toegang
tot dit bedrijf" — de null-veilige `mag_bedrijf_beheren` uit migratie 0022 doet
zijn werk. Ook met een **echte** auditbevinding als doelwit (met een willekeurige
uuid struikel je al over "Bron niet gevonden" en test je niets). Achteraf
gecontroleerd in de database: geen audit aangemaakt, geen sessie aangemaakt of
verwijderd, geen instelling gezet.

Dus: **één slot in plaats van twee**, niet een open deur.

**Wat ik heb gefixt** — dit viel onder "klein, veilig, additief met een test erbij":

- **`supabase/migrations/0053_anon_execute_nalopers.sql`** — trekt anon-EXECUTE in
  op die 12, met `authenticated` + `service_role` expliciet terug (exact het
  patroon van migratie 0023). Er wordt niets weggehaald wat werkt: alleen `anon`
  verliest een deur die al op slot zat.
- **`scripts/anon_execute_audit_test.mjs`** (nieuw) — leest de anon-EXECUTE-set
  **live uit de database** in plaats van uit een handgeschreven lijst, en faalt
  zodra er iets opduikt dat niet verklaard is. Dat sluit het procesgat: een
  volgende vergeten revoke valt meteen op in plaats van over een half jaar.

**Vooraf gecontroleerd dat geen login-loze flow hierop leunt:** `/a/[token]`
gebruikt `deellink_data`, `/melden/[token]` gebruikt `incident_meldcontext_token`
en `/tb/[token]` gebruikt `toolbox_voor_token` — en die token-RPC's leveren de
huisstijl in hun eigen payload mee. `huisstijl_van_bedrijf` heeft maar één caller
(`haalHuisstijl`), en die zit uitsluitend in `/[company_id]/*`-pagina's achter de
middleware-login. Zou het tóch ergens anoniem worden aangeroepen, dan valt
`haalHuisstijl` netjes terug op de standaard huisstijl.

**Bewijs.** Anon-EXECUTE 33 → 21 (precies de 13 tokenflows + 8 helpers).
`anon_execute_audit_test.mjs` 18/18 — de weigering komt nu van de permissielaag
("permission denied for function …") in plaats van van de guard. **Volledige suite
opnieuw gedraaid: identiek aan de basislijn, geen enkele regressie** — de
ingelogde flows (toolbox 64/64, audit 24/24, dashboard 17/17) merken er niets van.
`tsc` + `next build` groen, schema gedumpt.

---

## Deel 3 — AI-foto-analyse: randgevallen en misbruik (PASS, 53/53)

Nieuw: **`scripts/inspectie_ai_robuustheid_test.ts`**. De bestaande route-test
bewijst de gelukkige gang; deze duwt tegen de randen. Draait tegen de echte
dev-server met een echte sessie, op wegwerpbedrijven.

**Opt-in is hard.** Negen varianten van "bijna true" geprobeerd — ontbrekend,
`null`, `false`, de tekst `"true"`, `"TRUE"`, `"ja"`, het getal `1`, `[]`, `{}` —
plus `{waarde:true}` als object en kapotte JSON. **Allemaal HTTP 400**, en achteraf
0 rijen in `inspectie_ai_suggestie`. De route eist letterlijk `toestemming === true`.

**De sleutel lekt nergens.** Elk antwoord van de route (ook elke foutmelding) gaat
door één centrale scan op `gsk_`, `api.groq.com`, `Bearer …`, JWT-vormen,
`SUPABASE_SERVICE_ROLE`, `GROQ_API_KEY`, signed storage-URL's en
stacktrace-regels. Op geen enkel pad een treffer.

**Bedrijfsgrens houdt via elke omweg die ik kon bedenken.** A op de foto van B →
403. Onbekende uuid → 403. Een `fotoId` die geen uuid is → 403. En de omweg die
er het meest toe doet: meesturen van `companyId`, `company_id`, `bevindingId` en
`inspectieId` van het eigen bedrijf bij de foto van B → nog steeds 403. De route
leidt alles af uit de foto zelf en gelooft niets wat de client meestuurt.

**Kapotte invoer landt niet half:**

| Geval | Resultaat |
| --- | --- |
| leeg bestand (0 bytes) | 400, nette melding |
| foto > 4 MB | 413 |
| pdf geregistreerd als bijlage | 400 "alleen een foto" |
| rij zonder storage-object | 502, geen crash |
| rommelbytes met `image/png` als type | 502, **en 0 rijen opgeslagen** |
| foto zonder inspectiepunt | 400 |

**Leverancier die stukgaat.** Server gestart met `GROQ_MODEL=bestaat/niet-echt`:
502, de Nederlandse tekst "De AI-analyse is niet gelukt.", geen woord van Groq's
eigen foutmelding, geen sleutel, en niets opgeslagen. Het technische detail
(`Groq HTTP 404: …`) staat alleen in het serverlog. Eerder op de avond deed de
echte tokenlimiet (429) hetzelfde: "de dienst is nu druk bezet".

**Overnemen zonder resultaat blijft dicht — ook langs het scherm om.** Rechtstreeks
op `inspectie_ai_suggestie_besluit` met een geldig concept-id: geweigerd met "Kies
eerst een resultaat bij dit inspectiepunt", toelichting bleef leeg, suggestie bleef
op `concept` zonder besluittekst. Dat is de bug van migratie 0051, nu ook op
RPC-niveau bewezen.

**Niets wordt vanzelf definitief.** Afsluitende controle over alle suggesties van
het testbedrijf: geen enkele met een andere status dan `concept` zonder
`besloten_door`, en geen enkele bevinding met een toelichting zonder resultaat
(de "stille opslag" uit 0051).

---

## Deel 4 — Onveranderlijkheid (16/24; 8 FAILs zijn de bevinding hierboven)

Nieuw: **`scripts/onveranderlijkheid_test.mjs`**.

- **Toolbox-bewijsrecord — 11/11 PASS.** Elke kolom apart geprobeerd met de
  **service role**: allemaal geweigerd door de trigger ("Een afgerond
  toolbox-record is onveranderlijk"). Ook `persoon_id` en `company_id`. Een
  ingelogde KAM kan het record niet wijzigen én niet verwijderen. Dit is de
  maatstaf waaraan de rest zou moeten voldoen.
- **Afgeronde inspectie via de RPC's — 4/4 PASS.** `bevinding_opslaan`,
  een tweede `inspectie_afronden` en `inspectie_conclusie_opslaan` weigeren
  allemaal met een duidelijke reden.
- **Afgeronde inspectie + historie langs de RPC's om — 8 FAILs.** Zie de tweede
  bevinding bovenaan. De falende controles blijven bewust staan tot het voorstel
  is doorgevoerd; het script zegt dat er ook bij.

## Deel 5 — Tenant-isolatie breed

- **Alle 51 tabellen hebben RLS aan.** Geen enkele uitzondering.
- Voor de recent toegevoegde onderdelen is A-vs-B-isolatie aangetoond door de
  bestaande tests, allemaal groen: audit (24/24), inspectie-foto (in
  inspectie 51/51 + foto-selftest 16/16), toolbox-bron (in toolbox 64/64),
  dashboard-instelling (17/17), merge-log (20/20, inclusief "KAM van B ziet het
  logboek van A niet") en AI-analyse (29/29 + 53/53 robuustheid).
- **Alle policies die schrijven toestaan zijn per bedrijf of admin-only
  gescope't** — nagelopen op `qual`. Geen enkele policy laat cross-tenant
  schrijven toe. De gevonden problemen zitten dus in *wat* een bevoegde gebruiker
  binnen zijn eigen bedrijf mag (integriteit), niet in *wiens* data hij ziet.
- **Anon:** zie Deel 2. Na migratie 0053 nog 21 functies aanroepbaar door anon,
  allemaal verklaarbaar (13 tokenflows, 8 helpers).

---

## Deel 6 — Regressie en opruimen

- **`tsc --noEmit` groen**, **`next build` groen**.
- **Lint terug op de bestaande basislijn** (12 problemen / 7 fouten — allemaal van
  vóór vanavond, o.a. `YouTubeSpeler.tsx` en `PersonenClient.tsx`). Eén nieuwe
  waarschuwing die ik zelf introduceerde is meteen opgeruimd.
- **Volledige testsuite na elke wijziging opnieuw gedraaid**, met exact dezelfde
  uitkomst als de basislijn. Migratie 0053 heeft niets gebroken: toolbox 64/64,
  inspectie 51/51, audit 24/24, dashboard 17/17, bibliotheek 34/34, incidenten
  20/20, modules 8/8, merge 20/20, e2e 18/18.
- **Testdata opgeruimd en gecontroleerd:** 0 testbedrijven en 0 test-accounts over
  (gecontroleerd op alle prefixen: ANONTEST_, AIROB_, ONVTEST_, AIROUTE_,
  BROWSERTEST_, INSPTEST_, SECTEST_, AITEST_, FOTOTEST_, DIAG_). Eén
  `ANONTEST_`-bedrijf bleef eerst staan doordat ik de uitvoer door `head` pipete
  en het opruimblok daardoor niet meer draaide; alsnog verwijderd.
- **Klantdata niet aangeraakt.** Ter controle achteraf: Dutch Waste 11 inspecties
  / 12 acties, Geissler 20 acties, Alpha 7/15, Bravo 0/2 — allemaal onveranderd.
  Alle verwijderacties waren gescope't op de id's van mijn eigen wegwerpbedrijven.

---

## Kop van de lijst — wat als eerste te bekijken

**1. De `bewijs`-bucket schermt niet per bedrijf af.** Cross-tenant: een ingelogde
gebruiker van bedrijf A kan de bewijsmap van bedrijf B opsommen, bestanden lezen
én erin schrijven. Dit is de enige bevinding met een echte
vertrouwelijkheidsimpact. Klaar voorstel in dit rapport; ik heb het niet zelf
uitgevoerd omdat het bestaande policies op klantbewijs vervangt. **Let op de
padindex: `[2]`, niet `[1]`.**

**2. Een afgeronde inspectie is alleen in de RPC's bevroren.** Een ingelogde KAM
kan langs de RPC's om de toelichting en het resultaat van een afgeronde bevinding
wijzigen, de inspectie heropenen, een bevinding verwijderen, en historieregels
herschrijven, verwijderen of verzinnen. Geen datalek, wel een
integriteitsprobleem in precies de module die als bewijs moet dienen. Voorstel
klaar; niet uitgevoerd omdat het de kerntabellen van een module raakt.

**3. Gefikst en gepusht: 12 RPC's hadden onbedoeld anon-EXECUTE** (migratie 0053).
Geen lek geweest — de guard hield — maar het was één slot in plaats van twee. Het
echte probleem was dat de hardening-test een handgeschreven lijst bewaakte;
`scripts/anon_execute_audit_test.mjs` leest die set nu live uit de database en
betrapt de volgende naloper vanzelf.

**4. Goed nieuws waar het het zwaarst telt.** Het toolbox-bewijsrecord is écht
onveranderlijk — elke kolom geweigerd, ook met de service role. Alle 51 tabellen
hebben RLS aan. Geen enkele policy laat cross-tenant schrijven toe. En de
AI-foto-analyse hield stand tegen alles wat ik erop losliet: 53/53 op opt-in
omzeilen, sleutellekken, bedrijfsgrens-omwegen, kapotte bestanden en een
leverancier die stukgaat.

### Wat ik zelf heb gefikst
| | |
| --- | --- |
| `0053_anon_execute_nalopers.sql` | anon-EXECUTE ingetrokken op 12 RPC's |
| `scripts/anon_execute_audit_test.mjs` | live audit, betrapt toekomstige nalopers (18/18) |
| `scripts/inspectie_ai_robuustheid_test.ts` | AI-randgevallen en misbruik (53/53) |
| `scripts/onveranderlijkheid_test.mjs` | onveranderlijkheid van bewijs (16/24, 8 = bevinding 2) |

### Wat ik alleen heb gedocumenteerd
| | |
| --- | --- |
| bewijs-bucket per bedrijf afschermen | vervangt policies op klantbewijs — jouw akkoord nodig |
| ALL-policies op inspectie/historie | raakt de kerntabellen van een module — jouw akkoord nodig |
| append-only trigger op de historietabellen | aparte afweging: maakt ook opschonen onmogelijk |
