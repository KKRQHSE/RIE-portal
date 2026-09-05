-- Migratie 0072: instelbaar in-app notificatiesysteem (Spoor B, B2)
-- ----------------------------------------------------------------------------
-- Zes soorten, elk met een per-gebruiker voorkeur (direct/periodiek/uit,
-- default 'direct'): goedkeuringsverzoek, incident_melding (direct, via een
-- INSERT-trigger op de brontabel -- écht meteen, niet pas bij een volgende
-- scan), en actie_over_termijn/audit_gepland/rie_toetsing_verloopt/
-- toolbox_herinnering (geen natuurlijk insert-moment -- standing conditions,
-- daarom via notificaties_genereren() die bij elke notificaties_ophalen()-
-- aanroep opnieuw scant; de heartbeat-route roept 'm ook aan zodat gebruikers
-- die de app niet openen alsnog een verse periodieke bundel krijgen).
--
-- 'direct' = één rij per concreet voorval (gededupliceerd op bron_tabel+
-- bron_id). 'periodiek' = één samengevatte rij per dag (gededupliceerd op
-- event_type+periode_sleutel=vandaag), gevuld met de actuele tellng bij elke
-- scan -- geen aparte queue nodig. 'toolbox_herinnering' heeft geen
-- natuurlijk sub-item (bedrijfsbrede achterstand op de jaardoelstelling),
-- dus daar vallen direct/periodiek voorlopig samen (zie
-- audit/2026-09-05/OPENSTAAND_SPOOR_B2.md).
--
-- Rol-scope per type ('beheer' = admin+KAM, 'werk' = ook teamleider):
-- goedkeuringsverzoek/audit_gepland/rie_toetsing_verloopt = beheer (audits en
-- goedkeuring zijn al KAM/admin-only; teamleider mag NOOIT
-- goedkeuringsverzoek-meldingen krijgen, harde eis). incident_melding/
-- actie_over_termijn/toolbox_herinnering = werk (teamleider werkt hier al
-- rechtstreeks mee, Pakket 1).
--
-- E-mail komt later; deze migratie bouwt alleen de in-app laag + voorkeuren.
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Voorkeuren (per gebruiker, per soort)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notificatie_voorkeur (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'goedkeuringsverzoek', 'incident_melding', 'actie_over_termijn',
    'audit_gepland', 'rie_toetsing_verloopt', 'toolbox_herinnering'
  ])),
  modus      text NOT NULL DEFAULT 'direct' CHECK (modus = ANY (ARRAY['direct', 'periodiek', 'uit'])),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

ALTER TABLE public.notificatie_voorkeur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificatie_voorkeur_sel ON public.notificatie_voorkeur;
CREATE POLICY notificatie_voorkeur_sel ON public.notificatie_voorkeur AS PERMISSIVE FOR SELECT TO public
  USING (user_id = auth.uid());
-- Geen INSERT/UPDATE/DELETE-policy: alleen via notificatie_voorkeur_zetten (RPC).

