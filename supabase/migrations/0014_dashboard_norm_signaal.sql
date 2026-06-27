-- Migratie 0014: dashboard-telling 'norm_bijgewerkt'
-- ----------------------------------------------------------------------------
-- Voegt aan dashboard_overzicht één extra getal toe: het aantal punten waar dit
-- bedrijf lokaal afwijkt (eigen tekst óf uitgezet) én de centrale norm sindsdien
-- is gewijzigd (centrale versie > basis_versie). Dat zijn de afwijkingen die nog
-- niet zijn beantwoord (overnemen of mijn-versie-houden wist het signaal). De
-- 'centraal vervallen'-staat telt bewust NIET mee: dat is een staande keuze, geen
-- onbeantwoorde wijziging, en zou de teller permanent laten branden.
--
-- Additief: alleen create-or-replace met één extra jsonb-sleutel. Idempotent.

begin;

create or replace function public.dashboard_overzicht(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
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
        'geldig_tot',           r.geldig_tot,
        'verloopt_binnenkort',  r.geldig_tot is not null and r.geldig_tot < now() + interval '60 days'
      ) end
      from (
        select id, versie, status, geldig_tot
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
    )
  ) into v;

  return v;
end;
$function$;

commit;
