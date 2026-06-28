-- Migratie 0021: export-RPC's dichtzetten voor anon/token + null-veilige guard
-- ----------------------------------------------------------------------------
-- De isolatietest legde bloot dat een anon-caller (geen login, geen token) de
-- export-RPC's kon bereiken: (1) een nieuwe functie krijgt standaard EXECUTE voor
-- anon/PUBLIC, en (2) mag_bedrijf_beheren geeft voor een caller zónder auth NULL
-- terug, waardoor `if not mag_bedrijf_beheren(...)` de raise oversloeg (3-waardige
-- logica: `not null` = null → IF niet uitgevoerd).
--
-- Twee lagen dichtgezet, uitsluitend voor de export (lees-RPC's):
--   1. Null-veilige guard: `if not coalesce(mag_bedrijf_beheren(...), false)`.
--   2. EXECUTE intrekken voor PUBLIC + anon; alleen authenticated + service_role.
-- Geen datawijziging — alleen functiedefinitie + privileges. Idempotent.

begin;

create or replace function public.toolbox_bewijs(p_deelname_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from toolbox_deelname where id = p_deelname_id;
  if v_company is null then raise exception 'Deelname niet gevonden'; end if;
  if not coalesce(mag_bedrijf_beheren(v_company), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'id',                    d.id,
    'company_id',            d.company_id,
    'bedrijf_naam',          c.name,
    'bewijssoort',           d.bewijssoort,
    'bevestigde_naam',       d.bevestigde_naam,
    'naam_bevestigd',        d.naam_bevestigd,
    'afgerond_op',           d.afgerond_op,
    'titel_snap',            d.titel_snap,
    'tekst_snap',            d.tekst_snap,
    'video_url_snap',        d.video_url_snap,
    'video_bekeken',         d.video_bekeken,
    'quiz_snap',             d.quiz_snap,
    'quiz_resultaat',        d.quiz_resultaat,
    'handtekening',          d.handtekening,
    'handtekening_gezet_op', d.handtekening_gezet_op,
    'presentielijst_pad',    d.presentielijst_pad
  ) into v
  from toolbox_deelname d
  join companies c on c.id = d.company_id
  where d.id = p_deelname_id;
  return v;
end;
$function$;

create or replace function public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not coalesce(mag_bedrijf_beheren(p_company_id), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              d.id,
    'bevestigde_naam', d.bevestigde_naam,
    'titel_snap',      d.titel_snap,
    'afgerond_op',     d.afgerond_op,
    'getekend',        (d.handtekening is not null and btrim(d.handtekening) <> ''),
    'bewijssoort',     d.bewijssoort,
    'quiz_resultaat',  d.quiz_resultaat
  ) order by d.afgerond_op desc, d.id), '[]'::jsonb)
  into v
  from toolbox_deelname d
  where d.company_id = p_company_id
    and d.afgerond_op >= p_van
    and d.afgerond_op < (p_tot + 1);
  return v;
end;
$function$;

-- Anon/PUBLIC mag de export niet bereiken; alleen ingelogde KAM/admin + service_role.
revoke execute on function public.toolbox_bewijs(uuid) from public;
revoke execute on function public.toolbox_bewijs(uuid) from anon;
revoke execute on function public.toolbox_bewijs_overzicht(uuid, date, date) from public;
revoke execute on function public.toolbox_bewijs_overzicht(uuid, date, date) from anon;

grant execute on function public.toolbox_bewijs(uuid) to authenticated, service_role;
grant execute on function public.toolbox_bewijs_overzicht(uuid, date, date) to authenticated, service_role;

commit;
