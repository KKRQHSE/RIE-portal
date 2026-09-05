-- Migratie 0071: concept-medewerkers + goedkeuring + correctie-spoor (Spoor B, B1)
-- ----------------------------------------------------------------------------
-- Hergebruikt het bestaande personen.status='voorgesteld'-mechanisme (was al
-- de "grijs, zichtbaar concept"-marker, alleen nooit vanuit de UI bruikbaar —
-- vind_of_maak_persoon die dit zet is service-role-only). Voegt toe:
--  1. status='afgewezen' (widen CHECK) — een afgewezen concept-persoon wordt
--     NOOIT hard verwijderd, altijd deze status.
--  2. goedkeuringsverzoek: één rij per aanmaak/koppel-poging, met een partial
--     unique index (max 1 open verzoek per persoon) en een bevroren-trigger
--     zodra behandeld (status weg van 'open' = op slot, ook behandel-velden).
--  3. correctie_log: append-only (zelfde patroon als audit_log, migratie
--     0068), gevuld door TRIGGERS op personen (naam/email) en op
--     toolbox_deelname/inspectie/pva_items (persoon_id) — dus onafhankelijk
--     van welk RPC-pad de wijziging veroorzaakte. Dit maakt "correctie zonder
--     spoor" onmogelijk, niet alleen "niet aanbevolen".
--  4. RPC's: zoeken (teamleider-only, minimale velden), aanmaken (met
--     duplicaat-waarschuwing, geen blokkade), koppelen aan bestaand,
--     goedkeuren, afwijzen (atomisch, per gekoppeld item een keuze).
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. personen.status: 'afgewezen' toevoegen.
-- ============================================================
ALTER TABLE public.personen DROP CONSTRAINT IF EXISTS personen_status_check;
ALTER TABLE public.personen ADD CONSTRAINT personen_status_check
  CHECK (status = ANY (ARRAY['actief'::text, 'voorgesteld'::text, 'afgewezen'::text]));

-- ============================================================
-- 2. goedkeuringsverzoek
-- ============================================================
CREATE TABLE IF NOT EXISTS public.goedkeuringsverzoek (
  id                     uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type                   text NOT NULL CHECK (type = ANY (ARRAY['nieuw_concept'::text, 'koppel_bestaand'::text])),
  -- Nullable + SET NULL (niet CASCADE): als de gekoppelde persoon ooit alsnog
  -- wordt verwijderd (bestaand KAM-recht, ongewijzigd), blijft het besluit
  -- zelf herleidbaar in plaats van te verdwijnen — zelfde filosofie als
  -- pva_items.persoon_id/toolbox_deelname.persoon_id.
  persoon_id             uuid REFERENCES public.personen(id) ON DELETE SET NULL,
  mogelijk_duplicaat_van uuid REFERENCES public.personen(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open'::text, 'goedgekeurd'::text, 'afgewezen'::text])),
  aangemaakt_door        uuid NOT NULL,
  aangemaakt_op          timestamptz NOT NULL DEFAULT now(),
  behandeld_door         uuid,
  behandeld_op           timestamptz,
  reden_afwijzing        text,
  actie_pva_item_id      uuid REFERENCES public.pva_items(id) ON DELETE SET NULL
);

-- Nooit twee open verzoeken tegelijk voor dezelfde persoon (voorkomt
-- dubbel-behandelen/race conditions bij goedkeuren/afwijzen).
CREATE UNIQUE INDEX IF NOT EXISTS goedkeuringsverzoek_een_open_per_persoon
  ON public.goedkeuringsverzoek (persoon_id) WHERE (status = 'open');

CREATE INDEX IF NOT EXISTS goedkeuringsverzoek_company_status_idx
  ON public.goedkeuringsverzoek (company_id, status);

ALTER TABLE public.goedkeuringsverzoek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goedkeuringsverzoek_sel ON public.goedkeuringsverzoek;
CREATE POLICY goedkeuringsverzoek_sel ON public.goedkeuringsverzoek AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id) OR aangemaakt_door = auth.uid());

-- Bevroren zodra behandeld: zelfde patroon als inspectie_bevroren_bewaken
-- (OLD-status bepaalt of de overgang NAAR bevroren nog mag; eenmaal daar,
-- ligt de HELE rij vast — geen apart "alleen behandel-velden"-uitzondering
-- nodig, er is na behandelen niets meer aan te passen).
CREATE OR REPLACE FUNCTION public.goedkeuringsverzoek_bevroren_bewaken()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'open' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Dit goedkeuringsverzoek is al behandeld en ligt vast';
END;
$function$;

