-- ============================================================================
-- Werkplekinspectie — de RAPPORTEN-laag (lezen/presenteren)
-- ----------------------------------------------------------------------------
-- (Let op: dit is de rapporten-/bibliotheeklaag, NIET de inspectie-"stap 2" rond
--  planning/toewijzing/herinneringen — die ligt bij externe review.)
-- Draai dit bestand via: node scripts/db_run.mjs --file db/inspectie_rapporten_rpcs.sql
--
-- Twee ALLEEN-LEZEN RPC's die de bibliotheek (overzicht) en de rapportpagina
-- (detail) voeden. Geen schemawijziging, geen mutatie, geen logging — een
-- rapport observeert. Zelfde patroon als de dashboard-RPC's:
--   * SECURITY DEFINER + vaste search_path = public
--   * autorisatie via mag_bedrijf_beheren(company_id); company_id wordt NOOIT
--     van de client vertrouwd. Bij inspectie_rapport leiden we het bedrijf
--     server-side af uit de inspectie en weigeren we cross-company.
--
-- Idempotent: create or replace.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- inspectie_bibliotheek: één samenvattingsregel per inspectie van het bedrijf,
-- nieuwste eerst (op uitgevoerd_op, anders aangemaakt_op). Bevat alle velden om
-- een inspectie te kunnen voortzetten én de cijfers voor het archiefoverzicht.
-- ----------------------------------------------------------------------------
create or replace function public.inspectie_bibliotheek(p_company_id uuid)
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
        -- Uitvoerder = wie de inspectie startte (eerste historieregel met een 'wie').
        'uitvoerder_naam', (
          select u.naam
            from inspectie_historie h
            left join users u on u.id = h.wie
           where h.inspectie_id = i.id and h.wie is not null
           order by h.wanneer asc
           limit 1
        ),
        'aantal_punten',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id),
        'aantal_niet_in_orde', (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.resultaat = 'niet_in_orde'),
        -- Punten die een actie werden (afhandeling 'actie' met een gekoppeld actie_id).
        'aantal_acties',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.actie_id is not null)
      ) as row
    from inspectie i
    where i.company_id = p_company_id
  ) s;

  return v;
end;
$$;


-- ----------------------------------------------------------------------------
-- inspectie_rapport: één inspectie volledig, voor de rapport-detailpagina.
-- Kop + alle bevindingen (in bevroren volgorde) + de eruit voortgekomen acties
-- (pva_items via bron_type/bron_id) + de historie als tijdlijn.
-- ----------------------------------------------------------------------------
create or replace function public.inspectie_rapport(p_inspectie_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v jsonb;
begin
  -- Bedrijf server-side afleiden uit de inspectie; nooit van de client vertrouwen.
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

    -- Alle bevindingen in bevroren (sjabloon-)volgorde, met evt. actienummer.
    'bevindingen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',              b.id,
        'volgorde',        b.volgorde,
        'punt_tekst_snap', b.punt_tekst_snap,
        'verplicht',       b.verplicht,
        'resultaat',       b.resultaat,
        'afhandeling',     b.afhandeling,
        'opmerking',       b.opmerking,
        'actie_id',        b.actie_id,
        'actie_nr',        pa.nr
      ) order by b.volgorde, b.id), '[]'::jsonb)
      from inspectie_bevinding b
      left join pva_items pa on pa.id = b.actie_id
      where b.inspectie_id = i.id
    ),

    -- De eruit voortgekomen acties (PvA-items met deze inspectie als bron).
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

    -- Historie als tijdlijn (oudste eerst), met naam van wie de actie deed.
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
$$;


-- ----------------------------------------------------------------------------
-- Rechten: uitsluitend voor ingelogde gebruikers; de autorisatie zit in de RPC.
-- ----------------------------------------------------------------------------
grant execute on function public.inspectie_bibliotheek(uuid) to authenticated;
grant execute on function public.inspectie_rapport(uuid)     to authenticated;

commit;
