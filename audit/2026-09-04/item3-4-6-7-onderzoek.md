# Items 3, 4, 6, 7 — onderzoek, geen fixes (nachtopdracht)

## Item 3 — pg_policies systematisch (BEWEZEN, live query)

Commando: zie `audit/2026-09-04/item3_pg_policies_schrijf.json` (volledige ruwe output).
```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and cmd in ('ALL','INSERT','UPDATE','DELETE')
order by tablename, cmd;
```
**13 write-capable policies gevonden, ongewijzigd t.o.v. Ronde 2** (mijn eigen `audit_log`-migratie
voegt alleen een SELECT-policy toe, dus geen nieuwe hier). Opsplitsing:
- **12 van de 13 zijn `is_admin()`** (centrale catalogi: audit-paragrafen, rubrieken, centrale
  toolbox/vraag, incident-basisdata, merken, toolbox-bronnen; plus `companies`-UPDATE) — admin-only
  masterdata, correct.
- **1 is `mag_bedrijf_beheren(company_id)`**: `pva_items`-UPDATE — correct company-scoped, geen
  DELETE-policy.
- De enige met bredere reikwijdte (`ALL`, dus ook DELETE) is nog steeds **`personen_write`**
  (`mag_bedrijf_beheren(company_id)`) — dit is het al bekende, inmiddels ingeperkte 4.4-pad (de
  cascade is gefixt in migratie 0061; de brede schrijf-policy op `personen` zelf is een bewuste
  ontwerpkeuze voor gewone personen-CRUD, niet opnieuw aangepast).

**Geen enkele onverwacht brede policy gevonden.** Niets om te markeren als "ruimer dan verwacht"
buiten wat al bekend en beoordeeld was.

## Item 4 — alle FK ON DELETE CASCADE (BEWEZEN, live query)

Volledig overzicht: `audit/2026-09-04/item4_fk_cascades.json` (62 CASCADE-constraints).
```sql
select conrelid::regclass as tabel, conname, confdeltype, confrelid::regclass as verwijst_naar
from pg_constraint
where contype='f' and connamespace='public'::regnamespace and confdeltype='c'
order by tabel;
```
**Kernbevestiging: `toolbox_deelname_persoon_id_fkey` staat niet meer in deze lijst** — de 0061-fix
(SET NULL i.p.v. CASCADE) staat live en blijvend. De enige overgebleven cascade vanuit
`toolbox_deelname` is `sessie_id -> toolbox_sessie` (bedoeld: een hele sessie verwijderen neemt de
bijbehorende deelnames mee) en `company_id -> companies` (whole-tenant teardown, admin-only,
bedoeld).

Alle overige 60 CASCADE's vallen in twee categorieën, zoals al vastgesteld in Ronde 2:
- **Whole-company teardown** (`company_id -> companies`, ~25 tabellen): bedoeld, admin-only, zeldzaam.
- **Kind-van-een-zelf-al-dicht-record** (bv. `inspectie_bevinding -> inspectie`,
  `audit_vca_bevinding -> audit`, `inspectie_foto -> inspectie`): deze ouders hebben zelf geen
  client-DELETE-policy (SELECT-only sinds migraties 0055/0058), dus deze cascades zijn niet
  routinematig door een client te triggeren.

**Geen nieuwe risicovolle cascade geïntroduceerd** door de teamleider-migraties (0063/0065/0066) of
de audit-log-migratie (0068) — `audit_log` zelf heeft bewust GEEN foreign keys (zie item 1: dat is
een expliciete ontwerpkeuze, geen omissie).

**Al verloren productiedata via het oude 4.4-pad:** ongewijzigd t.o.v. Ronde 2 — **NIET VAST TE
STELLEN**. Verwijderde rijen laten geen spoor na; dat was precies het probleem vóór de fix. Geen
nieuwe indicatoren gevonden vanavond (geen reden om de eerdere conclusie te herzien).

## Item 6 — kolomnaam `toestemming_bevestigd` vs. RPC-parameter `p_toestemming` (CODE BEVESTIGD)

Al opgehelderd in de Deel-B-correctie van `SYSTEEMDOORLICHTING_2026-09-04.md` §3.6: dit is een
normale parameter→kolom-mapping, geen inconsistentie. De RPC `inspectie_ai_suggestie_opslaan`
ontvangt het argument als `p_toestemming` en schrijft de waarde weg in de kolom
`toestemming_bevestigd` op `inspectie_ai_suggestie`. Geverifieerd (opnieuw, voor de volledigheid)
door de RPC-body te lezen: geen taalverschil, geen verborgen bug — één waarde, twee namen op twee
plekken (call-site parameter vs. opslagkolom), functioneel identiek.

## Item 7 — vergeten testdata bij MEET_/ONVTEST_-bedrijven (BEWEZEN, live query)

```sql
select c.id, c.name,
  (select count(*) from personen p where p.company_id=c.id) as personen,
  (select count(*) from users u where u.company_id=c.id) as users,
  (select count(*) from toolbox_deelname t where t.company_id=c.id) as toolbox_deelnames,
  (select count(*) from pva_items pi where pi.company_id=c.id) as pva_items
from companies c
where c.name like 'MEET\_%' or c.name like 'ONVTEST\_%';
```

Resultaat, ongewijzigd t.o.v. Ronde 2:
- `ONVTEST_1788543600382` bestaat niet meer (al eerder opgeruimd, niet door mij vanavond).
- `MEET_1788246236870` bestaat nog: **1 gekoppelde `users`-rij**
  (`meet_1788246236870@example.test`, role `client`), **0 personen, 0 toolbox-deelnames,
  0 pva_items**. Puur een vergeten testaccount + leeg testbedrijf — geen toegangsrisico (het account
  heeft geen enkele echte data eraan hangen), geen gevoelige data. **Niet verwijderd** — niet mijn
  testdata, en de opdracht was inventariseren, niet opruimen. Beslissing bij Kees.

Verder in de repo geen andere `*TEST*`/wegwerp-testbedrijven aangetroffen bij deze query.

