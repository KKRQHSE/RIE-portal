-- Migratie 0065: teamleider — statuskop blijft gevuld (bedrijf_modules + dashboard-RPC's)
-- ----------------------------------------------------------------------------
-- Vervolg op 0063. Twee dingen bleken bij de UI-doorloop nog dicht voor
-- teamleider terwijl bijna elke module-pagina + de statuskop erop leunt:
--
-- 1. bedrijf_modules_sel stond nog op mag_bedrijf_beheren. Vrijwel elke
--    pagina (inspecties/toolbox/incidenten/pva/audits/modules-check in de nav)
--    checkt of een module actief is via deze tabel; zonder deze rij krijgt
--    teamleider overal notFound() en een lege navbalk.
--
-- 2. dashboard_overzicht/dashboard_pva_rie (voeden ModuleStatuskop op RIE/PvA/
--    inspecties/toolbox/audits-pagina's) stonden op mag_bedrijf_beheren.
--    dashboard_pva_rie is 100% RI&E/PvA-tellingen — puur verbreden.
--    dashboard_overzicht heeft ÉÉN gevoelige sleutel: 'instellingen'
--    (klachten/tevredenheid/audit-status/doelstelling-tekst/ISO-taken/IF-
--    getal — bedrijfsvoering, niet vrijgegeven). Verbreden + die ene sleutel
--    naar null voor teamleider, net als incident_overzicht dat al deed voor
--    de medische velden.
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. bedrijf_modules_sel verbreden.
-- ============================================================
DROP POLICY IF EXISTS bedrijf_modules_sel ON public.bedrijf_modules;
CREATE POLICY bedrijf_modules_sel ON public.bedrijf_modules AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_werken(company_id));

-- ============================================================
-- 2. dashboard_pva_rie: guard verbreden, verder ongewijzigd (geen gevoelige velden).
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_pva_rie(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    'totaal',         count(*),
    'open',           count(*) filter (where status = 'Open'),
    'in_behandeling', count(*) filter (where status = 'In behandeling'),
    'afgerond',       count(*) filter (where status = 'Afgerond'),
    'pct', case when count(*) > 0
                then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
                else 0 end
  ) into v
  from pva_items
  where company_id = p_company_id
    and bron_type is null
    and (rie_versie_id is not null
         or nullif(btrim(coalesce(tree, '')), '') is not null
         or nullif(btrim(coalesce(ref,  '')), '') is not null);

  return v;
end;
$function$;

-- ============================================================
-- 3. dashboard_overzicht: guard verbreden + 'instellingen' naar null voor teamleider.
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jaar int := extract(year from current_date)::int;
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
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

    'te_beoordelen', (
      select count(*) from pva_items
      where company_id = p_company_id
        and concept_status is not null and btrim(concept_status) <> ''
    ),

    'prio_open', (
      select jsonb_build_object(
        'Hoog',   count(*) filter (where prio = 'Hoog'),
        'Middel', count(*) filter (where prio = 'Middel'),
        'Laag',   count(*) filter (where prio = 'Laag')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

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

    'rie', (
      select case when r.id is null then null else jsonb_build_object(
        'versie',               r.versie,
        'status',               r.status,
        'toets_datum',          r.toets_datum,
        'geldig_tot',           r.geldig_tot,
        'verloopt_binnenkort',  r.geldig_tot is not null and r.geldig_tot < now() + interval '60 days'
      ) end
      from (
        select id, versie, status, toets_datum, geldig_tot
        from rie_versies where company_id = p_company_id
        order by versie desc limit 1
      ) r
    ),

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

    -- Inspectie-doel per persoon (bedrijf_inspectie_doel) vs afgeronde inspecties dit jaar.
    'inspectie_doel', (
      select jsonb_build_object(
        'totaal_doel',   coalesce(sum(idl.doel_per_jaar), 0),
        'totaal_gedaan', coalesce(sum(g.gedaan), 0),
        'personen', coalesce(jsonb_agg(jsonb_build_object(
          'naam', p.naam, 'doel', idl.doel_per_jaar, 'gedaan', g.gedaan
        ) order by p.naam), '[]'::jsonb)
      )
      from bedrijf_inspectie_doel idl
      join personen p on p.id = idl.persoon_id and p.archived_at is null
      left join lateral (
        select count(*)::int as gedaan
        from inspectie i
        where i.company_id = idl.company_id and i.persoon_id = idl.persoon_id
          and i.status = 'afgerond' and extract(year from i.uitgevoerd_op)::int = v_jaar
      ) g on true
      where idl.company_id = p_company_id
    ),

    -- Toolbox-aanwezigheid per sessie (tweede telwijze, los van naar-rato/toolbox_dashboard).
    'toolbox_sessies', jsonb_build_object(
      'sessies', (
        select count(*) from toolbox_sessie s
        where s.company_id = p_company_id and extract(year from s.datum)::int = v_jaar
      ),
      'aanwezig', (
        select count(*) from toolbox_deelname d
        join toolbox_sessie s on s.id = d.sessie_id
        where d.company_id = p_company_id and s.company_id = p_company_id
          and extract(year from s.datum)::int = v_jaar
      )
    ),

    -- Incidenten: aantallen naar status en naar gevolg (géén medische velden).
    'incidenten', (
      select jsonb_build_object(
        'totaal', count(*),
        'per_status', jsonb_build_object(
          'open',         count(*) filter (where status = 'open'),
          'in_onderzoek', count(*) filter (where status = 'in_onderzoek'),
          'afgehandeld',  count(*) filter (where status = 'afgehandeld')
        ),
        'per_gevolg', (
          select coalesce(jsonb_object_agg(coalesce(gs.omschrijving, gg.gevolg), gg.aantal), '{}'::jsonb)
          from (
            select unnest(gevolgen) as gevolg, count(*) as aantal
            from incident where company_id = p_company_id
            group by 1
          ) gg
          left join incident_gevolg_soort gs on gs.code = gg.gevolg
        )
      )
      from incident where company_id = p_company_id
    ),

    -- Aantal afwijkende punten waar de centrale norm is bijgewerkt (onbeantwoord).
    'norm_bijgewerkt', (
      select count(*)
      from bedrijf_rubriek br
      join centrale_vraag q on q.rubriek_id = br.rubriek_id and q.gearchiveerd_op is null
      join bedrijf_vraag_afwijking a on a.vraag_id = q.id and a.company_id = p_company_id
      where br.company_id = p_company_id and q.versie > a.basis_versie
    ),

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
    ),

    -- Handmatige bedrijfsvoering-velden — NOOIT voor teamleider (klachten/
    -- tevredenheid/audit-status/doelstelling-tekst/ISO-taken/IF-getal).
    'instellingen', case when is_teamleider() then null else (
      select case when di.company_id is null then null else jsonb_build_object(
        'klachten_aantal',           di.klachten_aantal,
        'tevredenheid_score',        di.tevredenheid_score,
        'tevredenheid_toelichting',  di.tevredenheid_toelichting,
        'audit_intern_gedaan',       di.audit_intern_gedaan,
        'audit_intern_totaal',       di.audit_intern_totaal,
        'audit_extern_omschrijving', di.audit_extern_omschrijving,
        'audit_status',              di.audit_status,
        'doelstelling_tekst',        di.doelstelling_tekst,
        'iso_taken_tekst',           di.iso_taken_tekst,
        'updated_at',                di.updated_at
      ) end
      from bedrijf_dashboard_instelling di where di.company_id = p_company_id
    ) end
  ) into v;

  return v;
end;
$function$;

commit;
