-- Migratie 0053: anon-EXECUTE intrekken op de RPC's die na 0023 zijn bijgekomen
-- ----------------------------------------------------------------------------
-- Gevonden in de nachttest van 31 augustus 2026.
--
-- Migratie 0023 trok anon-EXECUTE in op de toen bestaande 57 per-bedrijf-RPC's
-- (Beslissing 62). Maar Supabase kent via default privileges EXECUTE toe aan
-- anon én authenticated bij ELKE nieuwe functie, en `security_hardening_test.mjs`
-- bewaakt een HANDGESCHREVEN lijst uit die tijd. RPC's die daarna zijn
-- toegevoegd — de auditmodule, de dashboard-instelling, de toolboxsessies, het
-- inspectiedoel — vielen daardoor buiten elke controle en hielden hun
-- anon-EXECUTE. Bij audit_bevinding_naar_actie stond zelfs een expliciete
-- `grant ... to anon` in de migratie.
--
-- GEEN LEK GEWEEST, wél één slot in plaats van twee. De nachttest bewees
-- empirisch dat een anon-caller er tegen een echt bestaand bedrijf niets mee kon:
-- mag_bedrijf_beheren geeft sinds migratie 0022 `coalesce(..., false)` en elke
-- RPC weigerde met "Geen toegang tot dit bedrijf". Deze migratie zet het tweede
-- slot terug, zoals de norm het voorschrijft.
--
-- GEEN GEDRAGSVERANDERING. Nagelopen dat geen enkele login-loze flow deze
-- functies aanroept: /a/[token] gebruikt deellink_data, /melden/[token] gebruikt
-- incident_meldcontext_token en /tb/[token] gebruikt toolbox_voor_token — en die
-- token-RPC's leveren de huisstijl mee in hun eigen payload. huisstijl_van_bedrijf
-- wordt alleen aangeroepen door haalHuisstijl(), en die zit uitsluitend in
-- /[company_id]/*-pagina's die achter de middleware-login staan.
--
-- Additief in de zin die telt: er wordt niets weggehaald wat werkt. authenticated
-- en service_role houden hun EXECUTE; alleen anon verliest een deur die toch al
-- op slot zat.
--
-- Bewijs: scripts/anon_execute_audit_test.mjs (vóór deze migratie 18/18 met de
-- 12 namen als "bekende schuld", erna zonder). Die test leest de anon-EXECUTE-set
-- LIVE uit de database, zodat een volgende vergeten revoke meteen opvalt in
-- plaats van over een half jaar.

begin;

-- Auditmodule (migratie 0047).
revoke execute on function public.audit_aanmaken(uuid, text, text, integer, text) from public, anon;
grant  execute on function public.audit_aanmaken(uuid, text, text, integer, text) to authenticated, service_role;

revoke execute on function public.audit_bevinding_naar_actie(text, uuid) from public, anon;
grant  execute on function public.audit_bevinding_naar_actie(text, uuid) to authenticated, service_role;

-- Managementdashboard (migraties 0036/0037).
revoke execute on function public.dashboard_instelling_zetten(uuid, integer, numeric, text, integer, integer, text, text, text, text, numeric, numeric) from public, anon;
grant  execute on function public.dashboard_instelling_zetten(uuid, integer, numeric, text, integer, integer, text, text, text, text, numeric, numeric) to authenticated, service_role;

revoke execute on function public.dashboard_pva_rie(uuid) from public, anon;
grant  execute on function public.dashboard_pva_rie(uuid) to authenticated, service_role;

-- Huisstijl. Geeft alleen merkinstellingen terug (kleur, logo, lettertype) en
-- niets vertrouwelijks, maar er is geen reden waarom een willekeurige anon-caller
-- met een company_id de huisstijl van een klant moet kunnen opvragen.
revoke execute on function public.huisstijl_van_bedrijf(uuid) from public, anon;
grant  execute on function public.huisstijl_van_bedrijf(uuid) to authenticated, service_role;

-- Inspectiedoel per persoon (migratie 0031).
revoke execute on function public.inspectie_doel_zetten(uuid, uuid, integer) from public, anon;
grant  execute on function public.inspectie_doel_zetten(uuid, uuid, integer) to authenticated, service_role;

-- Toolboxsessies en aanwezigheid.
revoke execute on function public.toolbox_sessie_aanwezigheid_zetten(uuid, uuid, boolean) from public, anon;
grant  execute on function public.toolbox_sessie_aanwezigheid_zetten(uuid, uuid, boolean) to authenticated, service_role;

revoke execute on function public.toolbox_sessie_doel_zetten(uuid, integer) from public, anon;
grant  execute on function public.toolbox_sessie_doel_zetten(uuid, integer) to authenticated, service_role;

revoke execute on function public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid) from public, anon;
grant  execute on function public.toolbox_sessie_opslaan(uuid, uuid, date, text, text, uuid) to authenticated, service_role;

revoke execute on function public.toolbox_sessie_verwijderen(uuid) from public, anon;
grant  execute on function public.toolbox_sessie_verwijderen(uuid) to authenticated, service_role;

revoke execute on function public.toolbox_sessies_overzicht(uuid) from public, anon;
grant  execute on function public.toolbox_sessies_overzicht(uuid) to authenticated, service_role;

-- Eigen profielnaam. Weigert al met "Niet ingelogd", maar hoort net zo goed dicht.
revoke execute on function public.zet_mijn_naam(text) from public, anon;
grant  execute on function public.zet_mijn_naam(text) to authenticated, service_role;

commit;
