-- Migratie 0044: startlijst onderwerpenbibliotheek
-- ----------------------------------------------------------------------------
-- Zeven externe toolbox-bronnen, aangeleverd door Kees. Idempotent via
-- `on conflict (naam) do nothing`: opnieuw draaien voegt niets dubbel toe en
-- overschrijft ook geen handmatige correctie die de admin later maakt.
--
-- De URL's zijn overgenomen zoals aangeleverd en NIET door mij geverifieerd —
-- ik heb ze niet opgevraagd. Loopt er een dood, dan past de admin hem aan via
-- het beheerscherm; de constraint eist alleen https://.

begin;

insert into public.toolbox_bron (naam, url, omschrijving, volgorde) values
  ('Heijmans GO! / Geen Ongevallen',
   'https://www.geenongevallen.nl/toolbox',
   'Brede gratis toolbox-bibliotheek (PBM, fysieke belasting, hoogte, gevaarlijke stoffen).', 1),
  ('BAM Veiligheid',
   'https://veiligheid.bam.com/toolboxen/toolbox-bibliotheek',
   'Bouwgerichte toolbox-bibliotheek.', 2),
  ('Arboportaal (SZW)',
   'https://www.arboportaal.nl',
   'Officiële overheidsbron, sterk voor gevaarlijke stoffen en wettelijk kader.', 3),
  ('SSVV',
   'https://www.ssvv.nl',
   'VCA-organisatie, gratis toolboxen (past bij VCA-context).', 4),
  ('AllRisk valbeveiliging',
   'https://www.ar.nl/toolbox',
   'Specialist werken op hoogte.', 5),
  ('De Jonge Safety',
   'https://www.dejongesafety.nl/downloaden',
   'Gratis PDF-toolboxen.', 6),
  ('ARBOCO',
   'https://www.arboco-va.nl/toolbox',
   'Gratis downloadbare toolboxen.', 7)
on conflict (naam) do nothing;

commit;
