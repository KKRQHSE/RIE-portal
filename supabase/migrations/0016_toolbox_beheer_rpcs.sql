-- Migratie 0016: toolbox-beheer — RPC's (admin centraal + KAM per bedrijf)
-- ----------------------------------------------------------------------------
-- Spiegelt de centrale-bibliotheek-RPC's (0008/0009/0013): centraal alleen admin,
-- per bedrijf via mag_bedrijf_beheren + cross-company-guard, en lokale afwijking
-- blijft leven als centraal archiveert. Additief; idempotent (create or replace).

begin;

-- ============================================================
-- CENTRAAL (admin). Versie hoogt op bij een INHOUDELIJKE wijziging (titel/tekst/
-- video resp. vraagtekst/opties/antwoord/uitleg), niet bij instellingen/herorden —
-- zodat een lokaal afwijkend bedrijf geen vals 'norm gewijzigd'-signaal krijgt.
-- ============================================================
create or replace function public.centrale_toolbox_opslaan(
  p_id uuid, p_titel text, p_tekst text, p_video_url text,
  p_vereist_video boolean, p_vereist_quiz boolean, p_quiz_slaaggrens integer,
  p_quiz_uitleg_modus text, p_toegang text, p_volgorde integer default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid; v_oud record; v_inhoud_wijzigt boolean;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_titel),'') = '' then raise exception 'Titel is verplicht'; end if;

  if p_id is null then
    insert into centrale_toolbox
      (titel, tekst, video_url, vereist_video, vereist_quiz, quiz_slaaggrens,
       quiz_uitleg_modus, toegang, volgorde)
    values
      (btrim(p_titel), coalesce(p_tekst,''), nullif(btrim(coalesce(p_video_url,'')),''),
       coalesce(p_vereist_video,true), coalesce(p_vereist_quiz,false), coalesce(p_quiz_slaaggrens,70),
       coalesce(p_quiz_uitleg_modus,'aan_eind'), coalesce(p_toegang,'link'),
       coalesce(p_volgorde, (select coalesce(max(volgorde),0)+1 from centrale_toolbox)))
    returning id into v_id;
    return v_id;
  end if;

  select titel, tekst, video_url into v_oud from centrale_toolbox where id = p_id;
  if v_oud is null then raise exception 'Toolbox niet gevonden'; end if;
  v_inhoud_wijzigt := (btrim(p_titel) is distinct from v_oud.titel)
                   or (coalesce(p_tekst,'') is distinct from v_oud.tekst)
                   or (nullif(btrim(coalesce(p_video_url,'')),'') is distinct from v_oud.video_url);

  update centrale_toolbox set
    titel = btrim(p_titel), tekst = coalesce(p_tekst,''),
    video_url = nullif(btrim(coalesce(p_video_url,'')),''),
    vereist_video = coalesce(p_vereist_video, vereist_video),
    vereist_quiz = coalesce(p_vereist_quiz, vereist_quiz),
    quiz_slaaggrens = coalesce(p_quiz_slaaggrens, quiz_slaaggrens),
    quiz_uitleg_modus = coalesce(p_quiz_uitleg_modus, quiz_uitleg_modus),
    toegang = coalesce(p_toegang, toegang),
    volgorde = coalesce(p_volgorde, volgorde),
    versie = versie + (case when v_inhoud_wijzigt then 1 else 0 end),
    gewijzigd_op = (case when v_inhoud_wijzigt then now() else gewijzigd_op end)
  where id = p_id;
  return p_id;
end;
$function$;

create or replace function public.centrale_toolbox_archiveren(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from centrale_toolbox where id = p_id) then raise exception 'Toolbox niet gevonden'; end if;
  update centrale_toolbox set gearchiveerd_op = coalesce(gearchiveerd_op, now()) where id = p_id;
end;
$function$;

