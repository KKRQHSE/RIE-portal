-- Migratie 0074: project/locatie op inspecties + directe persoon-koppeling bij start
-- ----------------------------------------------------------------------------
-- Nachtbouw 5/6 sept 2026, Fase 1 (datagaten dichten).
--
-- 1. project_locatie: vrij tekstveld op `inspectie`, invulbaar bij het starten/
--    uitvoeren. Er was nog geen gestructureerd project/locatie-veld, waardoor
--    inspecties nooit per project herleidbaar/filterbaar waren. Additief;
--    bestaande rijen krijgen NULL (geen historische data verzonnen).
--
-- 2. inspectie.persoon_id werd bij het starten nooit gevuld — de koppeling naar
--    de concrete persoon liep via een omweg (inspectie_historie.wie -> users ->
--    geen directe personen-link). inspectie_start/inspectie_start_centraal
--    vullen persoon_id nu automatisch vanuit personen.user_id = auth.uid()
--    (de eerste actieve persoon bij dit bedrijf die aan dit account hangt).
--    Ontbreekt die koppeling (personen.user_id niet gezet), dan blijft
--    persoon_id NULL en blijft de bestaande omweg via inspectie_historie/users
--    het enige spoor -- geen breaking change voor bestaand gedrag.
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. project_locatie-kolom
-- ============================================================
ALTER TABLE public.inspectie ADD COLUMN IF NOT EXISTS project_locatie text;

CREATE OR REPLACE FUNCTION public.inspectie_project_opslaan(p_inspectie_id uuid, p_project_locatie text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company uuid;
  v_status  text;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  update inspectie
     set project_locatie = nullif(btrim(coalesce(p_project_locatie, '')), '')
   where id = p_inspectie_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.inspectie_project_opslaan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspectie_project_opslaan(uuid, text) TO authenticated, service_role;

-- inspectie_bibliotheek en inspectie_rapport tonen het veld voortaan mee.
CREATE OR REPLACE FUNCTION public.inspectie_bibliotheek(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(row order by sort_datum desc nulls last), '[]'::jsonb)
  into v
  from (
    select
      coalesce(i.uitgevoerd_op, i.aangemaakt_op) as sort_datum,
      jsonb_build_object(
        'id',                 i.id,
        'company_id',         i.company_id,
        'sjabloon_id',        i.sjabloon_id,
        'persoon_id',         i.persoon_id,
        'status',             i.status,
        'gepland_op',         i.gepland_op,
        'uitgevoerd_op',      i.uitgevoerd_op,
        'aangemaakt_op',      i.aangemaakt_op,
        'conclusie',          i.conclusie,
        'project_locatie',    i.project_locatie,
        'sjabloon_naam_snap', i.sjabloon_naam_snap,
        'controlesoort_snap', i.controlesoort_snap,
        'uitvoerder_naam', coalesce(
          (select u.naam
             from inspectie_historie h
             left join users u on u.id = h.wie
            where h.inspectie_id = i.id and h.wie is not null
            order by h.wanneer asc
            limit 1),
          (select pp.naam from personen pp where pp.id = i.persoon_id)
        ),
        'aantal_punten',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id),
        'aantal_niet_in_orde', (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.resultaat = 'niet_in_orde'),
        'aantal_acties',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.actie_id is not null)
      ) as row
    from inspectie i
    where i.company_id = p_company_id
  ) s;

  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspectie_rapport(p_inspectie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    'id',             i.id,
    'company_id',     i.company_id,
    'company_naam',   c.name,
    'naam',           i.sjabloon_naam_snap,
    'controlesoort',  i.controlesoort_snap,
    'status',         i.status,
    'gepland_op',     i.gepland_op,
    'uitgevoerd_op',  i.uitgevoerd_op,
    'aangemaakt_op',  i.aangemaakt_op,
    'conclusie',      i.conclusie,
    'project_locatie', i.project_locatie,
    'uitvoerder_naam', (
      select u.naam
        from inspectie_historie h
        left join users u on u.id = h.wie
       where h.inspectie_id = i.id and h.wie is not null
       order by h.wanneer asc
       limit 1
    ),

    'bevindingen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',               b.id,
        'volgorde',         b.volgorde,
        'rubriek_naam_snap', b.rubriek_naam_snap,
        'punt_tekst_snap',  b.punt_tekst_snap,
        'verplicht',        b.verplicht,
        'resultaat',        b.resultaat,
        'afhandeling',      b.afhandeling,
        'opmerking',        b.opmerking,
        'actie_id',         b.actie_id,
        'actie_nr',         pa.nr,
        'ai_voorwerk', (
          select jsonb_build_object(
            'leverancier',        s.leverancier,
            'model',              s.model,
            'besloten_op',        s.besloten_op,
            'besloten_door_naam', au.naam
          )
          from inspectie_ai_suggestie s
          left join users au on au.id = s.besloten_door
          where s.bevinding_id = b.id
            and s.status = 'overgenomen'
          order by s.besloten_op desc nulls last
          limit 1
        )
      ) order by b.volgorde, b.id), '[]'::jsonb)
      from inspectie_bevinding b
      left join pva_items pa on pa.id = b.actie_id
      where b.inspectie_id = i.id
    ),

    'acties', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'nr',        p.nr,
        'onderwerp', p.onderwerp,
        'status',    p.status,
        'prio',      p.prio
      ) order by (case when p.nr ~ '^[0-9]+$' then p.nr::int else null end) nulls last, p.nr), '[]'::jsonb)
      from pva_items p
      where p.company_id = i.company_id
        and p.bron_type = 'inspectie_bevinding'
        and p.bron_id in (select b.id from inspectie_bevinding b where b.inspectie_id = i.id)
    ),

    'historie', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',       h.id,
        'wijziging', h.wijziging,
        'wanneer',  h.wanneer,
        'wie_naam', u.naam
      ) order by h.wanneer asc, h.id), '[]'::jsonb)
      from inspectie_historie h
      left join users u on u.id = h.wie
      where h.inspectie_id = i.id
    )
  ) into v
  from inspectie i
  join companies c on c.id = i.company_id
  where i.id = p_inspectie_id;

  return v;