DROP TRIGGER IF EXISTS goedkeuringsverzoek_bevroren ON public.goedkeuringsverzoek;
CREATE TRIGGER goedkeuringsverzoek_bevroren
  BEFORE UPDATE ON public.goedkeuringsverzoek
  FOR EACH ROW EXECUTE FUNCTION public.goedkeuringsverzoek_bevroren_bewaken();

REVOKE EXECUTE ON FUNCTION public.goedkeuringsverzoek_bevroren_bewaken() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goedkeuringsverzoek_bevroren_bewaken() TO authenticated, service_role;

-- ============================================================
-- 3. correctie_log — append-only correctie-spoor (zelfde stijl als audit_log).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.correctie_log (
  id          uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id  uuid NOT NULL,
  tabel       text NOT NULL,
  record_id   uuid NOT NULL,
  veld        text NOT NULL,
  van_waarde  text,
  naar_waarde text,
  reden       text,
  wie         uuid,
  wanneer     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS correctie_log_company_wanneer_idx ON public.correctie_log (company_id, wanneer DESC);
CREATE INDEX IF NOT EXISTS correctie_log_record_idx ON public.correctie_log (tabel, record_id);

ALTER TABLE public.correctie_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS correctie_log_sel ON public.correctie_log;
CREATE POLICY correctie_log_sel ON public.correctie_log AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));

-- Geen enkele INSERT/UPDATE/DELETE-policy: schrijven kan uitsluitend via de
-- triggers hieronder (SECURITY DEFINER, bypassen RLS toch al als eigenaar).

CREATE OR REPLACE FUNCTION public.correctie_log_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'correctie_log is append-only: wijzigen, verwijderen of legen kan niet, ook niet met service-role';
END;
$function$;

DROP TRIGGER IF EXISTS correctie_log_no_update ON public.correctie_log;
CREATE TRIGGER correctie_log_no_update
  BEFORE UPDATE ON public.correctie_log
  FOR EACH ROW EXECUTE FUNCTION public.correctie_log_immutable();

DROP TRIGGER IF EXISTS correctie_log_no_delete ON public.correctie_log;
CREATE TRIGGER correctie_log_no_delete
  BEFORE DELETE ON public.correctie_log
  FOR EACH ROW EXECUTE FUNCTION public.correctie_log_immutable();

DROP TRIGGER IF EXISTS correctie_log_no_truncate ON public.correctie_log;
CREATE TRIGGER correctie_log_no_truncate
  BEFORE TRUNCATE ON public.correctie_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.correctie_log_immutable();

REVOKE EXECUTE ON FUNCTION public.correctie_log_immutable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correctie_log_immutable() TO authenticated, service_role;

-- ============================================================
-- 4. Auto-logging triggers — het onuitwisbare deel. Vuren op ELKE wijziging
--    aan deze velden, ongeacht welk RPC-pad (of een toekomstige directe
--    UPDATE via personen_write) de wijziging veroorzaakte.
-- ============================================================

