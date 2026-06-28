-- Migratie 0022: bron-fix — per-bedrijf-guard null-veilig
-- ----------------------------------------------------------------------------
-- mag_bedrijf_beheren(...) gaf voor een caller ZONDER auth (anon, geen token)
-- NULL terug: `is_admin() or p_company_id = my_company_id()` wordt `false or null`
-- = null. In een plpgsql-guard `if not mag_bedrijf_beheren(...) then raise` is
-- `not null` = null → de IF wordt overgeslagen → de raise gemist (guard omzeild).
--
-- BRON-FIX: laat de guard NOOIT null teruggeven — coalesce naar false zodra er geen
-- geauthenticeerde gebruiker is. Daarmee is elke bestaande én toekomstige
-- `if not mag_bedrijf_beheren(...)`-guard automatisch veilig.
--
-- Geen gedragswijziging voor legitieme gebruikers:
--   * admin   → is_admin() = true → `true or …` = true → coalesce(true)=true (gelijk).
--   * KAM     → is_admin() = false, p_company_id = my_company_id() (true/false) →
--               coalesce laat die exacte boolean staan (gelijk).
--   * anon    → false or null = null → coalesce → FALSE (voorheen null; nu veilig).
-- Ook RLS (`using (mag_bedrijf_beheren(company_id))`) blijft gelijk: null en false
-- weigeren allebei de rij. is_admin() coalesce't al naar false; my_company_id() mag
-- als waarde wél null blijven (dat is een geldige 'geen bedrijf').
--
-- Additief: alleen create or replace van de guard-functie. Idempotent.

begin;

create or replace function public.mag_bedrijf_beheren(p_company_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.is_admin() or p_company_id = public.my_company_id(), false)
$function$;

commit;