create or replace function public.centrale_toolbox_vraag_opslaan(
  p_id uuid, p_toolbox_id uuid, p_vraagtekst text, p_opties jsonb,
  p_juist_antwoord integer, p_uitleg text, p_volgorde integer default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid; v_oud record; v_wijzigt boolean;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_vraagtekst),'') = '' then raise exception 'Vraagtekst is verplicht'; end if;
  if p_opties is null or jsonb_typeof(p_opties) <> 'array' or jsonb_array_length(p_opties) < 2 then
    raise exception 'Geef minstens twee antwoordopties';
  end if;
  if p_juist_antwoord < 0 or p_juist_antwoord >= jsonb_array_length(p_opties) then
    raise exception 'Het juiste antwoord verwijst naar een niet-bestaande optie';
  end if;

  if p_id is null then
    if not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then raise exception 'Toolbox niet gevonden'; end if;
    insert into centrale_toolbox_vraag (toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde)
    values (p_toolbox_id, btrim(p_vraagtekst), p_opties, p_juist_antwoord, nullif(btrim(coalesce(p_uitleg,'')),''),
            coalesce(p_volgorde, (select coalesce(max(volgorde),0)+1 from centrale_toolbox_vraag where toolbox_id = p_toolbox_id)))
    returning id into v_id;
    return v_id;
  end if;

  select vraagtekst, opties, juist_antwoord, uitleg into v_oud from centrale_toolbox_vraag where id = p_id;
  if v_oud is null then raise exception 'Vraag niet gevonden'; end if;
  v_wijzigt := (btrim(p_vraagtekst) is distinct from v_oud.vraagtekst)
            or (p_opties is distinct from v_oud.opties)
            or (p_juist_antwoord is distinct from v_oud.juist_antwoord)
            or (nullif(btrim(coalesce(p_uitleg,'')),'') is distinct from v_oud.uitleg);

  update centrale_toolbox_vraag set
    vraagtekst = btrim(p_vraagtekst), opties = p_opties, juist_antwoord = p_juist_antwoord,
    uitleg = nullif(btrim(coalesce(p_uitleg,'')),''), volgorde = coalesce(p_volgorde, volgorde),
    versie = versie + (case when v_wijzigt then 1 else 0 end),
    gewijzigd_op = (case when v_wijzigt then now() else gewijzigd_op end)
  where id = p_id;
  return p_id;
end;
$function$;

create or replace function public.centrale_toolbox_vraag_archiveren(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from centrale_toolbox_vraag where id = p_id) then raise exception 'Vraag niet gevonden'; end if;
  update centrale_toolbox_vraag set gearchiveerd_op = coalesce(gearchiveerd_op, now()) where id = p_id;
end;
$function$;

-- ============================================================
-- PER BEDRIJF (mag_bedrijf_beheren). Koppelen/afwijken/doelstelling. Cross-company
-- afgedwongen; afwijken kan alleen op een gekoppelde toolbox.
-- ============================================================
create or replace function public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if not exists (select 1 from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null) then
    raise exception 'Toolbox niet gevonden of gearchiveerd';
  end if;
  insert into bedrijf_toolbox (company_id, toolbox_id) values (p_company_id, p_toolbox_id)
  on conflict (company_id, toolbox_id) do nothing;
end;
$function$;

create or replace function public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;

