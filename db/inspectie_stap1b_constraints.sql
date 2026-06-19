-- ============================================================================
-- Werkplekinspectie — STAP 1b: constraint-aanpassing (Path A)
-- ----------------------------------------------------------------------------
-- De stap0-database is strenger dan het "nog te beoordelen"-model van stap 1/2:
--   - inspectie_bevinding.resultaat was NOT NULL → geen onbeoordeelde bevinding
--     mogelijk (inspectie_start maakt die vooraf aan).
--   - bevinding_afhandeling_klopt verbood (niet_in_orde, geen) → het tussenstadium
--     in bevinding_opslaan mocht niet.
-- Deze migratie versoepelt beide zodat de tussenstadia tijdens het uitvoeren
-- geldig zijn. De EINDeisen (alle verplichte punten beoordeeld, elke niet_in_orde
-- afgehandeld) worden geborgd in de functie inspectie_afronden, niet meer in de
-- constraint. Uitgevoerd na expliciete goedkeuring; tabel was leeg.
-- ============================================================================

begin;

-- 1. Sta een nog-onbeoordeelde bevinding toe (resultaat mag NULL zijn tijdens uitvoering).
alter table public.inspectie_bevinding alter column resultaat drop not null;

-- 2. Herdefinieer de kruisveld-constraint zodat de tussenstadia geldig zijn.
alter table public.inspectie_bevinding drop constraint bevinding_afhandeling_klopt;
alter table public.inspectie_bevinding add constraint bevinding_afhandeling_klopt check (
  (resultaat is null         and afhandeling = 'geen')
  or (resultaat = 'in_orde'      and afhandeling = 'geen')
  or (resultaat = 'nvt'          and afhandeling = 'geen')
  or (resultaat = 'niet_in_orde' and afhandeling in ('geen','meteen_hersteld','actie'))
);

commit;
