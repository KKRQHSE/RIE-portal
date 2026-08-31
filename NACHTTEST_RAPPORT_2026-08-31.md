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

