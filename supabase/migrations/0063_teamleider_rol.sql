-- Migratie 0063: teamleider-rol — tweede poort mag_bedrijf_werken naast mag_bedrijf_beheren
-- ----------------------------------------------------------------------------
-- Ontwerp: mag_bedrijf_beheren wordt VERENGD (sluit teamleider nu uit, naast
-- cross-company); alles wat via die functie gegated is staat DUS automatisch
-- dicht voor teamleider tenzij hieronder expliciet naar mag_bedrijf_werken
-- (= mag_bedrijf_beheren OR teamleider binnen eigen bedrijf) verplaatst.
-- Fail-closed: alleen de expliciet toegestane RPC's/policies hieronder gaan open.
--
-- Teamleider mag: inspecties uitvoeren/afronden (elke inspectie in het bedrijf,
-- geen extra KAM-stap), toolbox-sessies registreren/bewerken (elke sessie),
-- alleen EIGEN sessies verwijderen, incidenten melden (bestaande publieke
-- meldlink, geen wijziging nodig) + oorzaakanalyse zonder medische velden,
-- acties inzien + status zetten via een smalle RPC (elke actie in het bedrijf),
-- doelstellingen zien, de volledige RI&E doorbladeren (alleen lezen).
-- Teamleider mag NIET: doelstellingen/bedrijfsvoering/personen/AVG wijzigen,
-- medische incidentvelden zien, audits.
--
-- Additief; idempotent (CREATE OR REPLACE + DROP POLICY IF EXISTS).

begin;

-- ============================================================
-- 1. Rol toevoegen aan de CHECK-constraint.
-- ============================================================
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['client'::text, 'admin'::text, 'teamleider'::text]));

-- ============================================================
-- 2. is_teamleider() — zelfde stijl als is_admin().
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_teamleider()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'teamleider' from public.users where id = auth.uid()), false)
$function$;

-- ============================================================
-- 3. mag_bedrijf_beheren VERENGD: sluit teamleider uit (fail-closed default).
-- ============================================================
CREATE OR REPLACE FUNCTION public.mag_bedrijf_beheren(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.is_admin() or (
      p_company_id = public.my_company_id() and not public.is_teamleider()
    ),
    false
  )
$function$;

-- ============================================================
-- 4. mag_bedrijf_werken NIEUW: mag_bedrijf_beheren OF teamleider eigen bedrijf.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mag_bedrijf_werken(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.mag_bedrijf_beheren(p_company_id) or (
      p_company_id = public.my_company_id() and public.is_teamleider()
    ),
    false
  )
$function$;

-- ============================================================
-- 5. RLS: SELECT-policies verbreden naar mag_bedrijf_werken (alleen lezen).
--    Dit is de expliciete allow-list — alle andere mag_bedrijf_beheren-
--    policies blijven ongewijzigd (dus automatisch dicht voor teamleider).
-- ============================================================
DROP POLICY IF EXISTS inspectie_sel ON public.inspectie;
CREATE POLICY inspectie_sel ON public.inspectie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_ai_suggestie_sel ON public.inspectie_ai_suggestie;
CREATE POLICY inspectie_ai_suggestie_sel ON public.inspectie_ai_suggestie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_bevinding_sel ON public.inspectie_bevinding;
CREATE POLICY inspectie_bevinding_sel ON public.inspectie_bevinding AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_foto_sel ON public.inspectie_foto;
CREATE POLICY inspectie_foto_sel ON public.inspectie_foto AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_historie_sel ON public.inspectie_historie;
CREATE POLICY inspectie_historie_sel ON public.inspectie_historie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_sjabloon_sel ON public.inspectie_sjabloon;
CREATE POLICY inspectie_sjabloon_sel ON public.inspectie_sjabloon AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS inspectie_sjabloon_punt_sel ON public.inspectie_sjabloon_punt;
CREATE POLICY inspectie_sjabloon_punt_sel ON public.inspectie_sjabloon_punt AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS rie_versies_sel ON public.rie_versies;
CREATE POLICY rie_versies_sel ON public.rie_versies AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS toolbox_sessie_sel ON public.toolbox_sessie;
CREATE POLICY toolbox_sessie_sel ON public.toolbox_sessie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS toolbox_deelname_sel ON public.toolbox_deelname;
CREATE POLICY toolbox_deelname_sel ON public.toolbox_deelname AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS bedrijf_doelstelling_sel ON public.bedrijf_doelstelling;
CREATE POLICY bedrijf_doelstelling_sel ON public.bedrijf_doelstelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS bedrijf_inspectie_doel_sel ON public.bedrijf_inspectie_doel;
CREATE POLICY bedrijf_inspectie_doel_sel ON public.bedrijf_inspectie_doel AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

