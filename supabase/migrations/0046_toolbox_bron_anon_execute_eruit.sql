-- Migratie 0046: anon-EXECUTE op de toolbox_bron-RPC's alsnog intrekken
-- ----------------------------------------------------------------------------
-- Correctie op 0043. Daar stond `revoke execute ... from public`, en dat is NIET
-- genoeg: Supabase kent via default privileges EXECUTE toe aan anon én
-- authenticated, en zo'n directe grant overleeft een revoke van PUBLIC. anon hield
-- dus EXECUTE op de drie RPC's.
--
-- GEEN LEK GEWEEST: alle drie beginnen met `if not is_admin() then raise`, en
-- is_admin() coalesce't naar false voor een caller zonder auth (0022). Een
-- anon-aanroep kreeg altijd 'Alleen voor beheerders'. Maar Beslissing 62 zegt dat
-- anon de functie niet eens moet kunnen aanroepen — defense-in-depth, en het
-- oppervlak hoort niet af te hangen van één guard-regel.
--
-- Zelfde patroon als migratie 0003 en 0045: expliciet van anon intrekken.

begin;

revoke execute on function public.toolbox_bron_opslaan(uuid, text, text, text, integer) from anon;
revoke execute on function public.toolbox_bron_archiveren(uuid) from anon;
revoke execute on function public.toolbox_bron_herstellen(uuid) from anon;

commit;
