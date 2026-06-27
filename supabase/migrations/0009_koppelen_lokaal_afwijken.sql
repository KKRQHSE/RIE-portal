-- Migratie 0009: koppelen + lokaal afwijken (klant)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + mag_bedrijf_beheren-check + cross-company-guard: een bedrijf
-- raakt uitsluitend zijn EIGEN koppeling/afwijking. Lokaal afwijken kan alleen via
-- deze RPC's (de bewuste handeling) — nooit stilzwijgend.
--
-- Cross-company hard gemaakt: company_id is een parameter die wordt geautoriseerd
-- (mag_bedrijf_beheren), en een afwijking mag alleen op een vraag waarvan de
-- rubriek door dít bedrijf is gekoppeld. Zo kan A niets bij B muteren.
--
-- Additief: alleen nieuwe functies. Idempotent via create or replace.

begin;

-- Volledig norm-overzicht voor één bedrijf: per (niet-gearchiveerde) rubriek of ze
-- gekoppeld is, en per vraag de centrale tekst/versie, de eventuele afwijking, of de
-- norm sinds de afwijking is gewijzigd, en de GELDENDE tekst (lokaal/centraal/uit).
-- rie_code wordt bewust NIET teruggegeven (intern dossierveld van de admin).
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
            'afwijking', case when a.vraag_id is null then null else jsonb_build_object(
              'modus',        a.modus,
              'lokale_tekst', a.lokale_tekst,
              'basis_versie', a.basis_versie
            ) end,
            'norm_gewijzigd', (a.vraag_id is not null and q.versie > a.basis_versie),
            'actief',         (a.vraag_id is null or a.modus <> 'uit'),
            'geldende_tekst', case
              when a.vraag_id is null    then q.tekst
              when a.modus = 'lokaal'    then a.lokale_tekst
              else null end
          ) order by q.volgorde, q.id), '[]'::jsonb)
          from centrale_vraag q
          left join bedrijf_vraag_afwijking a
            on a.vraag_id = q.id and a.company_id = p_company_id
          where q.rubriek_id = r.id and q.gearchiveerd_op is null
        )
      ) as rub
    from centrale_rubriek r
    where r.gearchiveerd_op is null
  ) s;

  return v;
end;
$function$;

-- Rubriek koppelen (bedrijf neemt de centrale set over).
create or replace function public.rubriek_koppelen(p_company_id uuid, p_rubriek_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if not exists (select 1 from centrale_rubriek where id = p_rubriek_id and gearchiveerd_op is null) then
    raise exception 'Rubriek niet gevonden of gearchiveerd';
  end if;

  insert into bedrijf_rubriek (company_id, rubriek_id)
  values (p_company_id, p_rubriek_id)
  on conflict (company_id, rubriek_id) do nothing;
end;
$function$;

-- Rubriek ontkoppelen. Eventuele lokale afwijkingen blijven bewaard maar tellen
-- alleen mee zolang de rubriek gekoppeld is.
create or replace function public.rubriek_ontkoppelen(p_company_id uuid, p_rubriek_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from bedrijf_rubriek
   where company_id = p_company_id and rubriek_id = p_rubriek_id;
end;
$function$;

-- Interne helper-logica zit inline in elke vraag-RPC: valideer dat de vraag bestaat
-- en dat de rubriek ervan door dit bedrijf is gekoppeld (anders geen afwijken).

-- Een centrale vraag lokaal herschrijven (eigen tekst). basis_versie = de huidige
-- centrale versie, zodat een latere normwijziging zichtbaar wordt.
create or replace function public.vraag_lokaal_aanpassen(p_company_id uuid, p_vraag_id uuid, p_lokale_tekst text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rubriek uuid;
  v_versie  integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if coalesce(btrim(p_lokale_tekst), '') = '' then
    raise exception 'Lokale tekst is verplicht';
  end if;

  select rubriek_id, versie into v_rubriek, v_versie
    from centrale_vraag where id = p_vraag_id and gearchiveerd_op is null;
  if v_rubriek is null then
    raise exception 'Vraag niet gevonden';
  end if;
  if not exists (select 1 from bedrijf_rubriek br where br.company_id = p_company_id and br.rubriek_id = v_rubriek) then
    raise exception 'Koppel eerst de rubriek voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_vraag_afwijking (company_id, vraag_id, modus, lokale_tekst, basis_versie)
  values (p_company_id, p_vraag_id, 'lokaal', btrim(p_lokale_tekst), v_versie)
  on conflict (company_id, vraag_id) do update
    set modus = 'lokaal', lokale_tekst = excluded.lokale_tekst,
        basis_versie = excluded.basis_versie, afgeweken_op = now();
end;
$function$;

-- Een centrale vraag voor dit bedrijf uitzetten.
create or replace function public.vraag_uitzetten(p_company_id uuid, p_vraag_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rubriek uuid;
  v_versie  integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select rubriek_id, versie into v_rubriek, v_versie
    from centrale_vraag where id = p_vraag_id and gearchiveerd_op is null;
  if v_rubriek is null then
    raise exception 'Vraag niet gevonden';
  end if;
  if not exists (select 1 from bedrijf_rubriek br where br.company_id = p_company_id and br.rubriek_id = v_rubriek) then
    raise exception 'Koppel eerst de rubriek voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_vraag_afwijking (company_id, vraag_id, modus, lokale_tekst, basis_versie)
  values (p_company_id, p_vraag_id, 'uit', null, v_versie)
  on conflict (company_id, vraag_id) do update
    set modus = 'uit', lokale_tekst = null,
        basis_versie = excluded.basis_versie, afgeweken_op = now();
end;
$function$;

-- Terug naar de centrale versie: hef de afwijking op (= ook "overnemen" van een
-- bijgewerkte norm). Het bedrijf volgt daarna weer automatisch de norm.
create or replace function public.vraag_terug_naar_centraal(p_company_id uuid, p_vraag_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from bedrijf_vraag_afwijking
   where company_id = p_company_id and vraag_id = p_vraag_id;
end;
$function$;

grant execute on function public.bedrijf_norm_overzicht(uuid) to anon, authenticated, service_role;
grant execute on function public.rubriek_koppelen(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.rubriek_ontkoppelen(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.vraag_lokaal_aanpassen(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.vraag_uitzetten(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.vraag_terug_naar_centraal(uuid, uuid) to anon, authenticated, service_role;

commit;
