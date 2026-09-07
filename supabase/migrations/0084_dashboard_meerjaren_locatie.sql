-- Migratie 0084: locatie-roll-up in het meerjarendashboard (Fase 4)
-- ----------------------------------------------------------------------------
-- Optionele multi-locatie-ondersteuning, aanpak A. Uitbreiding van de
-- BESTAANDE aggregatiefunctie dashboard_meerjaren (0075/0076), geen nieuwe
-- parallelle laag: elk jaar-object krijgt er een extra sleutel 'per_locatie'
-- bij (array, één rij per actieve locatie). Alle bestaande sleutels
-- (if_getal, inspecties, toolbox, incidenten, doelstelling) blijven exact
-- zoals ze waren -- organisatiebreed, ongewijzigd.
--
-- BEWUSTE BEPERKING (geen historie verzinnen, zelfde principe als 0075):
-- per_locatie bevat UITSLUITEND de drie metrics die daadwerkelijk een
-- locatie_id dragen (inspectie, toolbox_sessie, incident -- migratie 0080):
-- aantal afgeronde inspecties, aantal toolbox-sessies, aantal incidenten.
-- NIET opgesplitst, en dat blijft zo tenzij het datamodel verandert:
--   - if_getal: rekent op bedrijf_gewerkte_uren, dat geen locatie-dimensie
--     heeft (uren worden niet per locatie bijgehouden).
--   - toolbox.dekking_pct: rekent op de headcount, afgeleid uit personen --
--     personen.locatie_id bestaat niet (Fase 1 heeft dat bewust NIET
--     toegevoegd; een medewerker "hoort" niet per se bij één locatie).
--   - inspecties.doel_totaal: bedrijf_inspectie_doel is per PERSOON
--     vastgelegd, niet per locatie.
--   - doelstelling: een beleidstekst, per definitie organisatiebreed.
-- Deze vier blijven dus alleen op organisatieniveau bestaan; de UI toont ze
-- bij een gekozen locatie met een duidelijke "organisatiebreed"-aanduiding
-- in plaats van een verzonnen opsplitsing.
--
-- Bedrijf zonder locaties: de locatie-subquery matcht nul rijen -> lege
-- array. RPC-resultaat verder identiek aan vóór deze migratie.
--
-- Additief; idempotent (create or replace).

begin;

create or replace function public.dashboard_meerjaren(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

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
    union
    select jaar from bedrijf_inspectie_doel where company_id = p_company_id
  ),
  headcount as (
    select j.jaar, count(*) as n
    from jaren j
    join personen p on p.company_id = p_company_id
      and (p.datum_in_dienst is null or p.datum_in_dienst <= make_date(j.jaar, 12, 31))
      and (p.datum_uit_dienst is null or p.datum_uit_dienst >= make_date(j.jaar, 1, 1))
    group by j.jaar
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
      'doel_totaal', (
        select coalesce(sum(doel_per_jaar), 0) from bedrijf_inspectie_doel
         where company_id = p_company_id and jaar = j.jaar
      )
    ),
    'toolbox', jsonb_build_object(
      'sessies', (
        select count(*) from toolbox_sessie
         where company_id = p_company_id and extract(year from datum)::int = j.jaar
      ),
      'dekking_pct', (
        case when coalesce((select n from headcount where headcount.jaar = j.jaar), 0) = 0 then null else (
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
                 ) / (select n from headcount where headcount.jaar = j.jaar))
                 end
        ) end
      )
    ),
    'incidenten', (
      select count(*) from incident
       where company_id = p_company_id and extract(year from datum)::int = j.jaar
    ),
    'doelstelling', coalesce(
      (select tekst from bedrijf_jaardoelstelling where company_id = p_company_id and jaar = j.jaar),
      case when j.jaar = extract(year from current_date)::int
           then (select doelstelling_tekst from bedrijf_dashboard_instelling where company_id = p_company_id)
           else null end
    ),
    -- Nieuw (0084): roll-up per locatie, alleen de drie echt locatie-gebonden
    -- tellingen. Lege array bij een bedrijf zonder locaties.
    'per_locatie', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'locatie_id', l.id,
        'locatie_naam', l.naam,
        'inspecties_afgerond', (
          select count(*) from inspectie i
           where i.company_id = p_company_id and i.status = 'afgerond'
             and extract(year from i.uitgevoerd_op)::int = j.jaar and i.locatie_id = l.id
        ),
        'toolbox_sessies', (
          select count(*) from toolbox_sessie s
           where s.company_id = p_company_id and extract(year from s.datum)::int = j.jaar and s.locatie_id = l.id
        ),
        'incidenten', (
          select count(*) from incident inc
           where inc.company_id = p_company_id and extract(year from inc.datum)::int = j.jaar and inc.locatie_id = l.id
        )
      ) order by l.volgorde), '[]'::jsonb)
      from locatie l
      where l.company_id = p_company_id and l.gearchiveerd_op is null
    )
  ) order by j.jaar desc), '[]'::jsonb)
  into v
  from jaren j;

  return v;
end;
$function$;

commit;
