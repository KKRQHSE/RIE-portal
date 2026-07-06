-- Migratie 0032: inspectie-doelen Dutch Waste uit de toolbox-tabel halen
-- ----------------------------------------------------------------------------
-- De inspectie-doelen van Dutch Waste (Fatih 10, Rob 10, Jeroen 4, Ed 2) waren
-- per abuis in `bedrijf_doelstelling` gezet. Die tabel is EXCLUSIEF van de
-- toolbox (gelezen door toolbox_dashboard), dus deze personen verschenen daar
-- als 0/10 "loopt achter" terwijl ze geen toolboxen doen.
--
-- Deze data-migratie verhuist de doelen naar de eigen per-persoon-tabel
-- `bedrijf_inspectie_doel` (0031) en verwijdert ze uit `bedrijf_doelstelling`.
-- Gescoped op Dutch Waste; idempotent (insert = upsert, delete = no-op bij
-- herhaling). FK-guard: inserten alleen als de persoon bij dit bedrijf hoort,
-- zodat de migratie een no-op is op DB's zonder deze data.

begin;

-- Additief: zet de inspectie-doelen in de eigen per-persoon-tabel.
insert into public.bedrijf_inspectie_doel (company_id, persoon_id, doel_per_jaar, updated_at)
select v.company_id, v.persoon_id, v.doel, now()
from (values
  ('281b95cc-c807-431d-b760-839dfc9066ed'::uuid, '9538edf9-2173-42a1-87df-86335dc4cfd5'::uuid, 10),  -- Fatih Tasdemir
  ('281b95cc-c807-431d-b760-839dfc9066ed'::uuid, '26e82ffc-57ac-43a9-b25c-7fe44fc76cb5'::uuid, 10),  -- Rob Vernes
  ('281b95cc-c807-431d-b760-839dfc9066ed'::uuid, '2938b6d0-0444-410c-849d-f2b4738dbfd7'::uuid, 4),   -- Jeroen Schweig
  ('281b95cc-c807-431d-b760-839dfc9066ed'::uuid, 'd482b7da-83aa-45a1-ab46-f52574d6515e'::uuid, 2)    -- Ed de Jong
) as v(company_id, persoon_id, doel)
where exists (select 1 from public.personen p where p.id = v.persoon_id and p.company_id = v.company_id)
on conflict (company_id, persoon_id) do update
  set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();

-- Verwijderend (gescoped op Dutch Waste): haal de inspectie-doelen uit de
-- toolbox-tabel, zodat het toolbox-dashboard deze personen niet meer als 0/N toont.
delete from public.bedrijf_doelstelling
where company_id = '281b95cc-c807-431d-b760-839dfc9066ed'
  and functiegroep_id in (
    '42fdc6ea-8db6-4628-b57b-7c2a4977c745',  -- Teamleider Cleaning       (Fatih)
    'e1b61de2-1abd-416e-acc9-c326aa8c6a35',  -- QHSE-coordinator          (Rob)
    '95917284-eb00-4915-bc88-a76c48e9e417',  -- Directie - Jeroen Schweig (Jeroen)
    '7cfed88d-e246-4a72-b13b-2ca1dad3b7f9'   -- Directie - Ed de Jong     (Ed)
  );

commit;
