-- Migratie 0090: SeysCentra RI&E aanvullen met de volledige Numodo-FLOP-vragenlijst
-- ------------------------------------------------------------------------------------
-- Alleen bedrijf SeysCentra wordt geraakt. Puur additief: geen enkele bestaande rij
-- wordt geupdatet of verwijderd, alleen nieuwe vragen (nr NUM-<Numodo-nr>) en nieuwe
-- pva_items (nr 61+) worden ingevoegd. Zie SEYS_AANVULLING_2026-09-24.md voor de volledige
-- overlapanalyse per vraag (welke Numodo-vragen zijn overgeslagen en waarom, en de
-- twijfelgevallen die wel zijn toegevoegd). Bron: import/input/20260730 RIE Numodozorg.docx,
-- machinaal geextraheerd naar import/numodo_vragen.json / numodo_pva.json (niet gecommit,
-- valt onder de /import/*-blanket-ignore voor klantcontent).

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
  if v_vragen_voor <> 63 or v_pva_voor <> 60 then
    raise exception 'Onverwachte startstand SeysCentra: % vragen, % pva-items (verwacht 63/60) -- afgebroken.', v_vragen_voor, v_pva_voor;
  end if;

  -- Hash van de 63 BESTAANDE vragen (op hun eigen nr) -- moet na de migratie identiek zijn,
  -- als bewijs dat geen van de 12+ aandachtspunten is aangeraakt.
  select md5(string_agg(v.nr||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,''), '~' order by v.nr))
    into v_hash_bestaand_voor
    from public.vragen v where v.company_id = v_company_id and v.nr not like 'NUM-%';

  -- Nieuwe vragen uit Numodo, elk met nr 'NUM-<Numodo-nr>' zodat herkomst altijd zichtbaar
  -- blijft en er geen botsing is met de bestaande nr-reeksen. locatie_id/functiegroep_id
  -- blijven NULL (organisatiebreed) -- zie rapport voor de motivatie.
  insert into public.vragen (id, company_id, module_id, nr, vraag, antwoord, bevinding, klasse, volgorde)
  select gen_random_uuid(), v_company_id, m.id, x.nr, x.vraag, x.antwoord, x.bevinding, x.klasse, x.volgorde
  from (values
    ('F1','NUM-F1-1','Is er een actueel register van gevaarlijke stoffen op de werkplek en wordt actief gezocht naar minder schadelijke alternatieven (vervangingsbeleid)?','Nee','Op beide locaties zijn schoonmaak-, desinfectie- en keukenmiddelen in gebruik. Een productoverzicht per locatie ontbreekt. Het gaat om huishoudelijke producten in gebruiksklare verpakking, dus een overzicht op een A4 volstaat.','Laag',1000),
    ('F1','NUM-F1-2','Zijn van alle aanwezige gevaarlijke stoffen actuele etiketten en veiligheidsinformatiebladen (VIB/SDS) op iedere werkplek beschikbaar?','Ja','Er wordt met gebruiksklare producten in de originele verpakking gewerkt en de etiketten daarop zijn intact. Daarmee staat de gevaarinformatie op de plek waar het product wordt gebruikt.',NULL,1001),
    ('F1','NUM-F1-3','Krijgen medewerkers voorlichting en instructie over de gevaren, juiste werkwijze en eerste hulp bij blootstelling aan gevaarlijke stoffen?','Ja','Schoonmaak en verzorging horen bij het dagelijkse werk en de instructie loopt mee in het inwerken. Scholing heeft binnen Numodozorg een vaste plaats.',NULL,1002),
    ('F1','NUM-F1-4','Is de blootstelling aan gevaarlijke stoffen beoordeeld en zijn passende beheersmaatregelen getroffen (bronaanpak, ventilatie, PBM)?','Ja','Gebruiksklare huishoudelijke producten, volgens gebruiksaanwijzing en zonder mengen, in geventileerde ruimten. Een blootstellingsbeoordeling is op deze schaal niet aangewezen. Levert de screening uit actiepunt 1 een grenswaarde of CMR-indeling op, dan verandert dat.',NULL,1003),
    ('F1','NUM-F1-5','Worden gevaarlijke stoffen opgeslagen conform PGS 15 (lekbak, ventilatie, brandwerendheid, scheiding van incompatibele stoffen)?','NVT','De aanwezige hoeveelheden blijven ruim onder de ondergrens van PGS 15. Het gaat om huishoudelijke verpakkingen in een keuken- en werkkast, niet om een opslagvoorziening.',NULL,1004),
    ('F1','NUM-F1-6','Staan vloeibare gevaarlijke stoffen in deugdelijke lekbakken en gescheiden van incompatibele stoffen?','NVT','Er is geen bulkopslag van vloeibare gevaarlijke stoffen waarvoor lekbakken of scheiding van incompatibele stoffen aan de orde is.',NULL,1005),
    ('F1','NUM-F1-7','Is er een morsprocedure en zijn passende spillkits aanwezig en bij medewerkers bekend?','NVT','Er zijn geen hoeveelheden waarbij een spillkit passend is. Morsen van een huishoudelijk product wordt met de normale schoonmaakmiddelen opgeruimd.',NULL,1006),
    ('F1','NUM-F1-8','Is voor het werken met solventen en lasrook adequate ventilatie en/of adembescherming geregeld?','NVT','Er wordt niet met solventen gewerkt en er vindt geen las- of soldeerwerk plaats.',NULL,1007),
    ('F1','NUM-F1-10','Is het preventief medisch onderzoek (PAGO) afgestemd op de stoffen waaraan medewerkers worden blootgesteld?','NVT','Er is geen blootstelling aan stoffen die een op stoffen toegesneden PAGO vereist. Het periodiek gezondheidsonderzoek als geheel is beoordeeld onder O2-1.',NULL,1008),
    ('F1','NUM-F1-11','Geldt de ARIE-verplichting (Aanvullende Risico-Inventarisatie en -Evaluatie) op grond van de aanwezige hoeveelheden?','NVT','De ARIE-drempelwaarden worden bij lange na niet gehaald.',NULL,1009),
    ('F1','NUM-F1-12','Is een veiligheidsinformatieblad (VIB) bij elke werkplek of in elk servicevoertuig toegankelijk (digitaal of op papier)?','Ja','De producten blijven in de originele verpakking, met het etiket erop. Voor huishoudelijke middelen in deze hoeveelheden is dat de toegankelijke veiligheidsinformatie op de werkplek.',NULL,1010),
    ('F1','NUM-F1-13','Wordt het werken met gevaarlijke stoffen en koudemiddelen beperkt tot daartoe bevoegde en opgeleide medewerkers?','NVT','Er wordt niet met koudemiddelen of met stoffen gewerkt waarvoor een aparte bevoegdheidsregeling geldt. Bevoegd- en bekwaamheid voor medicatiehandelingen is beoordeeld onder F1-18.',NULL,1011),
    ('F1','NUM-F1-14','Zijn de verplichtingen voor diisocyanaten (REACH bijlage XVII, post 74) ingevuld (training en grenswaarde 6 µg NCO/m³)?','NVT','Er wordt niet met diisocyanaathoudende producten gewerkt.',NULL,1012),
    ('F1','NUM-F1-15','Zijn voor brandbare koudemiddelen (zoals propaan) een explosieveiligheidsdocument (EVD) en ATEX-zonering opgesteld en zijn grenswaarden geborgd richting de omgevingsvergunning?','NVT','Er zijn geen brandbare koudemiddelen of andere bronnen die een explosieveiligheidsdocument of ATEX-zonering vragen.',NULL,1013),
    ('F1','NUM-F1-16','Voldoet het vervoer van gevaarlijke stoffen aan ADR (1000-puntenregeling, etikettering, ADR-training waar nodig)?','NVT','Er worden geen gevaarlijke stoffen vervoerd. Het vervoer betreft clientvervoer en is beoordeeld onder L2.',NULL,1014),
    ('F1','NUM-F1-17','Worden schoonmaak-, desinfectie- en keukenmiddelen zo opgeslagen dat clienten er niet bij kunnen (afgesloten kast, buiten bereik)?','Ja','Schoonmaakmiddelen, desinfectiemiddelen en medicatie staan afgesloten. Dat is ter plaatse gezien op beide locaties. De messen in de keuken van 179 zijn een apart punt en staan bij de adviezen.
Foto 4, 5',NULL,1015),
    ('F1','NUM-F1-18','Zijn bevoegdheid en bekwaamheid voor medicatiehandelingen geregeld, inclusief opslag, sleutelbeheer, aftekenen en dubbele controle waar vereist?','Ja','Medicatie wordt alleen op 179 toegediend, na instructie en vastgestelde bekwaamheid. Op 9A nemen clienten hun eigen medicatie in. Opslag in een afgesloten kast met aparte koelkast, met vaste toedientijden, doorlopende aftekening en een WZD-formulier.',NULL,1016),
    ('F1','NUM-F1-19','Zijn bij verschonen, douche- en zorgtaken handhygiëne, handschoenen, afvalroute, schoonmaak en desinfectie en een prik- of spatincidentprocedure geregeld?','Nee','Bij verschonen en douchen is contact met lichaamsvloeistoffen mogelijk. Bij bijten en krabben loopt dat ook via de huid. Een medewerker haalde na zo''n voorval een tetanusinjectie. Een vaste handelwijze na een bijtincident, met belroute, is niet vastgelegd.','Middel',1017),
    ('F1','NUM-F1-20','Zijn alle tappunten van beide locaties opgenomen in het legionellabeheersplan met spoel- en meetregistratie?','Ja','Het legionellabeheer bestaat uit periodiek doorspoelen van de tappunten die niet dagelijks worden gebruikt, waaronder de douche op 9A. Voor deze installatie is spoelen de passende beheersmaatregel.',NULL,1018),
    ('F1','NUM-F1-21','Is bekend of in de panden asbesthoudende materialen aanwezig zijn, met het oog op toekomstige boor-, sloop- of verbouwwerkzaamheden?','Ja','Bij de verbouwing van 9A is geen asbest aangetroffen en voor 179 heeft de eigenaar gemeld dat er geen asbest aanwezig is. Een schriftelijke bevestiging bij de locatiegegevens beantwoordt de vraag ook voor toekomstig boorwerk.',NULL,1019),
    ('F2','NUM-F2-1','Is bij de inrichting van de werkplek en het werkontwerp rekening gehouden met fysieke belasting (tillen, dragen, statisch werken, langdurig staan)?','Nee','Verschonen, ondersteunen, in- en uitstappen en het dragen van was over de trap op 9A zijn niet per functie in beeld gebracht. Het verzuim is laag en er zijn geen ongevallen, dus dit is een punt om voor te blijven.','Laag',1020),
    ('F2','NUM-F2-3','Worden zware lasten zoveel mogelijk vermeden of met hulpmiddelen verplaatst (heftruck, kraan, palletwagen)?','Ja','Op 179 zijn een tillift en tilbanden beschikbaar, zie F2-4. Op 9A is dat niet aan de orde. Voor de was over de trap op 9A ligt de oplossing in actiepunt 5, namelijk de machines beneden zetten.
Foto 6',NULL,1021),
    ('F2','NUM-F2-4','Zijn til-, hijs- en duw-/trekhulpmiddelen beschikbaar en worden ze in de praktijk daadwerkelijk gebruikt?','Ja','Een passieve tillift, Joerns Oxford Presence 227, met tilbanden en gekeurd tot 2027. De tilbanden lopen mee in die keuring.
Foto 10, 11',NULL,1022),
    ('F2','NUM-F2-5','Wordt werken boven schouderhoogte zoveel mogelijk beperkt of met hulpmiddelen ondersteund?','Ja','Werken boven schouderhoogte komt beperkt voor, vooral bij de opslag op de verdieping van 9A. Wat daar staat is licht materiaal, karton en textiel.',NULL,1023),
    ('F2','NUM-F2-6','Zijn maatregelen getroffen om herhalende bewegingen en kortcyclisch werk te beperken (taakroulatie, pauzes)?','NVT','Er is geen kortcyclisch of repeterend productiewerk. Het begeleidingswerk is naar zijn aard afwisselend.',NULL,1024),
    ('F2','NUM-F2-7','Is er aandacht voor de fysieke belasting van oudere medewerkers (aangepast werk, taakroulatie)?','Ja','De teams zijn klein en werken in dagdiensten met meerdere begeleiders, waardoor taken onderling verdeeld kunnen worden. Er zijn geen signalen over overbelasting van oudere medewerkers.',NULL,1025),
    ('F2','NUM-F2-8','Zijn beeldschermwerkplekken ergonomisch ingericht (stoel, bureau, scherm, verlichting)?','Nee','Zit-stabureaus en verstelbare stoelen op beide locaties. Twee punten blijven open: op 179 een laptopstandaard zonder los toetsenbord en muis, en op 9A vier werkplekken in een serre met veel glas en zonder zonwering.
Foto 2, 9','Laag',1026),
    ('F2','NUM-F2-9','Is een verdiepende RI&E fysieke belasting uitgevoerd waar dat op grond van de aard van het werk passend is?','Nee','De TNO-beoordeling fysieke belasting uit het Plan van Aanpak 2025 is niet aangeleverd en dekt de huidige situatie niet. De beoordeling per functie uit actiepunt 3 vult dat in.','Laag',1027),
    ('F2','NUM-F2-10','Is per client vastgelegd of de tillift met een of met twee medewerkers wordt bediend, en is de instructie in het gebruik van tillift en tilbanden aantoonbaar?','Nee','De tillift op 179 is gekeurd tot 2027 en de tilbanden lopen in die keuring mee, zie F2-4. Niet vastgelegd is per client of een transfer met een of met twee medewerkers wordt gedaan, en wie in het gebruik van de lift en de banden is geschoold. Keuringsbewijs, tilbanden en scholing liggen niet als een dossier bij elkaar.','Middel',1028),
    ('F3','NUM-F3-1','Worden medewerkers blootgesteld aan schadelijke trillingen (hand-arm of lichaamstrillingen) waarvoor beheersmaatregelen nodig zijn?','NVT','Er wordt niet met trillingsbelastende arbeidsmiddelen gewerkt.',NULL,1029),
    ('F3','NUM-F3-3','Is gehoorbescherming beschikbaar en wordt deze gebruikt waar dat nodig is?','NVT','Er is geen blootstelling waarvoor gehoorbescherming nodig is.',NULL,1030),
    ('F3','NUM-F3-5','Zijn alle machines CE-gemarkeerd en worden ze periodiek gekeurd?','Ja','De werkplaats uit de huisregels bestaat in de praktijk niet meer: machinaal of elektrisch gereedschap is niet aangetroffen. Handgereedschap ligt afgesloten op zolder en gaat alleen onder toezicht mee.',NULL,1031),
    ('F3','NUM-F3-6','Zijn machines voorzien van adequate afscherming en goed bereikbare noodstoppen?','Ja','Machines met bewegende delen zijn op geen van beide locaties aangetroffen, ook geen motorisch tuingereedschap. Er is nooit een ongeval of bijna-ongeval mee geweest.',NULL,1032),
    ('F3','NUM-F3-7','Is er belijning voor intern transport en zijn voetgangers en voertuigen waar nodig gescheiden?','NVT','Er is geen intern transport met voertuigen op het terrein.',NULL,1033),
    ('F3','NUM-F3-8','Worden noodstoppen periodiek getest en geregistreerd?','NVT','Er zijn geen noodstoppen die periodiek getest moeten worden.',NULL,1034),
    ('F3','NUM-F3-9','Is bij werkzaamheden aan installaties een deugdelijke energiescheiding (LOTO) ingericht?','NVT','Er worden geen werkzaamheden aan installaties in eigen beheer uitgevoerd. Onderhoud aan installaties gebeurt door externe partijen, die daarbij hun eigen energiescheiding toepassen.',NULL,1035),
    ('F3','NUM-F3-10','Voldoet de elektrische installatie aan NEN 3140 en is een aanwijsbeleid (IV/VP/VOP) ingericht?','Ja','Elektrotechnisch werk gebeurt niet in eigen beheer, dus een aanwijsbeleid is niet aan de orde. Het inspectierapport van de installatie van 9A, in gebruik sinds april 2026, ligt bij de eigenaar van het pand.',NULL,1036),
    ('F3','NUM-F3-11','Worden de juiste arbeidsmiddelen gekozen voor werk op hoogte en zijn ze periodiek gekeurd?','Ja','Voor werk op hoogte is alleen een huishoudelijk opstapje in gebruik, bijvoorbeeld voor een lamp of decoratie. Daarvoor is geen aanvullende maatregel nodig.',NULL,1037),
    ('F3','NUM-F3-12','Is bij vaste werkplekken op hoogte (>2,5 m) randbeveiliging of veilige toegang geregeld?','NVT','Er zijn geen vaste werkplekken op meer dan 2,5 meter hoogte.',NULL,1038),
    ('F3','NUM-F3-13','Is valbeveiliging (harnas, lijn, ankerpunten) periodiek gekeurd en in gebruik?','NVT','Er is geen persoonlijke valbeveiliging in gebruik en er zijn geen werkzaamheden waarvoor die nodig is.',NULL,1039),
    ('F3','NUM-F3-14','Zijn looproutes, trappen en niveauverschillen vrij van struikelgevaar en voorzien van leuning waar nodig?','Nee','De trap naar de verdieping van 9A heeft antislip en een deur op slot. Een leuning naast de trap ontbreekt, terwijl er dagelijks wasgoed over die trap wordt gedragen.
Foto 1, 12','Laag',1040),
    ('F3','NUM-F3-15','Wordt veilig gewerkt met technische gassen (CO2, NH3, propaan) en in besloten ruimten (detectie, vluchtmasker, toezicht)?','NVT','Er wordt niet met technische gassen gewerkt en er zijn geen besloten ruimten.',NULL,1041),
    ('F3','NUM-F3-16','Is hijsmaterieel (hijsbanden, kettingen, hijspunten) periodiek gekeurd en geregistreerd?','Ja','De tillift is een hefwerktuig voor personen en valt onder de keuringsplicht. De sticker geeft mei 2026 als laatste en 2027 als volgende keuring, inclusief de tilbanden. Zie F2-4.
Foto 10, 11',NULL,1042),
    ('F3','NUM-F3-18','Is de wasruimte op de eerste verdieping van locatie 9A beoordeeld op brandrisico (pluizenfilter, ventilatie, stopcontacten) en op de opslag eromheen?','Nee','Pluizenfilter, ventilatie en stopcontacten bij de wasapparatuur op 9A zijn in orde. De omgeving houdt het punt open: de apparatuur staat tussen een omvangrijke opslag van karton en textiel, en er komt dagelijks iemand voor de was. Beneden zetten neemt dat weg, zie actiepunt 5.
Foto 1','Laag',1043),
    ('L1','NUM-L1-1','Zijn voldoende blusmiddelen aanwezig en op bereikbare plaatsen opgesteld?','Ja','Blusmiddelen zijn aanwezig en bereikbaar. Op 9A hangen een blusdeken in een houder onder de plattegrond en een blustoestel daarnaast in een beugel. Ook op 179 zijn blusmiddelen aanwezig en bereikbaar.
Foto 13',NULL,1044),
    ('L1','NUM-L1-2','Worden blusmiddelen jaarlijks gekeurd conform NEN 2559?','Ja','Brandmeldinstallatie en blussers zijn aanwezig en werkend. Er zijn geen aanwijzingen dat het periodieke onderhoud achterstallig is.
Foto 7',NULL,1045),
    ('L1','NUM-L1-3','Zijn nooduitgangen en vluchtwegen vrij van obstakels?','Ja','Er zijn geen meldingen of aanwijzingen dat vluchtwegen worden geblokkeerd. Dit wordt bij de rondgang op beide locaties bevestigd.
Foto 8',NULL,1046),
    ('L1','NUM-L1-4','Zijn vluchtwegen en nooduitgangen aangegeven conform NEN 3011/3014?','Ja','Vluchtwegaanduiding is aanwezig op beide locaties, ook in de ruimten die voor de BSO worden gebruikt.',NULL,1047),
    ('L1','NUM-L1-5','Is een ontruimingsplattegrond beschikbaar conform NEN 1414?','Nee','Op 9A hangen plattegronden volgens de norm, met vluchtroutes, melders en een legenda. Op 179 hangt een uitvergrote bouwtekening met ingetekende pijlen, die in een ontruiming niet te lezen is.
Foto 14, 18','Laag',1048),
    ('L1','NUM-L1-6','Worden periodiek ontruimingsoefeningen gehouden en geëvalueerd?','Nee','Op 179 wordt periodiek geoefend, ook met deelnemers erbij. Daaruit bleek dat een slechthorende deelnemer het signaal niet hoort, waarvoor daar het vlammetjes-symbool wordt gebruikt. Op 9A is sinds de opening niet geoefend en de logeernacht is nooit beoefend. Boven beide panden wonen particuliere huurders, die bij een ontruiming mogelijk geinformeerd moeten worden. Hoe dat gebeurt is niet afgesproken.','Middel',1049),
    ('L1','NUM-L1-7','Is de BHV-bezetting voldoende voor de risico''s (minimaal één BHV''er per ploeg/locatie)?','Ja','Op beide locaties zijn meerdere BHV''ers beschikbaar en alle functies zijn dubbel bezet, ook op de BSO vanaf 14:30 uur en op de vrijdagmiddag. De jaarlijkse training is toegespitst op de doelgroep en de locatie. In het rooster is per dagdeel geen aparte BHV-kolom opgenomen.',NULL,1050),
    ('L1','NUM-L1-8','Zijn de BHV-certificaten van medewerkers actueel?','Ja','Alle hoofdbegeleiders volgen jaarlijks de BHV-training, toegespitst op de doelgroep en de locatie.',NULL,1051),
    ('L1','NUM-L1-9','Is een beheerder voor de brandmeldinstallatie aangewezen (NEN 2654)?','Ja','Beide locaties hebben een brandmeldinstallatie met ontruimingsalarm en geinstrueerde bedieners. Het certificaat hangt bij het paneel op 179. Bij de panelen staan de bedienstappen, het nummer bij vals alarm en de verzamelplaats.
Foto 7, 18',NULL,1052),
    ('L1','NUM-L1-10','Is een AED aanwezig, bereikbaar en bij medewerkers bekend?','Ja','Bij beide locaties hangt in de omgeving een AED, waaronder een bij het dorpshuis, en de plek staat bij het brandmeldpaneel vermeld. Wettelijk verplicht is een AED niet.',NULL,1053),
    ('L1','NUM-L1-11','Voldoet de opslag van gasflessen aan PGS 15 (apart hok, ventilatie, scheiding)?','NVT','Er zijn geen gasflessen aanwezig.',NULL,1054),
    ('L1','NUM-L1-12','Is per groep beoordeeld hoeveel hulp clienten bij een ontruiming nodig hebben en is de taakverdeling daarop afgestemd?','Nee','Per groep is niet beoordeeld hoeveel hulp clienten bij een ontruiming nodig hebben. Dat is wat de oefening moet opleveren.','Middel',1055),
    ('L1','NUM-L1-13','Kan tijdens de logeernachten met de aanwezige bezetting veilig en tijdig worden ontruimd en is dat in de praktijk getoetst?','Nee','De nachtlijst van 20 juni 2026 telt acht logeergasten en een medewerker in slaapdienst. Rookmelders met doormelding regelen de detectie en er is een achtervang op afroep. Nog niet beoefend is hoeveel tijd het kost om de gasten in de nacht naar buiten te krijgen, hoeveel hulp elk van hen daarbij nodig heeft en hoe de bovenwoning daarin meegaat.
Foto 3, 6, 17','Middel',1056),
    ('L2','NUM-L2-1','Hebben chauffeurs van vrachtwagens een geldig rijbewijs C/CE en Code 95?','NVT','Er wordt niet met vrachtwagens gereden.',NULL,1057),
    ('L2','NUM-L2-2','Krijgen medewerkers instructie over veilig rijgedrag en rijmoeheid?','Ja','Het dagelijkse halen en brengen doet een taxibedrijf, dat zijn eigen chauffeursinstructie hanteert. De eigen bus en de ritten met eigen auto naar ambulante clienten worden door vaste, ervaren medewerkers gereden. Een korte eigen rijinstructie staat als verbetersuggestie bij de adviezen.',NULL,1058),
    ('L2','NUM-L2-3','Wordt vervoer van gevaarlijke stoffen conform ADR uitgevoerd (vrijstellingsgrenzen, etikettering, training)?','NVT','Er worden geen gevaarlijke stoffen vervoerd.',NULL,1059),
    ('L2','NUM-L2-4','Hebben heftruck- en hoogwerkerchauffeurs een geldig opleidingsbewijs?','NVT','Er wordt geen heftruck of hoogwerker gebruikt.',NULL,1060),
    ('L2','NUM-L2-5','Zijn op het terrein rijroutes en voetgangerszones gescheiden?','Ja','Op 179 stopt de bus in een kiss-and-ridevak met vrij zicht en een vrije uitrit. Op 9A worden de kinderen op het achterterrein afgezet, op een vast moment en onder begeleiding, op hetzelfde terrein waar wordt geparkeerd en gemanoeuvreerd. Een vaste afzetplek staat als verbetersuggestie bij de adviezen.
Foto 15, 16',NULL,1061),
    ('L2','NUM-L2-6','Zijn voertuigen in de 24/7-storingsdienst voorzien van passende banden voor alle weersomstandigheden?','NVT','Er is geen 24-uursstoringsdienst met voertuigen.',NULL,1062),
    ('L2','NUM-L2-7','Worden lange diensten en rijmoeheid in de storingsdienst gemonitord en zo nodig opgevangen door wisseling?','NVT','Er is geen storingsdienst. De belasting van de logeerdiensten is beoordeeld onder P1-3 en P1-5.',NULL,1063),
    ('L2','NUM-L2-8','Zijn de voertuigen voor clientvervoer voorzien van passende zit- en rolstoelvoorzieningen, gordels en periodiek onderhoud, en is vastgelegd wanneer een extra begeleider meerijdt?','Ja','Voor het taxivervoer ligt de voertuigzorg bij de vervoerder. De eigen bus is voorzien van gordels en rolstoelvoorzieningen. Een vaste eigen check voor vertrek en een regel wanneer een extra begeleider meerijdt staan als verbetersuggestie bij de adviezen.',NULL,1064),
    ('L3','NUM-L3-1','Worden specifieke risico''s per externe locatie vooraf bekendgemaakt aan de monteurs (V&G-instructie, locatie-eigen regels)?','Ja','Bij enkele clienten vindt kortdurende begeleiding thuis plaats, met de eigen auto en op basis van een overeenkomst per client. De medewerker kent de client en de situatie vooraf en de bezoeken lopen via een vast aanspreekpunt op de locatie.',NULL,1065),
    ('L3','NUM-L3-2','Wordt voor elk project een TBM/LMRA uitgevoerd en geregistreerd?','NVT','Er is geen projectwerk op locaties van derden waarvoor een taakgerichte risicobeoordeling vooraf aan de orde is.',NULL,1066),
    ('L3','NUM-L3-3','Is voor projectwerk waar dat vereist is een V&G-plan beschikbaar?','NVT','Er is geen bouwkundig projectwerk waarvoor een veiligheids- en gezondheidsplan geldt.',NULL,1067),
    ('L3','NUM-L3-4','Is bij risicovol werk passend toezicht geregeld (vier-ogen, supervisor)?','Ja','Overdag zijn meerdere begeleiders aanwezig, maximaal zes op 179 en negen op 9A, naast kantoormedewerkers. Onderling toezicht is daarmee geregeld. De nacht is apart beoordeeld onder L3-5 en L3-9.',NULL,1068),
    ('L3','NUM-L3-5','Is een check-in/out-procedure ingericht voor solitaire werkers?','Ja','Ongeveer drie weekenden per maand slaapt ''s nachts een medewerker bij de logeergasten, op 20 juni bij acht gasten. Er is een achtervang op afroep en alarmeren gaat via de eigen telefoon. Er gelden regels over de samenstelling van de groep, met maximaal vier rolstoelgebruikers.
Foto 17',NULL,1069),
    ('L3','NUM-L3-6','Wordt voorafgaand aan graafwerk een KLIC-melding gedaan?','NVT','Er vindt geen graafwerk plaats.',NULL,1070),
    ('L3','NUM-L3-7','Werken medewerkers in het buitenland conform Nederlands/EU-niveau van arbobescherming?','NVT','Er wordt niet in het buitenland gewerkt.',NULL,1071),
    ('L3','NUM-L3-8','Is geregeld hoe wordt omgegaan met agressie of intimidatie door derden op externe locaties (klanten, omstanders)?','NVT','Er wordt niet op externe locaties gewerkt. Agressie door clienten op de eigen locaties is beoordeeld onder P2-1 en P2-5.',NULL,1072),
    ('L3','NUM-L3-9','Is voor het alleen werken tijdens de logeernachten een specifieke risicoanalyse uitgevoerd met alarmering, opkomsttijd van een tweede persoon en clientgebonden grenzen?','Nee','Voor het alleen werken in de nacht gelden vaste afspraken: een achtervang op afroep, alarmeren via de eigen telefoon en regels over de samenstelling van de groep. Wie die achtervang is, binnen welke tijd die er kan zijn en bij welke situaties wordt gealarmeerd, staat niet op papier. De afspraak is ook niet in de praktijk getoetst en de grens waarbij het logeren met een medewerker niet doorgaat, ontbreekt.','Hoog',1073),
    ('O1','NUM-O1-1','Is een arbobeleid (incl. preventiebeleid) vastgesteld en ondertekend door de directie?','Ja','Er is een arbobeleidsplan versie 2.0 van 5 december 2024, waarin volgens het Plan van Aanpak 2026 ook psychosociale arbeidsbelasting staat. Het plan zelf wordt bij de toetsing meegelezen.',NULL,1074),
    ('O1','NUM-O1-3','Wordt het arbobeleid actief gecommuniceerd naar medewerkers (toolboxen, overleggen)?','Ja','Er zijn terugkerende teamvergaderingen waarin alle medewerkers inbreng hebben en waarin het Plan van Aanpak wordt besproken. Dat is de goede plek om arbo levend te houden.',NULL,1075),
    ('O1','NUM-O1-4','Zijn voor risicovol werk schriftelijke procedures of werkinstructies beschikbaar?','Nee','De inwerkinstructie dekt openen en sluiten, sleutelbeheer, dagstructuur, rapporteren en melden. Drie handelingen met een groot gevolg staan er niet in: alleen werken in de nacht, agressie en medicatie.','Laag',1076),
    ('O1','NUM-O1-6','Is een verzuimbeleid ingericht met verzuimgesprekken en re-integratie?','Ja','Numodozorg heeft een maatwerkcontract bij ArboNed. Het verzuim wordt per jaar gevolgd: 1,31 procent in 2024, 1,43 in 2025 en 1,46 in de eerste helft van 2026.',NULL,1077),
    ('O1','NUM-O1-7','Worden verzuimcijfers en oorzaken benut voor preventieve maatregelen?','Ja','De verzuimcijfers zijn beschikbaar en er is geen arbeidsgebonden verzuim gemeld. De cijfers zijn exclusief nuluren en stagiaires. Bij de jaarreview is dat het opmerken waard.',NULL,1078),
    ('O1','NUM-O1-9','Is de RI&E actueel (maximaal vier jaar oud) en is er een actueel plan van aanpak?','Ja','De vorige beoordeling van 6 februari 2020 dekt alleen locatie 179 en vier medewerkers. Deze beoordeling vervangt die volledig en wordt getoetst door een gecertificeerd kerndeskundige.',NULL,1079),
    ('O1','NUM-O1-10','Bij meer dan 50 medewerkers: is een OR of PVT ingericht en is er een klokkenluidersregeling?','Nee','Er is geen ondernemingsraad of personeelsvertegenwoordiging. Medezeggenschap loopt via de teamvergaderingen. Van de 52 werkenden is niet vastgesteld hoeveel er een arbeidsovereenkomst hebben, en dat bepaalt de OR-plicht.','Laag',1080),
    ('O2','NUM-O2-1','Wordt periodiek een PAGO of PMO aangeboden aan medewerkers?','Nee','PAGO en PMO zijn genoemd, naast fruit op het werk, sport- en dansavonden en een rookbeleid. Een uitnodiging of groepsrapportage is er niet, dus een aanbod aan alle medewerkers is niet aantoonbaar.','Laag',1081),
    ('O2','NUM-O2-2','Is de inhoud van het PAGO afgestemd op de aanwezige risico''s (stoffen, lawaai, fysieke belasting)?','Nee','Zonder aanbod is de inhoud ook niet op de aanwezige risico''s afgestemd. Richt het bij invoering op fysieke belasting, herstel na de logeernachten en psychosociale belasting.','Laag',1082),
    ('O2','NUM-O2-3','Wordt bij lawaaiblootstelling audiometrie aangeboden?','NVT','Er is geen lawaaiblootstelling waarvoor audiometrie aan de orde is.',NULL,1083),
    ('O2','NUM-O2-4','Worden verzuimsignalen geïnventariseerd op mogelijke beroepsziekten?','Ja','Het verzuim is laag en stabiel en er is geen arbeidsgebonden verzuim gemeld. Het signaleren en melden van beroepsziekten ligt bij de bedrijfsarts van ArboNed.',NULL,1084),
    ('O2','NUM-O2-5','Is een beleid voor vitaliteit en duurzame inzetbaarheid ingericht?','Ja','Vitaliteit loopt via de teamvergaderingen, twee functioneringsgesprekken per jaar waarin ook roosterwensen meegaan, en een aanbod van fruit, sport- en dansavonden en een rookbeleid.',NULL,1085),
    ('O2','NUM-O2-6','Is een bedrijfsarts beschikbaar?','Ja','De arbodienstverlening loopt via ArboNed op basis van een maatwerkcontract. Daarmee zijn de bedrijfsarts, de verzuimbegeleiding en de toegang tot het open spreekuur contractueel geregeld.',NULL,1086),
    ('O3','NUM-O3-1','Zijn voor zwangere medewerkers taakaanpassingen geregeld?','Ja','Er zijn geen zwangere medewerkers gemeld. Omdat het werk tillen en onvoorspelbaar gedrag omvat, is vooraf vastleggen welke taken dan vervallen een kwestie van een enkele alinea.',NULL,1087),
    ('O3','NUM-O3-2','Zijn voor oudere medewerkers, voor zover aanwezig, taakaanpassingen of roulatiemogelijkheden voorzien?','Ja','Er zijn geen signalen over overbelasting van oudere medewerkers. De teamomvang maakt onderlinge verdeling van zwaardere taken mogelijk.',NULL,1088),
    ('O3','NUM-O3-3','Zijn anderstalige medewerkers geïnstrueerd in een voor hen begrijpelijke taal?','Ja','Medewerkers met een taalbeperking zijn niet gemeld. Instructie in begrijpelijke taal is onderdeel van de instructiechecklist uit actiepunt 11.',NULL,1089),
    ('O3','NUM-O3-4','Worden ZZP''ers en tijdelijke krachten geïnformeerd over risico''s en regels?','Nee','Het inwerken gebeurt op de functie en op de groep, en richt zich ook tot assistent-begeleiders en stagiaires. Agressie, alleen werken en schoonmaakmiddelen ontbreken erin, en ontvangst wordt niet afgetekend.','Laag',1090),
    ('O3','NUM-O3-5','Werken bij uitzendingen naar het buitenland medewerkers onder NL-niveau van arbobescherming?','NVT','Er worden geen medewerkers naar het buitenland uitgezonden.',NULL,1091),
    ('O3','NUM-O3-6','Wordt voor jeugdigen (<18) passende begeleiding en taakaanpassing geregeld?','Ja','Stagiaires onder de achttien werken alleen doordeweeks tot uiterlijk half vijf, staan nooit alleen op een groep en doen geen voorbehouden handelingen. Die drie regels lopen mee in actiepunt 11.',NULL,1092),
    ('O3','NUM-O3-7','Is re-integratie na verzuim deugdelijk geregeld?','Ja','Verzuim wordt gevolgd en ArboNed begeleidt de re-integratie. Het lage verzuim geeft geen aanleiding tot een aanvullend oordeel.',NULL,1093),
    ('P1','NUM-P1-1','Wordt werkdruk structureel gemonitord (medewerkersonderzoek, gesprekken)?','Ja','Werkdruk en stress worden sinds de opening van 9A als thema benoemd en komen terug in de teamvergaderingen en in twee functioneringsgesprekken per jaar. Alle functies zijn dubbel bezet en het verzuim is met 1,31 tot 1,46 procent laag en stabiel.',NULL,1094),
    ('P1','NUM-P1-2','Is het werktempo bij piekbelasting haalbaar zonder overschrijding van werktijden of veiligheid?','Ja','Overdag zijn meerdere begeleiders aanwezig en de teams sturen onderling bij. De piek zit bij de overgang naar de BSO vanaf 14:30 uur en komt in de teamvergadering terug.',NULL,1095),
    ('P1','NUM-P1-3','Worden de werk- en rusttijden conform de Arbeidstijdenwet nageleefd, ook in de 24/7-storingsdienst (geen structurele weken >60 uur)?','Nee','De nacht is een slaapdienst en de medewerker slaapt ook werkelijk. Of de normen voor de aanwezigheidsdienst uit de CAO Gehandicaptenzorg worden gehaald, hoe vaak iemand die dienst draait en welke rust erna geldt, blijkt niet uit de aangeleverde stukken.','Middel',1096),
    ('P1','NUM-P1-4','Krijgen medewerkers ondersteuning bij stress of overbelasting (gesprek, coaching, bedrijfsarts)?','Ja','Er zijn korte lijnen, terugkerende teamvergaderingen en toegang tot de bedrijfsarts. Daarnaast is er een externe vertrouwenspersoon.',NULL,1097),
    ('P1','NUM-P1-5','Zijn werk- en rusttijden vastgelegd en geregistreerd?','Nee','Roosters en uren lopen via Shiftbase, dus het systeem is er. Of de logeernachten en de oproepkrachten daarin staan is niet gebleken. Zonder uitdraai is naleving van de rusttijden niet aantoonbaar.','Middel',1098),
    ('P2','NUM-P2-2','Krijgen medewerkers voorlichting over de meldprocedure en de vertrouwenspersoon?','Ja','De meldroute bij incidenten staat in de inwerkinstructie en verwijst naar de werkwijze op het intranet. Daarin is ook de weg naar de externe vertrouwenspersoon opgenomen.',NULL,1099),
    ('P2','NUM-P2-3','Worden meldingen vastgelegd en is er een jaarverslag vertrouwenspersoon?','Ja','Incidenten worden in Zilliz vastgelegd en per halfjaar geanalyseerd. De analyse over januari tot en met juni 2026 is daarop gebaseerd.',NULL,1100),
    ('P2','NUM-P2-4','Zijn leidinggevenden getraind in het signaleren en bespreken van ongewenst gedrag?','Ja','Er lopen twee sporen: een teamtraining prikkelverwerking door een SI-therapeut en een low arousal training. Een orthopedagoog en een gedragsdeskundige worden erbij gehaald zodra het gedrag van een client daarom vraagt.',NULL,1101),
    ('P2','NUM-P2-5','Zijn per clientgroep en per dienst afspraken vastgelegd over signalering, alarmering, assistentie en een veilige terugtrekroute bij onvoorspelbaar gedrag?','Ja','157 incidenten in een half jaar, 100 met een medewerker erbij en ongeveer 99 over fysiek gedrag, met het zwaartepunt op 9A. Overdag staan meerdere begeleiders op een groep, het agressiebeleid beschrijft signaleren, handelen, melden en opvang, en er lopen een teamtraining prikkelverwerking en een low arousal training.',NULL,1102),
    ('P2','NUM-P2-6','Worden agressie-incidenten richting medewerkers apart geanalyseerd, per melding afgesloten en vertaald naar maatregelen?','Ja','De halfjaaranalyse dekt de trend en leidt tot maatregelen. De terugkoppeling per melding loopt via de hoofdbegeleider en de teamvergadering.',NULL,1103),
    ('P3','NUM-P3-3','Worden incidenten structureel geëvalueerd?','Ja','Incidenten worden per halfjaar kwantitatief en kwalitatief geanalyseerd, met verbetermaatregelen. De analyse weegt de stijging tegen de groei en kondigt vergelijking per 100 clientdagen aan.',NULL,1104)
  ) as x(module_code, nr, vraag, antwoord, bevinding, klasse, volgorde)
  join public.modules m on m.company_id = v_company_id and m.code = x.module_code and m.archived_at is null;

  if (select count(*) from public.vragen where company_id = v_company_id and nr like 'NUM-%') <> 105 then
    raise exception 'Niet alle 105 nieuwe vragen zijn ingevoegd -- afgebroken.';
  end if;

  -- Nieuwe PvA-acties uit Numodo (alleen de acties die minstens 1 toegevoegde Nee-vraag
  -- als ref hebben overgehouden -- zie rapport). Doorlopend genummerd vanaf 61.
  insert into public.pva_items (id, company_id, nr, onderwerp, maatregel, tree, prio, termijn, status)
  values
    (gen_random_uuid(), v_company_id, '61', '[NUM-1] Overzicht van de aanwezige schoonmaak-, desinfectie- en keukenmiddelen', 'Maak per locatie een A4 met de aanwezige middelen: naam, plek en gebruik. Het gaat om gebruiksklare huishoudelijke producten, dus het etiket op de verpakking voorziet in de verdere informatie. Voer af wat niet meer wordt gebruikt. De middelen staan al afgesloten opgeborgen.', 'Organisatorisch', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '62', '[NUM-2] Handelwijze na een bijtincident en hygiëne bij verschonen en zorgtaken', 'Bijten en krabben komen voor en dat is het punt dat het meeste haast heeft. Leg op een A4 vast wat de medewerker direct doet na een bijtincident, wie er wordt gebeld en wanneer de arts eraan te pas komt. Vul dat aan met de gewone afspraken over handhygiene, handschoenen en afval bij verschonen en douchen.', 'Organisatorisch', 'Middel', 'Middellang (binnen 12 maanden)', 'Open'),
    (gen_random_uuid(), v_company_id, '63', '[NUM-3] Fysieke belasting en beeldschermwerk per functie en werkplek in beeld', 'Breng per functie de zwaarste handelingen in beeld: verschonen, ondersteunen, in- en uitstappen en wasgoed over de trap. Pas werkhoogten aan en spreek af welke handelingen met twee mensen gebeuren. Check elke kantoorwerkplek en vul de laptopwerkplek op 179 aan met toetsenbord en muis.', 'Bron', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '64', '[NUM-5] Leuning naast de trap naar de verdieping van locatie 9A', 'Breng een leuning aan naast de trap naar de verdieping van 9A. Er komt dagelijks iemand boven voor de was. Bekijk daarnaast of de wasmachine en droger beneden kunnen staan, dan is die gang naar boven niet meer nodig.', 'Bron', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '65', '[NUM-6] Ontruimingsoefening locatie 9A met beoordeling van de benodigde hulp per client', 'Oefen op een moment met BSO-bezetting. Beoordeel per groep hoeveel hulp de kinderen nodig hebben, meet de tijd en pas plan en taakverdeling daarop aan. Betrek de particuliere huurders boven het pand: spreek af hoe zij worden gealarmeerd en waar zij zich melden. Neem het leerpunt van 179 mee, namelijk dat wie het signaal niet hoort persoonlijk moet worden gealarmeerd, zoals daar met het vlammetjes-symbool gebeurt.', 'Organisatorisch', 'Middel', 'Middellang (binnen 12 maanden)', 'Open'),
    (gen_random_uuid(), v_company_id, '66', '[NUM-7] Nachtelijke ontruiming oefenen tijdens de logeerweekenden op locatie 179', 'Er is een achtervang op afroep en er gelden regels over de samenstelling van de groep, met maximaal vier rolstoelgebruikers. Wat nog niet is beoefend, is hoe een ontruiming in de nacht verloopt. Oefen dat een keer. Is een echte oefening te verstorend voor de clienten, kies dan voor een table top: het team loopt aan tafel stap voor stap door wat er gebeurt, wie wat doet en hoeveel tijd dat kost. Beoordeel per logeergast hoeveel hulp die nodig heeft en betrek de particuliere huurders boven het pand in het scenario.', 'Organisatorisch', 'Middel', 'Middellang (binnen 12 maanden)', 'Open'),
    (gen_random_uuid(), v_company_id, '67', '[NUM-8] Leesbare ontruimingsplattegronden op locatie 179', 'Op 179 hangt een uitvergrote bouwtekening met ingetekende pijlen. Laat daarvoor ontruimingsplattegronden volgens de norm maken, zoals die op 9A al hangen, en geef daarop ook de route weer die met de bovenwoning wordt gedeeld.', 'Organisatorisch', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '68', '[NUM-9] Arbo-organisatie: taakomschrijving preventiemedewerker en medezeggenschap', 'Leg de taken van de preventiemedewerker vast, zodat duidelijk is wat er van de rol wordt verwacht en waar die ophoudt. Bepaal daarnaast hoeveel personen een arbeidsovereenkomst hebben en stel vast of een ondernemingsraad of personeelsvertegenwoordiging verplicht is en of de Wet bescherming klokkenluiders geldt.', 'Organisatorisch', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '69', '[NUM-10] Periodiek gezondheidsonderzoek afgestemd op de zorgrisico''s', 'Bied via ArboNed een periodiek gezondheidsonderzoek aan, gericht op fysieke belasting, herstel na de logeernachten, psychosociale belasting en oogonderzoek. Deelname is vrijwillig en de uitkomsten komen geanonimiseerd terug. Bewaar de uitnodiging en de groepsrapportage.', 'Organisatorisch', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '70', '[NUM-11] Voorlichting en inwerken: instructiechecklist per locatie voor iedereen die meewerkt', 'Vul de inwerkinstructie aan met agressie, alleen werken en schoonmaakmiddelen, elk op een A4. Neem de regels voor stagiaires onder de achttien erin op. Laat iedereen die meewerkt tekenen voor ontvangst.', 'Organisatorisch', 'Laag', 'Wanneer redelijk (binnen 2 jaar)', 'Open'),
    (gen_random_uuid(), v_company_id, '71', '[NUM-12] Arbeidstijden en registratie van de logeerdiensten', 'Registreer alle werkenden in Shiftbase, inclusief de logeernachten en de oproepkrachten, en zorg dat er een uitdraai per medewerker uit komt. Toets de slaapdiensten aan de CAO-normen voor de aanwezigheidsdienst. Ga daarbij na of clientvervoer direct na een logeernacht verantwoord is en leg vast waar Numodozorg de grens legt.', 'Organisatorisch', 'Middel', 'Middellang (binnen 12 maanden)', 'Open'),
    (gen_random_uuid(), v_company_id, '72', '[NUM-14] Bereikbaarheid en alarmering tijdens de logeernachten op locatie 179', 'Leg schriftelijk vast wie tijdens de logeernacht oproepbaar is en binnen welke tijd die persoon ter plaatse kan zijn. Benoem daarbij de situaties waarin de medewerker alarmeert: agressie, brand, medische nood en uitval van de medewerker zelf. Leg ook vast wanneer het logeren met een medewerker niet doorgaat, bijvoorbeeld bij een groepssamenstelling die dat niet toelaat. Toets de afspraak een keer in de praktijk met een oproep buiten kantoortijd en noteer hoe lang het duurde voordat de achtervang er was. Neem de afspraak op in de overdracht, zodat iedere medewerker die de nacht draait hem kent.', 'Organisatorisch', 'Hoog', 'Kort (binnen 3 maanden)', 'Open'),
    (gen_random_uuid(), v_company_id, '73', '[NUM-15] Tillift en transfers op locatie 179: dossier en bediening per client', 'Breng het keuringsbewijs van de tillift en van de tilbanden bij elkaar in een dossier en houd de eerstvolgende keuringsdatum bij; de huidige keuring loopt tot 2027. Beoordeel de staat en de geschiktheid van de tilbanden per band en per client, en voer af wat versleten of niet passend is. Leg vast wie in het gebruik van de lift en de banden is geschoold en herhaal die instructie periodiek. Leg ten slotte per client vast of een transfer met een of met twee medewerkers wordt gedaan en neem dat op in het clientdossier, zodat het bij de overdracht bekend is.', 'Organisatorisch', 'Middel', 'Middellang (binnen 12 maanden)', 'Open');

  if (select count(*) from public.pva_items where company_id = v_company_id and nr::int >= 61) <> 13 then
    raise exception 'Niet alle 13 nieuwe pva-acties zijn ingevoegd -- afgebroken.';
  end if;

  -- Vragen koppelen aan hun nieuwe pva-actie (tekstuele match, zelfde patroon als bestaand).
  with koppel(vraag_nr, pva_nr) as (
    values
    ('NUM-F1-1', '61'),
    ('NUM-F1-19', '62'),
    ('NUM-F2-1', '63'),
    ('NUM-F2-8', '63'),
    ('NUM-F2-9', '63'),
    ('NUM-F3-14', '64'),
    ('NUM-F3-18', '64'),
    ('NUM-L1-12', '65'),
    ('NUM-L1-6', '66'),
    ('NUM-L1-13', '66'),
    ('NUM-L1-5', '67'),
    ('NUM-O1-10', '68'),
    ('NUM-O2-1', '69'),
    ('NUM-O2-2', '69'),
    ('NUM-O1-4', '70'),
    ('NUM-O3-4', '70'),
    ('NUM-P1-3', '71'),
    ('NUM-P1-5', '71'),
    ('NUM-L3-9', '72'),
    ('NUM-F2-10', '73')
  )
  update public.vragen v set pva = k.pva_nr
  from koppel k
  where v.company_id = v_company_id and v.nr = k.vraag_nr;

  if (select count(*) from public.vragen where company_id = v_company_id and nr like 'NUM-%' and pva is not null) <> 20 then
    raise exception 'Niet alle 20 nieuwe vraag-pva-koppelingen zijn gezet -- afgebroken.';
  end if;

  select count(*) into v_vragen_na from public.vragen where company_id = v_company_id;
  select count(*) into v_pva_na from public.pva_items where company_id = v_company_id;
  select md5(string_agg(v.nr||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,''), '~' order by v.nr))
    into v_hash_bestaand_na
    from public.vragen v where v.company_id = v_company_id and v.nr not like 'NUM-%';

  if v_hash_bestaand_na is distinct from v_hash_bestaand_voor then
    raise exception 'De hash van de 63 BESTAANDE vragen is veranderd -- afgebroken, niets mag hier wijzigen.';
  end if;

  if v_vragen_na <> 168 then
    raise exception 'Onverwacht totaal aantal vragen na afloop: % (verwacht 168).', v_vragen_na;
  end if;
  if v_pva_na <> 73 then
    raise exception 'Onverwacht totaal aantal pva-items na afloop: % (verwacht 73).', v_pva_na;
  end if;

  raise notice 'SeysCentra Numodo-aanvulling: % vragen -> %, % pva-items -> %, bestaande-vragen-hash ongewijzigd.', v_vragen_voor, v_vragen_na, v_pva_voor, v_pva_na;
end $$;

commit;
