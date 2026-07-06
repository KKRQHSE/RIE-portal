-- Migratie 0031: inspectie-doel per persoon (eigen home, los van de toolbox)
-- ----------------------------------------------------------------------------
-- Inspectie-doelen hoorden nergens: de enige doel-tabel `bedrijf_doelstelling`
-- is EXCLUSIEF van de toolbox (gelezen door toolbox_dashboard, geschreven door
-- doelstelling_zetten). Inspectie-doelen daarin zetten vervuilt het toolbox-
-- dashboard (personen verschijnen als 0/N terwijl ze geen toolboxen doen).
--
-- Daarom een EIGEN, PER-PERSOON doel-tabel voor werkplekinspecties. Per persoon,
-- want inspectie-doelen zijn individueel (bv. twee directieleden met 4 resp. 2).
-- Muteren uitsluitend via de SECURITY DEFINER-RPC (patroon doelstelling_zetten);
-- lezen mag het eigen bedrijf (KAM/admin). Uitsluitend additief; idempotent.

begin;

create table if not exists public.bedrijf_inspectie_doel (
  company_id    uuid not null references public.companies(id) on delete cascade,
  persoon_id    uuid not null references public.personen(id)  on delete cascade,
  doel_per_jaar integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (company_id, persoon_id),
  constraint inspectie_doel_niet_negatief check (doel_per_jaar >= 0)
);
create index if not exists bedrijf_inspectie_doel_company_idx
  on public.bedrijf_inspectie_doel (company_id);

alter table public.bedrijf_inspectie_doel enable row level security;

-- Alleen-lezen voor het eigen bedrijf; muteren uitsluitend via de RPC (geen write-policy).
drop policy if exists bedrijf_inspectie_doel_sel on public.bedrijf_inspectie_doel;
create policy bedrijf_inspectie_doel_sel on public.bedrijf_inspectie_doel
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- Zetten (upsert) van een inspectie-doel per persoon. Cross-company afgedwongen:
-- de persoon moet bij dit bedrijf horen. Doel 0 = geen doel (wist effectief).
create or replace function public.inspectie_doel_zetten(
  p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel_per_jaar,0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  if not exists (select 1 from personen where id = p_persoon_id and company_id = p_company_id and archived_at is null) then
    raise exception 'Persoon hoort niet bij dit bedrijf';
  end if;
  insert into bedrijf_inspectie_doel (company_id, persoon_id, doel_per_jaar, updated_at)
  values (p_company_id, p_persoon_id, coalesce(p_doel_per_jaar,0), now())
  on conflict (company_id, persoon_id) do update
    set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();
end;
$function$;

grant execute on function public.inspectie_doel_zetten(uuid, uuid, integer) to authenticated, service_role;

commit;