end;
$function$;

-- ============================================================
-- 2. persoon_id automatisch vullen bij het starten
-- ============================================================
CREATE OR REPLACE FUNCTION public.inspectie_start(p_sjabloon_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company   uuid;
  v_naam      text;
  v_soort     text;
  v_actief    boolean;
  v_arch      timestamptz;
  v_inspectie uuid;
  v_persoon   uuid;
begin
  select company_id, naam, controlesoort, actief, gearchiveerd_op
    into v_company, v_naam, v_soort, v_actief, v_arch
    from inspectie_sjabloon
   where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_arch is not null or coalesce(v_actief, false) = false then
    raise exception 'Sjabloon is gearchiveerd of inactief';
  end if;

  select id into v_persoon from personen
   where user_id = auth.uid() and company_id = v_company and archived_at is null
   order by created_at asc
   limit 1;

  insert into inspectie (company_id, sjabloon_id, persoon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (v_company, p_sjabloon_id, v_persoon, 'concept', v_naam, v_soort)
  returning id into v_inspectie;

  insert into inspectie_bevinding (company_id, inspectie_id, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select v_company, v_inspectie, punt.tekst, coalesce(punt.verplicht, false), coalesce(punt.volgorde, 0), 'geen'
    from inspectie_sjabloon_punt punt
   where punt.sjabloon_id = p_sjabloon_id
   order by punt.volgorde;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, v_inspectie, auth.uid(), now(), 'Inspectie gestart');

  return v_inspectie;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspectie_start_centraal(p_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspectie uuid;
  v_aantal    integer;
  v_persoon   uuid;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select id into v_persoon from personen
   where user_id = auth.uid() and company_id = p_company_id and archived_at is null
   order by created_at asc
   limit 1;

  insert into inspectie (company_id, sjabloon_id, persoon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (p_company_id, null, v_persoon, 'concept', 'Werkplekinspectie (norm)', null)
  returning id into v_inspectie;

  -- Effectieve vragen: gekoppelde rubrieken; de geldende tekst (lokaal/centraal);
  -- zonder uitgezette vragen; archivering laat een LOKAAL behouden vraag staan.
  with eff as (
    select
      r.naam     as rubriek_naam,
      r.volgorde as rub_volg,
      q.volgorde as vraag_volg,
      q.id       as vraag_id,
      case when a.modus = 'lokaal' then a.lokale_tekst else q.tekst end as tekst
    from bedrijf_rubriek br
    join centrale_rubriek r on r.id = br.rubriek_id
    join centrale_vraag   q on q.rubriek_id = r.id
    left join bedrijf_vraag_afwijking a
      on a.vraag_id = q.id and a.company_id = p_company_id
    where br.company_id = p_company_id
      and coalesce(a.modus, '') <> 'uit'
      and (
        (q.gearchiveerd_op is null and r.gearchiveerd_op is null)
        or a.modus = 'lokaal'
      )
  )
  insert into inspectie_bevinding
    (company_id, inspectie_id, rubriek_naam_snap, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select
    p_company_id, v_inspectie, rubriek_naam, tekst, true,
    row_number() over (order by rub_volg, vraag_volg, vraag_id),
    'geen'
  from eff;

  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then
    raise exception 'Koppel eerst rubrieken met vragen voordat je een inspectie start';
  end if;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (p_company_id, v_inspectie, auth.uid(), now(), 'Inspectie gestart vanuit de norm');

  return v_inspectie;
end;
$function$;

commit;
