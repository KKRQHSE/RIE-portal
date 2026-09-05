-- Migratie 0076: meerjarenoverzicht-verfijningen (opvolging eigen advies uit
-- NACHTBOUW_RAPPORT_2026-09-05.md, sectie "Openstaand")
-- ----------------------------------------------------------------------------
-- Lost drie van de vier daar genoemde punten op:
--
-- 1. Toolbox-dekking gebruikte het HUIDIGE personeelsaantal als noemer voor
--    ELK jaar. Vervangen door een historisch-correcte telling op basis van
--    personen.datum_in_dienst/datum_uit_dienst (dezelfde eff_start/eff_end-
--    aanpak als toolbox_dashboard(), hier per willekeurig jaar i.p.v. alleen
--    het huidige jaar). Geen nieuwe kolommen nodig -- de data bestond al.
--
-- 2. Inspectiedoel was een lopende instelling zonder jaar-dimensie, met
--    terugwerkende kracht toegepast op elk jaar in het meerjarenoverzicht.
--    bedrijf_inspectie_doel krijgt een jaar-kolom (PK wordt company_id,
--    persoon_id, jaar); bestaande rijen worden gelabeld met het huidige jaar
--    (dat IS wat ze nu voorstellen -- geen historie verzonnen, alleen
--    expliciet gemaakt). inspectie_doel_zetten krijgt p_jaar (default huidig
--    jaar, dus bestaande aanroepen blijven werken).
--
-- 3. Doelstellingen (bedrijf_dashboard_instelling.doelstelling_tekst) waren
--    nooit per jaar opgeslagen. Nieuwe tabel bedrijf_jaardoelstelling
--    (company_id, jaar, tekst) -- LET OP: dit is NIET hetzelfde als de
--    bestaande tabel bedrijf_doelstelling (die is een per-functiegroep
--    toolbox-doelaantal, zie toolbox_dashboard() -- andere naam met opzet
--    om verwarring te voorkomen). Bestaande vrije tekst wordt gekopieerd
--    naar het huidige jaar (geen historie verzonnen, alleen verplaatst).
--    De oude kolom blijft bestaan als stille terugval (zelfde patroon als
--    if_dit_jaar/if_vorig_jaar in migratie 0073: additief, geen drop).
--
-- Punt 4 uit het rapport (gewerkte-uren-UI voor willekeurige jaren) is een
-- zuivere UI-wijziging zonder schema-impact -- geen migratie nodig, gebeurt
-- in dezelfde commit aan de applicatiekant.
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Toolbox-dekking: dashboard_meerjaren met historische headcount.
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_meerjaren(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  with jaren as (
    select extract(year from current_date)::int as jaar
    union
    select extract(year from aangemaakt_op)::int from inspectie where company_id = p_company_id
    union
    select extract(year from uitgevoerd_op)::int from inspectie
      where company_id = p_company_id and uitgevoerd_op is not null
    union
    select extract(year from datum)::int from incident where company_id = p_company_id
    union
    select extract(year from datum)::int from toolbox_sessie where company_id = p_company_id
    union
    select jaar from bedrijf_gewerkte_uren where company_id = p_company_id and uren is not null
    union
    select jaar from bedrijf_inspectie_doel where company_id = p_company_id
  ),
  -- Effectief actieve personen per jaar: overlap van [datum_in_dienst, datum_uit_dienst]
  -- met [1 jan, 31 dec] van dat jaar. Onbekende datum_in_dienst = "al vóór dit jaar";
  -- onbekende datum_uit_dienst = "nog steeds". Zelfde aanpak als toolbox_dashboard(),
  -- hier per willekeurig jaar i.p.v. alleen het huidige.
  headcount as (
    select j.jaar, count(*) as n
    from jaren j
    join personen p on p.company_id = p_company_id
      and (p.datum_in_dienst is null or p.datum_in_dienst <= make_date(j.jaar, 12, 31))
      and (p.datum_uit_dienst is null or p.datum_uit_dienst >= make_date(j.jaar, 1, 1))
    group by j.jaar
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jaar', j.jaar,
    'if_getal', if_getal_voor_jaar(p_company_id, j.jaar),
    'inspecties', jsonb_build_object(
      'afgerond', (
        select count(*) from inspectie
         where company_id = p_company_id and status = 'afgerond'
           and extract(year from uitgevoerd_op)::int = j.jaar
      ),
      'doel_totaal', (
        select coalesce(sum(doel_per_jaar), 0) from bedrijf_inspectie_doel
         where company_id = p_company_id and jaar = j.jaar
      )
    ),
    'toolbox', jsonb_build_object(
      'sessies', (
        select count(*) from toolbox_sessie
         where company_id = p_company_id and extract(year from datum)::int = j.jaar
      ),
      'dekking_pct', (
        case when coalesce((select n from headcount where headcount.jaar = j.jaar), 0) = 0 then null else (
          select case when not exists (
                   select 1 from toolbox_sessie
                    where company_id = p_company_id and extract(year from datum)::int = j.jaar
                 ) then null
                 else round(100.0 * (
                   select count(distinct d.persoon_id)
                     from toolbox_deelname d
                     join toolbox_sessie s on s.id = d.sessie_id
                    where d.company_id = p_company_id and s.company_id = p_company_id
                      and extract(year from s.datum)::int = j.jaar
                      and d.persoon_id is not null
                 ) / (select n from headcount where headcount.jaar = j.jaar))
                 end
        ) end
      )
    ),
    'incidenten', (
      select count(*) from incident
       where company_id = p_company_id and extract(year from datum)::int = j.jaar
    ),
    -- Doelstelling: per jaar als vastgelegd; voor het HUIDIGE jaar valt dit terug op de
    -- (nooit-per-jaar-opgeslagen) legacy tekst zodra er nog geen jaar-specifieke rij is --
    -- geen historie verzonnen voor oudere jaren, alleen continuiteit voor "nu".
    'doelstelling', coalesce(
      (select tekst from bedrijf_jaardoelstelling where company_id = p_company_id and jaar = j.jaar),
      case when j.jaar = extract(year from current_date)::int
           then (select doelstelling_tekst from bedrijf_dashboard_instelling where company_id = p_company_id)
           else null end
    )
  ) order by j.jaar desc), '[]'::jsonb)
  into v
  from jaren j;

  return v;
