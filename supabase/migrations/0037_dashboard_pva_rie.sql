-- Migratie 0037: RI&E-gescopete PvA-voortgang voor het dashboard
-- ----------------------------------------------------------------------------
-- "Plan van Aanpak RI&E" is niet hetzelfde als de centrale actielijst: de PvA
-- telt alléén de uit de RI&E voortgekomen acties, terwijl de actielijst álle
-- bronnen (RI&E, inspectie, incident, audit, los) omvat. Deze kleine RPC geeft
-- de RI&E-gescopete voortgang voor de dashboard-gauge. Additief; guarded;
-- anon-EXECUTE eruit (Beslissing 62). dashboard_overzicht blijft ongewijzigd.
--
-- RI&E-origin = geen bron_type én (rie_versie_id óf tree óf ref gevuld). Dit
-- sluit los ('los'), inspectie/audit (bron_type gezet) en incident (bron_type
-- null zonder tree/ref) uit — gelijk aan lib/actie-herkomst.

create or replace function public.dashboard_pva_rie(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    'totaal',         count(*),
    'open',           count(*) filter (where status = 'Open'),
    'in_behandeling', count(*) filter (where status = 'In behandeling'),
    'afgerond',       count(*) filter (where status = 'Afgerond'),
    'pct', case when count(*) > 0
                then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
                else 0 end
  ) into v
  from pva_items
  where company_id = p_company_id
    and bron_type is null
    and (rie_versie_id is not null
         or nullif(btrim(coalesce(tree, '')), '') is not null
         or nullif(btrim(coalesce(ref,  '')), '') is not null);

  return v;
end;
$function$;

revoke execute on function public.dashboard_pva_rie(uuid) from public;
grant  execute on function public.dashboard_pva_rie(uuid) to authenticated, service_role;
