-- Migratie 0034: instelbaar jaartarget voor toolbox-sessies + in het overzicht
-- ----------------------------------------------------------------------------
-- De herziene toolbox-view beantwoordt "wat is er per maand gehouden en zitten we
-- op target?". Daarvoor een per-bedrijf instelbaar jaartarget (aantal toolbox-
-- sessies per jaar; default 12 = maandelijks). Alleen-lezen eigen bedrijf; muteren
-- via SECURITY DEFINER-RPC met mag_bedrijf_beheren-guard, anon-EXECUTE eruit
-- (Beslissing 62). Additief/idempotent.

begin;

create table if not exists public.bedrijf_toolbox_instelling (
  company_id           uuid primary key references public.companies(id) on delete cascade,
  sessie_doel_per_jaar integer not null default 12 check (sessie_doel_per_jaar >= 0),
  updated_at           timestamptz not null default now()
);

alter table public.bedrijf_toolbox_instelling enable row level security;

drop policy if exists bedrijf_toolbox_instelling_sel on public.bedrijf_toolbox_instelling;
create policy bedrijf_toolbox_instelling_sel on public.bedrijf_toolbox_instelling
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

create or replace function public.toolbox_sessie_doel_zetten(p_company_id uuid, p_doel integer)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel, 0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  insert into bedrijf_toolbox_instelling (company_id, sessie_doel_per_jaar, updated_at)
  values (p_company_id, coalesce(p_doel, 0), now())
  on conflict (company_id) do update
    set sessie_doel_per_jaar = excluded.sessie_doel_per_jaar, updated_at = now();
end;
$function$;

revoke execute on function public.toolbox_sessie_doel_zetten(uuid, integer) from public;
grant execute on function public.toolbox_sessie_doel_zetten(uuid, integer) to authenticated, service_role;

-- Overzicht uitbreiden met het jaartarget (default 12 als er niets is ingesteld).
create or replace function public.toolbox_sessies_overzicht(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'totaal_sessies', (select count(*) from toolbox_sessie s where s.company_id = p_company_id),
    'sessie_doel_per_jaar', coalesce(
      (select sessie_doel_per_jaar from bedrijf_toolbox_instelling where company_id = p_company_id), 12),
    'sessies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessie_id', s.id,
        'datum',     s.datum,
        'onderwerp', s.onderwerp,
        'notitie',   s.notitie,
        'toolbox_id', s.toolbox_id,
        'opkomst', (select count(*) from toolbox_deelname d where d.sessie_id = s.id),
        'aanwezigen', (
          select coalesce(jsonb_agg(d.persoon_id), '[]'::jsonb)
          from toolbox_deelname d where d.sessie_id = s.id
        )
      ) order by s.datum desc, s.created_at desc), '[]'::jsonb)
      from toolbox_sessie s where s.company_id = p_company_id
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', p.id,
        'naam', p.naam,
        'functiegroep_naam', fg.naam,
        'bijgewoond', (
          select count(*) from toolbox_deelname d
          join toolbox_sessie s2 on s2.id = d.sessie_id
          where d.persoon_id = p.id and s2.company_id = p_company_id
        )
      ) order by p.naam), '[]'::jsonb)
      from personen p
      left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
      where p.company_id = p_company_id and p.archived_at is null
    )
  ) into v;
  return v;
end;
$function$;

commit;
