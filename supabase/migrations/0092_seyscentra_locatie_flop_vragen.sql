-- Migratie 0092: SeysCentra L1/L2/L3 aanvullen met de Numodo-standaardchecklist per vestiging
-- -------------------------------------------------------------------------------------------
-- Op Kees' expliciete verzoek (24 sept 2026): dezelfde standaard-BHV/mobiliteit/extern-werken-
-- vragenlijst als in de Numodo-RI&E, nu voor elk van de vier SeysCentra-vestigingen apart
-- ingevuld (demo-data, eigen antwoord per vestiging i.p.v. simpelweg gekopieerd). De variatie
-- per vestiging is niet willekeurig: gebaseerd op elke vestiging haar al bestaande, ECHTE
-- profiel (Malden = de meeste bestaande BHV/brandveiligheid-issues, Utrecht = vooral
-- gebouwconditie, Zwijndrecht = het bekende vervoersprobleem met de bakfiets, Maastricht =
-- grotendeels compliant). Volledige inhoudelijke onderbouwing per vraag in
-- import/gen_locatie_flop_data.py (niet gecommit, klantcontent -- de resulterende migratie
-- met de letterlijke tekst is wel gecommit). Nr's continueren gewoon de bestaande, net
-- opgeschoonde reeks per module (L1 vanaf 35, L2 vanaf 12, L3 vanaf 11) -- geen NUM-achtig
-- voorvoegsel. Puur additief, alleen SeysCentra, geen schemawijziging.

begin;

do $$
declare
  v_company_id uuid := 'bd16538b-01e9-41d2-84ad-fe5690917cba';
  v_vragen_voor int;
  v_vragen_na int;
  v_pva_voor int;
  v_pva_na int;
  v_hash_bestaand_voor text;
  v_hash_bestaand_na text;
