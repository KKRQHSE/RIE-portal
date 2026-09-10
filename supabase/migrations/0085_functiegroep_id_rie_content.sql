-- Migratie 0085: functiegroep_id op vragen + pva_items (SeysCentra-import, aanpak A)
-- ----------------------------------------------------------------------------
-- Zelfde patroon als locatie_id (migratie 0080): een optionele, nullable FK.
-- Attribuut, geen rechtenlaag -- mag_bedrijf_beheren/mag_bedrijf_werken worden
-- hier niet aangeraakt. functiegroep bestaat al sinds migratie 0006 (personen)
-- en heeft al RLS/beheer-RPC's; hier komt geen nieuwe policy of RPC bij, alleen
-- de kolom zelf. RI&E-inhoud komt uitsluitend uit import_rie_content, dus welke
-- vraag/actie bij welke functiegroep hoort is een databeslissing bij import
-- (zelfde als bij locatie_id, Fase 2 -- geen nieuwe live-editor).
--
-- Bedrijf zonder functiegroep-specifieke RI&E-inhoud: functiegroep_id blijft
-- overal NULL, niets in bestaand gedrag verandert. Additief; idempotent.

begin;

alter table public.vragen
  add column if not exists functiegroep_id uuid references public.functiegroep(id) on delete set null;
create index if not exists vragen_functiegroep_idx
  on public.vragen (functiegroep_id) where functiegroep_id is not null;

alter table public.pva_items
  add column if not exists functiegroep_id uuid references public.functiegroep(id) on delete set null;
create index if not exists pva_items_functiegroep_idx
  on public.pva_items (functiegroep_id) where functiegroep_id is not null;

commit;