end;
$function$;

-- ============================================================
-- 2. Inspectiedoel per jaar.
-- ============================================================
ALTER TABLE public.bedrijf_inspectie_doel ADD COLUMN IF NOT EXISTS jaar integer;
UPDATE public.bedrijf_inspectie_doel SET jaar = extract(year from current_date)::int WHERE jaar IS NULL;
ALTER TABLE public.bedrijf_inspectie_doel ALTER COLUMN jaar SET NOT NULL;
ALTER TABLE public.bedrijf_inspectie_doel ALTER COLUMN jaar SET DEFAULT extract(year from current_date)::int;

ALTER TABLE public.bedrijf_inspectie_doel DROP CONSTRAINT IF EXISTS bedrijf_inspectie_doel_pkey;
ALTER TABLE public.bedrijf_inspectie_doel ADD CONSTRAINT bedrijf_inspectie_doel_pkey PRIMARY KEY (company_id, persoon_id, jaar);

DROP FUNCTION IF EXISTS public.inspectie_doel_zetten(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.inspectie_doel_zetten(
  p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer,
  p_jaar integer DEFAULT extract(year from current_date)::int
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel_per_jaar,0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  if not exists (select 1 from personen where id = p_persoon_id and company_id = p_company_id and archived_at is null) then
    raise exception 'Persoon hoort niet bij dit bedrijf';
  end if;
  insert into bedrijf_inspectie_doel (company_id, persoon_id, jaar, doel_per_jaar, updated_at)
  values (p_company_id, p_persoon_id, coalesce(p_jaar, extract(year from current_date)::int), coalesce(p_doel_per_jaar, 0), now())
  on conflict (company_id, persoon_id, jaar) do update
    set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.inspectie_doel_zetten(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspectie_doel_zetten(uuid, uuid, integer, integer) TO authenticated, service_role;

-- dashboard_overzicht: het doel-overzicht op het hoofddashboard is en blijft
-- "dit jaar" -- nu expliciet gescopet i.p.v. impliciet (alle rijen telden al
-- mee, want er was er maar één per persoon).
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

    -- Inspectie-doel per persoon (bedrijf_inspectie_doel, nu jaar-specifiek) vs
    -- afgeronde inspecties dit jaar.
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
      where idl.company_id = p_company_id and idl.jaar = v_jaar
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
    -- doelstelling_tekst valt terug op bedrijf_jaardoelstelling (dit jaar) zodra
    -- die is ingevuld; de kolom hier blijft de stille terugval (migratie 0076).
    'instellingen', case when is_teamleider() then null else (
      select case when di.company_id is null then null else jsonb_build_object(
        'klachten_aantal',           di.klachten_aantal,
        'tevredenheid_score',        di.tevredenheid_score,
        'tevredenheid_toelichting',  di.tevredenheid_toelichting,
        'audit_intern_gedaan',       di.audit_intern_gedaan,
        'audit_intern_totaal',       di.audit_intern_totaal,
        'audit_extern_omschrijving', di.audit_extern_omschrijving,
        'audit_status',              di.audit_status,
        'doelstelling_tekst',        coalesce(
          (select tekst from bedrijf_jaardoelstelling where company_id = p_company_id and jaar = v_jaar),
          di.doelstelling_tekst
        ),
        'iso_taken_tekst',           di.iso_taken_tekst,
        'updated_at',                di.updated_at
      ) end
      from bedrijf_dashboard_instelling di where di.company_id = p_company_id
    ) end
  ) into v;

  return v;
end;
$function$;

-- personen_samenvoegen: collision-check en verschuiving nu per jaar i.p.v.
-- blanket-per-persoon (een doel-rij van 2023 en een van 2024 botsen niet
-- met elkaar; alleen twee rijen voor HETZELFDE jaar botsen).
CREATE OR REPLACE FUNCTION public.personen_samenvoegen(p_doel_id uuid, p_bron_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company     uuid;
  v_doel_naam   text;
  v_bron_naam   text;
  v_bron        record;
  v_voorbeeld   jsonb;
  v_verschoven  jsonb;
  n_inspecties  integer;
  n_acties      integer;
  n_herinner    integer;
  n_toolbox     integer;
  n_doel        integer;
  n_deellink    integer;
begin
  v_company := persoon_merge_context(p_doel_id, p_bron_id);

  v_voorbeeld := personen_merge_voorbeeld(p_doel_id, p_bron_id);
  if jsonb_array_length(v_voorbeeld->'botsingen') > 0 then
    raise exception 'Samenvoegen kan niet: beide personen hebben getekend bij %',
      (select string_agg(b->>'omschrijving', ', ')
         from jsonb_array_elements(v_voorbeeld->'botsingen') b);
  end if;

  select naam into v_doel_naam from personen where id = p_doel_id;
  select naam, email, functiegroep_id, datum_in_dienst, datum_uit_dienst, user_id
    into v_bron from personen where id = p_bron_id;
  v_bron_naam := v_bron.naam;

  update inspectie       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_inspecties = row_count;
  update pva_items       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_acties = row_count;
  update herinnering_log set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_herinner = row_count;

  update toolbox_deelname set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_toolbox = row_count;

  delete from bedrijf_inspectie_doel bron
   where bron.persoon_id = p_bron_id
     and exists (select 1 from bedrijf_inspectie_doel d
                  where d.company_id = v_company and d.persoon_id = p_doel_id and d.jaar = bron.jaar);
  update bedrijf_inspectie_doel set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_doel = row_count;

  delete from deellinks
   where persoon_id = p_bron_id
     and exists (select 1 from deellinks d where d.persoon_id = p_doel_id);
  update deellinks set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_deellink = row_count;

  update personen set voorgesteld_door = p_doel_id where voorgesteld_door = p_bron_id;

  v_verschoven := jsonb_build_object(
    'inspecties', n_inspecties, 'acties', n_acties, 'herinneringen', n_herinner,
    'toolbox', n_toolbox, 'inspectie_doel', n_doel, 'deellink', n_deellink
  );

  insert into public.persoon_merge_log (company_id, doel_id, doel_naam, bron_naam, verschoven, wie)
  values (v_company, p_doel_id, v_doel_naam, v_bron_naam, v_verschoven, auth.uid());

  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), 'personen_samengevoegd', 'personen', p_doel_id, v_company,
    jsonb_build_object('doel_naam', v_doel_naam, 'bron_naam', v_bron_naam));

  delete from personen where id = p_bron_id;

  update personen
     set email            = coalesce(email,            v_bron.email),
         functiegroep_id  = coalesce(functiegroep_id,  v_bron.functiegroep_id),
         datum_in_dienst  = coalesce(datum_in_dienst,  v_bron.datum_in_dienst),
         datum_uit_dienst = coalesce(datum_uit_dienst, v_bron.datum_uit_dienst),
         user_id          = coalesce(user_id,          v_bron.user_id)
   where id = p_doel_id;

  return jsonb_build_object(
    'doel_naam', v_doel_naam, 'bron_naam', v_bron_naam, 'verschoven', v_verschoven
  );
end;
$function$;

-- ============================================================
-- 3. Doelstellingen per jaar (bedrijf_jaardoelstelling -- NIET te verwarren
--    met de bestaande bedrijf_doelstelling, dat is een ander concept: een
--    toolbox-doelaantal per functiegroep, zie toolbox_dashboard()).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bedrijf_jaardoelstelling (
  company_id uuid NOT NULL,
  jaar       integer NOT NULL,
  tekst      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, jaar)
);

