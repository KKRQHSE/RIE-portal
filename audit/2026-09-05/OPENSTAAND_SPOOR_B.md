# Openstaand voor Kees — Spoor B, B1 (concept-medewerkers)

Businesskeuzes waarbij ik een werkend, redelijk minimaal standaardgedrag heb gebouwd (zodat B1
end-to-end te testen is), maar die zelf niet definitief zijn — expliciet niet stilzwijgend ingevuld.

---

## 1. Exacte veldenlijst van de koppel-zoek-RPC (`persoon_zoeken_voor_koppeling`)

**Wat er nu gebeurt:** de RPC geeft per treffer terug: `id`, `naam`, `functiegroep_naam`,
`in_dienst`. Geen registratiehistorie, geen toolbox-/inspectie-/incidentdata, geen
gezondheidsgerelateerde velden — dat is hard gehouden.

**Openstaand:** of dit precies de juiste, minimale set is voor een AVG-toets (need-to-know voor
"is dit de juiste persoon om aan te koppelen"). Bijvoorbeeld: is `functiegroep_naam` zelf al te veel
(functie kan indirect iets over iemands rol/blootstelling zeggen), of juist te weinig om
naamgenoten goed te onderscheiden (afdeling? personeelsnummer?). `in_dienst` toont alleen een
boolean, geen datum — bewust, maar niet getoetst.

**Aanbevolen richting:** AVG-toets door Kees (of extern) op deze exacte veldenlijst voordat dit als
definitief geldt. Uitbreiden is triviaal (functie in `db/schema.sql` migratie 0071), verkleinen ook.

---

## 2. Strengere duplicaat-detectie op e-mail dan op naam?

**Wat er nu gebeurt:** `concept_medewerker_aanmaken` signaleert een mogelijk duplicaat bij een
naam-match (`lower(btrim(naam)) = lower(...)`, exact na trimmen) ÓF een e-mail-match
(`lower(email) = lower(...)`), met gelijke prioriteit — een e-mail-match komt wel eerst in de
gesorteerde kandidatenlijst (`order by email_match desc`), maar blokkeert verder niet strenger dan
een naam-match. Beide zijn niet-blokkerend: de teamleider kan in beide gevallen "toch nieuw"
kiezen.

**Openstaand:** of een e-mail-match (veel sterker signaal dan een naamgenoot) strenger zou moeten
zijn dan alleen "hogere sortering" — bijvoorbeeld een aparte waarschuwingstekst, of zelfs een
verplicht KAM-akkoord vooraf in plaats van achteraf bij goedkeuren. Nu behandelt de KAM dit sowieso
alsnog bewust bij goedkeuren (het verzoek toont `mogelijk_duplicaat`), dus er is geen gat — wel een
UX/strengheids-vraag.

**Aanbevolen richting:** businesskeuze door Kees; makkelijk aan te passen in
`concept_medewerker_aanmaken` (migratie 0071) zodra bepaald.

---

## 3. `pva_items.bron_type = 'concept_medewerker'` — geen nieuwe CHECK-constraint

**Wat er nu gebeurt:** `bron_type` bleef een vrij `text`-veld (was het al, geen CHECK-constraint
aanwezig vóór migratie 0071). De nieuwe waarde `'concept_medewerker'` wordt uitsluitend door de
nieuwe SECURITY DEFINER-RPC's gezet, niet door een DB-constraint afgedwongen.

**Waarom bewust zo gelaten:** een CHECK-constraint met een vaste waardenlijst zou ook alle
bestaande bron_type-waarden (`inspectie_bevinding`, `audit_bevinding`, `los`, `null`) moeten
opsommen — een verandering die alle bestaande insert-plekken raakt, meer risico dan winst voor dit
pakket. Niet blokkerend voor B1, wel een architecturale nette-afronding-vraag voor later.

**Aanbevolen richting:** desgewenst een aparte, kleine migratie die alle huidige bron_type-waarden
inventariseert en er één CHECK-constraint met de volledige lijst op zet — buiten scope van B1.