DROP POLICY IF EXISTS bedrijf_toolbox_instelling_sel ON public.bedrijf_toolbox_instelling;
CREATE POLICY bedrijf_toolbox_instelling_sel ON public.bedrijf_toolbox_instelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

-- ============================================================
-- 6. RLS: raw policies zonder poortfunctie DICHTZETTEN voor teamleider.
--    personen_write en pva_update stonden open voor élke company-user
--    (company_id = my_company_id() OR is_admin()) — zonder deze wijziging
--    zou een teamleider personen kunnen beheren en acties vrij kunnen
--    bewerken via een rechtstreekse table-update, buiten de smalle RPC om.
-- ============================================================
DROP POLICY IF EXISTS personen_write ON public.personen;
CREATE POLICY personen_write ON public.personen AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));

DROP POLICY IF EXISTS pva_update ON public.pva_items;
CREATE POLICY pva_update ON public.pva_items AS PERMISSIVE FOR UPDATE TO public
  USING (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 7. RPC's: guard verplaatst naar mag_bedrijf_werken.
--    Alleen de functies die teamleider nodig heeft voor inspecties
--    uitvoeren/afronden, toolbox-sessies en acties inzien. Alles wat hier
--    niet staat (audits, personen, doelstellingen wijzigen, bedrijfsvoering,
--    RIE-content bewerken, sjabloon/norm-beheer) blijft op mag_bedrijf_beheren.
-- ============================================================

-- 7a. Inspectie uitvoeren: bevinding invullen / naar actie omzetten.
CREATE OR REPLACE FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company   uuid;
  v_inspectie uuid;
  v_status    text;
  v_punt      text;
  v_actie     uuid;
  v_nr        integer;
begin
  select b.company_id, b.inspectie_id, b.punt_tekst_snap, b.actie_id, i.status
    into v_company, v_inspectie, v_punt, v_actie, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  if v_actie is null then
    select id into v_actie
      from pva_items
     where company_id = v_company
       and bron_type  = 'inspectie_bevinding'
       and bron_id    = p_bevinding_id
     limit 1;
  end if;

  if v_actie is null then
    select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
      into v_nr
      from pva_items
     where company_id = v_company;

    insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
    values (v_company, v_nr::text, coalesce(v_punt, 'Inspectiebevinding'),
            'Open', 'Middel', 'inspectie_bevinding', p_bevinding_id, now())
    returning id into v_actie;

    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Actie aangemaakt: ' || coalesce(v_punt, ''));
  end if;

  update inspectie_bevinding
     set afhandeling = 'actie',
         actie_id    = v_actie,
         resultaat   = 'niet_in_orde'
   where id = p_bevinding_id;

  return v_actie;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text DEFAULT 'geen'::text, p_opmerking text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company         uuid;
  v_inspectie       uuid;
  v_status          text;
  v_punt            text;
  v_bestaande_actie uuid;
  v_afh             text;
  v_act             uuid;
  v_opm             text;
begin
  select b.company_id, b.inspectie_id, b.actie_id, b.punt_tekst_snap, i.status
    into v_company, v_inspectie, v_bestaande_actie, v_punt, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;
  if p_resultaat is null or p_resultaat not in ('in_orde', 'niet_in_orde', 'nvt') then
    raise exception 'Ongeldig resultaat';
  end if;

  v_opm := nullif(btrim(coalesce(p_opmerking, '')), '');

  if p_resultaat in ('in_orde', 'nvt') then
    v_afh := 'geen';
    v_act := null;
  else
    if p_afhandeling = 'actie' then
      if v_bestaande_actie is null then
        raise exception 'Gebruik bevinding_naar_actie om een actie aan te maken';
      end if;
      v_afh := 'actie';
      v_act := v_bestaande_actie;
    elsif p_afhandeling = 'meteen_hersteld' then
      if v_opm is null then
        raise exception 'Een toelichting is verplicht bij ''meteen hersteld''';
      end if;
      v_afh := 'meteen_hersteld';
      v_act := null;
    else
      v_afh := 'geen';
      v_act := null;
    end if;
  end if;

  update inspectie_bevinding
     set resultaat   = p_resultaat,
         afhandeling = v_afh,
         actie_id    = v_act,
         opmerking   = v_opm
   where id = p_bevinding_id;

  if v_afh = 'meteen_hersteld' then
    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Direct hersteld: ' || coalesce(v_punt, ''));
  end if;
end;
$function$;

-- 7b. Inspectie starten / afronden / conclusie / bibliotheek / rapport.
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

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (v_company, p_sjabloon_id, 'concept', v_naam, v_soort)
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
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (p_company_id, null, 'concept', 'Werkplekinspectie (norm)', null)
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

CREATE OR REPLACE FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  if v_status = 'afgerond' then
    raise exception 'Inspectie is al afgerond';
  end if;
  if v_status = 'geannuleerd' then
    raise exception 'Inspectie is geannuleerd';
  end if;

  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and verplicht
       and resultaat is null
  ) then
    raise exception 'Niet alle verplichte punten hebben een resultaat';
  end if;

  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and resultaat = 'niet_in_orde'
       and afhandeling = 'geen'
  ) then
    raise exception 'Elke ''niet in orde''-bevinding moet zijn afgehandeld (meteen hersteld of actie)';
  end if;

  update inspectie
     set status       = 'afgerond',
         uitgevoerd_op = now(),
         conclusie     = coalesce(nullif(btrim(coalesce(p_conclusie, '')), ''), conclusie)
   where id = p_inspectie_id;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, p_inspectie_id, auth.uid(), now(), 'Inspectie afgerond');
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
     set conclusie = nullif(btrim(coalesce(p_conclusie, '')), '')
   where id = p_inspectie_id;
