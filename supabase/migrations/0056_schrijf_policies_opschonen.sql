-- Migratie 0056: overbodige schrijf-policies opruimen
-- ----------------------------------------------------------------------------
-- Vervolg op 0055. Daar bleek dat een ALL-policy stilletjes een tweede weg naar
-- binnen openhoudt naast de RPC's. Deze migratie loopt de rest van het schema na
-- op hetzelfde patroon.
--
-- Elke tabel hieronder wordt door de applicatie UITSLUITEND GELEZEN; alle
-- schrijfacties lopen via SECURITY DEFINER-RPC's, en die draaien als owner en
-- zijn niet aan RLS gebonden. De ALL-policy voegde dus niets toe aan wat werkt,
-- maar wél een oppervlak: een ingelogde gebruiker kon er met een directe
-- PostgREST-aanroep omheen de RPC's in schrijven.
--
-- Per tabel nagelopen in de codebase (elke `from('<tabel>')` bekeken op de
-- gebruikte operatie) en in db/schema.sql (welke RPC er wél in schrijft):
--
--   deellinks               app: alleen select   RPC's: create_deellink, intrek_deellink
--   functiegroep            app: alleen select   RPC's: functiegroep_opslaan/_archiveren,
--                                                persoon_functiegroep_zetten
--   herinner_instelling     app: alleen select   RPC:  zet_herinner_ritme
--   inspectie_sjabloon      app: alleen select   RPC's: sjabloon_opslaan/_archiveren/
--                                                _doelgroep_zetten, inspectie_start
--   inspectie_sjabloon_punt app: alleen select   RPC's: punt_opslaan, punt_verwijderen
--   bedrijf_modules         app: alleen select   RPC's: module_activeren, module_stopzetten,
--                                                module_gebruik_zetten
--
-- BEWUST NIET AANGERAAKT — hier schrijft de app wél rechtstreeks, dus hun
-- policy is functioneel:
--   personen    components/PersonenClient.tsx (insert r93, update r164)
--   pva_items   components/ActielijstClient.tsx (update r147), PvaCard.tsx (update r90)
-- En de admin-only referentietabellen (merken, toolbox_bron, incident_*,
-- centrale_*) blijven zoals ze zijn: die zijn al op is_admin() gescope't.
--
-- De AUDITMODULE (audit, audit_vca_bevinding, audit_iso_observatie,
-- audit_verbeterpunt) blijft óók staan, en dat is een bewuste keuze: die schrijft
-- vanuit de client rechtstreeks, via een generieke `from(table).update(patch)` in
-- components/AuditDetailClient.tsx r51. Daar de policy weghalen betekent eerst al
-- die schrijfacties naar RPC's verhuizen — een echte verbouwing, geen
-- policy-ingreep. Genoteerd als kandidaat, niet hier gedaan.
--
-- rie_versies is een apart geval. Zijn ENIGE policy was rie_versies_beheer [ALL],
-- die dus ook het lezen regelde. Botweg droppen zou de tabel onleesbaar maken.
-- Hij wordt door niets in de app of in een RPC geschreven — alleen door
-- import/import_run.mjs, en dat script gaat via DATABASE_URL rechtstreeks als
-- owner en merkt niets van RLS. Daarom hier: ALL vervangen door SELECT met
-- exact dezelfde voorwaarde, zodat lezen ongewijzigd blijft en schrijven dicht
-- gaat.
--
-- Additief in de zin die telt: er verdwijnt geen enkele weg die daadwerkelijk
-- gebruikt wordt. Bewijs: scripts/onveranderlijkheid_test.mjs (DEEL 6 leest de
-- schrijf-policies live uit de database en piept zodra er een onverklaarde bij
-- komt) plus de volledige bestaande suite.

begin;

-- Alleen-lezen voor de app; muteren uitsluitend via de RPC's. Deze zes hebben
-- allemaal een eigen *_sel/*_select-policy, dus lezen verandert niet.
drop policy if exists deellinks_write              on public.deellinks;
drop policy if exists functiegroep_wr              on public.functiegroep;
drop policy if exists herinner_instelling_write    on public.herinner_instelling;
drop policy if exists inspectie_sjabloon_wr        on public.inspectie_sjabloon;
drop policy if exists inspectie_sjabloon_punt_wr   on public.inspectie_sjabloon_punt;
drop policy if exists bedrijf_modules_wr           on public.bedrijf_modules;

-- rie_versies had geen aparte select-policy; ALL vervangen door SELECT met
-- dezelfde voorwaarde, anders valt het lezen weg.
drop policy if exists rie_versies_beheer on public.rie_versies;
drop policy if exists rie_versies_sel    on public.rie_versies;   -- idempotent
create policy rie_versies_sel on public.rie_versies
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

commit;
