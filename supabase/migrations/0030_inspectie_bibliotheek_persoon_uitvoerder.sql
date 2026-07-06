-- Migratie 0030: inspectie-bibliotheek toont ook een persoon als uitvoerder
-- ----------------------------------------------------------------------------
-- De uitvoerder in het bibliotheekoverzicht kwam tot nu toe UITSLUITEND uit de
-- eerste inspectie_historie-regel met een ingelogde gebruiker (h.wie → users).
-- Voor historisch geïmporteerde inspecties (uitvoerder = een PERSOON, niet een
-- ingelogde gebruiker; inspectie.persoon_id is gevuld) bleef de uitvoerder leeg.
--
-- Fix: val terug op de naam van inspectie.persoon_id als er geen historie-
-- uitvoerder is. Puur additief (create or replace, zelfde signatuur/gedrag voor
-- bestaande data); geen kolom/permissie gewijzigd.

begin;

create or replace function public.inspectie_bibliotheek(p_company_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
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
        -- Uitvoerder = wie de inspectie startte (eerste historieregel met een 'wie');
        -- valt terug op de gekoppelde persoon (voor historisch geïmporteerde inspecties).
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

commit;
