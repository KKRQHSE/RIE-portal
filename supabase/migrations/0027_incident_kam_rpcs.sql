-- Migratie 0027: incidenten — KAM-afhandeling (Deel 2) + meldlink-beheer
-- ----------------------------------------------------------------------------
-- Mutaties uitsluitend via SECURITY DEFINER-RPC's met null-veilige guard
-- (mag_bedrijf_beheren coalesce't al naar false, Beslissing 62). anon-EXECUTE
-- ingetrokken; alleen authenticated (KAM/admin eigen bedrijf) + service_role.
-- Lezen (lijst/detail) gaat via de RLS-select-policy op incident/incident_foto en
-- de ingelogde sessie — geen leesr-RPC nodig.
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Deel 2 opslaan: oorzaken, maatregelen, status, gevoelige velden.
--    Bedrijf komt uit p_company_id (geguard); de incident moet erbij horen.
-- ============================================================
create or replace function public.incident_deel2_opslaan(
  p_company_id                     uuid,
  p_incident_id                    uuid,
  p_status                         text,
  p_directe_oorzaken               integer[],
  p_basis_oorzaken                 integer[],
  p_oorzaak_toelichting            text,
  p_onderzoeksrapportage_bijgevoegd boolean,
  p_telefonische_melding_directie  boolean,
  p_telefonische_melding_aan       text,
  p_maatregelen_in_actielijst      boolean,
  p_tra_aanpassen                  boolean,
  p_andere_maatregelen             text,
  p_besproken_in_toolbox_datum     date,
  p_functie_slachtoffer            text,
  p_medische_dienst_bezocht        text
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_directe integer[];
  v_basis   integer[];
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;
  if not exists (select 1 from public.incident where id = p_incident_id and company_id = p_company_id) then
    raise exception 'Incident niet gevonden';
  end if;
  if coalesce(p_status,'') not in ('open','in_onderzoek','afgehandeld') then
    raise exception 'Ongeldige status';
  end if;
  if p_medische_dienst_bezocht is not null
     and p_medische_dienst_bezocht not in ('ja','nee','onbekend') then
    raise exception 'Ongeldige waarde medische dienst';
  end if;

  -- Alleen bestaande oorzaakcodes bewaren (onbekende stil negeren).
  select coalesce(array_agg(c order by c), '{}') into v_directe
  from unnest(coalesce(p_directe_oorzaken,'{}')) c
  where exists (select 1 from public.incident_directe_oorzaak d where d.code = c);

  select coalesce(array_agg(c order by c), '{}') into v_basis
  from unnest(coalesce(p_basis_oorzaken,'{}')) c
  where exists (select 1 from public.incident_basis_oorzaak b where b.code = c);

  update public.incident set
    status                          = p_status,
    directe_oorzaken                = v_directe,
    basis_oorzaken                  = v_basis,
    oorzaak_toelichting             = nullif(btrim(coalesce(p_oorzaak_toelichting,'')), ''),
    onderzoeksrapportage_bijgevoegd = coalesce(p_onderzoeksrapportage_bijgevoegd, false),
    telefonische_melding_directie   = coalesce(p_telefonische_melding_directie, false),
    telefonische_melding_aan        = nullif(btrim(coalesce(p_telefonische_melding_aan,'')), ''),
    maatregelen_in_actielijst       = coalesce(p_maatregelen_in_actielijst, false),
    tra_aanpassen                   = coalesce(p_tra_aanpassen, false),
    andere_maatregelen              = nullif(btrim(coalesce(p_andere_maatregelen,'')), ''),
    besproken_in_toolbox_datum      = p_besproken_in_toolbox_datum,
    functie_slachtoffer             = nullif(btrim(coalesce(p_functie_slachtoffer,'')), ''),
    medische_dienst_bezocht         = p_medische_dienst_bezocht,
    afgehandeld_op                  = case
                                        when p_status = 'afgehandeld' then coalesce(afgehandeld_op, now())
                                        else null
                                      end,
    laatst_bijgewerkt_op            = now()
  where id = p_incident_id and company_id = p_company_id;
end;
$function$;

-- ============================================================
-- 2. Meldlink-beheer: ophalen-of-maken, roteren, in-/uitschakelen.
-- ============================================================
create or replace function public.incident_meldlink_zorg(p_company_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link public.incident_meldlink;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  select * into v_link from public.incident_meldlink where company_id = p_company_id;
  if v_link.company_id is null then
    insert into public.incident_meldlink (company_id, token, aangemaakt_door)
    values (
      p_company_id,
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      auth.uid()
    )
    returning * into v_link;
  end if;

  return jsonb_build_object('token', v_link.token, 'ingetrokken', v_link.ingetrokken);
end;
$function$;

create or replace function public.incident_meldlink_roteren(p_company_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_token text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.incident_meldlink (company_id, token, ingetrokken, aangemaakt_op, aangemaakt_door)
  values (p_company_id, v_token, false, now(), auth.uid())
  on conflict (company_id) do update
    set token = excluded.token, ingetrokken = false,
        aangemaakt_op = now(), aangemaakt_door = auth.uid();

  return jsonb_build_object('token', v_token, 'ingetrokken', false);
end;
$function$;

create or replace function public.incident_meldlink_intrekken(p_company_id uuid, p_ingetrokken boolean)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link public.incident_meldlink;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  update public.incident_meldlink
    set ingetrokken = coalesce(p_ingetrokken, true)
  where company_id = p_company_id
  returning * into v_link;

  if v_link.company_id is null then raise exception 'Geen meldlink'; end if;
  return jsonb_build_object('token', v_link.token, 'ingetrokken', v_link.ingetrokken);
end;
$function$;

-- ============================================================
-- 3. Grants — per-bedrijf/KAM: anon dicht (Beslissing 62), alleen authenticated
--    + service_role.
-- ============================================================
revoke execute on function public.incident_deel2_opslaan(uuid, uuid, text, integer[], integer[], text, boolean, boolean, text, boolean, boolean, text, date, text, text) from public, anon;
revoke execute on function public.incident_meldlink_zorg(uuid) from public, anon;
revoke execute on function public.incident_meldlink_roteren(uuid) from public, anon;
revoke execute on function public.incident_meldlink_intrekken(uuid, boolean) from public, anon;

grant execute on function public.incident_deel2_opslaan(uuid, uuid, text, integer[], integer[], text, boolean, boolean, text, boolean, boolean, text, date, text, text) to authenticated, service_role;
grant execute on function public.incident_meldlink_zorg(uuid) to authenticated, service_role;
grant execute on function public.incident_meldlink_roteren(uuid) to authenticated, service_role;
grant execute on function public.incident_meldlink_intrekken(uuid, boolean) to authenticated, service_role;

commit;
