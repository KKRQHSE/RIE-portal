-- Migratie 0082: locatie op inspecties + toolbox-sessies (Fase 3, deel 1)
-- ----------------------------------------------------------------------------
-- Optionele multi-locatie-ondersteuning, aanpak A (locatie = attribuut, geen
-- rechtenlaag). Vervolg op 0080 (datamodel) en 0081 (correctie schrijf-policy).
-- pva_items krijgt geen RPC-wijziging: dat schrijft al rechtstreeks vanuit de
-- client (pva_update-policy, mag_bedrijf_beheren), zelfde pad als het
-- bestaande persoon_id-veld. WEL nodig (ontdekt tijdens het testen van deze
-- migratie): naast de RLS-policy staat er OOK een kolom-specifieke UPDATE-grant
-- voor de rol authenticated op pva_items (alleen opm/persoon_id/status/
-- updated_at/updated_by/verantw -- kennelijk buiten de genummerde migraties om
-- ooit zo ingesteld, zie geen enkele migratie met "grant update" op deze
-- tabel). Zonder een expliciete GRANT UPDATE (locatie_id) erbij faalt een
-- rechtstreekse client-update met "permission denied for table pva_items" --
-- een tweede, kolom-niveau slot BOVEN de RLS-policy, dat verder niets met de
-- RLS/isolatiegrens te maken heeft (die blijft company_id, ongewijzigd).
--
-- inspectie.project_locatie (vrij tekstveld, migratie 0074) blijft ONGEWIJZIGD
-- naast de nieuwe structurele locatie_id staan -- geen dataverlies, geen
-- migratie van de ene betekenis naar de andere. project_locatie blijft
-- geschikt voor fijnmaziger detail (bijv. "Malden, De Horst 12") dan de
-- locatie-vestiging zelf.
--
-- Alle guards/RLS ongewijzigd van vorm: mag_bedrijf_werken blijft de enige
-- poort, hier alleen aangeroepen. Additief; idempotent (create or replace).

begin;

-- ============================================================
-- 1. inspectie_locatie_zetten -- mirror van inspectie_project_opslaan (0074),
--    maar voor de structurele FK i.p.v. het vrije tekstveld. Cross-company-
--    guard: de locatie moet tot hetzelfde bedrijf horen als de inspectie.
-- ============================================================
create or replace function public.inspectie_locatie_zetten(p_inspectie_id uuid, p_locatie_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company        uuid;
  v_status         text;
  v_locatie_company uuid;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  if p_locatie_id is not null then
    select company_id into v_locatie_company from locatie where id = p_locatie_id;
    if v_locatie_company is null then
      raise exception 'Locatie niet gevonden';
    end if;
    if v_locatie_company <> v_company then
      raise exception 'Locatie hoort bij een ander bedrijf';
    end if;
  end if;

  update inspectie set locatie_id = p_locatie_id where id = p_inspectie_id;
end;
$function$;

revoke execute on function public.inspectie_locatie_zetten(uuid, uuid) from public, anon;
grant  execute on function public.inspectie_locatie_zetten(uuid, uuid) to authenticated;

-- ============================================================
-- 2. inspectie_bibliotheek + inspectie_rapport: locatie_naam meegeven
--    (server-side resolved, zelfde patroon als uitvoerder_naam/
--    functiegroep_naam elders) -- de bibliotheeklijst filtert op de naam
--    exact zoals het bestaande project_locatie-filter al doet.
-- ============================================================
create or replace function public.inspectie_bibliotheek(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
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
        'project_locatie',    i.project_locatie,
        'locatie_id',         i.locatie_id,
        'locatie_naam',       loc.naam,
        'sjabloon_naam_snap', i.sjabloon_naam_snap,
        'controlesoort_snap', i.controlesoort_snap,
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
    left join locatie loc on loc.id = i.locatie_id
    where i.company_id = p_company_id
  ) s;

  return v;
end;
$function$;

create or replace function public.inspectie_rapport(p_inspectie_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_werken(v_company) then
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
    'project_locatie', i.project_locatie,
    'locatie_naam',   loc.naam,
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
  left join locatie loc on loc.id = i.locatie_id
  where i.id = p_inspectie_id;

  return v;
end;
$function$;

-- ============================================================
-- 3. toolbox_sessie_opslaan: optionele p_locatie_id erbij. LET OP (bevestigd
--    tijdens deze migratie): een extra parameter maakt dit in Postgres een
--    ANDERE functie-identiteit (ander overload, andere proargtypes) -- geen
--    echte "replace" van de bestaande 6-argumenten-versie. Het erft dus NIET
--    de bestaande ACL en krijgt opnieuw de default-anon-grant uit migratie
--    0070 (zelfde patroon als een gloednieuwe CREATE FUNCTION). Daarom hier
--    expliciet: de oude 6-argumenten-overload droppen (geen dubbele, dode
--    functie laten staan) en de nieuwe REVOKE/GRANT zoals bij een nieuwe
--    functie, conform AGENTS.md.
-- ============================================================
drop function if exists public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid);

create or replace function public.toolbox_sessie_opslaan(
  p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text,
  p_notitie text, p_toolbox_id uuid default null, p_locatie_id uuid default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_locatie_company uuid;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_onderwerp),'') = '' then raise exception 'Onderwerp is verplicht'; end if;
  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  if p_toolbox_id is not null and not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then
    raise exception 'Gekozen toolbox bestaat niet';
  end if;
  if p_locatie_id is not null then
    select company_id into v_locatie_company from locatie where id = p_locatie_id;
    if v_locatie_company is null then
      raise exception 'Locatie niet gevonden';
    end if;
    if v_locatie_company <> p_company_id then
      raise exception 'Locatie hoort bij een ander bedrijf';
    end if;
  end if;

  if p_sessie_id is null then
    insert into toolbox_sessie (company_id, datum, onderwerp, notitie, toolbox_id, aangemaakt_door, locatie_id)
    values (p_company_id, p_datum, btrim(p_onderwerp), nullif(btrim(coalesce(p_notitie,'')),''), p_toolbox_id, auth.uid(), p_locatie_id)
    returning id into v_id;
    return v_id;
  end if;

  update toolbox_sessie set
    datum = p_datum, onderwerp = btrim(p_onderwerp),
    notitie = nullif(btrim(coalesce(p_notitie,'')),''), toolbox_id = p_toolbox_id,
    locatie_id = p_locatie_id,
    updated_at = now()
  where id = p_sessie_id and company_id = p_company_id;
  if not found then raise exception 'Sessie niet gevonden'; end if;
  return p_sessie_id;
