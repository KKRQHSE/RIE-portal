-- Migratie 0052: AI-herkomst zichtbaar in het inspectierapport
-- ----------------------------------------------------------------------------
-- Gevonden in de browsertest van 0050/0051. Het invulscherm toont bij een
-- bevinding een labeltje zodra de toelichting uit AI-voorwerk is ontstaan, maar
-- het RAPPORT deed dat niet: daar stond de herkomst alleen in de geschiedenis,
-- onderaan, los van de bevinding zelf.
--
-- Juist het rapport is het document dat later gelezen, afgedrukt en als PDF
-- gedeeld wordt — vaak door iemand die er niet bij was. Wie daar een toelichting
-- leest, hoort naast die toelichting te zien dat het voorwerk van een machine
-- kwam en dat een mens het heeft beoordeeld en vastgesteld. Een regel onderaan
-- in de tijdlijn is daarvoor te makkelijk te missen.
--
-- Toegevoegd: per bevinding een 'ai_voorwerk'-object, of null als er geen
-- AI-suggestie is overgenomen. Het bevat wie het voorstel deed (leverancier +
-- model) en wie het wanneer heeft vastgesteld — precies de twee helften van
-- "AI stelde voor, mens besliste".
--
-- Alleen suggesties met status 'overgenomen' tellen. Een verworpen of nog open
-- concept heeft de bevinding niet geraakt en hoort dus ook niet in het rapport.
-- Bij meerdere overgenomen suggesties op één punt wint de laatste: die tekst
-- staat er nu.
--
-- Additief: de RPC krijgt er één veld bij, bestaande velden blijven ongewijzigd.
-- De guard (mag_bedrijf_beheren) en de grants blijven zoals ze waren; er komt
-- geen nieuw leesoppervlak bij, want de aanroeper mocht deze inspectie al zien.

begin;

create or replace function public.inspectie_rapport(p_inspectie_id uuid)
 returns jsonb
 language plpgsql stable security definer set search_path to 'public'
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
        'actie_nr',         pa.nr,
        -- NIEUW (0052): null als er geen AI-suggestie is overgenomen.
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

-- Grants opnieuw zetten zodat anon er zeker niet bij kan (Beslissing 62).
revoke execute on function public.inspectie_rapport(uuid) from public, anon;
grant  execute on function public.inspectie_rapport(uuid) to authenticated, service_role;

commit;
