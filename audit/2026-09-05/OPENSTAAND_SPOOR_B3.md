# Openstaand voor Kees — Spoor B, B3 (IF-getal als VCA-berekening)

## 1. Nieuwe gevolg-categorie 'ongeval_met_verzuim' — historische incidenten tellen niet automatisch mee

De bestaande catalogus (`incident_gevolg_soort`, migratie 0025) had geen exacte "ongeval met
verzuim"-categorie — alleen `ongeval_zonder_verzuim` en het bredere `letsel`. Ik heb GEEN van
beide bestaande codes hergebruikt als proxy (te dubbelzinnig: niet elk `letsel` betekent verzuim,
en `letsel` zonder `ongeval_zonder_verzuim` is geen betrouwbaar signaal). In plaats daarvan heb ik
een nieuwe, exacte catalogusregel toegevoegd: `ongeval_met_verzuim` (migratie 0073).

**Gevolg:** het IF-getal telt alleen incidenten die VANAF NU met deze nieuwe optie zijn gemeld.
Bestaande, al gemelde incidenten die feitelijk verzuim betroffen maar destijds alleen als `letsel`
zijn aangevinkt, tellen niet automatisch mee — die zijn niet met terugwerkende kracht herlabeld
(zou een aanname over intent vereisen die ik niet mag maken). Als je met terugwerkende kracht wilt
corrigeren: dat kan via de incidentenpagina (gevolgen aanvinken) of, voor bulk, een losse migratie
op jouw aanwijzing.

## 2. Elk gemeld incident telt mee, ongeacht status/afhandeling

De telling gebruikt `incident.datum` (het jaar van het ongeval zelf, niet de meldingsdatum of
afhandeldatum) en telt ELK incident met `ongeval_met_verzuim` in `gevolgen`, ook als het nog
`status='open'` is (nog niet volledig onderzocht/afgehandeld). Overwogen alternatief: alleen
afgehandelde incidenten meetellen — dat zou het IF-getal actueel houden maar systematisch te laag
laten uitvallen zolang onderzoek loopt. Gekozen voor "meteen meetellen" als de veiligere kant voor
een veiligheidskengetal (nooit een ongeval verstoppen achter openstaand papierwerk).

## 3. Oude handmatige velden blijven ongebruikt in de database staan

`bedrijf_dashboard_instelling.if_dit_jaar`/`if_vorig_jaar` en de bijbehorende
`dashboard_instelling_zetten`-parameters zijn NIET verwijderd (additief-only, geen drops). De UI
leest/schrijft ze niet meer. Kan later opgeruimd worden in een aparte migratie als je dat wilt —
geen haast, ze doen nu niets meer.