-- current_setting('app.correctie_reden', true) is optioneel: een RPC kan 'm
-- vóór de UPDATE zetten (set_config(..., true) = alleen deze transactie) om
-- een reden mee te geven; zonder die context blijft 'reden' gewoon null.
CREATE OR REPLACE FUNCTION public.personen_correctie_loggen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.naam IS DISTINCT FROM OLD.naam THEN
    INSERT INTO public.correctie_log (company_id, tabel, record_id, veld, van_waarde, naar_waarde, reden, wie)
    VALUES (NEW.company_id, 'personen', NEW.id, 'naam', OLD.naam, NEW.naam,
            nullif(current_setting('app.correctie_reden', true), ''), auth.uid());
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.correctie_log (company_id, tabel, record_id, veld, van_waarde, naar_waarde, reden, wie)
    VALUES (NEW.company_id, 'personen', NEW.id, 'email', OLD.email, NEW.email,
            nullif(current_setting('app.correctie_reden', true), ''), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS personen_correctie_audit ON public.personen;
CREATE TRIGGER personen_correctie_audit
  AFTER UPDATE ON public.personen
  FOR EACH ROW
  WHEN (NEW.naam IS DISTINCT FROM OLD.naam OR NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION public.personen_correctie_loggen();

REVOKE EXECUTE ON FUNCTION public.personen_correctie_loggen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personen_correctie_loggen() TO authenticated, service_role;

-- Eén gedeelde functie voor persoon_id-herkoppeling op drie tabellen —
-- TG_TABLE_NAME geeft de tabelnaam automatisch mee.
CREATE OR REPLACE FUNCTION public.persoon_koppeling_correctie_loggen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.correctie_log (company_id, tabel, record_id, veld, van_waarde, naar_waarde, reden, wie)
  VALUES (NEW.company_id, TG_TABLE_NAME, NEW.id, 'persoon_id',
          OLD.persoon_id::text, NEW.persoon_id::text,
          nullif(current_setting('app.correctie_reden', true), ''), auth.uid());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS toolbox_deelname_persoon_correctie_audit ON public.toolbox_deelname;
CREATE TRIGGER toolbox_deelname_persoon_correctie_audit
  AFTER UPDATE ON public.toolbox_deelname
  FOR EACH ROW WHEN (NEW.persoon_id IS DISTINCT FROM OLD.persoon_id)
  EXECUTE FUNCTION public.persoon_koppeling_correctie_loggen();

DROP TRIGGER IF EXISTS inspectie_persoon_correctie_audit ON public.inspectie;
CREATE TRIGGER inspectie_persoon_correctie_audit
  AFTER UPDATE ON public.inspectie
  FOR EACH ROW WHEN (NEW.persoon_id IS DISTINCT FROM OLD.persoon_id)
  EXECUTE FUNCTION public.persoon_koppeling_correctie_loggen();

DROP TRIGGER IF EXISTS pva_items_persoon_correctie_audit ON public.pva_items;
CREATE TRIGGER pva_items_persoon_correctie_audit
  AFTER UPDATE ON public.pva_items
  FOR EACH ROW WHEN (NEW.persoon_id IS DISTINCT FROM OLD.persoon_id)
  EXECUTE FUNCTION public.persoon_koppeling_correctie_loggen();

REVOKE EXECUTE ON FUNCTION public.persoon_koppeling_correctie_loggen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persoon_koppeling_correctie_loggen() TO authenticated, service_role;

-- ============================================================
-- 5. Zoek-RPC — teamleider-only, minimale velden (need-to-know, zie
--    OPENSTAAND_SPOOR_B.md voor de AVG-toets op de exacte veldenlijst).
-- ============================================================
CREATE OR REPLACE FUNCTION public.persoon_zoeken_voor_koppeling(p_company_id uuid, p_zoekterm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb;
begin
  if not (is_teamleider() and mag_bedrijf_werken(p_company_id)) then
    raise exception 'Geen toegang';
  end if;
  if coalesce(btrim(p_zoekterm), '') = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'naam', p.naam,
    'functiegroep_naam', fg.naam,
    'in_dienst', (p.datum_uit_dienst is null or p.datum_uit_dienst >= current_date)
  ) order by p.naam), '[]'::jsonb)
  into v
  from personen p
  left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
  where p.company_id = p_company_id
    and p.status = 'actief'
    and p.archived_at is null
    and (p.naam ilike '%' || btrim(p_zoekterm) || '%'
         or (p.email is not null and p.email ilike '%' || btrim(p_zoekterm) || '%'))
  limit 20;

  return v;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.persoon_zoeken_voor_koppeling(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persoon_zoeken_voor_koppeling(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 6. Aanmaken — nieuwe concept-persoon, met duplicaat-waarschuwing (niet
--    blokkerend). Twee aanroepen: eerst zonder p_negeer_duplicaat_waarschuwing
--    (levert alleen mogelijke_duplicaten, maakt niets aan als die er zijn),
--    dan desgewenst nogmaals met p_negeer_duplicaat_waarschuwing=true.
-- ============================================================
CREATE OR REPLACE FUNCTION public.concept_medewerker_aanmaken(
  p_company_id uuid,
  p_naam text,
  p_email text DEFAULT NULL::text,
  p_functiegroep_id uuid DEFAULT NULL::uuid,
  p_negeer_duplicaat_waarschuwing boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_naam       text := btrim(coalesce(p_naam, ''));
  v_email      text := nullif(btrim(coalesce(p_email, '')), '');
  v_duplicaten jsonb;
  v_top_id     uuid;
  v_persoon_id uuid;
  v_verzoek_id uuid;
  v_nr         integer;
  v_actie_id   uuid;
begin
  if not (is_teamleider() and mag_bedrijf_werken(p_company_id)) then
    raise exception 'Geen toegang';
  end if;
  if v_naam = '' then
    raise exception 'Naam is verplicht';
  end if;
  if p_functiegroep_id is not null and not exists (
    select 1 from functiegroep where id = p_functiegroep_id and company_id = p_company_id and gearchiveerd_op is null
  ) then
    raise exception 'Functiegroep hoort niet bij dit bedrijf';
  end if;

  with kandidaten as (
    select p.id, p.naam,
           fg.naam as functiegroep_naam,
           (p.datum_uit_dienst is null or p.datum_uit_dienst >= current_date) as in_dienst,
           (v_email is not null and p.email is not null and lower(p.email) = lower(v_email)) as email_match
    from personen p
    left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
    where p.company_id = p_company_id and p.status = 'actief' and p.archived_at is null
      and (lower(btrim(p.naam)) = lower(v_naam)
           or (v_email is not null and p.email is not null and lower(p.email) = lower(v_email)))
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'naam', naam, 'functiegroep_naam', functiegroep_naam, 'in_dienst', in_dienst
    ) order by email_match desc, naam), '[]'::jsonb),
    (array_agg(id order by email_match desc, naam))[1]
  into v_duplicaten, v_top_id
  from kandidaten;

  if v_duplicaten <> '[]'::jsonb and not coalesce(p_negeer_duplicaat_waarschuwing, false) then
    return jsonb_build_object('aangemaakt', false, 'mogelijke_duplicaten', v_duplicaten);
  end if;

  insert into personen (company_id, naam, email, status, functiegroep_id)
  values (p_company_id, v_naam, v_email, 'voorgesteld', p_functiegroep_id)
  returning id into v_persoon_id;

  insert into goedkeuringsverzoek (company_id, type, persoon_id, mogelijk_duplicaat_van, aangemaakt_door)
  values (p_company_id, 'nieuw_concept', v_persoon_id,
          case when v_duplicaten <> '[]'::jsonb then v_top_id else null end, auth.uid())
  returning id into v_verzoek_id;

  select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1 into v_nr
    from pva_items where company_id = p_company_id;
  insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
  values (p_company_id, v_nr::text, 'Goedkeuring nieuwe medewerker: ' || v_naam, 'Open', 'Middel',
          'concept_medewerker', v_persoon_id, now())
  returning id into v_actie_id;
  update goedkeuringsverzoek set actie_pva_item_id = v_actie_id where id = v_verzoek_id;

  return jsonb_build_object(
    'aangemaakt', true, 'persoon_id', v_persoon_id, 'goedkeuringsverzoek_id', v_verzoek_id,
    'mogelijk_duplicaat_van', case when v_duplicaten <> '[]'::jsonb then v_top_id else null end
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.concept_medewerker_aanmaken(uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concept_medewerker_aanmaken(uuid, text, text, uuid, boolean) TO authenticated, service_role;

-- ============================================================
-- 7. Koppelen aan bestaande (actieve) persoon — geen nieuwe personen-rij.
-- ============================================================
CREATE OR REPLACE FUNCTION public.concept_medewerker_koppelen(p_company_id uuid, p_persoon_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_naam       text;
  v_verzoek_id uuid;
  v_nr         integer;
  v_actie_id   uuid;
begin
  if not (is_teamleider() and mag_bedrijf_werken(p_company_id)) then
    raise exception 'Geen toegang';
  end if;

  select naam into v_naam from personen
   where id = p_persoon_id and company_id = p_company_id and status = 'actief' and archived_at is null;
  if v_naam is null then
    raise exception 'Persoon niet gevonden of hoort niet bij dit bedrijf';
  end if;

  insert into goedkeuringsverzoek (company_id, type, persoon_id, aangemaakt_door)
  values (p_company_id, 'koppel_bestaand', p_persoon_id, auth.uid())
  returning id into v_verzoek_id;

  select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1 into v_nr
    from pva_items where company_id = p_company_id;
  insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
  values (p_company_id, v_nr::text, 'Bevestig koppeling: ' || v_naam, 'Open', 'Middel',
          'concept_medewerker', p_persoon_id, now())
  returning id into v_actie_id;
  update goedkeuringsverzoek set actie_pva_item_id = v_actie_id where id = v_verzoek_id;

  return jsonb_build_object('goedkeuringsverzoek_id', v_verzoek_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.concept_medewerker_koppelen(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concept_medewerker_koppelen(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 8. Goedkeuren — KAM/admin-only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.concept_medewerker_goedkeuren(p_goedkeuringsverzoek_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_verzoek public.goedkeuringsverzoek;
begin
  select * into v_verzoek from goedkeuringsverzoek where id = p_goedkeuringsverzoek_id;
  if v_verzoek.id is null then raise exception 'Verzoek niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_verzoek.company_id) then raise exception 'Geen toegang'; end if;
  if v_verzoek.status <> 'open' then raise exception 'Dit verzoek is al behandeld'; end if;

  if v_verzoek.type = 'nieuw_concept' and v_verzoek.persoon_id is not null then
    update personen set status = 'actief' where id = v_verzoek.persoon_id;
  end if;

  update goedkeuringsverzoek
     set status = 'goedgekeurd', behandeld_door = auth.uid(), behandeld_op = now()
   where id = p_goedkeuringsverzoek_id;

  if v_verzoek.actie_pva_item_id is not null then
    update pva_items set status = 'Afgerond', updated_at = now() where id = v_verzoek.actie_pva_item_id;
    insert into actie_historie (company_id, pva_item_id, gebeurtenis, van_status, naar_status, actor_naam, actor_type)
    values (v_verzoek.company_id, v_verzoek.actie_pva_item_id, 'concept_medewerker_goedgekeurd', 'Open', 'Afgerond',
            coalesce((select naam from users where id = auth.uid()), null), 'beheerder');
  end if;

  return jsonb_build_object('status', 'goedgekeurd');
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.concept_medewerker_goedkeuren(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concept_medewerker_goedkeuren(uuid) TO authenticated, service_role;

-- ============================================================
-- 9. Afwijzen — KAM/admin-only, atomisch: elk gekoppeld item (toolbox_deelname/
--    inspectie/actie) moet expliciet een keuze krijgen, anders weigert de RPC.
--    Mechanisch identiek voor alle drie keuzes (persoon_id -> null + logregel
--    via de triggers uit stap 4) — 'weggooien' sluit bij een ACTIE bovendien
--    de pva_items-rij af (status Afgerond); bij toolbox_deelname/inspectie
--    verandert er verder niets (bevroren bewijs blijft bevroren).
-- ============================================================
CREATE OR REPLACE FUNCTION public.concept_medewerker_afwijzen(
  p_goedkeuringsverzoek_id uuid,
  p_item_keuzes jsonb,
  p_reden text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_verzoek    public.goedkeuringsverzoek;
  v_verwacht   uuid[];
  v_gegeven    uuid[];
  v_ontbrekend uuid[];
  v_item       jsonb;
  v_item_type  text;
  v_item_id    uuid;
  v_keuze      text;
begin
  select * into v_verzoek from goedkeuringsverzoek where id = p_goedkeuringsverzoek_id;
  if v_verzoek.id is null then raise exception 'Verzoek niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_verzoek.company_id) then raise exception 'Geen toegang'; end if;
  if v_verzoek.status <> 'open' then raise exception 'Dit verzoek is al behandeld'; end if;

  select array_agg(id) into v_verwacht from (
    select id from toolbox_deelname where persoon_id = v_verzoek.persoon_id and company_id = v_verzoek.company_id
    union all
    select id from inspectie where persoon_id = v_verzoek.persoon_id and company_id = v_verzoek.company_id
    union all
    select id from pva_items where persoon_id = v_verzoek.persoon_id and company_id = v_verzoek.company_id
      and id is distinct from v_verzoek.actie_pva_item_id
  ) alles;

  select array_agg((elem->>'item_id')::uuid) into v_gegeven
  from jsonb_array_elements(coalesce(p_item_keuzes, '[]'::jsonb)) elem;

  select array_agg(id) into v_ontbrekend
  from unnest(coalesce(v_verwacht, '{}'::uuid[])) id
  where not (id = any (coalesce(v_gegeven, '{}'::uuid[])));

  if v_ontbrekend is not null and array_length(v_ontbrekend, 1) > 0 then
    raise exception 'Niet alle gekoppelde items zijn afgehandeld (% ontbreken)', array_length(v_ontbrekend, 1);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_item_keuzes, '[]'::jsonb))
  loop
    v_item_type := v_item->>'item_type';
    v_item_id   := (v_item->>'item_id')::uuid;
    v_keuze     := v_item->>'keuze';
    if v_keuze not in ('terug_naar_aanmaker', 'opnieuw_aanmaken', 'weggooien') then
      raise exception 'Ongeldige keuze: %', v_keuze;
    end if;

    perform set_config('app.correctie_reden',
      'concept_medewerker_afwijzen: ' || v_keuze || coalesce(' — ' || p_reden, ''), true);

    if v_item_type = 'toolbox_deelname' then
      update toolbox_deelname set persoon_id = null
       where id = v_item_id and company_id = v_verzoek.company_id and persoon_id = v_verzoek.persoon_id;
    elsif v_item_type = 'inspectie' then
      update inspectie set persoon_id = null
       where id = v_item_id and company_id = v_verzoek.company_id and persoon_id = v_verzoek.persoon_id;
    elsif v_item_type = 'actie' then
      update pva_items set persoon_id = null
       where id = v_item_id and company_id = v_verzoek.company_id and persoon_id = v_verzoek.persoon_id;
      if v_keuze = 'weggooien' then
        update pva_items
           set status = 'Afgerond',
               opm = nullif(btrim(coalesce(opm, '') || E'\nGesloten: concept-medewerker afgewezen.'), ''),
               updated_at = now()
         where id = v_item_id;
        insert into actie_historie
          (company_id, pva_item_id, gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type)
        values
          (v_verzoek.company_id, v_item_id, 'concept_medewerker_afgewezen_gesloten', 'Open', 'Afgerond', p_reden,
           coalesce((select naam from users where id = auth.uid()), null), 'beheerder');
      end if;
    else
      raise exception 'Onbekend item_type: %', v_item_type;
    end if;
  end loop;

  perform set_config('app.correctie_reden', '', true);

  if v_verzoek.type = 'nieuw_concept' and v_verzoek.persoon_id is not null then
    update personen set status = 'afgewezen' where id = v_verzoek.persoon_id;
  end if;

  update goedkeuringsverzoek
     set status = 'afgewezen', behandeld_door = auth.uid(), behandeld_op = now(), reden_afwijzing = p_reden
   where id = p_goedkeuringsverzoek_id;

  if v_verzoek.actie_pva_item_id is not null then
    update pva_items set status = 'Afgerond', updated_at = now() where id = v_verzoek.actie_pva_item_id;
    insert into actie_historie (company_id, pva_item_id, gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type)
    values (v_verzoek.company_id, v_verzoek.actie_pva_item_id, 'concept_medewerker_afgewezen', 'Open', 'Afgerond', p_reden,
            coalesce((select naam from users where id = auth.uid()), null), 'beheerder');
  end if;

  return jsonb_build_object('status', 'afgewezen');
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.concept_medewerker_afwijzen(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concept_medewerker_afwijzen(uuid, jsonb, text) TO authenticated, service_role;

-- ============================================================
-- 10. Leesoverzicht voor de KAM/admin — "openstaande verzoeken". Per verzoek
--     de gekoppelde items zodat de afwijs-UI meteen weet welke keuzes ze moet
--     opvragen (item_keuzes voor concept_medewerker_afwijzen).
-- ============================================================
CREATE OR REPLACE FUNCTION public.goedkeuringsverzoek_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'type', g.type,
    'status', g.status,
    'aangemaakt_op', g.aangemaakt_op,
    'aangemaakt_door_naam', u.naam,
    'persoon', jsonb_build_object('id', p.id, 'naam', p.naam, 'email', p.email),
    'mogelijk_duplicaat', case when d.id is not null then jsonb_build_object('id', d.id, 'naam', d.naam) else null end,
    'gekoppelde_items', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('item_type', 'toolbox_deelname', 'item_id', t.id, 'omschrijving', t.titel_snap) as x
          from toolbox_deelname t where t.persoon_id = g.persoon_id and t.company_id = g.company_id
        union all
        select jsonb_build_object('item_type', 'inspectie', 'item_id', i.id,
                 'omschrijving', coalesce(i.sjabloon_naam_snap, 'inspectie'))
          from inspectie i where i.persoon_id = g.persoon_id and i.company_id = g.company_id
        union all
        select jsonb_build_object('item_type', 'actie', 'item_id', a.id, 'omschrijving', a.onderwerp)
          from pva_items a where a.persoon_id = g.persoon_id and a.company_id = g.company_id
           and a.id is distinct from g.actie_pva_item_id
      ) items
    )
  ) order by g.aangemaakt_op)
  , '[]'::jsonb)
  into v
  from goedkeuringsverzoek g
  left join personen p on p.id = g.persoon_id
  left join personen d on d.id = g.mogelijk_duplicaat_van
  left join users u on u.id = g.aangemaakt_door
  where g.company_id = p_company_id
    and g.status = 'open';

  return v;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.goedkeuringsverzoek_overzicht(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goedkeuringsverzoek_overzicht(uuid) TO authenticated, service_role;

commit;
