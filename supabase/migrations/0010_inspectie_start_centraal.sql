-- Migratie 0010: inspectie starten vanuit de centrale norm + rubriek in rapport
-- ----------------------------------------------------------------------------
-- Een klant start een werkplekinspectie rechtstreeks over zijn GEKOPPELDE centrale
-- rubrieken. Per vraag wordt de GELDENDE tekst bevroren (centraal, of lokaal bij
-- afwijking; uitgezette vragen vallen weg), samen met de rubrieknaam, zodat een
-- afgerond rapport leesbaar blijft als centraal/lokaal later wijzigt.
--
-- Alle centrale vragen worden als verplicht gesnapshot: een normvraag hoort
-- beoordeeld te worden (n.v.t. mag, dat is een geldig resultaat). De bestaande
-- afrond-/bevinding-logica werkt per bevinding en verandert niet.
--
-- Additief: nieuwe functie + create-or-replace van inspectie_rapport (alleen een
-- extra veld rubriek_naam_snap in de bevindingen). Idempotent.

begin;

create or replace function public.inspectie_start_centraal(p_company_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inspectie uuid;
  v_aantal    integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (p_company_id, null, 'concept', 'Werkplekinspectie (norm)', null)
  returning id into v_inspectie;

  -- Effectieve vragen: gekoppelde + niet-gearchiveerde rubrieken, niet-gearchiveerde
  -- vragen, lokale tekst waar afgeweken, en zonder de lokaal uitgezette vragen.
  with eff as (
    select
      r.naam       as rubriek_naam,
      r.volgorde   as rub_volg,
      q.volgorde   as vraag_volg,
      q.id         as vraag_id,
      case when a.modus = 'lokaal' then a.lokale_tekst else q.tekst end as tekst,
      (a.vraag_id is not null and a.modus = 'uit') as uit
    from bedrijf_rubriek br
    join centrale_rubriek r on r.id = br.rubriek_id and r.gearchiveerd_op is null
    join centrale_vraag   q on q.rubriek_id = r.id  and q.gearchiveerd_op is null
    left join bedrijf_vraag_afwijking a
      on a.vraag_id = q.id and a.company_id = p_company_id
    where br.company_id = p_company_id
  )
  insert into inspectie_bevinding
    (company_id, inspectie_id, rubriek_naam_snap, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select
    p_company_id, v_inspectie, rubriek_naam, tekst, true,
    row_number() over (order by rub_volg, vraag_volg, vraag_id),
    'geen'
  from eff
  where not uit;

  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then
    -- Rolt de zojuist aangemaakte inspectie mee terug (atomair).
    raise exception 'Koppel eerst rubrieken met vragen voordat je een inspectie start';
  end if;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (p_company_id, v_inspectie, auth.uid(), now(), 'Inspectie gestart vanuit de norm');

  return v_inspectie;
end;
$function$;

grant execute on function public.inspectie_start_centraal(uuid) to anon, authenticated, service_role;

-- Rapport opnieuw, met rubriek_naam_snap erbij in elke bevinding (voor groepering).
create or replace function public.inspectie_rapport(p_inspectie_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
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
        'actie_nr',         pa.nr
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

commit;
