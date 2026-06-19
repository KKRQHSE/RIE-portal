-- ============================================================================
-- Managementdashboard — de lees-RPC-laag
-- ----------------------------------------------------------------------------
-- Draai dit bestand via: node scripts/db_run.mjs --file db/dashboard_rpcs.sql
--
-- Alleen-lezen, GEEN logging (een dashboard observeert, het muteert niets).
-- SECURITY DEFINER met vaste search_path = public. Autorisatie via de bestaande
-- helpers: mag_bedrijf_beheren(company_id) voor één bedrijf, is_admin() voor de
-- bedrijf-overstijgende roll-up. company_id wordt NOOIT van de client vertrouwd
-- als toegangsbewijs: de helper bepaalt of de ingelogde gebruiker het mag zien.
--
-- Idempotent: create or replace.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- dashboard_overzicht: alle tegelcijfers voor ÉÉN bedrijf, als één jsonb-object.
-- Eén round-trip i.p.v. losse client-queries.
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_overzicht(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    -- Voortgang PvA: de kop-donut.
    'pva', (
      select jsonb_build_object(
        'totaal',         count(*),
        'open',           count(*) filter (where status = 'Open'),
        'in_behandeling', count(*) filter (where status = 'In behandeling'),
        'afgerond',       count(*) filter (where status = 'Afgerond'),
        'pct', case when count(*) > 0
                    then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
                    else 0 end
      )
      from pva_items where company_id = p_company_id
    ),

    -- Te beoordelen: actiehouder diende een voorstel in, KAM moet vrijgeven/terugsturen.
    'te_beoordelen', (
      select count(*) from pva_items
      where company_id = p_company_id
        and concept_status is not null and btrim(concept_status) <> ''
    ),

    -- Openstaand per prioriteit (alles wat niet afgerond is).
    'prio_open', (
      select jsonb_build_object(
        'Hoog',   count(*) filter (where prio = 'Hoog'),
        'Middel', count(*) filter (where prio = 'Middel'),
        'Laag',   count(*) filter (where prio = 'Laag')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

    -- Termijn-urgentie (op de machine-leesbare termijn_datum).
    'termijn', (
      select jsonb_build_object(
        'over',         count(*) filter (where termijn_datum < current_date),
        'binnenkort',   count(*) filter (where termijn_datum >= current_date
                                           and termijn_datum < current_date + 30),
        'zonder_datum', count(*) filter (where termijn_datum is null
                                           and termijn is not null and btrim(termijn) <> '')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

    -- RI&E-geldigheid: de meest recente versie van dit bedrijf (of null).
    'rie', (
      select case when r.id is null then null else jsonb_build_object(
        'versie',               r.versie,
        'status',               r.status,
        'geldig_tot',           r.geldig_tot,
        'verloopt_binnenkort',  r.geldig_tot is not null and r.geldig_tot < now() + interval '60 days'
      ) end
      from (
        select id, versie, status, geldig_tot
        from rie_versies where company_id = p_company_id
        order by versie desc limit 1
      ) r
    ),

    -- Inspecties: lopend vs afgerond + onafgehandelde niet_in_orde-bevindingen.
    'inspecties', jsonb_build_object(
      'open', (
        select count(*) from inspectie
        where company_id = p_company_id and status in ('concept', 'ingediend')
      ),
      'afgerond', (
        select count(*) from inspectie
        where company_id = p_company_id and status = 'afgerond'
      ),
      'open_bevindingen', (
        select count(*) from inspectie_bevinding
        where company_id = p_company_id
          and resultaat = 'niet_in_orde' and afhandeling = 'geen'
      )
    ),

    -- Bewijslast: kwaliteit van afhandeling, niet alleen het vinkje.
    'bewijs', (
      select jsonb_build_object(
        'afgerond_met_bewijs', count(*) filter (where heeft_bewijs),
        'afgerond_zonder_bewijs', count(*) filter (where not heeft_bewijs)
      )
      from (
        select exists (
          select 1 from bewijs b
          where b.pva_item_id = i.id and b.verwijderd_op is null
        ) as heeft_bewijs
        from pva_items i
        where i.company_id = p_company_id and i.status = 'Afgerond'
      ) s
    )
  ) into v;

  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- dashboard_admin_overzicht: één regel per bedrijf voor de admin-roll-up.
-- Alleen voor admin; gesorteerd op "heeft aandacht nodig" (te beoordelen, over termijn).
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_admin_overzicht()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;

  select coalesce(jsonb_agg(row order by row->>'te_beoordelen' desc, row->>'over_termijn' desc, row->>'name'), '[]'::jsonb)
  into v
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'pva_totaal',    p.totaal,
      'pva_afgerond',  p.afgerond,
      'pct',           p.pct,
      'te_beoordelen', p.te_beoordelen,
      'over_termijn',  p.over_termijn,
      'rie_status',    r.status,
      'rie_geldig_tot', r.geldig_tot,
      'laatste_activiteit', p.laatste_activiteit
    ) as row
    from companies c
    left join lateral (
      select
        count(*)                                          as totaal,
        count(*) filter (where status = 'Afgerond')       as afgerond,
        case when count(*) > 0
             then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
             else 0 end                                   as pct,
        count(*) filter (where concept_status is not null and btrim(concept_status) <> '') as te_beoordelen,
        count(*) filter (where termijn_datum < current_date and status <> 'Afgerond')      as over_termijn,
        max(updated_at)                                   as laatste_activiteit
      from pva_items where company_id = c.id
    ) p on true
    left join lateral (
      select status, geldig_tot
      from rie_versies where company_id = c.id
      order by versie desc limit 1
    ) r on true
  ) s;

  return v;
end;
$$;

commit;
