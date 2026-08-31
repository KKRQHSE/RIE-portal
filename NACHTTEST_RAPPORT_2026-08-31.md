# NACHTTEST-rapport — 31 augustus 2026

_Autonome, onbewaakte run op branch `main`._

_Dit rapport staat bewust in de repo-root en niet in `test-nacht/`: die map staat in
`.gitignore` ("lokaal, niet committen"), en jij vroeg om een rapport dat gepusht
wordt. De eerdere rapporten daar zijn niet aangeraakt._

**Grenzen die ik heb aangehouden:** geen verwijderende of overschrijvende acties op
bestaande data, geen productie-/klantdata (Dutch Waste, Geissler) aangeraakt, alle
eigen testdata achteraf opgeruimd, en riskante of grote wijzigingen alleen
gedocumenteerd — niet gebouwd.

> **Status:** loopt nog. Dit bestand wordt gaandeweg bijgewerkt en gepusht, zodat de
> stand ook zichtbaar is als de run halverwege stilvalt.

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