create or replace function public.toolbox_lokaal_aanpassen(
  p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_versie integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_lokale_tekst),'') = '' then raise exception 'Lokale tekst is verplicht'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_toolbox_afwijking
    (company_id, toolbox_id, modus, lokale_titel, lokale_tekst, lokale_video_url, basis_versie)
  values
    (p_company_id, p_toolbox_id, 'lokaal', nullif(btrim(coalesce(p_lokale_titel,'')),''),
     btrim(p_lokale_tekst), nullif(btrim(coalesce(p_lokale_video_url,'')),''), v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='lokaal', lokale_titel=excluded.lokale_titel, lokale_tekst=excluded.lokale_tekst,
        lokale_video_url=excluded.lokale_video_url, basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;

create or replace function public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_versie integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;
  insert into bedrijf_toolbox_afwijking (company_id, toolbox_id, modus, basis_versie)
  values (p_company_id, p_toolbox_id, 'uit', v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='uit', lokale_titel=null, lokale_tekst=null, lokale_video_url=null,
        basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;

create or replace function public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from bedrijf_toolbox_afwijking where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;

create or replace function public.doelstelling_zetten(p_company_id uuid, p_functiegroep_id uuid, p_doel_per_jaar integer)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel_per_jaar,0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  -- Cross-company: de functiegroep moet bij dit bedrijf horen.
  if not exists (select 1 from functiegroep where id = p_functiegroep_id and company_id = p_company_id) then
    raise exception 'Functiegroep hoort niet bij dit bedrijf';
  end if;
  insert into bedrijf_doelstelling (company_id, functiegroep_id, doel_per_jaar, updated_at)
  values (p_company_id, p_functiegroep_id, p_doel_per_jaar, now())
  on conflict (company_id, functiegroep_id) do update
    set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();
end;
$function$;

-- Volledig toolbox-overzicht voor de KAM (koppeling + lokale afwijking + geldende
-- inhoud), met de survive-archivering-logica van de centrale bibliotheek (0013).
create or replace function public.bedrijf_toolbox_overzicht(p_company_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select coalesce(jsonb_agg(row order by volg, tid), '[]'::jsonb) into v
  from (
    select t.volgorde as volg, t.id as tid, jsonb_build_object(
      'toolbox_id',        t.id,
      'volgorde',          t.volgorde,
      'gekoppeld',         exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id),
      'centrale_titel',    t.titel,
      'centrale_tekst',    t.tekst,
      'centrale_video_url', t.video_url,
      'centrale_versie',   t.versie,
      'vereist_video',     t.vereist_video,
      'vereist_quiz',      t.vereist_quiz,
      'quiz_uitleg_modus', t.quiz_uitleg_modus,
      'toegang',           t.toegang,
      'quiz_aantal',       (select count(*) from centrale_toolbox_vraag q where q.toolbox_id=t.id and q.gearchiveerd_op is null),
      'centraal_vervallen', (t.gearchiveerd_op is not null),
      'afwijking', case when a.toolbox_id is null then null else jsonb_build_object(
        'modus', a.modus, 'lokale_titel', a.lokale_titel, 'lokale_tekst', a.lokale_tekst,
        'lokale_video_url', a.lokale_video_url, 'basis_versie', a.basis_versie) end,
      'norm_gewijzigd', (a.toolbox_id is not null and t.gearchiveerd_op is null and t.versie > a.basis_versie),
      'actief', (a.toolbox_id is null or a.modus <> 'uit'),
      'geldende_titel', case when a.modus='lokaal' and a.lokale_titel is not null then a.lokale_titel else t.titel end,
      'geldende_tekst', case when a.modus='lokaal' then a.lokale_tekst else t.tekst end,
      'geldende_video_url', case when a.modus='lokaal' and a.lokale_video_url is not null then a.lokale_video_url else t.video_url end
    ) as row
    from centrale_toolbox t
    left join bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = p_company_id
    where t.gearchiveerd_op is null
       or exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id
                    and a.modus = 'lokaal')
  ) s;
  return v;
end;
$function$;

grant execute on function public.centrale_toolbox_opslaan(uuid, text, text, text, boolean, boolean, integer, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.centrale_toolbox_archiveren(uuid) to anon, authenticated, service_role;
grant execute on function public.centrale_toolbox_vraag_opslaan(uuid, uuid, text, jsonb, integer, text, integer) to anon, authenticated, service_role;
grant execute on function public.centrale_toolbox_vraag_archiveren(uuid) to anon, authenticated, service_role;
grant execute on function public.toolbox_koppelen(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.toolbox_ontkoppelen(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.toolbox_lokaal_aanpassen(uuid, uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.toolbox_uitzetten(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.toolbox_terug_naar_centraal(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.doelstelling_zetten(uuid, uuid, integer) to anon, authenticated, service_role;
grant execute on function public.bedrijf_toolbox_overzicht(uuid) to anon, authenticated, service_role;

commit;
