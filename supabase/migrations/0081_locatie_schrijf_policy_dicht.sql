-- Migratie 0081: locatie_wr weer dicht (Fase 1, correctie)
-- ----------------------------------------------------------------------------
-- 0080 volgde nog de oorspronkelijke functiegroep-vorm uit migratie 0006 (een
-- ALL-policy met mag_bedrijf_beheren). Die vorm is sinds 0056 verlaten: elke
-- company-beheertabel (functiegroep incluis) schrijft UITSLUITEND via de
-- SECURITY DEFINER-RPC's, geen directe schrijf-policy meer op de tabel zelf.
-- onveranderlijkheid_test.mjs (DEEL 6) bewaakt dit live en faalde op 'locatie'
-- als nieuwe, onverklaarde schrijf-policy — precies zoals bedoeld.
--
-- locatie_sel blijft staan (lezen via mag_bedrijf_werken, Fase 1-ontwerp).
-- locatie_opslaan/_archiveren blijven ongewijzigd: die zijn SECURITY DEFINER
-- en schrijven dus sowieso buiten RLS om. Additief/idempotent.

begin;

drop policy if exists locatie_wr on public.locatie;

commit;
