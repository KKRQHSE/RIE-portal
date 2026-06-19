-- Migratie 0003: te-brede EXECUTE-grant intrekken op interne/gevoelige RPC's
-- Doel: dichten van de bevindingen uit de nachttest (tenant-isolatie).
--   Supabase verleent standaard EXECUTE op ELKE public-functie aan PUBLIC
--   (en dus aan anon + authenticated), waardoor PostgREST ze allemaal als REST-RPC
--   blootstelt. Vier functies zijn SECURITY DEFINER, zónder mag_bedrijf_beheren-guard,
--   en alleen bedoeld als INTERNE helper (aangeroepen vanuit andere definer-functies):
--
--     * actie_als_jsonb(uuid)       -> LEESLEK: gaf de volledige pva_items-rij van
--                                      ELKE actie-id terug aan een willekeurige aanroeper.
--     * import_rie_content(uuid)    -> DESTRUCTIEF: wist+herimporteert modules/vragen/foto's
--                                      van een willekeurig bedrijf.
--     * import_company(jsonb)       -> maakt een nieuw bedrijf (+ RI&E) aan; spam/DoS.
--     * vind_of_maak_persoon(...)   -> injecteert een personen-rij in een willekeurig bedrijf.
--
-- Fix (defense-in-depth, GEEN app-wijziging): de te-brede EXECUTE intrekken. Interne
--   aanroepen blijven werken omdat de aanroepende functies SECURITY DEFINER zijn en als
--   owner (postgres) draaien; de owner houdt EXECUTE. De vertrouwde server-side
--   service_role behoudt expliciet toegang. Alleen het ONBETROUWDE browser-/gastoppervlak
--   (anon + authenticated) verliest de directe REST-aanroep.
--
-- Veilig/omkeerbaar: REVOKE/GRANT zijn idempotent; raakt geen data, geen functiebody,
--   geen RLS-policy. De gast- en KAM-flows lopen via de geguarde wrappers
--   (deellink_*, actie_doorgeven, geef_actie_vrij, ...) en blijven ongewijzigd werken.

revoke execute on function public.actie_als_jsonb(uuid)                     from public, anon, authenticated;
revoke execute on function public.import_rie_content(uuid)                  from public, anon, authenticated;
revoke execute on function public.import_company(jsonb)                     from public, anon, authenticated;
revoke execute on function public.vind_of_maak_persoon(uuid, text, text, uuid) from public, anon, authenticated;

-- Server-side (vertrouwd) behoudt volledige capaciteit.
grant execute on function public.actie_als_jsonb(uuid)                      to service_role;
grant execute on function public.import_rie_content(uuid)                   to service_role;
grant execute on function public.import_company(jsonb)                      to service_role;
grant execute on function public.vind_of_maak_persoon(uuid, text, text, uuid) to service_role;
