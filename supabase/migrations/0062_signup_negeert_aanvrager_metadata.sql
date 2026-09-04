-- ============================================================================
-- Signup kan zichzelf geen rol of bedrijf meer toekennen
-- ----------------------------------------------------------------------------
-- Gevonden in de systeemdoorlichting van 4 september 2026
-- (SYSTEEMDOORLICHTING_2026-09-04.md, categorie 3.1/3.2, ernstigst): de
-- signup-trigger handle_new_user las role/company_id rechtstreeks uit
-- raw_user_meta_data — data die de AANVRAGER zelf meegeeft bij
-- POST {SUPABASE_URL}/auth/v1/signup. Met alleen de publieke anon-key (zit
-- per ontwerp in de client-bundle) kon iedereen zichzelf zo role='admin'
-- geven, of company_id op een willekeurig bestaand bedrijf zetten en zo als
-- KAM binnenkomen — allebei live bewezen en direct weer opgeruimd tijdens de
-- doorlichting.
--
-- Fix: de trigger negeert raw_user_meta_data nu volledig voor role/company_id.
-- Elk nieuw account krijgt altijd role='client', company_id=NULL — functioneel
-- dezelfde "nergens toegang"-staat als role='none' (getSessionProfile in
-- lib/auth.ts), want zonder company_id matcht geen enkele
-- mag_bedrijf_beheren()/pagina-gate ooit.
--
-- Rol/bedrijf toekennen blijft — zoals nu al het geval is voor alle bestaande
-- accounts (admin, de KAM's, Dutch Waste) — uitsluitend een aparte,
-- geautoriseerde stap: de service-role/admin-API maakt het account aan en zet
-- daarna zelf role/company_id via een upsert op public.users (zie het patroon
-- in scripts/persoon_merge_isolatie_test.mjs:90-106). Die stap gebruikt nooit
-- signup-metadata en verandert hier niet.
--
-- Bestaande rijen in public.users blijven ongewijzigd: deze trigger vuurt
-- alleen AFTER INSERT ON auth.users, dus hij raakt nooit een account dat al
-- bestaat.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- role/company_id komen NOOIT uit new.raw_user_meta_data: dat is door de
  -- aanvrager zelf ingevuld bij signup en dus niet te vertrouwen. Elk nieuw
  -- account start als machteloze 'client' zonder bedrijf; een admin (of een
  -- gecontroleerd proces met de service-role) kent de echte rol/koppeling
  -- daarna apart toe.
  insert into public.users (id, email, role, company_id)
  values (new.id, new.email, 'client', null)
  on conflict (id) do nothing;

  return new;
end;
$function$;
