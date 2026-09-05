# Openstaand voor Kees — Spoor B, B2 (notificaties)

Businesskeuzes waarbij ik een werkend, redelijk standaardgedrag heb gebouwd (zodat B2
end-to-end te testen is), maar die zelf niet definitief zijn.

---

## 1. Interpretatie van "toolbox-herinneringen"

De brief noemt dit als één van de zes soorten zonder een precieze definitie. Er bestaat al een
apart, ouder mechanisme (`herinner_kandidaten`/`herinnering_log`/de heartbeat-route) dat
individuele actiehouders (personen, geen portaalgebruikers) per e-mail herinnert aan openstaande
acties — dat is dus geen goede match voor een in-app melding aan KAM/teamleider.

**Wat ik gebouwd heb:** een bedrijfsbrede "loop je achter op je toolbox-doelstelling"-check:
`bedrijf_toolbox_instelling.sessie_doel_per_jaar` pro-rata over het jaar vergeleken met het
werkelijke aantal `toolbox_sessie`-rijen dit kalenderjaar, alleen als de toolbox-module actief
staat voor dat bedrijf (anders zou elk nieuw bedrijf zonder sessies altijd "achter" lijken —
gevonden en gefixt tijdens het testen, zie migratie 0072).

**Openstaand:** of dit de juiste invulling is, en of de pro-rata-formule (lineair over 365 dagen)
goed genoeg is of preciezer moet (bv. rekening houden met een pas laat in het jaar geactiveerde
module).

---

## 2. Recipiënt-scope van `audit_gepland` en `rie_toetsing_verloopt`: geen teamleider

Beide zijn gescoped op 'beheer' (KAM/admin), consistent met de bestaande toegang (audits zijn al
volledig dicht voor teamleider, Pakket 1). Voor RI&E-toetsing was dat een eigen keuze: teamleider
kan de RI&E-pagina wel lezen, maar krijgt geen melding over een verlopende toetsing — behandeld als
een managementonderwerp, net als audits.

**Openstaand:** of dat klopt, of teamleider hier juist wél bij gebaat is (hij werkt immers al met
RI&E-gerelateerde onderdelen).

---

## 3. Drempels: 7 dagen (audits), 30 dagen (RI&E-toetsing)

Willekeurig gekozen, redelijke standaardwaarden, niet uit de brief. Makkelijk aan te passen in
`notificaties_genereren` (migratie 0072).

---

## 4. `toolbox_herinnering`: direct en periodiek vallen samen

Dit type heeft geen natuurlijk sub-item (het is een bedrijfsbrede toestand, geen los voorval per
sessie), dus 'direct' en 'periodiek' leveren op dit moment identiek gedrag op: één samengevatte
melding per dag. Alleen 'uit' maakt daadwerkelijk verschil. Bewust zo gelaten (geen zinvolle manier
gevonden om dit type op te splitsen in losse voorvallen) — zie migratie 0072, sectie 7.

---

## 5. E-mail (nog niet gebouwd)

Zoals gevraagd: alleen de in-app laag is gebouwd. De voorkeurstabel (`notificatie_voorkeur`) is al
generiek genoeg om er een e-mailkanaal naast te zetten zonder migratie-breuk, maar er wordt nu nog
niets gemaild.
