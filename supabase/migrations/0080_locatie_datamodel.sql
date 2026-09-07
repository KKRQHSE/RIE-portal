-- Migratie 0080: locatie (optionele multi-locatie-ondersteuning, Fase 1 — datamodel)
-- ----------------------------------------------------------------------------
-- Aanpak A uit de multilocatie-verkenning (7 sept 2026): locatie is een
-- ATTRIBUUT, geen aparte rechtenlaag. Exact het patroon van functiegroep
-- (migratie 0006): een company-geïsoleerde tabel + optionele nullable FK's op
-- de tabellen waar een locatie relevant is. De isolatiegrens blijft company_id;
-- mag_bedrijf_beheren/mag_bedrijf_werken worden hier UITSLUITEND gebruikt
-- (bestaande functies), niet gewijzigd.
--
-- Bedrijf zonder locaties: locatie_id blijft overal NULL, niets in bestaand
-- gedrag verandert. Additief; idempotent (create table if not exists,
-- add column if not exists, create or replace, drop policy if exists).
--
-- RLS-keuze (afwijking van functiegroep_sel, bewust): functiegroep_sel gebruikt
-- mag_bedrijf_beheren (alleen KAM/admin lezen de lijst). locatie_sel gebruikt
-- mag_bedrijf_werken, zodat een teamleider (die in Fase 3 een locatie moet
-- kunnen kiezen bij een inspectie/toolbox-sessie) de lijst ook kan lezen.
-- mag_bedrijf_werken bestaat al sinds 0063 en wordt hier alleen aangeroepen —
-- geen nieuwe predicate, geen wijziging van wie wat mag.
--
-- incident heeft al een VERPLICHT vrij tekstveld `locatie` (waar het gebeurde).
-- De nieuwe kolom heet bewust `locatie_id` (FK) — een ander ding, bestaand
-- tekstveld blijft ongewijzigd. Idem voor inspectie.project_locatie (tekst,
-- migratie 0074): blijft naast de nieuwe locatie_id staan; wat daarmee gebeurt
-- is een Fase 3-beslissing, geen dataverlies hier.

begin;

-- ============================================================
-- 1. De tabel. Zelfde vorm als functiegroep (0006).
-- ============================================================
create table if not exists public.locatie (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  naam            text not null,
  volgorde        integer not null default 0,
  gearchiveerd_op timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists locatie_company_idx
  on public.locatie (company_id, volgorde);

alter table public.locatie enable row level security;

drop policy if exists locatie_sel on public.locatie;
create policy locatie_sel on public.locatie
  as permissive for select to public
  using (mag_bedrijf_werken(company_id));

drop policy if exists locatie_wr on public.locatie;
create policy locatie_wr on public.locatie
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id))
  with check (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 2. Optionele locatie_id op de vijf tabellen. on delete set null, zelfde
--    stijl als personen.functiegroep_id: een gearchiveerde/verwijderde
--    locatie breekt geen historische koppeling.
-- ============================================================
alter table public.vragen
  add column if not exists locatie_id uuid references public.locatie(id) on delete set null;
create index if not exists vragen_locatie_idx
  on public.vragen (locatie_id) where locatie_id is not null;

alter table public.inspectie
  add column if not exists locatie_id uuid references public.locatie(id) on delete set null;
create index if not exists inspectie_locatie_idx
  on public.inspectie (locatie_id) where locatie_id is not null;

alter table public.toolbox_sessie
  add column if not exists locatie_id uuid references public.locatie(id) on delete set null;
create index if not exists toolbox_sessie_locatie_idx
  on public.toolbox_sessie (locatie_id) where locatie_id is not null;

alter table public.pva_items
  add column if not exists locatie_id uuid references public.locatie(id) on delete set null;
create index if not exists pva_items_locatie_idx
  on public.pva_items (locatie_id) where locatie_id is not null;

alter table public.incident
  add column if not exists locatie_id uuid references public.locatie(id) on delete set null;
create index if not exists incident_locatie_idx
  on public.incident (locatie_id) where locatie_id is not null;

-- ============================================================
-- 3. RPC's — mirror van functiegroep_opslaan/_archiveren (0006), met de
--    aangescherpte grant-stijl van migratie 0079/AGENTS.md: expliciete REVOKE
--    van public+anon, alleen authenticated mag aanroepen (guard doet de rest).
-- ============================================================
create or replace function public.locatie_opslaan(
  p_id uuid,
  p_company_id uuid,
  p_naam text,
  p_volgorde integer default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_volg    integer;
  v_id      uuid;
begin
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_id is null then
    if not mag_bedrijf_beheren(p_company_id) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;

    v_volg := coalesce(
      p_volgorde,
      (select coalesce(max(volgorde), 0) + 1
         from locatie where company_id = p_company_id)
    );

    insert into locatie (company_id, naam, volgorde)
    values (p_company_id, btrim(p_naam), v_volg)
    returning id into v_id;
    return v_id;
  end if;

  select company_id into v_company from locatie where id = p_id;
  if v_company is null then
    raise exception 'Locatie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update locatie
     set naam     = btrim(p_naam),
         volgorde = coalesce(p_volgorde, volgorde)
   where id = p_id;
  return p_id;
end;
$function$;

create or replace function public.locatie_archiveren(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
begin
  select company_id into v_company from locatie where id = p_id;
  if v_company is null then
    raise exception 'Locatie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update locatie
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;

revoke execute on function public.locatie_opslaan(uuid, uuid, text, integer) from public, anon;
grant  execute on function public.locatie_opslaan(uuid, uuid, text, integer) to authenticated;

revoke execute on function public.locatie_archiveren(uuid) from public, anon;
grant  execute on function public.locatie_archiveren(uuid) to authenticated;

commit;
