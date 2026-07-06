-- Migratie 0029: toolbox-sessies — RPC's (beheer + aanwezigheid + overzicht)
-- ----------------------------------------------------------------------------
-- Alle mutatie loopt via SECURITY DEFINER-RPC's met mag_bedrijf_beheren (KAM/admin
-- van het eigen bedrijf); NIET via de anonieme werknemer-tokenflow. Spiegelt het
-- patroon van 0016/0020. Additief; idempotent (create or replace).
--
-- Aanwezigheid aan/uit = INSERT / DELETE van een fysiek_aanwezig-deelname (nooit
-- UPDATE → botst niet met de onveranderlijkheids-trigger). toolbox_id blijft NULL
-- zodat de twee telwijzen strikt gescheiden blijven (zie 0028).

begin;

-- ============================================================
-- Sessie opslaan (nieuw of bijwerken). De sessie is metadata → muteerbaar.
-- ============================================================
create or replace function public.toolbox_sessie_opslaan(
  p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text,
  p_notitie text, p_toolbox_id uuid default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_onderwerp),'') = '' then raise exception 'Onderwerp is verplicht'; end if;
  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  -- Optionele referentie naar een centrale toolbox: als opgegeven, moet hij bestaan.
  if p_toolbox_id is not null and not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then
    raise exception 'Gekozen toolbox bestaat niet';
  end if;

  if p_sessie_id is null then
    insert into toolbox_sessie (company_id, datum, onderwerp, notitie, toolbox_id, aangemaakt_door)
    values (p_company_id, p_datum, btrim(p_onderwerp), nullif(btrim(coalesce(p_notitie,'')),''), p_toolbox_id, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  -- Bijwerken: alleen binnen het eigen bedrijf (cross-company-guard via company_id).
  update toolbox_sessie set
    datum = p_datum, onderwerp = btrim(p_onderwerp),
    notitie = nullif(btrim(coalesce(p_notitie,'')),''), toolbox_id = p_toolbox_id,
    updated_at = now()
  where id = p_sessie_id and company_id = p_company_id;
  if not found then raise exception 'Sessie niet gevonden'; end if;
  return p_sessie_id;
end;
$function$;

-- ============================================================
-- Sessie verwijderen. Cascade (0028) ruimt de aanwezigheidsrijen op.
-- ============================================================
create or replace function public.toolbox_sessie_verwijderen(p_sessie_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_company uuid;
begin
  select company_id into v_company from toolbox_sessie where id = p_sessie_id;
  if v_company is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from toolbox_sessie where id = p_sessie_id;
end;
$function$;

-- ============================================================
-- Aanwezigheid zetten: aanwezig=true → fysiek_aanwezig-deelname insert (idempotent);
-- aanwezig=false → delete. Afwezigheid = simpelweg geen rij (GEEN achterstand).
-- ============================================================
create or replace function public.toolbox_sessie_aanwezigheid_zetten(
  p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sessie  record;
  v_persoon record;
begin
  select id, company_id, datum, onderwerp, notitie into v_sessie
    from toolbox_sessie where id = p_sessie_id;
  if v_sessie.id is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_sessie.company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  -- Cross-company-guard: de persoon moet bij hetzelfde bedrijf horen en actief zijn.
  select id, naam, company_id into v_persoon
    from personen where id = p_persoon_id and archived_at is null;
  if v_persoon.id is null then raise exception 'Persoon niet gevonden'; end if;
  if v_persoon.company_id <> v_sessie.company_id then raise exception 'Persoon hoort niet bij dit bedrijf'; end if;

  if coalesce(p_aanwezig, false) then
    insert into toolbox_deelname (
      company_id, persoon_id, toolbox_id, sessie_id, bewijssoort,
      titel_snap, tekst_snap, afgerond_op,
      naam_bevestigd, bevestigde_naam
    ) values (
      v_sessie.company_id, v_persoon.id, null, v_sessie.id, 'fysiek_aanwezig',
      v_sessie.onderwerp, coalesce(v_sessie.notitie, ''), v_sessie.datum::timestamptz,
      false, v_persoon.naam
    )
    on conflict (sessie_id, persoon_id) where sessie_id is not null do nothing;
  else
    delete from toolbox_deelname where sessie_id = p_sessie_id and persoon_id = p_persoon_id;
  end if;
end;
$function$;

-- ============================================================
-- Overzicht: per sessie de opkomst + aanwezigen; per persoon het aantal bijgewoonde
-- sessies (NEUTRAAL — geen doel, geen achterstand, geen rood). Puur lezend.
-- ============================================================
create or replace function public.toolbox_sessies_overzicht(p_company_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'totaal_sessies', (select count(*) from toolbox_sessie s where s.company_id = p_company_id),
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

-- Beheer/overzicht uitsluitend voor ingelogde KAM/admin (NIET anon/tokenflow).
grant execute on function public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid) to authenticated, service_role;
grant execute on function public.toolbox_sessie_verwijderen(uuid) to authenticated, service_role;
grant execute on function public.toolbox_sessie_aanwezigheid_zetten(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.toolbox_sessies_overzicht(uuid) to authenticated, service_role;

commit;
