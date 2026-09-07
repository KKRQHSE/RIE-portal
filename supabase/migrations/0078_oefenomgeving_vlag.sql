-- ============================================================================
-- Oefenomgeving-vlag op companies
-- ----------------------------------------------------------------------------
-- Voor een losstaand oefen-bedrijf (kloon van een echt bedrijf, alleen voor
-- toolbox/inspectie-training) moeten RI&E-inzage (/rie, /pva) en bedrijfsvoering
-- (/personen, /modules) volledig verdwijnen — niet leeg, maar weg uit nav,
-- pagina's én dashboard. Incidenten/audit hebben hiervoor al een toggle
-- (bedrijf_modules); RI&E/PvA/personen/modules hebben dat niet, die staan
-- altijd aan voor een beheerder. Deze vlag is de schakelaar daarvoor.
--
-- Standaard false: raakt geen bestaand bedrijf. Geen nieuwe functie, dus geen
-- REVOKE-regel nodig (zie AGENTS.md).
-- ============================================================================

begin;

alter table public.companies
  add column if not exists oefenomgeving boolean not null default false;

commit;