end;
$function$;

revoke execute on function public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid, uuid) from public, anon;
grant  execute on function public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid, uuid) to authenticated;

-- ============================================================
-- 4. toolbox_sessies_overzicht: locatie_naam per sessie (server-side
--    resolved, zelfde patroon als functiegroep_naam verderop in dezelfde RPC).
-- ============================================================
create or replace function public.toolbox_sessies_overzicht(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'totaal_sessies', (select count(*) from toolbox_sessie s where s.company_id = p_company_id),
    'sessie_doel_per_jaar', coalesce(
      (select sessie_doel_per_jaar from bedrijf_toolbox_instelling where company_id = p_company_id), 12),
    'sessies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessie_id', s.id,
        'datum',     s.datum,
        'onderwerp', s.onderwerp,
        'notitie',   s.notitie,
        'toolbox_id', s.toolbox_id,
        'locatie_id', s.locatie_id,
        'locatie_naam', loc.naam,
        'aangemaakt_door', s.aangemaakt_door,
        'opkomst', (select count(*) from toolbox_deelname d where d.sessie_id = s.id),
        'aanwezigen', (
          select coalesce(jsonb_agg(d.persoon_id), '[]'::jsonb)
          from toolbox_deelname d where d.sessie_id = s.id and d.persoon_id is not null
        )
      ) order by s.datum desc, s.created_at desc), '[]'::jsonb)
      from toolbox_sessie s
      left join locatie loc on loc.id = s.locatie_id
      where s.company_id = p_company_id
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', p.id,
        'naam', p.naam,
        'functiegroep_naam', fg.naam,
        'bijgewoond', (
          select count(*) from toolbox_deelname d
          join toolbox_sessie s2 on s2.id = d.sessie_id
          where d.persoon_id = p.id and s2.company_id = p_company_id
        )
      ) order by p.naam), '[]'::jsonb)
      from personen p
      left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
      where p.company_id = p_company_id and p.archived_at is null
    )
  ) into v;

  return v;
end;
$function$;

-- ============================================================
-- 5. pva_items.locatie_id: dezelfde kolom-niveau UPDATE-grant als de
--    bestaande client-schrijfbare velden (zie toelichting bovenaan).
-- ============================================================
grant update (locatie_id) on public.pva_items to authenticated;

commit;
