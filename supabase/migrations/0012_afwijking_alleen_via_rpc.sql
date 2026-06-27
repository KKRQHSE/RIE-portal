-- Migratie 0012: koppeling/afwijking alleen muteerbaar via de RPC's
-- ----------------------------------------------------------------------------
-- Verscherping van 0007: de per-bedrijf-tabellen worden ALLEEN-LEZEN voor clients.
-- Schrijven kan uitsluitend via de SECURITY DEFINER-RPC's (rubriek_koppelen,
-- vraag_lokaal_aanpassen, …), die als owner draaien en RLS omzeilen. Zo kan een
-- klant niet stiekem (direct op de tabel) afwijken buiten de bewuste handeling om;
-- de RPC's dwingen de waarschuwing + koppel-guard af.
--
-- We laten de SELECT-policy staan (lezen mag het eigen bedrijf) en verwijderen de
-- brede FOR ALL-schrijfpolicy. Geen datawijziging — alleen policy-aanscherping.

begin;

drop policy if exists bedrijf_rubriek_wr on public.bedrijf_rubriek;
drop policy if exists bedrijf_vraag_afwijking_wr on public.bedrijf_vraag_afwijking;

commit;
