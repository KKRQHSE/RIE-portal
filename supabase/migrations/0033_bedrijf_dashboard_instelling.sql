-- Migratie 0033: klant-dashboard — handmatige bedrijfsvoering-velden + uitgebreid overzicht
-- ----------------------------------------------------------------------------
-- Het klant-dashboard trekt de modules (RI&E, toolbox, inspectie, incidenten)
-- samen op één scherm. De module-tegels leunen op bestaande lees-RPC's; hier
-- komen de nog ontbrekende stukken bij:
--   1. Een per-bedrijf tabel voor HANDMATIGE velden (nog geen eigen module):
--      klanttevredenheid, audits en twee vrije tekstblokken. Alleen-lezen voor
--      het eigen bedrijf; muteren uitsluitend via de SECURITY DEFINER-RPC
--      (patroon doelstelling_zetten / inspectie_doel_zetten), anon-EXECUTE eruit
--      (Beslissing 62). Externe audit is vrije tekst ("11 en 13 maart") — geen
--      losse datumkolom waar iets op steunt.
--   2. Uitbreiding van dashboard_overzicht met de nieuwe live-blokken
--      (rie.toets_datum, toolbox-sessies, inspectie-doel-voortgang, incidenten)
--      en het instellingen-blok, zodat het dashboard alles in één call heeft.
--      Additief: bestaande sleutels blijven ongewijzigd.

begin;

-- 1. Handmatige bedrijfsvoering-velden ---------------------------------------
create table if not exists public.bedrijf_dashboard_instelling (
  company_id                uuid primary key references public.companies(id) on delete cascade,
  klachten_aantal           integer not null default 0 check (klachten_aantal >= 0),
  tevredenheid_score        numeric(4,1),            -- bv. 7.5; null = nog niet gemeten
  tevredenheid_toelichting  text,
  audit_intern_gedaan       integer not null default 0 check (audit_intern_gedaan >= 0),
  audit_intern_totaal       integer not null default 0 check (audit_intern_totaal >= 0),
  audit_extern_omschrijving text,                    -- leidend, vrije tekst (data + omschrijving)
  audit_status              text,
  doelstelling_tekst        text,
  iso_taken_tekst           text,
  updated_at                timestamptz not null default now()
);

alter table public.bedrijf_dashboard_instelling enable row level security;

-- Alleen-lezen voor het eigen bedrijf; muteren uitsluitend via de RPC (geen write-policy).
drop policy if exists bedrijf_dashboard_instelling_sel on public.bedrijf_dashboard_instelling;
create policy bedrijf_dashboard_instelling_sel on public.bedrijf_dashboard_instelling
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- Upsert van de handmatige velden. Numeriek null-veilig (coalesce → 0); tekst blijft nullable.
create or replace function public.dashboard_instelling_zetten(
  p_company_id                uuid,
  p_klachten_aantal           integer,
  p_tevredenheid_score        numeric,
  p_tevredenheid_toelichting  text,
  p_audit_intern_gedaan       integer,
  p_audit_intern_totaal       integer,
  p_audit_extern_omschrijving text,
  p_audit_status              text,
  p_doelstelling_tekst        text,
  p_iso_taken_tekst           text
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_klachten_aantal, 0) < 0 then raise exception 'Aantal klachten mag niet negatief zijn'; end if;
  if coalesce(p_audit_intern_gedaan, 0) < 0 or coalesce(p_audit_intern_totaal, 0) < 0 then
    raise exception 'Audit-aantallen mogen niet negatief zijn';
  end if;

  insert into bedrijf_dashboard_instelling (
    company_id, klachten_aantal, tevredenheid_score, tevredenheid_toelichting,
    audit_intern_gedaan, audit_intern_totaal, audit_extern_omschrijving, audit_status,
    doelstelling_tekst, iso_taken_tekst, updated_at
  ) values (
    p_company_id, coalesce(p_klachten_aantal, 0), p_tevredenheid_score, nullif(btrim(coalesce(p_tevredenheid_toelichting, '')), ''),
    coalesce(p_audit_intern_gedaan, 0), coalesce(p_audit_intern_totaal, 0),
    nullif(btrim(coalesce(p_audit_extern_omschrijving, '')), ''), nullif(btrim(coalesce(p_audit_status, '')), ''),
    nullif(btrim(coalesce(p_doelstelling_tekst, '')), ''), nullif(btrim(coalesce(p_iso_taken_tekst, '')), ''), now()
  )
  on conflict (company_id) do update set
    klachten_aantal           = excluded.klachten_aantal,
    tevredenheid_score        = excluded.tevredenheid_score,
    tevredenheid_toelichting  = excluded.tevredenheid_toelichting,
    audit_intern_gedaan       = excluded.audit_intern_gedaan,
    audit_intern_totaal       = excluded.audit_intern_totaal,
    audit_extern_omschrijving = excluded.audit_extern_omschrijving,
    audit_status              = excluded.audit_status,
    doelstelling_tekst        = excluded.doelstelling_tekst,
    iso_taken_tekst           = excluded.iso_taken_tekst,
    updated_at                = now();
end;
$function$;

-- Beslissing 62: anon-EXECUTE eruit; alleen ingelogde beheerders + service_role.
revoke execute on function public.dashboard_instelling_zetten(uuid, integer, numeric, text, integer, integer, text, text, text, text) from public;
grant execute on function public.dashboard_instelling_zetten(uuid, integer, numeric, text, integer, integer, text, text, text, text) to authenticated, service_role;

-- 2. Uitgebreid dashboard-overzicht ------------------------------------------
-- Additieve uitbreiding: bestaande sleutels (pva, te_beoordelen, prio_open,
-- termijn, rie, inspecties, norm_bijgewerkt, bewijs) blijven ongewijzigd; nieuw
-- zijn rie.toets_datum, toolbox_sessies, inspectie_doel, incidenten, instellingen.
create or replace function public.dashboard_overzicht(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_jaar int := extract(year from current_date)::int;
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

    -- Incidenten: aantallen naar status en naar gevolg.
    'incidenten', (
      select jsonb_build_object(
        'totaal', count(*),
        'per_status', jsonb_build_object(
          'open',         count(*) filter (where status = 'open'),
          'in_onderzoek', count(*) filter (where status = 'in_onderzoek'),
          'afgehandeld',  count(*) filter (where status = 'afgehandeld')
        ),
        'per_gevolg', (
          select coalesce(jsonb_object_agg(gevolg, aantal), '{}'::jsonb)
          from (
            select unnest(gevolgen) as gevolg, count(*) as aantal
            from incident where company_id = p_company_id
            group by 1
          ) gg
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

    -- Handmatige bedrijfsvoering-velden (null als er nog niets is ingevuld).
    'instellingen', (
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
    )
  ) into v;

  return v;
end;
$function$;

commit;
