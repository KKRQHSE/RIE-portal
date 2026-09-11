-- Migratie 0087: SeysCentra demo-klaar — dashboard-scope, functietitel, toetsverslag
-- ----------------------------------------------------------------------------
-- Vier losse, additieve stukjes voor dezelfde opdracht (SeysCentra demo-klaar
-- maken), gebundeld in één migratie omdat ze in één sessie samen landen.
--
-- 1. companies.toon_bedrijfsvoering — SeysCentra gaat uitsluitend over de
--    RI&E; de Bedrijfsvoering-sectie (doelstellingen/tevredenheid/audits/
--    ISO-taken) en de IF-getal-tegel op het dashboard horen daar niet bij.
--    Beide stonden tot nu toe gekoppeld aan `toonRie` (dus aan de
--    oefenomgeving-vlag) — maar SeysCentra is GEEN oefenomgeving (RI&E-inzage
--    moet juist blijven bestaan) en toolbox/inspectie/incidenten/audit staan
--    al standaard uit (geen bedrijf_modules-rij = uit, ongewijzigd gedrag).
--    NULL/true = huidig gedrag (sectie tonen, zoals nu overal het geval is).
--    Alleen expliciet false wijkt af. Zelfde patroon als beschikbare_talen
--    (migratie 0086): attribuut, geen rechtenlaag, geen regressie voor een
--    bestaand of toekomstig bedrijf zonder instelling.
--
-- 2. personen.functietitel — er was geen plek om een specifieke functietitel
--    (los van de grovere functiegroep, bv. "Coördinator Vastgoed &
--    Facilitair") vast te leggen. Optioneel vrij tekstveld; bestaat een
--    persoon met twee functies, dan komt de tweede als toelichting in
--    hetzelfde veld (geen tweede persoonsrecord, geen tweede kolom).
--
-- 3. rie_versies.toetser_* — het korte, structurele GETOETST-kenmerk (wie
--    heeft getoetst, welk certificaatnummer, namens welke organisatie) hoort
--    bij de rie_versie zelf, naast de al bestaande toets_datum.
--
-- 4. rie_toetsverslag — nog geen plek voor de leesbare kerninhoud van een
--    toetsverslag (managementsamenvatting, toetsbrief, conclusies per
--    onderdeel, eindoordeel). Eén rij per rie_versie (1:1), read-only voor de
--    app (invullen gebeurt hier, buiten de UI om — geen nieuwe RPC nodig).
--    Zelfde RLS-stijl als rie_versies/locatie: mag_bedrijf_werken (client,
--    teamleider én admin mogen de toetsing lezen), alleen een SELECT-policy.
--
-- Geen nieuwe functies in deze migratie -> geen REVOKE-regel nodig (AGENTS.md).

begin;

-- ============================================================
-- 1. companies.toon_bedrijfsvoering
-- ============================================================
alter table public.companies
  add column if not exists toon_bedrijfsvoering boolean;

comment on column public.companies.toon_bedrijfsvoering is
  'Bedrijfsvoering-sectie + IF-getal-tegel op het dashboard tonen? NULL/true = tonen (huidig gedrag, geen regressie). Alleen expliciet false verbergt de sectie -- los van oefenomgeving, dat ook de RI&E-inzage zelf uitschakelt.';

update public.companies
  set toon_bedrijfsvoering = false
  where name = 'SeysCentra B.V.';

-- ============================================================
-- 2. personen.functietitel
-- ============================================================
alter table public.personen
  add column if not exists functietitel text;

comment on column public.personen.functietitel is
  'Optionele specifieke functietitel, los van de grovere functiegroep (bv. "Coördinator Vastgoed & Facilitair"). Een tweede functie van dezelfde persoon komt als toelichting in hetzelfde veld -- geen tweede persoonsrecord.';

-- ============================================================
-- 3. rie_versies.toetser_*
-- ============================================================
alter table public.rie_versies
  add column if not exists toetser_naam text,
  add column if not exists toetser_certificaatnummer text,
  add column if not exists toetser_namens text;

comment on column public.rie_versies.toetser_naam is
  'Naam van de toetser (kerndeskundige/HVK) die deze RI&E-versie heeft getoetst.';
comment on column public.rie_versies.toetser_certificaatnummer is
  'Certificaatnummer van de toetser, zoals vermeld in het toetsverslag.';
comment on column public.rie_versies.toetser_namens is
  'Organisatie namens wie de toetsing is uitgevoerd.';

update public.rie_versies
  set toetser_naam = 'Kees Kraaiveld',
      toetser_certificaatnummer = '111332-002',
      toetser_namens = 'QHSE Totaal B.V.'
  where company_id = (select id from public.companies where name = 'SeysCentra B.V.')
    and versie = 1;

-- ============================================================
-- 4. rie_toetsverslag
-- ============================================================
create table if not exists public.rie_toetsverslag (
  id                              uuid primary key default gen_random_uuid(),
  rie_versie_id                   uuid not null references public.rie_versies(id) on delete cascade,
  company_id                      uuid not null references public.companies(id) on delete cascade,
  managementsamenvatting          text,
  toetsbrief                      text,
  conclusie_volledigheid          text,
  conclusie_brongebruik           text,
  conclusie_verplichte_aspecten   text,
  conclusie_wettelijk_kader       text,
  conclusie_actualiteit           text,
  conclusie_betrouwbaarheid       text,
  conclusie_plan_van_aanpak       text,
  conclusie_systeem_scopetoets    text,
  eindoordeel                     text,
  bron_bestand                    text,
  created_at                      timestamptz not null default now(),
  unique (rie_versie_id)
);

create index if not exists rie_toetsverslag_company_idx
  on public.rie_toetsverslag (company_id);

alter table public.rie_toetsverslag enable row level security;

drop policy if exists rie_toetsverslag_sel on public.rie_toetsverslag;
create policy rie_toetsverslag_sel on public.rie_toetsverslag
  as permissive for select to public
  using (mag_bedrijf_werken(company_id));

commit;
