-- Migratie 0006: functiegroepen (rol binnen het bedrijf) + doel-functiegroep op sjabloon
-- ----------------------------------------------------------------------------
-- Een functiegroep is wat iemand BINNEN HET BEDRIJF doet (QHSE-er, Uitvoerder,
-- Projectleider, Directie, …). Dit staat LOS van het systeemrecht
-- (mag_bedrijf_beheren): een functiegroep zegt niets over wat iemand in het
-- portaal mag, alleen over zijn rol in het bedrijf.
--
-- Elk bedrijf beheert een EIGEN lijst (per company_id, tenant-geïsoleerd). De
-- vier startgroepen worden NIET hard in de code/migratie vastgelegd voor alle
-- bedrijven: een bedrijf kan ze hernoemen, toevoegen en archiveren. De UI biedt
-- ze als optionele voorbeeldset aan; Testbedrijf Alpha wordt apart geseed.
--
-- Veilig/opt-in: uitsluitend additief (nieuwe tabel, twee nullable kolommen,
-- nieuwe indexen, nieuwe RPC's). Geen bestaande kolom wijzigt van betekenis,
-- geen bestaande data wordt aangeraakt. Idempotent: alles met `if not exists`
-- / `create or replace` / `drop policy if exists`; herhaald draaien is veilig.

begin;

-- 1. De tabel. Soft-delete via gearchiveerd_op (zoals inspectie_sjabloon), zodat
--    een gearchiveerde functiegroep historische koppelingen niet hard breekt.
create table if not exists public.functiegroep (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  naam            text not null,
  volgorde        integer not null default 0,
  gearchiveerd_op timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists functiegroep_company_idx
  on public.functiegroep (company_id, volgorde);

alter table public.functiegroep enable row level security;

-- Lezen/schrijven per bedrijf, exact zoals inspectie_sjabloon. Mutaties lopen via
-- de SECURITY DEFINER-RPC's hieronder; deze policy dekt het lezen op de pagina.
drop policy if exists functiegroep_sel on public.functiegroep;
create policy functiegroep_sel on public.functiegroep
  as permissive for select to public
  using (mag_bedrijf_beheren(company_id));

drop policy if exists functiegroep_wr on public.functiegroep;
create policy functiegroep_wr on public.functiegroep
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id))
  with check (mag_bedrijf_beheren(company_id));

-- 2. Koppeling op een persoon: welke rol heeft deze persoon. Nullable; bij het
--    archiveren/verwijderen van een functiegroep valt de persoon terug op 'geen'.
alter table public.personen
  add column if not exists functiegroep_id uuid
    references public.functiegroep(id) on delete set null;

-- 3. Doel-functiegroep op een sjabloon: voor welke rol is deze checklist bedoeld.
--    Nullable = geldt voor iedereen.
alter table public.inspectie_sjabloon
  add column if not exists doel_functiegroep_id uuid
    references public.functiegroep(id) on delete set null;

-- ============================================================
-- RPC's (SECURITY DEFINER + mag_bedrijf_beheren-check), in de stijl van
-- sjabloon_opslaan / punt_opslaan. Geen auditlog: het sjabloon-/personendeel
-- kent die ook niet, dus we houden het consistent en eenvoudig.
-- ============================================================

-- Nieuw of hernoemen. Bij nieuw komt company_id mee maar wordt geautoriseerd;
-- bij bestaand wordt company_id uit de rij afgeleid (meegestuurde genegeerd).
create or replace function public.functiegroep_opslaan(
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
         from functiegroep where company_id = p_company_id)
    );

    insert into functiegroep (company_id, naam, volgorde)
    values (p_company_id, btrim(p_naam), v_volg)
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaande functiegroep: company_id afleiden, meegestuurd company_id negeren.
  select company_id into v_company from functiegroep where id = p_id;
  if v_company is null then
    raise exception 'Functiegroep niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update functiegroep
     set naam     = btrim(p_naam),
         volgorde = coalesce(p_volgorde, volgorde)
   where id = p_id;
  return p_id;
end;
$function$;

-- Archiveren (soft-delete). De FK's met ON DELETE SET NULL gaan alleen af bij een
-- echte delete; bij archiveren laten we koppelingen staan en filtert de UI op
-- gearchiveerd_op is null. Zo blijft historie intact zonder harde verwijdering.
create or replace function public.functiegroep_archiveren(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
begin
  select company_id into v_company from functiegroep where id = p_id;
  if v_company is null then
    raise exception 'Functiegroep niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update functiegroep
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;

-- Functiegroep aan een persoon hangen (of losmaken met p_functiegroep_id = null).
-- Belangrijk voor de isolatie: de functiegroep MOET tot hetzelfde bedrijf horen
-- als de persoon. Zo kan bedrijf A geen functiegroep van B aan zijn persoon
-- koppelen (de personen-RLS alleen zou dat niet tegenhouden).
create or replace function public.persoon_functiegroep_zetten(
  p_persoon_id uuid,
  p_functiegroep_id uuid
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_persoon_company uuid;
  v_groep_company   uuid;
begin
  select company_id into v_persoon_company from personen where id = p_persoon_id;
  if v_persoon_company is null then
    raise exception 'Persoon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_persoon_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  if p_functiegroep_id is not null then
    select company_id into v_groep_company from functiegroep where id = p_functiegroep_id;
    if v_groep_company is null then
      raise exception 'Functiegroep niet gevonden';
    end if;
    if v_groep_company <> v_persoon_company then
      raise exception 'Functiegroep hoort bij een ander bedrijf';
    end if;
  end if;

  update personen set functiegroep_id = p_functiegroep_id where id = p_persoon_id;
end;
$function$;

-- Doel-functiegroep op een sjabloon zetten (of leeghalen met null = voor iedereen).
-- Aparte kleine RPC i.p.v. sjabloon_opslaan uitbreiden: dat zou een tweede
-- overload van sjabloon_opslaan opleveren. Zelfde cross-company-guard als boven.
create or replace function public.sjabloon_doelgroep_zetten(
  p_sjabloon_id uuid,
  p_doel_functiegroep_id uuid
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sjabloon_company uuid;
  v_groep_company    uuid;
begin
  select company_id into v_sjabloon_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_sjabloon_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_sjabloon_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  if p_doel_functiegroep_id is not null then
    select company_id into v_groep_company from functiegroep where id = p_doel_functiegroep_id;
    if v_groep_company is null then
      raise exception 'Functiegroep niet gevonden';
    end if;
    if v_groep_company <> v_sjabloon_company then
      raise exception 'Functiegroep hoort bij een ander bedrijf';
    end if;
  end if;

  update inspectie_sjabloon
     set doel_functiegroep_id = p_doel_functiegroep_id
   where id = p_sjabloon_id;
end;
$function$;

-- Privileges in de stijl van migratie 0003: de browser-clients (anon/authenticated)
-- mogen de RPC's aanroepen; autorisatie zit in de mag_bedrijf_beheren-check zelf.
grant execute on function public.functiegroep_opslaan(uuid, uuid, text, integer) to anon, authenticated, service_role;
grant execute on function public.functiegroep_archiveren(uuid) to anon, authenticated, service_role;
grant execute on function public.persoon_functiegroep_zetten(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.sjabloon_doelgroep_zetten(uuid, uuid) to anon, authenticated, service_role;

commit;