ALTER TABLE public.bedrijf_jaardoelstelling
  DROP CONSTRAINT IF EXISTS bedrijf_jaardoelstelling_company_id_fkey;
ALTER TABLE public.bedrijf_jaardoelstelling
  ADD CONSTRAINT bedrijf_jaardoelstelling_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.bedrijf_jaardoelstelling ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bedrijf_jaardoelstelling_sel ON public.bedrijf_jaardoelstelling;
CREATE POLICY bedrijf_jaardoelstelling_sel ON public.bedrijf_jaardoelstelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
-- Geen INSERT/UPDATE-policy: alleen via jaardoelstelling_zetten (RPC).

-- Bestaande vrije tekst kopiëren naar het huidige jaar (verplaatsen, geen historie verzinnen).
INSERT INTO public.bedrijf_jaardoelstelling (company_id, jaar, tekst, updated_at)
SELECT company_id, extract(year from current_date)::int, doelstelling_tekst, updated_at
  FROM public.bedrijf_dashboard_instelling
 WHERE doelstelling_tekst IS NOT NULL AND btrim(doelstelling_tekst) <> ''
ON CONFLICT (company_id, jaar) DO NOTHING;

CREATE OR REPLACE FUNCTION public.jaardoelstelling_zetten(p_company_id uuid, p_jaar integer, p_tekst text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if p_jaar is null then raise exception 'Jaar is verplicht'; end if;

  insert into bedrijf_jaardoelstelling (company_id, jaar, tekst, updated_at)
  values (p_company_id, p_jaar, nullif(btrim(coalesce(p_tekst, '')), ''), now())
  on conflict (company_id, jaar) do update
    set tekst = excluded.tekst, updated_at = now();
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.jaardoelstelling_zetten(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jaardoelstelling_zetten(uuid, integer, text) TO authenticated, service_role;

-- dashboard_instelling_zetten: doelstelling_tekst wordt vanaf nu (UI-kant, deze
-- commit) niet meer meegestuurd -- null-veilig bewaren i.p.v. overschrijven,
-- zelfde patroon als if_dit_jaar/if_vorig_jaar (0073).
CREATE OR REPLACE FUNCTION public.dashboard_instelling_zetten(p_company_id uuid, p_klachten_aantal integer, p_tevredenheid_score numeric, p_tevredenheid_toelichting text, p_audit_intern_gedaan integer, p_audit_intern_totaal integer, p_audit_extern_omschrijving text, p_audit_status text, p_doelstelling_tekst text, p_iso_taken_tekst text, p_if_dit_jaar numeric DEFAULT NULL::numeric, p_if_vorig_jaar numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_klachten_aantal, 0) < 0 then raise exception 'Aantal klachten mag niet negatief zijn'; end if;
  if coalesce(p_audit_intern_gedaan, 0) < 0 or coalesce(p_audit_intern_totaal, 0) < 0 then
    raise exception 'Audit-aantallen mogen niet negatief zijn';
  end if;

  insert into bedrijf_dashboard_instelling (
    company_id, klachten_aantal, tevredenheid_score, tevredenheid_toelichting,
    audit_intern_gedaan, audit_intern_totaal, audit_extern_omschrijving, audit_status,
    doelstelling_tekst, iso_taken_tekst, if_dit_jaar, if_vorig_jaar, updated_at
  ) values (
    p_company_id, coalesce(p_klachten_aantal, 0), p_tevredenheid_score, nullif(btrim(coalesce(p_tevredenheid_toelichting, '')), ''),
    coalesce(p_audit_intern_gedaan, 0), coalesce(p_audit_intern_totaal, 0),
    nullif(btrim(coalesce(p_audit_extern_omschrijving, '')), ''), nullif(btrim(coalesce(p_audit_status, '')), ''),
    nullif(btrim(coalesce(p_doelstelling_tekst, '')), ''), nullif(btrim(coalesce(p_iso_taken_tekst, '')), ''),
    p_if_dit_jaar, p_if_vorig_jaar, now()
  )
  on conflict (company_id) do update set
    klachten_aantal           = excluded.klachten_aantal,
    tevredenheid_score        = excluded.tevredenheid_score,
    tevredenheid_toelichting  = excluded.tevredenheid_toelichting,
    audit_intern_gedaan       = excluded.audit_intern_gedaan,
    audit_intern_totaal       = excluded.audit_intern_totaal,
    audit_extern_omschrijving = excluded.audit_extern_omschrijving,
    audit_status              = excluded.audit_status,
    -- Niet meegegeven (null) = laat staan wat er stond (zelfde patroon als IF hieronder).
    doelstelling_tekst        = coalesce(excluded.doelstelling_tekst, bedrijf_dashboard_instelling.doelstelling_tekst),
    iso_taken_tekst           = excluded.iso_taken_tekst,
    if_dit_jaar               = coalesce(excluded.if_dit_jaar,   bedrijf_dashboard_instelling.if_dit_jaar),
    if_vorig_jaar             = coalesce(excluded.if_vorig_jaar, bedrijf_dashboard_instelling.if_vorig_jaar),
    updated_at                = now();
end;
$function$;

commit;
