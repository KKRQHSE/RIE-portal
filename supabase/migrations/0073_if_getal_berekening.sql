-- Migratie 0073: IF-getal als VCA-berekening (Spoor B, B3)
-- ----------------------------------------------------------------------------
-- Vervangt het handmatig ingevulde IF-getal (bedrijf_dashboard_instelling.
-- if_dit_jaar/if_vorig_jaar, migratie 0036/0042) door een berekening:
--   IF = (aantal ongevallen MET verzuim x 1.000.000) / totaal gewerkte uren
-- Verzuimongevallen komen uit de incidentmodule (nieuwe gevolg-catalogusregel
-- 'ongeval_met_verzuim' -- zie OPENSTAAND_SPOOR_B3.md: de bestaande catalogus
-- had alleen 'ongeval_zonder_verzuim' en het bredere/dubbelzinnige 'letsel',
-- geen exacte "met verzuim"-categorie). Totaal gewerkte uren wordt een nieuw
-- per-bedrijf-per-jaar invoerveld (bedrijfsvoering).
--
-- De oude if_dit_jaar/if_vorig_jaar-kolommen en het bijbehorende RPC-argument
-- blijven ONGEMOEID (additief-only, geen drops) -- ze worden alleen niet meer
-- gelezen/geschreven vanuit de UI. Zie migratie-header-conventie: additief
-- direct, verwijderend = STOP; dit is bewust geen drop.
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Nieuwe gevolg-catalogusregel: exacte "met verzuim"-categorie.
-- ============================================================
insert into public.incident_gevolg_soort (code, omschrijving, volgorde) values
  ('ongeval_met_verzuim', 'Ongeval met verzuim', 7)
on conflict (code) do nothing;

-- ============================================================
-- 2. Gewerkte uren per bedrijf per jaar (bedrijfsvoering-invoer).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bedrijf_gewerkte_uren (
  company_id uuid NOT NULL,
  jaar       integer NOT NULL,
  uren       numeric(12,2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, jaar)
);

ALTER TABLE public.bedrijf_gewerkte_uren
  DROP CONSTRAINT IF EXISTS gewerkte_uren_niet_negatief;
ALTER TABLE public.bedrijf_gewerkte_uren
  ADD CONSTRAINT gewerkte_uren_niet_negatief CHECK (uren IS NULL OR uren >= 0);

ALTER TABLE public.bedrijf_gewerkte_uren ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bedrijf_gewerkte_uren_sel ON public.bedrijf_gewerkte_uren;
CREATE POLICY bedrijf_gewerkte_uren_sel ON public.bedrijf_gewerkte_uren AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
-- Geen INSERT/UPDATE-policy: alleen via gewerkte_uren_zetten (RPC).

CREATE OR REPLACE FUNCTION public.gewerkte_uren_zetten(p_company_id uuid, p_jaar integer, p_uren numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if p_uren is not null and p_uren < 0 then raise exception 'Gewerkte uren mag niet negatief zijn'; end if;

  insert into bedrijf_gewerkte_uren (company_id, jaar, uren, updated_at)
  values (p_company_id, p_jaar, p_uren, now())
  on conflict (company_id, jaar) do update set uren = excluded.uren, updated_at = now();
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.gewerkte_uren_zetten(uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gewerkte_uren_zetten(uuid, integer, numeric) TO authenticated, service_role;

-- ============================================================
-- 3. Berekening per jaar + het gecombineerde dashboard-RPC.
-- ============================================================
CREATE OR REPLACE FUNCTION public.if_getal_voor_jaar(p_company_id uuid, p_jaar integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ongevallen integer;
  v_uren       numeric;
  v_if         numeric;
begin
  select count(*) into v_ongevallen from incident
   where company_id = p_company_id
     and extract(year from datum) = p_jaar
     and 'ongeval_met_verzuim' = any(gevolgen);

  select uren into v_uren from bedrijf_gewerkte_uren where company_id = p_company_id and jaar = p_jaar;

  if v_uren is null or v_uren = 0 then
    v_if := null;
  else
    v_if := round((v_ongevallen::numeric * 1000000) / v_uren, 2);
  end if;

  return jsonb_build_object(
    'jaar', p_jaar, 'verzuimongevallen', v_ongevallen, 'gewerkte_uren', v_uren, 'if_getal', v_if
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.if_getal_voor_jaar(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.if_getal_voor_jaar(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dashboard_if_getal(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_jaar integer := extract(year from current_date)::int;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  return jsonb_build_object(
    'dit_jaar', if_getal_voor_jaar(p_company_id, v_jaar),
    'vorig_jaar', if_getal_voor_jaar(p_company_id, v_jaar - 1)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.dashboard_if_getal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_if_getal(uuid) TO authenticated, service_role;

commit;