begin
  select count(*) into v_vragen_voor from public.vragen where company_id = v_company_id;
  select count(*) into v_pva_voor from public.pva_items where company_id = v_company_id;
  if v_vragen_voor <> 168 or v_pva_voor <> 73 then
    raise exception 'Onverwachte startstand SeysCentra: % vragen, % pva-items (verwacht 168/73) -- afgebroken.', v_vragen_voor, v_pva_voor;
  end if;

  select md5(string_agg(v.id::text||'|'||v.module_id::text||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,'')||'|'||coalesce(v.locatie_id::text,'')||'|'||coalesce(v.functiegroep_id::text,'')||'|'||coalesce(v.klasse,''), '~' order by v.id))
    into v_hash_bestaand_voor
    from public.vragen v where v.company_id = v_company_id;

  insert into public.vragen (id, company_id, module_id, nr, vraag, antwoord, bevinding, klasse, locatie_id, volgorde)
  select gen_random_uuid(), v_company_id, m.id, x.nr, x.vraag, x.antwoord, x.bevinding, x.klasse, x.locatie_id, x.volgorde
  from (values
    ('L1', 'L1-35', 'Zijn voldoende blusmiddelen aanwezig en op bereikbare plaatsen opgesteld?', 'Ja', 'Blusmiddelen hangen zichtbaar en bereikbaar bij de ingang.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1035),
    ('L1', 'L1-36', 'Zijn voldoende blusmiddelen aanwezig en op bereikbare plaatsen opgesteld?', 'Ja', 'Blusmiddelen zijn aanwezig op de begane grond en de verdieping.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1036),
    ('L1', 'L1-37', 'Zijn voldoende blusmiddelen aanwezig en op bereikbare plaatsen opgesteld?', 'Ja', 'Elk woonhuis heeft een eigen blusmiddel bij de keuken.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1037),
    ('L1', 'L1-38', 'Zijn voldoende blusmiddelen aanwezig en op bereikbare plaatsen opgesteld?', 'Ja', 'Blusmiddel hangt bereikbaar bij de uitgang.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1038),
    ('L1', 'L1-39', 'Worden blusmiddelen jaarlijks gekeurd conform NEN 2559?', 'Ja', 'Keuringssticker is actueel.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1039),
    ('L1', 'L1-40', 'Worden blusmiddelen jaarlijks gekeurd conform NEN 2559?', 'Nee', 'Keuringsbewijs van de blusmiddelen is niet te vinden; onduidelijk of de jaarlijkse keuring heeft plaatsgevonden.', 'Middel', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1040),
    ('L1', 'L1-41', 'Worden blusmiddelen jaarlijks gekeurd conform NEN 2559?', 'Ja', 'Keuring is dit jaar uitgevoerd door de vaste onderhoudspartij.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1041),
    ('L1', 'L1-42', 'Worden blusmiddelen jaarlijks gekeurd conform NEN 2559?', 'Ja', 'Keuringssticker is actueel.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1042),
    ('L1', 'L1-43', 'Zijn nooduitgangen en vluchtwegen vrij van obstakels?', 'Ja', 'Vluchtroute is bij de rondgang vrij bevonden.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1043),
    ('L1', 'L1-44', 'Zijn nooduitgangen en vluchtwegen vrij van obstakels?', 'Ja', 'Vluchtroute is vrij, los van de eerder gesignaleerde meterkastopslag.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1044),
    ('L1', 'L1-45', 'Zijn nooduitgangen en vluchtwegen vrij van obstakels?', 'Ja', 'Vluchtroutes tussen de woonhuizen zijn vrij van obstakels.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1045),
    ('L1', 'L1-46', 'Zijn nooduitgangen en vluchtwegen vrij van obstakels?', 'Ja', 'Vluchtroute in de kleine ruimtes is vrij gehouden.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1046),
    ('L1', 'L1-47', 'Zijn vluchtwegen en nooduitgangen aangegeven conform NEN 3011/3014?', 'Ja', 'Pictogrammen hangen op de juiste plekken.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1047),
    ('L1', 'L1-48', 'Zijn vluchtwegen en nooduitgangen aangegeven conform NEN 3011/3014?', 'Nee', 'Vluchtwegaanduiding ontbreekt op de verdieping.', 'Middel', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1048),
    ('L1', 'L1-49', 'Zijn vluchtwegen en nooduitgangen aangegeven conform NEN 3011/3014?', 'Ja', 'Pictogrammen hangen in elk woonhuis.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1049),
    ('L1', 'L1-50', 'Zijn vluchtwegen en nooduitgangen aangegeven conform NEN 3011/3014?', 'Ja', 'Pictogrammen hangen op de juiste plekken.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1050),
    ('L1', 'L1-51', 'Is een ontruimingsplattegrond beschikbaar conform NEN 1414?', 'Nee', 'Er hangt geen ontruimingsplattegrond die aan de norm voldoet.', 'Laag', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1051),
    ('L1', 'L1-52', 'Is een ontruimingsplattegrond beschikbaar conform NEN 1414?', 'Nee', 'Ontruimingsplattegrond ontbreekt op de verdieping.', 'Laag', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1052),
    ('L1', 'L1-53', 'Is een ontruimingsplattegrond beschikbaar conform NEN 1414?', 'Ja', 'Plattegrond hangt bij elke ingang.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1053),
    ('L1', 'L1-54', 'Is een ontruimingsplattegrond beschikbaar conform NEN 1414?', 'Ja', 'Plattegrond hangt bij de ingang.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1054),
    ('L1', 'L1-55', 'Worden periodiek ontruimingsoefeningen gehouden en geëvalueerd?', 'Ja', 'Ontruimingsoefening is dit jaar gehouden en geëvalueerd, conform de organisatiebrede BHV-planning.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1055),
    ('L1', 'L1-56', 'Worden periodiek ontruimingsoefeningen gehouden en geëvalueerd?', 'Ja', 'Ontruimingsoefening is dit jaar gehouden en geëvalueerd, conform de organisatiebrede BHV-planning.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1056),
    ('L1', 'L1-57', 'Worden periodiek ontruimingsoefeningen gehouden en geëvalueerd?', 'Ja', 'Ontruimingsoefening is dit jaar gehouden en geëvalueerd, conform de organisatiebrede BHV-planning.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1057),
    ('L1', 'L1-58', 'Worden periodiek ontruimingsoefeningen gehouden en geëvalueerd?', 'Ja', 'Ontruimingsoefening is dit jaar gehouden en geëvalueerd, conform de organisatiebrede BHV-planning.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1058),
    ('L1', 'L1-59', 'Is de BHV-bezetting voldoende voor de risico''s (minimaal één BHV''er per ploeg/locatie)?', 'Ja', 'Er is dagelijks minimaal één BHV''er aanwezig.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1059),
    ('L1', 'L1-60', 'Is de BHV-bezetting voldoende voor de risico''s (minimaal één BHV''er per ploeg/locatie)?', 'Ja', 'Er is dagelijks minimaal één BHV''er aanwezig.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1060),
    ('L1', 'L1-61', 'Is de BHV-bezetting voldoende voor de risico''s (minimaal één BHV''er per ploeg/locatie)?', 'Ja', 'Er is dagelijks minimaal één BHV''er aanwezig.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1061),
    ('L1', 'L1-62', 'Is de BHV-bezetting voldoende voor de risico''s (minimaal één BHV''er per ploeg/locatie)?', 'Ja', 'Er is dagelijks minimaal één BHV''er aanwezig.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1062),
    ('L1', 'L1-63', 'Zijn de BHV-certificaten van medewerkers actueel?', 'Ja', 'Herhalingstraining is dit jaar gevolgd.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1063),
    ('L1', 'L1-64', 'Zijn de BHV-certificaten van medewerkers actueel?', 'Ja', 'Herhalingstraining is dit jaar gevolgd.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1064),
    ('L1', 'L1-65', 'Zijn de BHV-certificaten van medewerkers actueel?', 'Ja', 'Herhalingstraining is dit jaar gevolgd.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1065),
    ('L1', 'L1-66', 'Zijn de BHV-certificaten van medewerkers actueel?', 'Ja', 'Herhalingstraining is dit jaar gevolgd.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1066),
    ('L1', 'L1-67', 'Is een beheerder voor de brandmeldinstallatie aangewezen (NEN 2654)?', 'Ja', 'Beheerder is aangewezen en bekend.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1067),
    ('L1', 'L1-68', 'Is een beheerder voor de brandmeldinstallatie aangewezen (NEN 2654)?', 'Nee', 'Er is geen vaste beheerder van de brandmeldinstallatie aangewezen.', 'Laag', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1068),
    ('L1', 'L1-69', 'Is een beheerder voor de brandmeldinstallatie aangewezen (NEN 2654)?', 'Ja', 'Beheerder is aangewezen en bekend.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1069),
    ('L1', 'L1-70', 'Is een beheerder voor de brandmeldinstallatie aangewezen (NEN 2654)?', 'Ja', 'Beheerder is aangewezen en bekend.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1070),
    ('L1', 'L1-71', 'Is een AED aanwezig, bereikbaar en bij medewerkers bekend?', 'Nee', 'Dichtstbijzijnde AED is niet bij medewerkers bekend.', 'Laag', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1071),
    ('L1', 'L1-72', 'Is een AED aanwezig, bereikbaar en bij medewerkers bekend?', 'Ja', 'AED in de buurt is bekend bij het team.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1072),
    ('L1', 'L1-73', 'Is een AED aanwezig, bereikbaar en bij medewerkers bekend?', 'Ja', 'AED in de buurt is bekend bij het team.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1073),
    ('L1', 'L1-74', 'Is een AED aanwezig, bereikbaar en bij medewerkers bekend?', 'Nee', 'Geen AED in de directe omgeving bekend bij medewerkers.', 'Laag', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1074),
    ('L1', 'L1-75', 'Is per groep beoordeeld hoeveel hulp cliënten bij een ontruiming nodig hebben en is de taakverdeling daarop afgestemd?', 'Ja', 'Hulpbehoefte per cliënt is bekend bij de begeleiding.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1075),
    ('L1', 'L1-76', 'Is per groep beoordeeld hoeveel hulp cliënten bij een ontruiming nodig hebben en is de taakverdeling daarop afgestemd?', 'Nee', 'Hulpbehoefte bij ontruiming is niet per cliënt vastgelegd, terwijl niet-zelfredzame cliënten hier bekend zijn.', 'Hoog', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1076),
    ('L1', 'L1-77', 'Is per groep beoordeeld hoeveel hulp cliënten bij een ontruiming nodig hebben en is de taakverdeling daarop afgestemd?', 'Nee', 'Door de opzet over meerdere woonhuizen is niet per groep vastgelegd wie welke hulp nodig heeft bij een ontruiming.', 'Middel', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1077),
    ('L1', 'L1-78', 'Is per groep beoordeeld hoeveel hulp cliënten bij een ontruiming nodig hebben en is de taakverdeling daarop afgestemd?', 'Ja', 'Kleine groep, hulpbehoefte is bekend bij de vaste begeleiders.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1078),
    ('L2', 'L2-12', 'Krijgen medewerkers instructie over veilig rijgedrag en rijmoeheid?', 'Ja', 'Rijinstructie loopt mee in het inwerken.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1012),
    ('L2', 'L2-13', 'Krijgen medewerkers instructie over veilig rijgedrag en rijmoeheid?', 'Ja', 'Rijinstructie loopt mee in het inwerken.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1013),
    ('L2', 'L2-14', 'Krijgen medewerkers instructie over veilig rijgedrag en rijmoeheid?', 'Ja', 'Rijinstructie loopt mee in het inwerken.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1014),
    ('L2', 'L2-15', 'Krijgen medewerkers instructie over veilig rijgedrag en rijmoeheid?', 'Nee', 'Geen vaste rijinstructie, mede omdat vervoer hier grotendeels via de (buiten gebruik zijnde) bakfiets liep.', 'Laag', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1015),
    ('L2', 'L2-16', 'Zijn op het terrein rijroutes en voetgangerszones gescheiden?', 'Ja', 'Geen gemotoriseerd verkeer op het terrein.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1016),
    ('L2', 'L2-17', 'Zijn op het terrein rijroutes en voetgangerszones gescheiden?', 'Ja', 'Parkeren en lopen zijn gescheiden.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1017),
    ('L2', 'L2-18', 'Zijn op het terrein rijroutes en voetgangerszones gescheiden?', 'Ja', 'Geen relevant terreinverkeer bij de woonhuizen.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1018),
    ('L2', 'L2-19', 'Zijn op het terrein rijroutes en voetgangerszones gescheiden?', 'Nee', 'Klein terrein zonder gescheiden rijroute en looppad.', 'Laag', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1019),
    ('L2', 'L2-20', 'Zijn de voertuigen voor cliëntvervoer voorzien van passende zit- en rolstoelvoorzieningen, gordels en periodiek onderhoud, en is vastgelegd wanneer een extra begeleider meerijdt?', 'Ja', 'Vervoer verloopt via een externe vervoerder met eigen voertuigzorg.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1020),
    ('L2', 'L2-21', 'Zijn de voertuigen voor cliëntvervoer voorzien van passende zit- en rolstoelvoorzieningen, gordels en periodiek onderhoud, en is vastgelegd wanneer een extra begeleider meerijdt?', 'Ja', 'Vervoer verloopt via een externe vervoerder met eigen voertuigzorg.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1021),
    ('L2', 'L2-22', 'Zijn de voertuigen voor cliëntvervoer voorzien van passende zit- en rolstoelvoorzieningen, gordels en periodiek onderhoud, en is vastgelegd wanneer een extra begeleider meerijdt?', 'Ja', 'Vervoer verloopt via een externe vervoerder met eigen voertuigzorg.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1022),
    ('L2', 'L2-23', 'Zijn de voertuigen voor cliëntvervoer voorzien van passende zit- en rolstoelvoorzieningen, gordels en periodiek onderhoud, en is vastgelegd wanneer een extra begeleider meerijdt?', 'Nee', 'De eigen bakfiets is buiten gebruik (terugroepactie) en er is nog geen vaste, passend uitgeruste vervangende vervoersvoorziening.', 'Middel', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1023),
    ('L3', 'L3-11', 'Worden specifieke risico''s per externe locatie (huisbezoek) vooraf bekendgemaakt aan de medewerker?', 'Nee', 'De thuissituatie van cliënten wordt niet vooraf geïnventariseerd bij huisbezoeken (zelfde punt als organisatiebreed al is vastgesteld).', 'Middel', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1011),
    ('L3', 'L3-12', 'Worden specifieke risico''s per externe locatie (huisbezoek) vooraf bekendgemaakt aan de medewerker?', 'Nee', 'De thuissituatie van cliënten wordt niet vooraf geïnventariseerd bij huisbezoeken (zelfde punt als organisatiebreed al is vastgesteld).', 'Middel', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1012),
    ('L3', 'L3-13', 'Worden specifieke risico''s per externe locatie (huisbezoek) vooraf bekendgemaakt aan de medewerker?', 'Nee', 'De thuissituatie van cliënten wordt niet vooraf geïnventariseerd bij huisbezoeken (zelfde punt als organisatiebreed al is vastgesteld).', 'Middel', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1013),
    ('L3', 'L3-14', 'Worden specifieke risico''s per externe locatie (huisbezoek) vooraf bekendgemaakt aan de medewerker?', 'Nee', 'De thuissituatie van cliënten wordt niet vooraf geïnventariseerd bij huisbezoeken (zelfde punt als organisatiebreed al is vastgesteld).', 'Middel', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1014),
    ('L3', 'L3-15', 'Is bij risicovol werk op een externe locatie passend toezicht geregeld (vier-ogen, bereikbare collega)?', 'Ja', 'Huisbezoeken lopen via een vast aanspreekpunt op de locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1015),
    ('L3', 'L3-16', 'Is bij risicovol werk op een externe locatie passend toezicht geregeld (vier-ogen, bereikbare collega)?', 'Ja', 'Huisbezoeken lopen via een vast aanspreekpunt op de locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1016),
    ('L3', 'L3-17', 'Is bij risicovol werk op een externe locatie passend toezicht geregeld (vier-ogen, bereikbare collega)?', 'Ja', 'Huisbezoeken lopen via een vast aanspreekpunt op de locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1017),
    ('L3', 'L3-18', 'Is bij risicovol werk op een externe locatie passend toezicht geregeld (vier-ogen, bereikbare collega)?', 'Ja', 'Huisbezoeken lopen via een vast aanspreekpunt op de locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1018),
    ('L3', 'L3-19', 'Is een check-in/out-procedure ingericht voor medewerkers die alleen op een externe locatie werken?', 'Ja', 'Vast aanspreekpunt weet wanneer een huisbezoek begint en eindigt.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1019),
    ('L3', 'L3-20', 'Is een check-in/out-procedure ingericht voor medewerkers die alleen op een externe locatie werken?', 'Ja', 'Vast aanspreekpunt weet wanneer een huisbezoek begint en eindigt.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1020),
    ('L3', 'L3-21', 'Is een check-in/out-procedure ingericht voor medewerkers die alleen op een externe locatie werken?', 'Nee', 'Door de opzet over meerdere woonhuizen is niet altijd duidelijk wanneer een medewerker alleen tussen huizen onderweg is.', 'Laag', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1021),
    ('L3', 'L3-22', 'Is een check-in/out-procedure ingericht voor medewerkers die alleen op een externe locatie werken?', 'Ja', 'Vast aanspreekpunt weet wanneer een huisbezoek begint en eindigt.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1022),
    ('L3', 'L3-23', 'Is geregeld hoe wordt omgegaan met agressie of intimidatie door derden op een externe locatie (bv. bij een huisbezoek)?', 'Nee', 'Voor huisbezoeken specifiek is geen aanvulling op het algemene agressieprotocol geregeld.', 'Laag', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1023),
    ('L3', 'L3-24', 'Is geregeld hoe wordt omgegaan met agressie of intimidatie door derden op een externe locatie (bv. bij een huisbezoek)?', 'Nee', 'Voor huisbezoeken specifiek is geen aanvulling op het algemene agressieprotocol geregeld.', 'Laag', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1024),
    ('L3', 'L3-25', 'Is geregeld hoe wordt omgegaan met agressie of intimidatie door derden op een externe locatie (bv. bij een huisbezoek)?', 'Nee', 'Voor huisbezoeken specifiek is geen aanvulling op het algemene agressieprotocol geregeld.', 'Laag', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1025),
    ('L3', 'L3-26', 'Is geregeld hoe wordt omgegaan met agressie of intimidatie door derden op een externe locatie (bv. bij een huisbezoek)?', 'Nee', 'Voor huisbezoeken specifiek is geen aanvulling op het algemene agressieprotocol geregeld.', 'Laag', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1026),
    ('L1', 'L1-79', 'Voldoet de opslag van gasflessen aan PGS 15 (apart hok, ventilatie, scheiding)?', 'NVT', 'Er zijn geen gasflessen aanwezig op deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1079),
    ('L1', 'L1-80', 'Voldoet de opslag van gasflessen aan PGS 15 (apart hok, ventilatie, scheiding)?', 'NVT', 'Er zijn geen gasflessen aanwezig op deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1080),
    ('L1', 'L1-81', 'Voldoet de opslag van gasflessen aan PGS 15 (apart hok, ventilatie, scheiding)?', 'NVT', 'Er zijn geen gasflessen aanwezig op deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1081),
    ('L1', 'L1-82', 'Voldoet de opslag van gasflessen aan PGS 15 (apart hok, ventilatie, scheiding)?', 'NVT', 'Er zijn geen gasflessen aanwezig op deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1082),
    ('L1', 'L1-83', 'Kan tijdens overnachtingen met de aanwezige bezetting veilig en tijdig worden ontruimd en is dat in de praktijk getoetst?', 'NVT', 'SeysCentra biedt geen overnachtings-/logeeropvang; deze locatie heeft geen nachtbezetting.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1083),
    ('L1', 'L1-84', 'Kan tijdens overnachtingen met de aanwezige bezetting veilig en tijdig worden ontruimd en is dat in de praktijk getoetst?', 'NVT', 'SeysCentra biedt geen overnachtings-/logeeropvang; deze locatie heeft geen nachtbezetting.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1084),
    ('L1', 'L1-85', 'Kan tijdens overnachtingen met de aanwezige bezetting veilig en tijdig worden ontruimd en is dat in de praktijk getoetst?', 'NVT', 'SeysCentra biedt geen overnachtings-/logeeropvang; deze locatie heeft geen nachtbezetting.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1085),
    ('L1', 'L1-86', 'Kan tijdens overnachtingen met de aanwezige bezetting veilig en tijdig worden ontruimd en is dat in de praktijk getoetst?', 'NVT', 'SeysCentra biedt geen overnachtings-/logeeropvang; deze locatie heeft geen nachtbezetting.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1086),
    ('L2', 'L2-24', 'Hebben chauffeurs van vrachtwagens een geldig rijbewijs C/CE en Code 95?', 'NVT', 'Er wordt niet met vrachtwagens gereden vanuit deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1024),
    ('L2', 'L2-25', 'Hebben chauffeurs van vrachtwagens een geldig rijbewijs C/CE en Code 95?', 'NVT', 'Er wordt niet met vrachtwagens gereden vanuit deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1025),
    ('L2', 'L2-26', 'Hebben chauffeurs van vrachtwagens een geldig rijbewijs C/CE en Code 95?', 'NVT', 'Er wordt niet met vrachtwagens gereden vanuit deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1026),
    ('L2', 'L2-27', 'Hebben chauffeurs van vrachtwagens een geldig rijbewijs C/CE en Code 95?', 'NVT', 'Er wordt niet met vrachtwagens gereden vanuit deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1027),
    ('L2', 'L2-28', 'Wordt vervoer van gevaarlijke stoffen conform ADR uitgevoerd (vrijstellingsgrenzen, etikettering, training)?', 'NVT', 'Er worden geen gevaarlijke stoffen vervoerd vanuit deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1028),
    ('L2', 'L2-29', 'Wordt vervoer van gevaarlijke stoffen conform ADR uitgevoerd (vrijstellingsgrenzen, etikettering, training)?', 'NVT', 'Er worden geen gevaarlijke stoffen vervoerd vanuit deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1029),
    ('L2', 'L2-30', 'Wordt vervoer van gevaarlijke stoffen conform ADR uitgevoerd (vrijstellingsgrenzen, etikettering, training)?', 'NVT', 'Er worden geen gevaarlijke stoffen vervoerd vanuit deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1030),
    ('L2', 'L2-31', 'Wordt vervoer van gevaarlijke stoffen conform ADR uitgevoerd (vrijstellingsgrenzen, etikettering, training)?', 'NVT', 'Er worden geen gevaarlijke stoffen vervoerd vanuit deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1031),
    ('L2', 'L2-32', 'Hebben heftruck- en hoogwerkerchauffeurs een geldig opleidingsbewijs?', 'NVT', 'Er wordt geen heftruck of hoogwerker gebruikt op deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1032),
    ('L2', 'L2-33', 'Hebben heftruck- en hoogwerkerchauffeurs een geldig opleidingsbewijs?', 'NVT', 'Er wordt geen heftruck of hoogwerker gebruikt op deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1033),
    ('L2', 'L2-34', 'Hebben heftruck- en hoogwerkerchauffeurs een geldig opleidingsbewijs?', 'NVT', 'Er wordt geen heftruck of hoogwerker gebruikt op deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1034),
    ('L2', 'L2-35', 'Hebben heftruck- en hoogwerkerchauffeurs een geldig opleidingsbewijs?', 'NVT', 'Er wordt geen heftruck of hoogwerker gebruikt op deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1035),
    ('L2', 'L2-36', 'Zijn voertuigen in een 24/7-storingsdienst voorzien van passende banden voor alle weersomstandigheden?', 'NVT', 'Er is geen 24-uursstoringsdienst met eigen voertuigen vanuit deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1036),
    ('L2', 'L2-37', 'Zijn voertuigen in een 24/7-storingsdienst voorzien van passende banden voor alle weersomstandigheden?', 'NVT', 'Er is geen 24-uursstoringsdienst met eigen voertuigen vanuit deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1037),
    ('L2', 'L2-38', 'Zijn voertuigen in een 24/7-storingsdienst voorzien van passende banden voor alle weersomstandigheden?', 'NVT', 'Er is geen 24-uursstoringsdienst met eigen voertuigen vanuit deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1038),
    ('L2', 'L2-39', 'Zijn voertuigen in een 24/7-storingsdienst voorzien van passende banden voor alle weersomstandigheden?', 'NVT', 'Er is geen 24-uursstoringsdienst met eigen voertuigen vanuit deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1039),
    ('L2', 'L2-40', 'Worden lange diensten en rijmoeheid in een storingsdienst gemonitord en zo nodig opgevangen door wisseling?', 'NVT', 'Er is geen storingsdienst vanuit deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1040),
    ('L2', 'L2-41', 'Worden lange diensten en rijmoeheid in een storingsdienst gemonitord en zo nodig opgevangen door wisseling?', 'NVT', 'Er is geen storingsdienst vanuit deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1041),
    ('L2', 'L2-42', 'Worden lange diensten en rijmoeheid in een storingsdienst gemonitord en zo nodig opgevangen door wisseling?', 'NVT', 'Er is geen storingsdienst vanuit deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1042),
    ('L2', 'L2-43', 'Worden lange diensten en rijmoeheid in een storingsdienst gemonitord en zo nodig opgevangen door wisseling?', 'NVT', 'Er is geen storingsdienst vanuit deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1043),
    ('L3', 'L3-27', 'Wordt voor extern projectwerk een TBM/LMRA uitgevoerd en geregistreerd?', 'NVT', 'Er is geen bouwkundig of technisch projectwerk vanuit deze locatie waarvoor een taakgerichte risicobeoordeling vooraf aan de orde is.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1027),
    ('L3', 'L3-28', 'Wordt voor extern projectwerk een TBM/LMRA uitgevoerd en geregistreerd?', 'NVT', 'Er is geen bouwkundig of technisch projectwerk vanuit deze locatie waarvoor een taakgerichte risicobeoordeling vooraf aan de orde is.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1028),
    ('L3', 'L3-29', 'Wordt voor extern projectwerk een TBM/LMRA uitgevoerd en geregistreerd?', 'NVT', 'Er is geen bouwkundig of technisch projectwerk vanuit deze locatie waarvoor een taakgerichte risicobeoordeling vooraf aan de orde is.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1029),
    ('L3', 'L3-30', 'Wordt voor extern projectwerk een TBM/LMRA uitgevoerd en geregistreerd?', 'NVT', 'Er is geen bouwkundig of technisch projectwerk vanuit deze locatie waarvoor een taakgerichte risicobeoordeling vooraf aan de orde is.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1030),
    ('L3', 'L3-31', 'Is voor extern projectwerk waar dat vereist is een V&G-plan beschikbaar?', 'NVT', 'Er is geen bouwkundig projectwerk vanuit deze locatie waarvoor een veiligheids- en gezondheidsplan geldt.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1031),
    ('L3', 'L3-32', 'Is voor extern projectwerk waar dat vereist is een V&G-plan beschikbaar?', 'NVT', 'Er is geen bouwkundig projectwerk vanuit deze locatie waarvoor een veiligheids- en gezondheidsplan geldt.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1032),
    ('L3', 'L3-33', 'Is voor extern projectwerk waar dat vereist is een V&G-plan beschikbaar?', 'NVT', 'Er is geen bouwkundig projectwerk vanuit deze locatie waarvoor een veiligheids- en gezondheidsplan geldt.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1033),
    ('L3', 'L3-34', 'Is voor extern projectwerk waar dat vereist is een V&G-plan beschikbaar?', 'NVT', 'Er is geen bouwkundig projectwerk vanuit deze locatie waarvoor een veiligheids- en gezondheidsplan geldt.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1034),
    ('L3', 'L3-35', 'Wordt voorafgaand aan graafwerk vanuit deze locatie een KLIC-melding gedaan?', 'NVT', 'Er vindt geen graafwerk plaats vanuit deze locatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1035),
    ('L3', 'L3-36', 'Wordt voorafgaand aan graafwerk vanuit deze locatie een KLIC-melding gedaan?', 'NVT', 'Er vindt geen graafwerk plaats vanuit deze locatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1036),
    ('L3', 'L3-37', 'Wordt voorafgaand aan graafwerk vanuit deze locatie een KLIC-melding gedaan?', 'NVT', 'Er vindt geen graafwerk plaats vanuit deze locatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1037),
    ('L3', 'L3-38', 'Wordt voorafgaand aan graafwerk vanuit deze locatie een KLIC-melding gedaan?', 'NVT', 'Er vindt geen graafwerk plaats vanuit deze locatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1038),
    ('L3', 'L3-39', 'Werken medewerkers vanuit deze locatie in het buitenland conform Nederlands/EU-niveau van arbobescherming?', 'NVT', 'Er wordt vanuit deze locatie niet in het buitenland gewerkt.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1039),
    ('L3', 'L3-40', 'Werken medewerkers vanuit deze locatie in het buitenland conform Nederlands/EU-niveau van arbobescherming?', 'NVT', 'Er wordt vanuit deze locatie niet in het buitenland gewerkt.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1040),
    ('L3', 'L3-41', 'Werken medewerkers vanuit deze locatie in het buitenland conform Nederlands/EU-niveau van arbobescherming?', 'NVT', 'Er wordt vanuit deze locatie niet in het buitenland gewerkt.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1041),
    ('L3', 'L3-42', 'Werken medewerkers vanuit deze locatie in het buitenland conform Nederlands/EU-niveau van arbobescherming?', 'NVT', 'Er wordt vanuit deze locatie niet in het buitenland gewerkt.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1042),
    ('L3', 'L3-43', 'Is voor alleen werken tijdens de nacht vanuit deze locatie een specifieke risicoanalyse uitgevoerd?', 'NVT', 'SeysCentra biedt vanuit deze locatie geen overnachtings-/logeeropvang, dus geen alleen-werken-in-de-nacht-situatie.', NULL, '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid, 1043),
    ('L3', 'L3-44', 'Is voor alleen werken tijdens de nacht vanuit deze locatie een specifieke risicoanalyse uitgevoerd?', 'NVT', 'SeysCentra biedt vanuit deze locatie geen overnachtings-/logeeropvang, dus geen alleen-werken-in-de-nacht-situatie.', NULL, '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid, 1044),
    ('L3', 'L3-45', 'Is voor alleen werken tijdens de nacht vanuit deze locatie een specifieke risicoanalyse uitgevoerd?', 'NVT', 'SeysCentra biedt vanuit deze locatie geen overnachtings-/logeeropvang, dus geen alleen-werken-in-de-nacht-situatie.', NULL, '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid, 1045),
    ('L3', 'L3-46', 'Is voor alleen werken tijdens de nacht vanuit deze locatie een specifieke risicoanalyse uitgevoerd?', 'NVT', 'SeysCentra biedt vanuit deze locatie geen overnachtings-/logeeropvang, dus geen alleen-werken-in-de-nacht-situatie.', NULL, '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid, 1046)
  ) as x(module_code, nr, vraag, antwoord, bevinding, klasse, locatie_id, volgorde)
  join public.modules m on m.company_id = v_company_id and m.code = x.module_code and m.archived_at is null;

  if (select count(*) from public.vragen where company_id = v_company_id) <> 120 + v_vragen_voor then
    raise exception 'Niet alle 120 nieuwe vragen zijn ingevoegd -- afgebroken.';
  end if;

  insert into public.pva_items (id, company_id, nr, onderwerp, maatregel, prio, termijn, status, locatie_id)
  values
    (gen_random_uuid(), v_company_id, '74', 'Keuring blusmiddelen (Malden)', 'Vraag het keuringsbewijs op bij de onderhoudspartij en plan een keuring in als die ontbreekt.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '75', 'Vluchtwegaanduiding (Malden)', 'Breng vluchtwegaanduiding aan op de verdieping conform NEN 3011.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '76', 'Ontruimingsplattegrond (Maastricht)', 'Laat een ontruimingsplattegrond volgens NEN 1414 maken en ophangen.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid),
    (gen_random_uuid(), v_company_id, '77', 'Ontruimingsplattegrond (Malden)', 'Laat een ontruimingsplattegrond volgens NEN 1414 maken en ophangen.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '78', 'Beheerder brandmeldinstallatie (Malden)', 'Wijs een beheerder voor de brandmeldinstallatie aan en leg dat vast.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '79', 'AED bekendheid (Maastricht)', 'Breng de dichtstbijzijnde AED-locatie in kaart en maak dit bekend bij het team.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid),
    (gen_random_uuid(), v_company_id, '80', 'AED bekendheid (Zwijndrecht)', 'Breng de dichtstbijzijnde AED-locatie in kaart en maak dit bekend bij het team.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid),
    (gen_random_uuid(), v_company_id, '81', 'Hulpbehoefte bij ontruiming (Malden)', 'Beoordeel per cliënt de hulpbehoefte bij ontruiming en leg de taakverdeling vast.', 'Hoog', 'Kort (binnen 3 maanden)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '82', 'Hulpbehoefte bij ontruiming (Utrecht)', 'Beoordeel per groep/woonhuis de hulpbehoefte bij ontruiming en leg de taakverdeling vast.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid),
    (gen_random_uuid(), v_company_id, '83', 'Rijinstructie (Zwijndrecht)', 'Geef een korte rijinstructie aan medewerkers die vervoer verzorgen vanuit deze locatie.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid),
    (gen_random_uuid(), v_company_id, '84', 'Rijroutes en voetgangerszones (Zwijndrecht)', 'Markeer een looproute los van de rijroute op het terrein.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid),
    (gen_random_uuid(), v_company_id, '85', 'Vervangend cliëntvervoer (Zwijndrecht)', 'Regel een vervangende, passend uitgeruste vervoersvoorziening nu de bakfiets buiten gebruik is.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid),
    (gen_random_uuid(), v_company_id, '86', 'Risico-inventarisatie huisbezoek (Maastricht)', 'Inventariseer voorafgaand aan een huisbezoek vanuit deze locatie de thuissituatie en bekende risico''s, en bespreek dit met de medewerker.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid),
    (gen_random_uuid(), v_company_id, '87', 'Risico-inventarisatie huisbezoek (Malden)', 'Inventariseer voorafgaand aan een huisbezoek vanuit deze locatie de thuissituatie en bekende risico''s, en bespreek dit met de medewerker.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '88', 'Risico-inventarisatie huisbezoek (Utrecht)', 'Inventariseer voorafgaand aan een huisbezoek vanuit deze locatie de thuissituatie en bekende risico''s, en bespreek dit met de medewerker.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid),
    (gen_random_uuid(), v_company_id, '89', 'Risico-inventarisatie huisbezoek (Zwijndrecht)', 'Inventariseer voorafgaand aan een huisbezoek vanuit deze locatie de thuissituatie en bekende risico''s, en bespreek dit met de medewerker.', 'Middel', 'Middellang (binnen 12 maanden)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid),
    (gen_random_uuid(), v_company_id, '90', 'Check-in/out alleen werken (Utrecht)', 'Richt een check-in/out-afspraak in voor medewerkers die alleen tussen de woonhuizen onderweg zijn.', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid),
    (gen_random_uuid(), v_company_id, '91', 'Agressieprotocol huisbezoek (Maastricht)', 'Vul het agressieprotocol aan met een paragraaf specifiek voor huisbezoeken vanuit deze locatie (signalering, terugtrekken, melden).', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '5b8e166d-6a4c-4c03-9dbf-1cbee2afa615'::uuid),
    (gen_random_uuid(), v_company_id, '92', 'Agressieprotocol huisbezoek (Malden)', 'Vul het agressieprotocol aan met een paragraaf specifiek voor huisbezoeken vanuit deze locatie (signalering, terugtrekken, melden).', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '887a3423-74ee-43d9-b35f-372e94cc8c6f'::uuid),
    (gen_random_uuid(), v_company_id, '93', 'Agressieprotocol huisbezoek (Utrecht)', 'Vul het agressieprotocol aan met een paragraaf specifiek voor huisbezoeken vanuit deze locatie (signalering, terugtrekken, melden).', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '73ccaa2d-8751-4801-8e23-43b0f8cd22ca'::uuid),
    (gen_random_uuid(), v_company_id, '94', 'Agressieprotocol huisbezoek (Zwijndrecht)', 'Vul het agressieprotocol aan met een paragraaf specifiek voor huisbezoeken vanuit deze locatie (signalering, terugtrekken, melden).', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open', '820215ae-50e9-4042-9ea8-cb3237ff2742'::uuid);

  if (select count(*) from public.pva_items where company_id = v_company_id and nr::int >= 74) <> 21 then
    raise exception 'Niet alle 21 nieuwe pva-acties zijn ingevoegd -- afgebroken.';
  end if;

  with koppel(vraag_nr, pva_nr) as (
    values
    ('L1-40', '74'),
    ('L1-48', '75'),
    ('L1-51', '76'),
    ('L1-52', '77'),
    ('L1-68', '78'),
    ('L1-71', '79'),
    ('L1-74', '80'),
    ('L1-76', '81'),
    ('L1-77', '82'),
    ('L2-15', '83'),
    ('L2-19', '84'),
    ('L2-23', '85'),
    ('L3-11', '86'),
    ('L3-12', '87'),
    ('L3-13', '88'),
    ('L3-14', '89'),
    ('L3-21', '90'),
    ('L3-23', '91'),
    ('L3-24', '92'),
    ('L3-25', '93'),
    ('L3-26', '94')
  )
  update public.vragen v set pva = k.pva_nr
  from koppel k
  where v.company_id = v_company_id and v.nr = k.vraag_nr;

  if (select count(*) from public.vragen v where v.company_id = v_company_id and v.volgorde >= 1000 and v.pva is not null) <> 21 then
    raise exception 'Niet alle 21 nieuwe vraag-pva-koppelingen zijn gezet -- afgebroken.';
  end if;

  select count(*) into v_vragen_na from public.vragen where company_id = v_company_id;
  select count(*) into v_pva_na from public.pva_items where company_id = v_company_id;
  select md5(string_agg(v.id::text||'|'||v.module_id::text||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,'')||'|'||coalesce(v.locatie_id::text,'')||'|'||coalesce(v.functiegroep_id::text,'')||'|'||coalesce(v.klasse,''), '~' order by v.id))
    into v_hash_bestaand_na
    from public.vragen v where v.company_id = v_company_id and v.volgorde < 1000;

  if v_hash_bestaand_na is distinct from v_hash_bestaand_voor then
    raise exception 'De hash van de 168 BESTAANDE vragen is veranderd -- afgebroken, niets mag hier wijzigen.';
  end if;

  if v_vragen_na <> 288 then
    raise exception 'Onverwacht totaal aantal vragen na afloop: % (verwacht 288).', v_vragen_na;
  end if;
  if v_pva_na <> 94 then
    raise exception 'Onverwacht totaal aantal pva-items na afloop: % (verwacht 94).', v_pva_na;
  end if;

  raise notice 'SeysCentra locatie-FLOP-aanvulling: % vragen -> %, % pva-items -> %, bestaande-vragen-hash ongewijzigd.', v_vragen_voor, v_vragen_na, v_pva_voor, v_pva_na;
end $$;

commit;
