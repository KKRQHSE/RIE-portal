-- Migratie 0013: een lokale afwijking blijft leven, ook als centraal archiveert
-- ----------------------------------------------------------------------------
-- Correctie op het model: wie LOKAAL afweek (eigen tekst) mag blijven afwijken,
-- ook nadat de centrale vraag (of rubriek) is gearchiveerd. De centrale archivering
-- raakt alleen de bedrijven die de norm vólgden (daar valt de vraag weg) en de
-- bedrijven die de vraag hadden uitgezet (blijft weg). Een lokale eigen tekst
-- overleeft het archiveren en wordt gemarkeerd als 'centraal vervallen'.
--
-- Aangepast: bedrijf_norm_overzicht (toont vervallen-eigen-versie + vlag
-- centraal_vervallen) en inspectie_start_centraal (neemt overlevende lokale
-- vragen mee in de snapshot). Additief: alleen create-or-replace. Idempotent.

begin;

create or replace function public.bedrijf_norm_overzicht(p_company_id uuid)
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

  select coalesce(jsonb_agg(rub order by rub_volgorde, rub_id), '[]'::jsonb)
  into v
  from (
    select
      r.volgorde as rub_volgorde,
      r.id       as rub_id,
      jsonb_build_object(
        'rubriek_id', r.id,
        'naam',       r.naam,
        'volgorde',   r.volgorde,
        'gekoppeld',  exists (
          select 1 from bedrijf_rubriek br
          where br.company_id = p_company_id and br.rubriek_id = r.id
        ),
        'vragen', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'vraag_id',        q.id,
            'volgorde',        q.volgorde,
            'centrale_tekst',  q.tekst,
            'centrale_versie', q.versie,
            -- Centraal gearchiveerd, maar door dit bedrijf lokaal behouden.
            'centraal_vervallen', (q.gearchiveerd_op is not null),
            'afwijking', case when a.vraag_id is null then null else jsonb_build_object(
              'modus',        a.modus,
              'lokale_tekst', a.lokale_tekst,
              'basis_versie', a.basis_versie
            ) end,
            -- 'norm gewijzigd' alleen bij een nog-actieve centrale vraag; bij een
            -- gearchiveerde vraag geldt 'centraal_vervallen' in plaats daarvan.
            'norm_gewijzigd', (a.vraag_id is not null and q.gearchiveerd_op is null and q.versie > a.basis_versie),
            'actief',         (a.vraag_id is null or a.modus <> 'uit'),
            'geldende_tekst', case
              when a.vraag_id is null    then q.tekst
              when a.modus = 'lokaal'    then a.lokale_tekst
              else null end
          ) order by q.volgorde, q.id), '[]'::jsonb)
          from centrale_vraag q
          left join bedrijf_vraag_afwijking a
            on a.vraag_id = q.id and a.company_id = p_company_id
          where q.rubriek_id = r.id
            -- Actieve vragen, plus gearchiveerde vragen die dit bedrijf lokaal hield.
            and (q.gearchiveerd_op is null or (a.vraag_id is not null and a.modus = 'lokaal'))
        )
      ) as rub
    from centrale_rubriek r
    where
      -- Niet-gearchiveerde rubrieken altijd (ook om te kunnen koppelen);
      -- gearchiveerde rubrieken alleen als dit bedrijf er een lokaal behouden vraag in heeft.
      r.gearchiveerd_op is null
      or exists (
        select 1
        from bedrijf_rubriek br
        join centrale_vraag q2 on q2.rubriek_id = r.id and q2.gearchiveerd_op is not null
        join bedrijf_vraag_afwijking a2 on a2.vraag_id = q2.id
          and a2.company_id = p_company_id and a2.modus = 'lokaal'
        where br.company_id = p_company_id and br.rubriek_id = r.id
      )
  ) s;

  return v;
end;
$function$;

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

  -- Effectieve vragen: gekoppelde rubrieken; de geldende tekst (lokaal/centraal);
  -- zonder uitgezette vragen; archivering laat een LOKAAL behouden vraag staan.
  with eff as (
    select
      r.naam     as rubriek_naam,
      r.volgorde as rub_volg,
      q.volgorde as vraag_volg,
      q.id       as vraag_id,
      case when a.modus = 'lokaal' then a.lokale_tekst else q.tekst end as tekst
    from bedrijf_rubriek br
    join centrale_rubriek r on r.id = br.rubriek_id
    join centrale_vraag   q on q.rubriek_id = r.id
    left join bedrijf_vraag_afwijking a
      on a.vraag_id = q.id and a.company_id = p_company_id
    where br.company_id = p_company_id
      and coalesce(a.modus, '') <> 'uit'
      and (
        (q.gearchiveerd_op is null and r.gearchiveerd_op is null)
        or a.modus = 'lokaal'
      )
  )
  insert into inspectie_bevinding
    (company_id, inspectie_id, rubriek_naam_snap, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select
    p_company_id, v_inspectie, rubriek_naam, tekst, true,
    row_number() over (order by rub_volg, vraag_volg, vraag_id),
    'geen'
  from eff;

  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then
    raise exception 'Koppel eerst rubrieken met vragen voordat je een inspectie start';
  end if;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (p_company_id, v_inspectie, auth.uid(), now(), 'Inspectie gestart vanuit de norm');

  return v_inspectie;
end;
$function$;

commit;
