-- Migratie 0075: meerjaren-dashboard (Fase 3, voorbereidend)
-- ----------------------------------------------------------------------------
-- Nachtbouw 5/6 sept 2026. Meta-overzicht dat prestaties per jaar naast elkaar
-- toont: IF-getal, toolbox-dekking, inspectie-voortgang, aantal incidenten.
-- Gebruikt UITSLUITEND data die het systeem al per jaar vastlegt:
--   - IF-getal: if_getal_voor_jaar() (migratie 0073), ongewijzigd hergebruikt.
--   - Toolbox: toolbox_sessie.datum / toolbox_deelname (via de sessie).
--   - Inspecties: inspectie.uitgevoerd_op (afgeronde inspecties dat jaar).
--   - Incidenten: incident.datum.
-- Geen historische cijfers verzonnen. Jaren die getoond worden = elk jaar
-- waarin minstens één van deze bronnen een rij heeft, plus altijd het huidige
-- jaar (ook als dat nog helemaal leeg is -- dat IS de actuele situatie).
--
-- Bewuste vereenvoudigingen (ontwerpkeuzes, zie NACHTBOUW_RAPPORT voor de
-- toelichting -- ter verfijning later):
--   - Toolbox-dekking gebruikt het HUIDIGE aantal actieve personen als noemer
--     voor elk jaar (geen historische personeelsstand bijgehouden) -- voor
--     oudere jaren dus een benadering.
--   - Inspectie-doel (bedrijf_inspectie_doel.doel_per_jaar) is een lopende
--     instelling, geen jaar-specifieke waarde -- toegepast op elk jaar alsof
--     die altijd al gold. Het aantal AFGERONDE inspecties zelf is wel een
--     harde, jaar-echte telling.
--   - "Doelstellingen" (bedrijf_dashboard_instelling.doelstelling_tekst) wordt
--     bewust NIET per jaar getoond: dat veld is nooit per jaar opgeslagen,
--     alleen de huidige tekst bestaat. Zie rapport voor het openstaande punt.
--
-- Additief; idempotent.

begin;

CREATE OR REPLACE FUNCTION public.dashboard_meerjaren(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actieve_personen integer;
  v_doel_totaal integer;
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select count(*) into v_actieve_personen
    from personen where company_id = p_company_id and archived_at is null;

  select coalesce(sum(doel_per_jaar), 0) into v_doel_totaal
    from bedrijf_inspectie_doel where company_id = p_company_id;

  with jaren as (
    select extract(year from current_date)::int as jaar
    union
    select extract(year from aangemaakt_op)::int from inspectie where company_id = p_company_id
    union
    select extract(year from uitgevoerd_op)::int from inspectie
      where company_id = p_company_id and uitgevoerd_op is not null
    union
    select extract(year from datum)::int from incident where company_id = p_company_id
    union
    select extract(year from datum)::int from toolbox_sessie where company_id = p_company_id
    union
    select jaar from bedrijf_gewerkte_uren where company_id = p_company_id and uren is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jaar', j.jaar,
    'if_getal', if_getal_voor_jaar(p_company_id, j.jaar),
    'inspecties', jsonb_build_object(
      'afgerond', (
        select count(*) from inspectie
         where company_id = p_company_id and status = 'afgerond'
           and extract(year from uitgevoerd_op)::int = j.jaar
      ),
      'doel_totaal', v_doel_totaal
    ),
    'toolbox', jsonb_build_object(
      'sessies', (
        select count(*) from toolbox_sessie
         where company_id = p_company_id and extract(year from datum)::int = j.jaar
      ),
      'dekking_pct', (
        case when v_actieve_personen = 0 then null else (
          select case when not exists (
                   select 1 from toolbox_sessie
                    where company_id = p_company_id and extract(year from datum)::int = j.jaar
                 ) then null
                 else round(100.0 * (
                   select count(distinct d.persoon_id)
                     from toolbox_deelname d
                     join toolbox_sessie s on s.id = d.sessie_id
                    where d.company_id = p_company_id and s.company_id = p_company_id
                      and extract(year from s.datum)::int = j.jaar
                      and d.persoon_id is not null
                 ) / v_actieve_personen)
                 end
        ) end
      )
    ),
    'incidenten', (
      select count(*) from incident
       where company_id = p_company_id and extract(year from datum)::int = j.jaar
    )
  ) order by j.jaar desc), '[]'::jsonb)
  into v
  from jaren j;

  return v;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.dashboard_meerjaren(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_meerjaren(uuid) TO authenticated, service_role;

commit;
