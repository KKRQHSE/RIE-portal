-- Migratie 0054: de bewijs-bucket afschermen per bedrijf
-- ----------------------------------------------------------------------------
-- Gevonden in de nachttest van 31 augustus 2026 (scripts/nachttest_storage.mjs).
-- Een INGELOGDE gebruiker van bedrijf A kon de bewijsbestanden van bedrijf B
-- opsommen, lezen én erin schrijven. Dat `list` werkte maakte het ernstig: er
-- hoefde geen pad geraden te worden.
--
-- Oorzaak: drie policies op storage.objects die alleen "ben je ingelogd" eisen,
-- zonder enige bedrijfsafbakening:
--   bewijs beheerder leest    (SELECT) — bucket_id = 'bewijs' AND auth.uid() IS NOT NULL
--   bewijs beheerder schrijft (INSERT) — idem
--   bewijs beheerder update   (UPDATE) — idem
-- De fotobuckets (incident-foto, inspectie-foto) deden het al wél goed.
--
-- LET OP HET PADSEGMENT. Bij de fotobuckets is het eerste segment de company:
-- <company_id>/<inspectie_id>/<bestand>. Bij bewijs staat er een letterlijke
-- 'bewijs' vóór: bewijs/<company_id>/<actie_id>/<bestand> (zie
-- deellink_bewijs_pad en app/api/bewijs/beheerder-upload). Een policy die hier
-- segment [1] gebruikt zou ALLES blokkeren. Het is [2].
--
-- GEEN INSERT/UPDATE-POLICY TERUG, met opzet — zelfde regime als inspectie-foto.
-- Alle vier de bewijs-routes (beheerder-upload/-download, gast-upload/-download)
-- minten met de SERVICE ROLE een signed URL, en die omzeilt RLS. De browser
-- uploadt met uploadToSignedUrl(), dat op het upload-token valideert en niet op
-- een policy. Er is dus geen enkele app-flow die deze policies nodig heeft; ze
-- bedienden alleen directe, ongescope'te clienttoegang. Precies het lek.
--
-- Vooraf gecontroleerd op de echte data (aggregerend, zonder bestandsinhoud of
-- klantpaden in te zien): alle objecten in de bucket hebben segment 1 = 'bewijs',
-- segment 2 = een BESTAAND company-id, en paddiepte 3. Er wordt dus niets
-- onbereikbaar door deze wijziging.

begin;

-- De drie te ruime policies eruit.
drop policy if exists "bewijs beheerder leest"    on storage.objects;
drop policy if exists "bewijs beheerder schrijft" on storage.objects;
drop policy if exists "bewijs beheerder update"   on storage.objects;

-- Terug met een echte per-bedrijf-afbakening op segment [2].
create policy "bewijs eigen bedrijf leest" on storage.objects
  as permissive for select to public using (
    bucket_id = 'bewijs'
    and ((storage.foldername(name))[2] = my_company_id()::text or is_admin())
  );

commit;
