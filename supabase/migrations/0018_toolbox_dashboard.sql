-- Migratie 0018: live doelstellingen-dashboard (naar-rato)
-- ----------------------------------------------------------------------------
-- Eén lees-RPC die bij elke aanroep LIVE herberekent uit de actuele data (geen
-- gecachte tellers). Per persoon een naar-rato-doel voor dit kalenderjaar,
-- gecorrigeerd voor in- en uitstroom; per functiegroep en bedrijf de voortgang.
--
-- ============================================================================
-- NAAR-RATO-FORMULE (expliciet):
--   Kalenderjaar Y: year_start = 1 jan, year_end = 31 dec, year_days = aantal
--   dagen in Y (365 of 366). N = doel_per_jaar van de functiegroep van de persoon.
--
--   eff_start = max(year_start, datum_in_dienst of year_start als leeg)
--   eff_end   = min(year_end,  datum_uit_dienst of year_end als leeg)
--   service_days = (eff_end - eff_start) + 1, of 0 als eff_end < eff_start
--   factor   = service_days / year_days
--   DOEL (naar rato) = round(N * factor)
--
--   VERWACHT-NU (voor 'op schema'-bepaling) = round(N * verstreken_dagen / year_days),
--   met verstreken_dagen = (min(vandaag, eff_end) - eff_start) + 1, min 0.
--   GEDAAN = aantal DISTINCTE toolboxen dit jaar aantoonbaar afgerond (elk record is
--   bewijs; bewijssoort 'digitaal' of 'fysiek_aanwezig' tellen beide mee).
--
--   Voorbeeld: in dienst per 1 juli, N=12, jaar 365 dagen → service_days 184 →
--   factor 0,504 → doel round(12*0,504)=6. (Halverwege ingestroomd → half doel.)
--
--   Uitstroom: eff_end stopt op datum_uit_dienst, dus het doel telt alleen de
--   in-dienst-periode. Een persoon die NU niet meer in dienst is (datum_uit_dienst
--   < vandaag) valt uit de NOEMER van het bedrijf/functiegroep-totaal, maar blijft
--   zichtbaar in de personenlijst met status 'uit_dienst' (bewijs blijft bestaan).
--
--   Lege dienstdata: geen datum_in_dienst → eff_start = year_start (vol jaar, geen
--   korting); geen datum_uit_dienst → nog in dienst. Niets wordt geforceerd.
-- ============================================================================
-- Additief; idempotent.

begin;

create or replace function public.toolbox_dashboard(p_company_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_jaar int  := extract(year from current_date)::int;
  v_ys   date := make_date(v_jaar, 1, 1);
  v_ye   date := make_date(v_jaar, 12, 31);
  v_yd   int  := (v_ye - v_ys) + 1;
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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

grant execute on function public.toolbox_dashboard(uuid) to anon, authenticated, service_role;

commit;
