-- Migratie 0039: seed centrale VCA**-catalogus + 5 geplande DW-audits 2026
-- ----------------------------------------------------------------------------
-- De VCA-paragrafencatalogus (H1-H11) 1-op-1 uit het bronformulier. Idempotent
-- (on conflict do update). Daarna de 5 geplande interne audits van Dutch Waste
-- voor 2026, guarded tegen dubbel seeden.

begin;

insert into public.centrale_audit_vca_paragraaf (code, hoofdstuk, hoofdstuk_titel, titel, omschrijving, volgorde) values
  ('1.1','H1','VGM-beleid en organisatie','KAM-beleid', $t$De directie heeft het QHSE-beleid vastgelegd in een beleidsverklaring. Het beleid wordt minimaal jaarlijks gecommuniceerd met alle medewerkers en minimaal 3-jaarlijks herzien.$t$, 1),
  ('1.2','H1','VGM-beleid en organisatie','VGM-coördinator', $t$De VGM-coördinator heeft VOL VCA en wordt ondersteund door een extern veiligheidskundige met een HVK-diploma.$t$, 2),
  ('1.3','H1','VGM-beleid en organisatie','VGM-structuur', $t$Per relevante functie is vastgelegd wat er op VGM-gebied verwacht wordt (opstellen/uitvoeren/verantwoordelijk/controlerend/adviserend).$t$, 3),
  ('1.4','H1','VGM-beleid en organisatie','Beoordeling leidinggevenden', $t$Alle leidinggevenden worden jaarlijks beoordeeld tijdens functioneringsgesprekken; VGM-gedrag is een vast onderdeel.$t$, 4),
  ('1.5','H1','VGM-beleid en organisatie','Interne audits', $t$Er worden jaarlijks interne audits uitgevoerd door een aangestelde auditor, zo dat in 3 jaar alle VCA**-elementen worden geverifieerd.$t$, 5),
  ('1.6','H1','VGM-beleid en organisatie','Directiebeoordeling', $t$Jaarlijks vindt een directiebeoordeling plaats conform H1.6 VCA; constateringen komen in het QHSE-actieplan, waarvan de voortgang wordt gemonitord.$t$, 6),
  ('2.1','H2','VGM-risicobeheer','RI&E', $t$Er is een RI&E met functie-RIE's; risico's zijn geïdentificeerd en geëvalueerd en worden beheerst. Minimaal eens per 3 jaar en na elk ongeval geëvalueerd.$t$, 7),
  ('2.2','H2','VGM-risicobeheer','TRA', $t$Voor nieuwe/risicovolle situaties wordt een TRA opgesteld op advies van de veiligheidskundige; voor routine wordt verwezen naar functie-RIE en standaard-TRA.$t$, 8),
  ('2.3','H2','VGM-risicobeheer','LMRA', $t$Er is een LMRA-procedure; medewerkers voeren voorafgaand aan de werkzaamheden een LMRA uit.$t$, 9),
  ('3.1','H3','Opleiding, voorlichting en instructie','Vakopleiding en ervaring', $t$Er is een opleidingsmatrix; de Operations Manager bewaakt tijdige herhaling en actualiseert opleidingseisen. Ervarings- en opleidingseisen liggen vast in functie-omschrijvingen, TRA's en functie-RIE.$t$, 10),
  ('3.2','H3','Opleiding, voorlichting en instructie','VCA-Basis opleiding', $t$Alle operationele medewerkers (>3 maanden in dienst) beschikken over het diploma Basisveiligheid VCA.$t$, 11),
  ('3.3','H3','Opleiding, voorlichting en instructie','VCA-VOL opleiding', $t$Alle operationeel leidinggevenden (>3 maanden in dienst) beschikken over het diploma VCA voor operationeel leidinggevenden (VOL).$t$, 12),
  ('3.4','H3','Opleiding, voorlichting en instructie','Specifieke opleidings- en ervaringseisen', $t$Medewerkers beschikken over de vereiste kennis/kunde volgens het overzicht specifieke opleidings- en ervaringseisen.$t$, 13),
  ('3.5','H3','Opleiding, voorlichting en instructie','VGM-voorlichting en -instructie', $t$Nieuwe medewerkers en inhuurkrachten krijgen vóór indiensttreding een bedrijfseigen KAM-voorlichting; risico's en beheersmaatregelen worden op diverse momenten gecommuniceerd.$t$, 14),
  ('3.6','H3','Opleiding, voorlichting en instructie','Instructies eigen medewerkers/inleners/onderaannemers', $t$Vóór aanvang van het werk worden medewerkers geïnformeerd over de geldende veiligheidsregels en het VGM-plan; instructies worden geregistreerd via presentielijst.$t$, 15),
  ('3.7','H3','Opleiding, voorlichting en instructie','Communicatie', $t$Alle medewerkers beheersen Nederlands (of Engels met een tweetalige aanwezige); indien nodig wordt een communicatieplan opgesteld.$t$, 16),
  ('4.1','H4','VGM-bewustzijn','VGM-overleg', $t$Minimaal 10 toolboxmeetings per jaar over een vastgesteld onderwerp; deelnemers worden geregistreerd.$t$, 17),
  ('4.2','H4','VGM-bewustzijn','Programma VGM-bewustzijn en -gedrag', $t$Er is een programma om VGM-bewustzijn/gedrag te stimuleren via OOG-rondes (Observatie Onveilig Gedrag), minimaal per kwartaal door de VK; resultaten worden besproken.$t$, 18),
  ('5.1','H5','VGM-projectplan','VGM-projectplannen', $t$Waar van toepassing worden VGM-plannen gehanteerd conform de procedure en het sjabloon.$t$, 19),
  ('5.2','H5','VGM-projectplan','Aanbieden aan opdrachtgever', $t$Het VGM-plan wordt vóór aanvang aangeboden aan en waar mogelijk besproken met de opdrachtgever.$t$, 20),
  ('6.1','H6','Voorbereiding op noodsituaties','Procedure noodsituaties', $t$Voor noodsituaties gelden de noodinstructies van de opdrachtgever; anders is er een goedgekeurde brandblusser en EHBO-set in de auto en beschikken medewerkers over BHV.$t$, 21),
  ('6.2','H6','Voorbereiding op noodsituaties','BHV-opleidingen', $t$Alle medewerkers hebben een BHV-opleiding; herhalingen worden ingepland.$t$, 22),
  ('7.1','H7','VGM-inspecties','Werkplekinspecties', $t$Werkplekinspecties worden maandelijks per werkplek uitgevoerd door de operationeel leidinggevende met het inspectieformulier.$t$, 23),
  ('7.2','H7','VGM-inspecties','Trendanalyse', $t$Minimaal jaarlijks wordt een trendanalyse van de inspectiebevindingen gemaakt als input voor de directiebeoordeling.$t$, 24),
  ('8.1','H8','Bedrijfsgezondheidszorg','Medische geschiktheid', $t$Medewerkers worden alleen ingezet voor taken waarvoor zij medisch geschikt zijn; per functie zijn eisen en onderzoeksfrequentie vastgelegd.$t$, 25),
  ('8.2','H8','Bedrijfsgezondheidszorg','Medisch onderzoek', $t$Periodiek wordt een PMO aangeboden; het PMO-advies uit de RI&E wordt opgevolgd.$t$, 26),
  ('8.3','H8','Bedrijfsgezondheidszorg','Spreekuur', $t$Medewerkers hebben recht op arbospreekuur en zijn hierover schriftelijk geïnformeerd.$t$, 27),
  ('8.4','H8','Bedrijfsgezondheidszorg','Beleid aangepast werk', $t$Er is beleid om medewerkers die na een ongeval niet in hun oude functie kunnen terugkeren aangepast werk aan te bieden.$t$, 28),
  ('9.1','H9','Aanschaf en keuring arbeidsmiddelen en PBM','Aanschaf arbeidsmiddelen en PBM', $t$Aanschaf, beheer en onderhoud van materieel, gereedschap en PBM gebeurt vanuit het bedrijf; gehuurde middelen zijn aantoonbaar goedgekeurd.$t$, 29),
  ('9.2','H9','Aanschaf en keuring arbeidsmiddelen en PBM','Keuring arbeidsmiddelen en PBM', $t$Periodieke keuring wordt aangestuurd via het inspectie- en onderhoudsprogramma.$t$, 30),
  ('10.1','H10','Inkoop van diensten','Werkzaamheden door onderaannemers', $t$Er wordt niet met onderaannemers gewerkt, alleen met inleners; de regie blijft bij het bedrijf.$t$, 31),
  ('10.2','H10','Inkoop van diensten','Beoordeling onderaannemers', $t$Zie 10.1.$t$, 32),
  ('10.3','H10','Inkoop van diensten','Uitzendkrachten', $t$Uitzendkrachten voor risicovol werk worden bij voorkeur betrokken via VCU-gecertificeerde partijen en beschikken over VCA; aanvullende opleidingseisen gelden waar nodig.$t$, 33),
  ('11.1','H11','Melding, registratie en onderzoek van incidenten','Melden en registreren van ongevallen', $t$Alle ongevallen met en zonder verzuim worden gemeld en geregistreerd volgens de procedure; directie/VK en zo nodig bevoegd gezag worden geïnformeerd.$t$, 34),
  ('11.2','H11','Melding, registratie en onderzoek van incidenten','Onderzoek van ongevallen', $t$Op basis van het meldformulier wordt onderzoek gedaan naar de oorzaken; corrigerende maatregelen minimaliseren de kans op herhaling.$t$, 35)
on conflict (code) do update set
  hoofdstuk = excluded.hoofdstuk, hoofdstuk_titel = excluded.hoofdstuk_titel,
  titel = excluded.titel, omschrijving = excluded.omschrijving, volgorde = excluded.volgorde;

-- 5 geplande interne audits voor Dutch Waste, 2026 (guarded tegen dubbel seeden).
do $$
declare
  v_c   uuid := '281b95cc-c807-431d-b760-839dfc9066ed';
  v_vca uuid;
begin
  if exists (select 1 from public.companies where id = v_c)
     and not exists (select 1 from public.audit where company_id = v_c and jaar = 2026) then

    insert into public.audit (company_id, sjabloon, titel, jaar, status) values
      (v_c, 'iso', 'Uitvoering tankauto''s',                 2026, 'gepland'),
      (v_c, 'iso', 'Personeelszaken/opleiding en training',  2026, 'gepland'),
      (v_c, 'iso', 'Onderhoud incl. inkoop',                 2026, 'gepland'),
      (v_c, 'iso', 'Uitvoering binnenvaart',                 2026, 'gepland');

    insert into public.audit (company_id, sjabloon, titel, jaar, status)
      values (v_c, 'vca', 'VCA volledige scope', 2026, 'gepland')
      returning id into v_vca;

    insert into public.audit_vca_bevinding
      (audit_id, company_id, code, hoofdstuk, hoofdstuk_titel, titel, omschrijving, volgorde)
    select v_vca, v_c, code, hoofdstuk, hoofdstuk_titel, titel, omschrijving, volgorde
      from public.centrale_audit_vca_paragraaf order by volgorde;
  end if;
end $$;

commit;
