-- ============================================================================
-- Bucket-niveau mime-type- en groottelimieten (defense-in-depth)
-- ----------------------------------------------------------------------------
-- Gevonden in de systeemdoorlichting Ronde 2 (must-punt 4): geen enkele
-- Storage-bucket had een allowed_mime_types-restrictie, en de 'bewijs'-bucket
-- had ook geen file_size_limit. De route-laag valideert dit nu óók
-- (app/api/*/route.ts, TOEGESTANE_MIME_TYPES in lib/bewijs.ts) — dit is de
-- tweede, onafhankelijke laag die geldt op het moment van de daadwerkelijke
-- upload (uploadToSignedUrl), dus niet te omzeilen door over het geclaimde
-- type/grootte te liegen richting de route.
--
-- Geen 'image/svg+xml' in de gebruikersgerichte buckets: een SVG kan script
-- bevatten en is de klassieke stored-XSS-vector bij inline weergave.
-- 'merk-assets' is de uitzondering (logo's, uitsluitend admin-upload via het
-- dashboard, geen route in de app) — daar staat SVG wél toe, voor
-- schaalbare logo's; het dreigingsmodel is anders (bevoegde admin, geen
-- willekeurige gebruiker).
-- ============================================================================

update storage.buckets set
  file_size_limit = 5242880,  -- 5 MB, gelijk aan MAX_BYTES in lib/bewijs.ts
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
where id = 'bewijs';

-- Zelfde lijst als 'bewijs' (incl. pdf): isToegestaanType() in lib/bewijs.ts
-- staat pdf uniform toe voor alle drie de upload-contexten (bewijs, incident-
-- foto, inspectie-foto) — de bestaande robuustheidstest
-- (inspectie_ai_robuustheid_test.ts) uploadt bewust een pdf naar
-- inspectie-foto om te verifiëren dat de AI-analyse daar netjes op weigert.
-- Beperken tot alleen afbeeldingen zou die bestaande, bedoelde flexibiliteit
-- breken.
update storage.buckets set
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
where id = 'incident-foto';

update storage.buckets set
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
where id = 'inspectie-foto';

update storage.buckets set
  file_size_limit = 2097152,  -- 2 MB, logo's zijn klein
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml']
where id = 'merk-assets';
