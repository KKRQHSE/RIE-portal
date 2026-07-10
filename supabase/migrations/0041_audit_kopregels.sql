-- Migratie 0041: auditkop — "Aan" en "Van"
-- ----------------------------------------------------------------------------
-- Beide bronformulieren openen met dezelfde twee kopregels:
--   Aan : Directie Dutch Waste Collectors BV
--   Van : Kees Kraaiveld
-- Die ontbraken in 0038. Twee nullable tekstkolommen op audit, voor BEIDE
-- sjablonen (VCA-checklist én ISO-verslag hebben de kop).
--
-- BEWUST NIET OPGESLAGEN: de tellers "Afwijkingen: N" en "Verbeterpunten: N" uit
-- de formulierkop. Die worden afgeleid uit audit_verbeterpunt.soort en
-- audit_vca_bevinding.status. Een opgeslagen teller kan uit de pas lopen met de
-- bevindingen eronder; een afgeleide teller niet.
--
-- Additief: twee nullable kolommen, geen backfill nodig (bestaande audits tonen
-- een leeg veld). RLS en policies ongewijzigd — audit_all dekt de hele rij.

begin;

alter table public.audit
  add column if not exists gericht_aan text,
  add column if not exists auditor     text;

comment on column public.audit.gericht_aan is 'Kopregel "Aan" van het auditrapport, bv. "Directie Dutch Waste Collectors BV".';
comment on column public.audit.auditor    is 'Kopregel "Van" — de uitvoerend auditor.';

commit;