-- ============================================================
-- 2. Notificaties zelf
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notificatie (
  id              uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type      text NOT NULL CHECK (event_type = ANY (ARRAY[
    'goedkeuringsverzoek', 'incident_melding', 'actie_over_termijn',
    'audit_gepland', 'rie_toetsing_verloopt', 'toolbox_herinnering'
  ])),
  titel           text NOT NULL,
  link_pad        text,
  bron_tabel      text,
  bron_id         uuid,
  periode_sleutel text,
  gelezen_op      timestamptz,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notificatie_dedup_direct
  ON public.notificatie (user_id, bron_tabel, bron_id) WHERE (bron_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS notificatie_dedup_periodiek
  ON public.notificatie (user_id, event_type, periode_sleutel) WHERE (periode_sleutel IS NOT NULL);
CREATE INDEX IF NOT EXISTS notificatie_user_ongelezen_idx
  ON public.notificatie (user_id, aangemaakt_op DESC) WHERE (gelezen_op IS NULL);

ALTER TABLE public.notificatie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificatie_sel ON public.notificatie;
CREATE POLICY notificatie_sel ON public.notificatie AS PERMISSIVE FOR SELECT TO public
  USING (user_id = auth.uid());
-- Geen INSERT/UPDATE/DELETE-policy: alleen via de RPC's/triggers hieronder.

-- ============================================================
-- 3. Voorkeuren lezen/zetten
-- ============================================================
CREATE OR REPLACE FUNCTION public.notificatie_voorkeuren_ophalen()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_agg(jsonb_build_object(
    'event_type', t.event_type,
    'modus', coalesce(v.modus, 'direct')
  ) order by t.event_type)
  from unnest(ARRAY[
    'goedkeuringsverzoek', 'incident_melding', 'actie_over_termijn',
    'audit_gepland', 'rie_toetsing_verloopt', 'toolbox_herinnering'
  ]) as t(event_type)
  left join notificatie_voorkeur v on v.user_id = auth.uid() and v.event_type = t.event_type
$function$;

REVOKE EXECUTE ON FUNCTION public.notificatie_voorkeuren_ophalen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificatie_voorkeuren_ophalen() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notificatie_voorkeur_zetten(p_event_type text, p_modus text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_event_type <> ALL (ARRAY[
    'goedkeuringsverzoek', 'incident_melding', 'actie_over_termijn',
    'audit_gepland', 'rie_toetsing_verloopt', 'toolbox_herinnering'
  ]) then
    raise exception 'Onbekend event_type: %', p_event_type;
  end if;
  if p_modus <> ALL (ARRAY['direct', 'periodiek', 'uit']) then
    raise exception 'Onbekende modus: %', p_modus;
  end if;

  insert into notificatie_voorkeur (user_id, event_type, modus, updated_at)
  values (auth.uid(), p_event_type, p_modus, now())
  on conflict (user_id, event_type) do update set modus = excluded.modus, updated_at = now();
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificatie_voorkeur_zetten(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificatie_voorkeur_zetten(text, text) TO authenticated, service_role;

-- ============================================================
-- 4. Wie krijgt een notificatie van soort p_scope binnen dit bedrijf.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notificatie_ontvangers(p_company_id uuid, p_scope text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from users
   where role = 'admin'
      or (company_id = p_company_id and role = 'client')
      or (p_scope = 'werk' and company_id = p_company_id and role = 'teamleider')
$function$;

REVOKE EXECUTE ON FUNCTION public.notificatie_ontvangers(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificatie_ontvangers(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 5. Directe individuele notificatie voor elke 'direct'-ontvanger van scope;
--    'periodiek'/'uit'-gebruikers slaan dit voorval bewust over (zij krijgen
--    hun samenvatting via notificaties_genereren).
-- ============================================================
CREATE OR REPLACE FUNCTION public.notificatie_direct_aanmaken(
  p_company_id uuid, p_event_type text, p_scope text,
  p_titel text, p_link_pad text, p_bron_tabel text, p_bron_id uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, bron_tabel, bron_id)
  select p_company_id, o.user_id, p_event_type, p_titel, p_link_pad, p_bron_tabel, p_bron_id
    from notificatie_ontvangers(p_company_id, p_scope) o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = p_event_type
   where v.modus = 'direct'
  union all
  select p_company_id, o.user_id, p_event_type, p_titel, p_link_pad, p_bron_tabel, p_bron_id
    from notificatie_ontvangers(p_company_id, p_scope) o
   where not exists (select 1 from notificatie_voorkeur v where v.user_id = o.user_id and v.event_type = p_event_type)
  on conflict (user_id, bron_tabel, bron_id) where (bron_id is not null) do nothing;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificatie_direct_aanmaken(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificatie_direct_aanmaken(uuid, text, text, text, text, text, uuid) TO authenticated, service_role;

-- ============================================================
-- 6. Triggers voor de twee insert-gedreven soorten (écht direct).
-- ============================================================
CREATE OR REPLACE FUNCTION public.goedkeuringsverzoek_notificatie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_naam text;
begin
  select naam into v_naam from personen where id = NEW.persoon_id;
  perform notificatie_direct_aanmaken(
    NEW.company_id, 'goedkeuringsverzoek', 'beheer',
    'Nieuw goedkeuringsverzoek: ' || coalesce(v_naam, 'onbekend'),
    '/' || NEW.company_id || '/goedkeuringen',
    'goedkeuringsverzoek', NEW.id
  );
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS goedkeuringsverzoek_notificatie_trigger ON public.goedkeuringsverzoek;
CREATE TRIGGER goedkeuringsverzoek_notificatie_trigger
  AFTER INSERT ON public.goedkeuringsverzoek
  FOR EACH ROW EXECUTE FUNCTION public.goedkeuringsverzoek_notificatie();

REVOKE EXECUTE ON FUNCTION public.goedkeuringsverzoek_notificatie() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goedkeuringsverzoek_notificatie() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_notificatie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform notificatie_direct_aanmaken(
    NEW.company_id, 'incident_melding', 'werk',
    'Nieuwe incidentmelding: ' || coalesce(nullif(btrim(NEW.locatie), ''), 'onbekende locatie'),
    '/' || NEW.company_id || '/incidenten',
    'incident', NEW.id
  );
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS incident_notificatie_trigger ON public.incident;
CREATE TRIGGER incident_notificatie_trigger
  AFTER INSERT ON public.incident
  FOR EACH ROW EXECUTE FUNCTION public.incident_notificatie();

REVOKE EXECUTE ON FUNCTION public.incident_notificatie() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incident_notificatie() TO authenticated, service_role;

-- ============================================================
-- 7. Scan: de vier standing-condition-soorten (direct = per item,
--    gededupliceerd; periodiek = één samengevatte rij per dag) + de
--    periodieke bundel voor de twee insert-gedreven soorten hierboven.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notificaties_genereren(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_vandaag text := to_char(current_date, 'YYYY-MM-DD');
  v_rij record;
  v_aantal integer;
begin
  if not (mag_bedrijf_werken(p_company_id) or auth.role() = 'service_role') then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  -- ---- periodieke bundels voor de insert-gedreven soorten ----
  select count(*) into v_aantal from goedkeuringsverzoek where company_id = p_company_id and status = 'open';
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
  select p_company_id, o.user_id, 'goedkeuringsverzoek',
         v_aantal || ' openstaand goedkeuringsverzoek' || case when v_aantal = 1 then '' else 'en' end,
         '/' || p_company_id || '/goedkeuringen', v_vandaag
    from notificatie_ontvangers(p_company_id, 'beheer') o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'goedkeuringsverzoek'
   where v.modus = 'periodiek' and v_aantal > 0
  on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
    do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;

  select count(*) into v_aantal from incident where company_id = p_company_id and aangemaakt_op::date = current_date;
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
  select p_company_id, o.user_id, 'incident_melding',
         v_aantal || ' nieuwe incidentmelding' || case when v_aantal = 1 then '' else 'en' end || ' vandaag',
         '/' || p_company_id || '/incidenten', v_vandaag
    from notificatie_ontvangers(p_company_id, 'werk') o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'incident_melding'
   where v.modus = 'periodiek' and v_aantal > 0
  on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
    do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;

  -- ---- acties over termijn (direct = per actie; periodiek = bundel) ----
  for v_rij in
    select id, onderwerp from pva_items
     where company_id = p_company_id and coalesce(status, 'Open') <> 'Afgerond'
       and termijn_datum is not null and termijn_datum < current_date
  loop
    perform notificatie_direct_aanmaken(
      p_company_id, 'actie_over_termijn', 'werk',
      'Actie over de termijn: ' || coalesce(v_rij.onderwerp, 'zonder onderwerp'),
      '/' || p_company_id || '/actielijst#actie-rij-' || v_rij.id,
      'pva_items', v_rij.id
    );
  end loop;

  select count(*) into v_aantal from pva_items
   where company_id = p_company_id and coalesce(status, 'Open') <> 'Afgerond'
     and termijn_datum is not null and termijn_datum < current_date;
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
  select p_company_id, o.user_id, 'actie_over_termijn',
         v_aantal || ' actie' || case when v_aantal = 1 then '' else 's' end || ' over de termijn',
         '/' || p_company_id || '/actielijst', v_vandaag
    from notificatie_ontvangers(p_company_id, 'werk') o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'actie_over_termijn'
   where v.modus = 'periodiek' and v_aantal > 0
  on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
    do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;

  -- ---- geplande audits (binnen 7 dagen, nog niet uitgevoerd) ----
  for v_rij in
    select id, titel, datum from audit
     where company_id = p_company_id and status = 'gepland'
       and datum is not null and datum <= current_date + interval '7 days'
  loop
    perform notificatie_direct_aanmaken(
      p_company_id, 'audit_gepland', 'beheer',
      'Geplande audit: ' || v_rij.titel || ' op ' || to_char(v_rij.datum, 'DD-MM-YYYY'),
      '/' || p_company_id || '/audits/' || v_rij.id,
      'audit', v_rij.id
    );
  end loop;

  select count(*) into v_aantal from audit
   where company_id = p_company_id and status = 'gepland'
     and datum is not null and datum <= current_date + interval '7 days';
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
  select p_company_id, o.user_id, 'audit_gepland',
         v_aantal || ' geplande audit' || case when v_aantal = 1 then '' else 's' end || ' binnen 7 dagen',
         '/' || p_company_id || '/audits', v_vandaag
    from notificatie_ontvangers(p_company_id, 'beheer') o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'audit_gepland'
   where v.modus = 'periodiek' and v_aantal > 0
  on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
    do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;

  -- ---- RI&E-toetsing verloopt (binnen 30 dagen) ----
  for v_rij in
    select id, geldig_tot from rie_versies
     where company_id = p_company_id and status = 'actief'
       and geldig_tot is not null and geldig_tot <= now() + interval '30 days'
  loop
    perform notificatie_direct_aanmaken(
      p_company_id, 'rie_toetsing_verloopt', 'beheer',
      'RI&E-toetsing verloopt op ' || to_char(v_rij.geldig_tot, 'DD-MM-YYYY'),
      '/' || p_company_id || '/rie',
      'rie_versies', v_rij.id
    );
  end loop;

  select count(*) into v_aantal from rie_versies
   where company_id = p_company_id and status = 'actief'
     and geldig_tot is not null and geldig_tot <= now() + interval '30 days';
  insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
  select p_company_id, o.user_id, 'rie_toetsing_verloopt',
         v_aantal || ' RI&E-toetsing' || case when v_aantal = 1 then '' else 'en' end || ' verloopt binnenkort',
         '/' || p_company_id || '/rie', v_vandaag
    from notificatie_ontvangers(p_company_id, 'beheer') o
    join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'rie_toetsing_verloopt'
   where v.modus = 'periodiek' and v_aantal > 0
  on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
    do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;

  -- ---- toolbox-achterstand (bedrijfsbreed, geen sub-item -- direct en
  --      periodiek vallen hier voorlopig samen, zie OPENSTAAND_SPOOR_B2.md) ----
  declare
    v_doel integer;
    v_pro_rata numeric;
    v_gedaan integer;
    v_module_actief boolean;
  begin
    select exists (
      select 1 from bedrijf_modules
       where company_id = p_company_id and module = 'toolbox'
         and module_status = 'actief' and actief = true
    ) into v_module_actief;

    select coalesce(sessie_doel_per_jaar, 12) into v_doel
      from bedrijf_toolbox_instelling where company_id = p_company_id;
    if v_doel is null then v_doel := 12; end if;
    v_pro_rata := v_doel * (extract(doy from current_date) / 365.0);
    select count(*) into v_gedaan from toolbox_sessie
     where company_id = p_company_id and extract(year from datum) = extract(year from current_date);

    if v_module_actief and v_gedaan < floor(v_pro_rata) then
      insert into notificatie (company_id, user_id, event_type, titel, link_pad, periode_sleutel)
      select p_company_id, o.user_id, 'toolbox_herinnering',
             'Toolbox-achterstand: ' || v_gedaan || ' van de ' || v_doel || ' sessies dit jaar gehouden',
             '/' || p_company_id || '/toolbox/overzicht', v_vandaag
        from notificatie_ontvangers(p_company_id, 'werk') o
        join notificatie_voorkeur v on v.user_id = o.user_id and v.event_type = 'toolbox_herinnering'
       where v.modus in ('direct', 'periodiek')
      union all
      select p_company_id, o.user_id, 'toolbox_herinnering',
             'Toolbox-achterstand: ' || v_gedaan || ' van de ' || v_doel || ' sessies dit jaar gehouden',
             '/' || p_company_id || '/toolbox/overzicht', v_vandaag
        from notificatie_ontvangers(p_company_id, 'werk') o
       where not exists (select 1 from notificatie_voorkeur v where v.user_id = o.user_id and v.event_type = 'toolbox_herinnering')
      on conflict (user_id, event_type, periode_sleutel) where (periode_sleutel is not null)
        do update set titel = excluded.titel, aangemaakt_op = now(), gelezen_op = null;
    end if;
  end;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificaties_genereren(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificaties_genereren(uuid) TO authenticated, service_role;

-- ============================================================
-- 8. Lezen + gelezen zetten
-- ============================================================
CREATE OR REPLACE FUNCTION public.notificaties_ophalen(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  perform notificaties_genereren(p_company_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'event_type', n.event_type, 'titel', n.titel, 'link_pad', n.link_pad,
    'gelezen_op', n.gelezen_op, 'aangemaakt_op', n.aangemaakt_op
  ) order by n.aangemaakt_op desc), '[]'::jsonb)
  into v
  from (
    select * from notificatie
     where company_id = p_company_id and user_id = auth.uid()
     order by aangemaakt_op desc
     limit 50
  ) n;

  return v;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.notificaties_ophalen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificaties_ophalen(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notificatie_gelezen_zetten(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update notificatie set gelezen_op = now() where id = p_id and user_id = auth.uid() and gelezen_op is null
$function$;

REVOKE EXECUTE ON FUNCTION public.notificatie_gelezen_zetten(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificatie_gelezen_zetten(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notificaties_alles_gelezen(p_company_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update notificatie set gelezen_op = now()
   where company_id = p_company_id and user_id = auth.uid() and gelezen_op is null
$function$;

REVOKE EXECUTE ON FUNCTION public.notificaties_alles_gelezen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificaties_alles_gelezen(uuid) TO authenticated, service_role;

commit;
