-- Migratie 0020: juridische export toolbox — lees-RPC's (snapshot-only)
-- ----------------------------------------------------------------------------
-- Bewijsmateriaal voor ongevalsonderzoek. Beide RPC's lezen UITSLUITEND het
-- onveranderlijke snapshot in toolbox_deelname; de enige join is naar companies
-- voor de bedrijfsnaam (metadata, geen toolbox-inhoud). NOOIT joinen naar de
-- actuele centrale_toolbox — zo blijft een bewijsstuk volledig reconstrueerbaar
-- ook nadat de centrale toolbox is gewijzigd of gearchiveerd. Puur lezend.
--
-- Toegang: harde mag_bedrijf_beheren-check (admin overal). GRANT alleen aan
-- authenticated + service_role (NIET anon): een werknemer-token kan de export
-- niet eens bereiken. Additief; idempotent.

begin;

-- Eén volledig bewijsstuk uit het bevroren record.
create or replace function public.toolbox_bewijs(p_deelname_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from toolbox_deelname where id = p_deelname_id;
  if v_company is null then raise exception 'Deelname niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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
  join companies c on c.id = d.company_id          -- enige join: bedrijfsnaam (metadata)
  where d.id = p_deelname_id;
  return v;
end;
$function$;

-- Bedrijfsperiode-lijst (KAM/auditor). Snapshot-only; geen handtekening-afbeelding
-- in de lijst (die zit in het individuele bewijsstuk), wel of er getekend is.
create or replace function public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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
    and d.afgerond_op < (p_tot + 1);   -- p_tot inclusief (hele einddag meenemen)
  return v;
end;
$function$;

grant execute on function public.toolbox_bewijs(uuid) to authenticated, service_role;
grant execute on function public.toolbox_bewijs_overzicht(uuid, date, date) to authenticated, service_role;

commit;
