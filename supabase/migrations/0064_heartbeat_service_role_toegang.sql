-- ============================================================================
-- Heartbeat-RPC accepteert de service-role
-- ----------------------------------------------------------------------------
-- Gevonden in de systeemdoorlichting van 4 september 2026 (bevinding 1.2 /
-- P2 uit AANSCHERPING_systeemdoorlichting_2026-09-04.md): de automatische
-- herinner-heartbeat (app/api/herinneringen/heartbeat, aangeroepen door
-- pg_cron, geauthenticeerd met een gedeeld geheim in de x-heartbeat-secret-
-- header) draait met de service-role. herinner_kandidaten opende met
-- `if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen
-- toegang'` — en mag_bedrijf_beheren/is_admin/my_company_id leunen op
-- auth.uid(), dat er bij de service-role niet is. Voor élk bedrijf faalde
-- dus élke aanroep: verstuurd bleef altijd 0.
--
-- Fix: de RPC accepteert nu óók auth.role() = 'service_role'. Dit breidt
-- niets uit — de service-role bypassed RLS toch al op elke tabel die deze
-- RPC raakt (personen, deellinks, pva_items, herinnering_log); deze RPC was
-- voor die rol het enige (kapotte) obstakel, geen echte grens. EXECUTE staat
-- al alleen open voor authenticated/service_role (nooit anon), dus er komt
-- geen nieuw publiek pad bij.
-- ============================================================================

create or replace function public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean default false)
returns table(persoon_id uuid, naam text, email text, token text, acties jsonb)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_ritme text;
  v_interval interval;
begin
  -- Toegang: beheerder van dit bedrijf, admin, of de vertrouwde service-role
  -- (de automatische heartbeat — die authenticeert al zelf met een gedeeld
  -- geheim in de route, vóórdat deze RPC ooit wordt aangeroepen).
  if not (public.mag_bedrijf_beheren(p_company_id) or auth.role() = 'service_role') then
    raise exception 'Geen toegang';
  end if;

  select coalesce(hi.ritme, 'uit') into v_ritme
  from public.herinner_instelling hi
  where hi.company_id = p_company_id;
  if v_ritme is null then v_ritme := 'uit'; end if;

  if p_alleen_ritme and v_ritme = 'uit' then
    return;
  end if;

  v_interval := case v_ritme
    when 'dagelijks'   then interval '1 day'
    when 'wekelijks'   then interval '7 days'
    when 'maandelijks' then interval '30 days'
    else interval '1000 years'
  end;

  return query
  select
    p.id as persoon_id,
    p.naam,
    p.email,
    d.token,
    coalesce(
      (select jsonb_agg(jsonb_build_object('nr', a.nr, 'onderwerp', a.onderwerp) order by a.nr)
       from public.pva_items a
       where a.persoon_id = p.id
         and a.company_id = p_company_id
         and coalesce(a.status, 'Open') <> 'Afgerond'),
      '[]'::jsonb
    ) as acties
  from public.personen p
  join public.deellinks d
    on d.persoon_id = p.id
   and d.ingetrokken = false
   and (d.vervalt_op is null or d.vervalt_op > now())
  where p.company_id = p_company_id
    and p.archived_at is null
    and p.email is not null
    and btrim(p.email) <> ''
    and exists (
      select 1 from public.pva_items a
      where a.persoon_id = p.id
        and a.company_id = p_company_id
        and coalesce(a.status, 'Open') <> 'Afgerond'
    )
    and public.mag_herinneren(p.id)
    and (
      not p_alleen_ritme
      or not exists (
        select 1 from public.herinnering_log hl
        where hl.persoon_id = p.id
          and hl.verzonden_op > now() - v_interval
      )
    );
end;
$function$;