end;
$function$;

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

-- 7c. Foto-context: cascadeert naar foto_pad/registreren/verwijderen en de
--     AI-suggestie-functies, die deze helper gebruiken voor hun eigen guard.
CREATE OR REPLACE FUNCTION public.inspectie_foto_context(p_inspectie_id uuid, p_bevinding_id uuid, p_moet_lopen boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_status text;
begin
  select company_id, status into v_company, v_status
    from inspectie where id = p_inspectie_id;
  if v_company is null then raise exception 'Inspectie niet gevonden'; end if;
  if not mag_bedrijf_werken(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if p_moet_lopen and v_status in ('afgerond', 'geannuleerd') then
    raise exception 'Deze inspectie is afgerond; foto''s kunnen niet meer wijzigen';
  end if;

  if p_bevinding_id is not null and not exists (
    select 1 from inspectie_bevinding
     where id = p_bevinding_id and inspectie_id = p_inspectie_id
  ) then
    raise exception 'Bevinding hoort niet bij deze inspectie';
  end if;

  return v_company;
end;
$function$;

-- 7d. Toolbox-sessies.
CREATE OR REPLACE FUNCTION public.toolbox_sessie_opslaan(p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text, p_notitie text, p_toolbox_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_onderwerp),'') = '' then raise exception 'Onderwerp is verplicht'; end if;
  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  if p_toolbox_id is not null and not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then
    raise exception 'Gekozen toolbox bestaat niet';
  end if;

  if p_sessie_id is null then
    insert into toolbox_sessie (company_id, datum, onderwerp, notitie, toolbox_id, aangemaakt_door)
    values (p_company_id, p_datum, btrim(p_onderwerp), nullif(btrim(coalesce(p_notitie,'')),''), p_toolbox_id, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update toolbox_sessie set
    datum = p_datum, onderwerp = btrim(p_onderwerp),
    notitie = nullif(btrim(coalesce(p_notitie,'')),''), toolbox_id = p_toolbox_id,
    updated_at = now()
  where id = p_sessie_id and company_id = p_company_id;
  if not found then raise exception 'Sessie niet gevonden'; end if;
  return p_sessie_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toolbox_sessie_aanwezigheid_zetten(p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sessie  record;
  v_persoon record;
begin
  select id, company_id, datum, onderwerp, notitie into v_sessie
    from toolbox_sessie where id = p_sessie_id;
  if v_sessie.id is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_werken(v_sessie.company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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

-- Verwijderen blijft smaller: een teamleider mag alleen EIGEN sessies
-- verwijderen (aangemaakt_door = zichzelf); admin/KAM mag elke sessie.
CREATE OR REPLACE FUNCTION public.toolbox_sessie_verwijderen(p_sessie_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_aangemaakt_door uuid;
begin
  select company_id, aangemaakt_door into v_company, v_aangemaakt_door
    from toolbox_sessie where id = p_sessie_id;
  if v_company is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_werken(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if not mag_bedrijf_beheren(v_company) and v_aangemaakt_door is distinct from auth.uid() then
    raise exception 'Een teamleider mag alleen eigen toolbox-sessies verwijderen';
  end if;
  delete from toolbox_sessie where id = p_sessie_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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
          from toolbox_deelname d where d.sessie_id = s.id and d.persoon_id is not null
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

CREATE OR REPLACE FUNCTION public.toolbox_bewijs(p_deelname_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from toolbox_deelname where id = p_deelname_id;
  if v_company is null then raise exception 'Deelname niet gevonden'; end if;
  if not coalesce(mag_bedrijf_werken(v_company), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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

CREATE OR REPLACE FUNCTION public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not coalesce(mag_bedrijf_werken(p_company_id), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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

CREATE OR REPLACE FUNCTION public.toolbox_dashboard(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jaar int  := extract(year from current_date)::int;
  v_ys   date := make_date(v_jaar, 1, 1);
  v_ye   date := make_date(v_jaar, 12, 31);
  v_yd   int  := (v_ye - v_ys) + 1;
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  with pers as (
    select p.id, p.naam, p.functiegroep_id, fg.naam as fg_naam,
           p.datum_in_dienst, p.datum_uit_dienst,
           coalesce(d.doel_per_jaar, 0) as n,
           (p.datum_uit_dienst is null or p.datum_uit_dienst >= current_date) as niet_uit_dienst
    from personen p
    left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
    left join bedrijf_doelstelling d on d.company_id = p_company_id and d.functiegroep_id = p.functiegroep_id
    where p.company_id = p_company_id and p.archived_at is null
  ),
  calc as (
    select pers.*,
           greatest(v_ys, coalesce(datum_in_dienst, v_ys)) as eff_start,
           least(v_ye, coalesce(datum_uit_dienst, v_ye))   as eff_end
    from pers
  ),
  m3 as (
    select c.*,
      round(n * (case when eff_end < eff_start then 0 else (eff_end - eff_start) + 1 end)::numeric / v_yd)::int as doel,
      round(n * (greatest(0, (least(current_date, eff_end) - eff_start) + 1))::numeric / v_yd)::int as verwacht,
      (select count(distinct dd.toolbox_id) from toolbox_deelname dd
         where dd.persoon_id = c.id and extract(year from dd.afgerond_op)::int = v_jaar) as gedaan
    from calc c
  ),
  m4 as (
    select m3.*,
      case
        when not niet_uit_dienst then 'uit_dienst'
        when doel <= 0 then 'geen_doel'
        when gedaan >= doel then 'klaar'
        when gedaan >= verwacht then 'op_schema'
        else 'loopt_achter'
      end as status
    from m3
  )
  select jsonb_build_object(
    'jaar', v_jaar,
    'bedrijf', (
      select jsonb_build_object(
        'doel',   coalesce(sum(doel) filter (where niet_uit_dienst), 0),
        'gedaan', coalesce(sum(least(gedaan, doel)) filter (where niet_uit_dienst), 0),
        'pct', case when coalesce(sum(doel) filter (where niet_uit_dienst), 0) > 0
                    then round(100.0 * sum(least(gedaan, doel)) filter (where niet_uit_dienst)
                               / sum(doel) filter (where niet_uit_dienst))
                    else null end
      ) from m4
    ),
    'per_functiegroep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'functiegroep_id', fg_id, 'naam', fg_naam, 'aantal_personen', aantal,
        'doel', doel_t, 'gedaan', gedaan_t,
        'pct', case when doel_t > 0 then round(100.0 * gedaan_t / doel_t) else null end
      ) order by fg_naam nulls last), '[]'::jsonb)
      from (
        select functiegroep_id as fg_id, fg_naam, count(*) as aantal,
               sum(doel) as doel_t, sum(least(gedaan, doel)) as gedaan_t
        from m4 where niet_uit_dienst and functiegroep_id is not null
        group by functiegroep_id, fg_naam
      ) g
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', id, 'naam', naam, 'functiegroep_naam', fg_naam,
        'doel', doel, 'gedaan', gedaan, 'verwacht_nu', verwacht, 'status', status,
        'datum_in_dienst', datum_in_dienst, 'datum_uit_dienst', datum_uit_dienst
      ) order by
        case status when 'loopt_achter' then 0 when 'op_schema' then 1 when 'klaar' then 2
                    when 'geen_doel' then 3 else 4 end, naam), '[]'::jsonb)
      from m4
    )
  ) into v;
  return v;
end;
$function$;

-- 7e. Acties inzien: historie + bewijslijst (lezen, geen wijziging).
CREATE OR REPLACE FUNCTION public.actie_historie_ophalen(p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.pva_items where id = p_actie_id;
  if v_company_id is null then return '[]'::jsonb; end if;
  if not public.mag_bedrijf_werken(v_company_id) then raise exception 'Geen toegang'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(h) order by h.created_at desc)
    from (
      select gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type, created_at
      from public.actie_historie where pva_item_id = p_actie_id
    ) h
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.bewijs_lijst(p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.pva_items where id = p_actie_id;
  if v_company_id is null then return '[]'::jsonb; end if;
  if not public.mag_bedrijf_werken(v_company_id) then raise exception 'Geen toegang'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(b) order by b.created_at desc)
    from (
      select id, pad, bestandsnaam, type, grootte, geupload_door, uploader_type,
             verwijderd_op, verwijderd_door, created_at
      from public.bewijs
      where pva_item_id = p_actie_id
    ) b
  ), '[]'::jsonb);
end;
$function$;

-- ============================================================
-- 8. NIEUW — acties: smalle status-only RPC voor teamleider (en bruikbaar
--    voor admin/KAM, maar die hebben pva_update/geef_actie_vrij al).
--    Raakt uitsluitend status/opmerking + logt in actie_historie — geen
--    toegang tot onderwerp/maatregel/prio/termijn/verantw/persoon_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.actie_status_zetten(p_actie_id uuid, p_status text, p_opm text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pva_items;
  v_naam text;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_werken(v_item.company_id) then raise exception 'Geen toegang'; end if;
  if coalesce(p_status, '') not in ('Open', 'In behandeling', 'Afgerond') then
    raise exception 'Ongeldige status';
  end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  update public.pva_items
  set status = p_status,
      opm = coalesce(nullif(btrim(coalesce(p_opm, '')), ''), opm),
      updated_at = now(),
      updated_by = coalesce(v_naam, updated_by)
  where id = p_actie_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'status_gewijzigd', v_item.status, p_status, p_opm, v_naam,
     case when public.is_teamleider() then 'teamleider' else 'beheerder' end);

  return public.actie_als_jsonb(p_actie_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.actie_status_zetten(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actie_status_zetten(uuid, text, text) TO authenticated, service_role;

-- ============================================================
-- 9. NIEUW — incidenten: oorzaakanalyse zonder medische velden (teamleider).
--    Splitst incident_deel2_opslaan; incident_deel2_opslaan zelf blijft
--    ongewijzigd (mag_bedrijf_beheren, dus automatisch dicht voor teamleider)
--    en blijft de enige route naar functie_slachtoffer/medische_dienst_bezocht.
-- ============================================================
CREATE OR REPLACE FUNCTION public.incident_oorzaak_opslaan(
  p_company_id                      uuid,
  p_incident_id                     uuid,
  p_status                          text,
  p_directe_oorzaken                integer[],
  p_basis_oorzaken                  integer[],
  p_oorzaak_toelichting             text,
  p_onderzoeksrapportage_bijgevoegd boolean,
  p_telefonische_melding_directie   boolean,
  p_telefonische_melding_aan        text,
  p_maatregelen_in_actielijst       boolean,
  p_tra_aanpassen                   boolean,
  p_andere_maatregelen              text,
  p_besproken_in_toolbox_datum      date
)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_directe integer[];
  v_basis   integer[];
  v_row     public.incident;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;
  if not exists (select 1 from public.incident where id = p_incident_id and company_id = p_company_id) then
    raise exception 'Incident niet gevonden';
  end if;
  if coalesce(p_status,'') not in ('open','in_onderzoek','afgehandeld') then
    raise exception 'Ongeldige status';
  end if;

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
    afgehandeld_op                  = case
                                        when p_status = 'afgehandeld' then coalesce(afgehandeld_op, now())
                                        else null
                                      end,
    laatst_bijgewerkt_op            = now()
  where id = p_incident_id and company_id = p_company_id
  returning * into v_row;

  -- Medische velden gaan hier nooit mee terug, ongeacht wat er in de DB staat.
  return jsonb_build_object(
    'id', v_row.id, 'company_id', v_row.company_id, 'status', v_row.status,
    'directe_oorzaken', v_row.directe_oorzaken, 'basis_oorzaken', v_row.basis_oorzaken,
    'oorzaak_toelichting', v_row.oorzaak_toelichting,
    'onderzoeksrapportage_bijgevoegd', v_row.onderzoeksrapportage_bijgevoegd,
    'telefonische_melding_directie', v_row.telefonische_melding_directie,
    'telefonische_melding_aan', v_row.telefonische_melding_aan,
    'maatregelen_in_actielijst', v_row.maatregelen_in_actielijst,
    'tra_aanpassen', v_row.tra_aanpassen,
    'andere_maatregelen', v_row.andere_maatregelen,
    'besproken_in_toolbox_datum', v_row.besproken_in_toolbox_datum,
    'afgehandeld_op', v_row.afgehandeld_op,
    'laatst_bijgewerkt_op', v_row.laatst_bijgewerkt_op,
    'functie_slachtoffer', null,
    'medische_dienst_bezocht', null
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.incident_oorzaak_opslaan(uuid, uuid, text, integer[], integer[], text, boolean, boolean, text, boolean, boolean, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incident_oorzaak_opslaan(uuid, uuid, text, integer[], integer[], text, boolean, boolean, text, boolean, boolean, text, date) TO authenticated, service_role;

-- ============================================================
-- 10. NIEUW — incidenten lezen met masking: teamleider krijgt de medische
--     velden altijd als null; admin/KAM krijgen de echte waarden. De RLS-
--     SELECT-policy op incident zelf blijft dicht voor teamleider (mag_bedrijf_
--     beheren, ongewijzigd) — dit is de enige leesroute voor teamleider.
-- ============================================================
CREATE OR REPLACE FUNCTION public.incident_overzicht(p_company_id uuid)
 RETURNS TABLE (
   id uuid, company_id uuid, datum date, tijd time without time zone, locatie text, project text,
   omschrijving text, naam_melder text, gevolgen text[], aangemaakt_op timestamptz,
   status text, directe_oorzaken integer[], basis_oorzaken integer[], oorzaak_toelichting text,
   onderzoeksrapportage_bijgevoegd boolean, telefonische_melding_directie boolean,
   telefonische_melding_aan text, maatregelen_in_actielijst boolean, tra_aanpassen boolean,
   andere_maatregelen text, besproken_in_toolbox_datum date,
   functie_slachtoffer text, medische_dienst_bezocht text,
   actie_ids uuid[], toolbox_push_id uuid, afgehandeld_op timestamptz, laatst_bijgewerkt_op timestamptz
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  return query
    select i.id, i.company_id, i.datum, i.tijd, i.locatie, i.project, i.omschrijving,
           i.naam_melder, i.gevolgen, i.aangemaakt_op, i.status,
           i.directe_oorzaken, i.basis_oorzaken, i.oorzaak_toelichting,
           i.onderzoeksrapportage_bijgevoegd, i.telefonische_melding_directie,
           i.telefonische_melding_aan, i.maatregelen_in_actielijst, i.tra_aanpassen,
           i.andere_maatregelen, i.besproken_in_toolbox_datum,
           case when is_teamleider() then null else i.functie_slachtoffer end,
           case when is_teamleider() then null else i.medische_dienst_bezocht end,
           i.actie_ids, i.toolbox_push_id, i.afgehandeld_op, i.laatst_bijgewerkt_op
      from public.incident i
     where i.company_id = p_company_id
     order by i.aangemaakt_op desc;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.incident_overzicht(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incident_overzicht(uuid) TO authenticated, service_role;

-- ============================================================
-- 11. Grants voor de nieuwe poort-functies. Anders dan mag_bedrijf_beheren
--     (dat nog anon-EXECUTE heeft staan uit een oudere migratie) krijgen deze
--     TWEE NIEUWE functies dat NIET: geen enkele anon-toegankelijke policy of
--     RPC gebruikt ze, dus staat de EXECUTE hier gewoon dicht (Beslissing 62).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_teamleider() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teamleider() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mag_bedrijf_werken(p_company_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_werken(p_company_id uuid) TO authenticated, service_role;

commit;
