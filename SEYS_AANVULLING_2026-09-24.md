# SeysCentra aanvullen met de volledige Numodo-FLOP-vragenlijst — lopend rapport

> Bedrijf: SeysCentra B.V. (`bd16538b-01e9-41d2-84ad-fe5690917cba`). Zelfstandige sessie,
> gestart 2026-09-24 (vervolg op de FLOP-herstructurering van eerder vandaag, commit `d71a523`).

## Belangrijke afwijkingen t.o.v. de opdracht, meteen gemeld (nog niets gewijzigd op dit punt)

**1. De bron was geen JSON met 46 vragen, maar een .docx met 116 vragen.**
`import/input/` bevat geen JSON voor Numodo — wel `20260730 RIE Numodozorg.docx`. Dat document
zelf zegt expliciet: *"Beoordeelde modules | 12 modules, 116 vragen"*. Ik heb dit document
machinaal geëxtraheerd (`import/extract_docx.py` → `import/docx_dump.json`) en per FLOP-module
de vraagtabellen (kolommen `Nr. / RI&E-vraag / Antw. / Bevinding-toelichting / Basisrisicofactor /
Klasse`) eruit gehaald: **116 vragen, exact verdeeld als F1:21, F2:10, F3:18, L1:13, L2:8, L3:9,
O1:10, O2:6, O3:7, P1:5, P2:6, P3:3.** Weggeschreven naar `import/numodo_vragen.json` (vragen),
`import/numodo_pva.json` (de 15 genummerde Plan-van-Aanpak-acties) en `import/numodo_adviezen.json`
(4 losse "Adviezen" zonder eigen PvA-nummer — zie verderop, deze zijn NIET meegenomen).
Ik ga door met de 116 vragen die er daadwerkelijk zijn — "46" bestond niet, "116" wel, en dat is
zelf ook een volledige, nette FLOP-12-module-lijst met Ja/Nee/NVT, dus inhoudelijk precies wat de
opdracht vraagt.

**2. "De bestaande SeysCentra-aandachtspunten (de 12 Nee's)" klopt niet met de database.**
De huidige SeysCentra-RI&E heeft **61 vragen met antwoord "Nee" en 2 met "Ja"** (0 NVT), niet 12.
Dit is dezelfde 63-vragenset uit de FLOP-herstructurering van vanochtend (ongewijzigd sindsdien —
inhouds-hash `44dba2a0e1a43fb3eb2fe5b892be7ca7`, identiek aan het einde van die sessie). Ik weet
niet waar het getal 12 vandaan komt (misschien het oude aantal in module O1 vóór de
herstructurering, dat had 12 vragen maar ook niet allemaal Nee). **Ik behandel daarom ALLE 63
bestaande SeysCentra-vragen (61 Nee + 2 Ja) als de te beschermen, leidende basis** — niet alleen
een subset van 12 — dat is de veiligste lezing van de bedoeling ("de bestaande aandachtspunten
mogen niet gewijzigd worden") en telt dus zwaarder dan het letterlijke getal 12 in de opdracht.

## Fase 0 — Baseline + veiligheidskopie (voltooid)

**Backup weggeschreven** naar `audit/2026-09-24_seys-aanvulling/`:
`backup_vragen_full.json`, `backup_pva_items_full.json`, `backup_modules_full.json`
(alle kolommen, alle rijen, van vóór deze sessie).

**Baseline-telling (vóór aanvulling):**

| Metriek | Aantal |
|---|---|
| Vragen totaal | 63 |
| — waarvan Nee | 61 |
| — waarvan Ja | 2 |
| — waarvan NVT | 0 |
| PvA-acties totaal | 60 (hoogste `nr` = 60, nieuwe acties beginnen dus bij 61) |
| PvA-acties met locatie_id | 21 |
| Inhouds-hash | `44dba2a0e1a43fb3eb2fe5b892be7ca7` (ongewijzigd t.o.v. eind vorige sessie) |

Verificatie aan het eind: deze 63 vragen (inclusief hun `vraag`/`antwoord`/`bevinding`/`pva`/
`locatie_id`) moeten woord voor woord ongewijzigd terugkomen — geen enkele UPDATE op een bestaande
rij, alleen nieuwe INSERT's.

## Fase 1 — Overlapanalyse (voltooid)

Alle 116 Numodo-vragen per FLOP-module (dezelfde indeling als Numodo zelf al gebruikte)
vergeleken met de bestaande SeysCentra-vragen in diezelfde module. Regel: bij een echte inhoudelijke
duplicaat van een bestaand SeysCentra-item blijft SeysCentra leidend en wordt de Numodo-vraag
overgeslagen; bij twijfel wordt de Numodo-vraag toegevoegd én genoteerd.

**11 vragen overgeslagen (echte duplicaten):**

| Numodo-nr | Reden |
|---|---|
| F1-9 | exact dezelfde check als SeysCentra O1-5 (PBM beschikbaar en consistent gebruikt) |
| F2-2 | exact dezelfde check als SeysCentra F1-3/F4-3 (ergonomie-instructie aan medewerkers) |
| F3-2 | exact dezelfde check als SeysCentra F3-1 (geluidsbelasting werkplek beoordeeld) |
| F3-4 | exact dezelfde check als SeysCentra F1-8/F3-2 (binnenklimaat/ventilatie beoordeeld) |
| F3-17 | exact dezelfde check als SeysCentra F4-6 (geluidsbelasting/hinder in groepsruimtes) |
| O1-2 | exact dezelfde check als SeysCentra O1-1 (preventiemedewerker/arbo-organisatie belegd) |
| O1-5 | exact dezelfde check als SeysCentra O1-7 oud (meldpunt (bijna-)incidenten) |
| O1-8 | exact dezelfde check als SeysCentra F1-13/F3-5 (vertrouwenspersoon aangesteld/bekend) |
| P2-1 | exact dezelfde check als SeysCentra O1-11 (agressiebeleid/protocol aanwezig) |
| P3-1 | exact dezelfde check als SeysCentra F1-10 (protocol/opvang na ingrijpende gebeurtenis) |
| P3-2 | nagenoeg dezelfde check als SeysCentra F1-10 / Numodo P3-1 (nazorgprocedure) |

**105 vragen toegevoegd**, waarvan 20 als twijfelgeval genoteerd (thematisch dicht bij een
bestaand SeysCentra-item, maar met een andere/specifiekere invalshoek, dus toegevoegd i.p.v.
overgeslagen):

| Numodo-nr | Twijfelgeval |
|---|---|
| F1-19 | mogelijk overlap met F1-6/F4-5 (hygiëne/verschonen); dit is specifiek de procedure na een bijt-/prikincident die SeysCentra niet heeft |
| F2-1 | thematisch dicht bij F1-1 (fysieke belasting); algemene "in kaart brengen per functie"-check, geen exacte duplicaat |
| F2-8 | thematisch dicht bij F2-1/F3-3 (thuiswerkplek-ergonomie); dit gaat over kantoor-beeldschermplekken specifiek |
| F3-14 | thematisch dicht bij het L1-blok (trap/leuning/valgevaar bij andere vestigingen); andere locatie/context, in Numodo zelf onder F3 geclassificeerd, zo overgenomen |
| **L1-6** | **belangrijk: spreekt SeysCentra O1-6 ("BHV-organisatie op orde", antwoord Ja) inhoudelijk tegen met een Nee over hetzelfde type check (ontruimingsoefeningen evalueren) — expliciet nalopen** |
| L1-7 | gedeeltelijke overlap met O1-6 (BHV-bezetting is een subaspect van "BHV-organisatie op orde") |
| L1-8 | gedeeltelijke overlap met O1-6 (BHV-certificaten is een subaspect van "BHV-organisatie op orde") |
| L2-2 | thematisch dicht bij F2-3/O1-10 (verkeersveiligheid); andere invalshoek (rijmoeheid-instructie) |
| L3-1 | thematisch dicht bij F1-9 (vooraf inventariseren bij huisbezoek); andere invalshoek |
| O1-3 | lichte overlap met O1-1 ("bekend bij medewerkers"); andere invalshoek (communicatiekanaal) |
| O1-4 | thematisch dicht bij O1-4 oud (instructie nieuwe medewerkers); gaat over schriftelijke procedures voor risicovol werk specifiek |
| O3-1 | valt onder SeysCentra's bredere, gecombineerde O1-8 ("beleid bijzondere groepen"), maar dan als los, granulair subitem (zwangeren) |
| O3-2 | idem, subitem oudere medewerkers |
| O3-4 | raakt O1-8 licht (ZZP'ers als aparte groep, niet expliciet genoemd) |
| O3-6 | idem, subitem jeugdigen <18 |
| P1-1 | lichte overlap met werkdruk-items (F1-11/F4-8); andere invalshoek (monitoring-proces) |
| P1-2 | lichte overlap met F3-4 (piekbelasting); andere invalshoek (haalbaarheid werktempo) |
| P2-2 | raakt de vertrouwenspersoon-thematiek (elders geskipt); specifiek de meldprocedure bij agressie |
| P2-4 | thematisch dicht bij F1-12 (omgaan met agressieve ouders); andere doelgroep (leidinggevenden) |
| P3-3 | lichte overlap met O1-2 (PSA-beleid signalering/opvolging); andere invalshoek (evaluatie) |

**Vraag L1-6 verdient jouw aandacht het meest**: SeysCentra's eigen O1-6 zegt "Ja, de
BHV-organisatie is op orde, jaarlijkse ontruimingsoefeningen worden uitgevoerd en geëvalueerd".
De toegevoegde Numodo-vraag L1-6 stelt letterlijk dezelfde vraag (periodieke
ontruimingsoefeningen evalueren) en heeft in Numodo's eigen dataset het antwoord "Nee". Ik heb
'm toegevoegd (regel: bij twijfel toevoegen, nooit een bestaand aandachtspunt overschrijven),
maar het resultaat is dat het L1-blok nu zowel "Ja, dit is geregeld" (O1-6) als "Nee, dit is niet
geëvalueerd" (NUM-L1-6) bevat over hetzelfde onderwerp. Voor een schone demo kun je overwegen om
`NUM-L1-6` te archiveren als je 'm te verwarrend vindt — ik heb 'm niet zelf verwijderd.

## Fase 2 — Migratie gebouwd, dry-run getest, toegepast (voltooid)

**Bron machinaal geëxtraheerd:** `import/extract_docx.py` op
`import/input/20260730 RIE Numodozorg.docx` → `import/docx_dump.json` → 116 vragen (12 modules)
+ 15 Plan-van-Aanpak-acties, weggeschreven naar `import/numodo_vragen.json` /
`numodo_pva.json` (bewust NIET gecommit — valt onder de bestaande `/import/*`-gitignore-regel
voor klantcontent; alleen de resulterende migratie, met de letterlijke tekst erin, wordt
gecommit).

**Migratie:** `supabase/migrations/0090_seyscentra_numodo_aanvulling.sql`. Eén transactie:
1. Assert vooraf: 63 vragen, 60 pva-items (anders direct afgebroken).
2. Hash berekend over de 63 bestaande vragen (op hun eigen `nr`, dus `NUM-%` nooit meegeteld).
3. 105 nieuwe vragen ingevoegd, elk met `nr = 'NUM-<Numodo-nr>'` (voorkomt elke botsing met
   bestaande nr's en maakt herkomst blijvend zichtbaar in de UI). `locatie_id`/`functiegroep_id`
   blijven NULL voor alle nieuwe vragen — zie toelichting hieronder.
4. Assert: precies 105 nieuwe vragen aanwezig.
5. 13 nieuwe pva-acties ingevoegd (doorlopend genummerd 61 t/m 73; van de oorspronkelijke 15
   Numodo-PvA-acties vielen er 2 af — zie hieronder), status altijd `Open` (geen fictieve
   voortgang verzonnen).
6. Assert: precies 13 nieuwe pva-acties aanwezig.
7. 20 vraag→pva-koppelingen gezet (tekstuele match op `vragen.pva`, zelfde patroon als bestaand;
   `pva_items` heeft geen `module_id`, dus dit raakt nergens de FLOP-indeling).
8. Assert: precies 20 koppelingen gezet.
9. Hash van de 63 bestaande vragen opnieuw berekend en vergeleken met stap 2 — moet identiek zijn.
10. Assert: totaal 168 vragen, 73 pva-items.

Bij elke afwijking breekt de `DO`-block af met `raise exception` en wordt de hele transactie
teruggedraaid (niets blijft hangen). **Eerst getest met `rollback;` in plaats van `commit;`** —
liep foutloos door, pas daarna echt toegepast.

**Twee ontwerpkeuzes, expliciet gemaakt:**
- **Locatie:** de 105 nieuwe vragen (ook de 13 in het L-blok) hebben allemaal `locatie_id = NULL`.
  Numodo's eigen vestigingen (Dorpsstraat 179 / 9A in Harmelen) zijn niet SeysCentra's vier
  vestigingen (Maastricht/Malden/Utrecht/Zwijndrecht) — een Numodo-BHV-vraag aan een specifieke
  SeysCentra-vestiging toewijzen zou verzonnen zijn. De bestaande locatie-koppelingen (21 vragen,
  21 pva-acties) zijn op geen enkele manier aangeraakt. Het L-blok blijft dus locatiegebonden waar
  het dat al was; de aanvulling zelf is daar organisatiebreed binnen.
- **Twee van de 15 Numodo-PvA-acties zijn niet overgenomen:** actie 13 (enige ref was Numodo O1-2,
  die zelf als duplicaat is overgeslagen — niets om aan te koppelen) en actie 4 (refs F2-8 en
  F3-4; F3-4 was een overgeslagen duplicaat, en F2-8 wordt al door actie 3 gedekt — `vragen.pva`
  is één tekstveld, dus een vraag kan maar aan één actie hangen. Ook `L1-6` werd door twee acties
  geclaimd (6 en 7); die is aan actie 7 gekoppeld, de specifiekere van de twee).

## Verificatie — telling voor/na (bewijs dat niets verloren is)

| Metriek | Vóór | Ná | Klopt? |
|---|---|---|---|
| Vragen totaal | 63 | 168 (63 + 105 nieuw) | ✅ |
| — waarvan de oorspronkelijke 63 nog met Nee | 61 | 61 | ✅ **alle 61 SeysCentra-aandachtspunten nog aanwezig** |
| — waarvan de oorspronkelijke 63 nog met Ja | 2 | 2 | ✅ |
| Hash van de 63 oorspronkelijke vragen | `44dba2a0e1a43fb3eb2fe5b892be7ca7` | `44dba2a0e1a43fb3eb2fe5b892be7ca7` | ✅ **identiek — geen letter gewijzigd** |
| PvA-acties totaal | 60 | 73 (60 + 13 nieuw) | ✅ |
| Antwoordverdeling (alle 168) | 61 Nee / 2 Ja / 0 NVT | 81 Nee / 55 Ja / 32 NVT | 20 nieuwe Nee + 53 nieuwe Ja + 32 nieuwe NVT = 105 ✅ |

**(Herhaling van de eerdere correctie: het waren feitelijk 61 Nee-aandachtspunten, niet 12 zoals
in de opdracht stond — zie de melding bovenaan dit rapport. Alle 61 zijn nog onaangeroerd
aanwezig, geverifieerd via zowel de telling als de letterlijke inhouds-hash.)**

**Volledige FLOP-structuur nu (elke module gevuld, Ja/Nee/NVT zichtbaar):**

| Module | Totaal | Nee | Ja | NVT |
|---|---|---|---|---|
| F1 Gevaarlijke stoffen | 25 | 7 | 8 | 10 |
| F2 Fysieke belasting | 16 | 11 | 4 | 1 |
| F3 Schadelijke factoren | 19 | 6 | 5 | 8 |
| L1 Brandveiligheid en BHV | 34 | 24 | 9 | 1 |
| L2 Mobiliteit en transport | 11 | 3 | 3 | 5 |
| L3 Werken op externe locaties | 10 | 2 | 3 | 5 |
| O1 Preventiebeleid en arbo-organisatie | 12 | 6 | 6 | 0 |
| O2 PAGO en gezondheidsbeleid | 10 | 6 | 3 | 1 |
| O3 Kwetsbare groepen | 8 | 2 | 5 | 1 |
| P1 Stress en werkdruk | 13 | 10 | 3 | 0 |
| P2 Intimidatie en ongewenst gedrag | 7 | 2 | 5 | 0 |
| P3 Ingrijpende gebeurtenissen en PSA | 3 | 2 | 1 | 0 |
| **Totaal** | **168** | **81** | **55** | **32** |

Geen enkele module is meer leeg of extreem dun (vergelijk met vanochtend: L3 had 1 vraag, O3 had
1 vraag — nu 10 resp. 8). Alle twaalf FLOP-modules tonen nu een realistische mix van Ja/Nee/NVT,
niet alleen aandachtspunten.

## Regressie

- `npx tsc --noEmit`: groen.
- `npm run build`: groen, alle routes.
- Volledige testronde (`node --use-system-ca scripts/run_tests.mjs`): **37/37 scripts groen**,
  6 overgeslagen (hebben een lokale dev-server nodig). O.a. `anon_execute_audit_test` 20/20,
  `module_isolatie_test` 8/8, `locatie_isolatie_test` 13/13, `dashboard_meerjaren_locatie_test`
  12/12, `rie_locatie_filter_selftest` 6/6, `nachttest_rls` (cross-tenant) groen.
- Dutch Waste: `vragen`-telling (149) en `pva_items`-telling (21) ongewijzigd t.o.v. voor deze
  sessie — de migratie raakt nergens een andere `company_id`.
- Geen enkel `.tsx`/`.ts`-bestand aangepast: `RieClient`/`ModuleCard`/`PvaClient`/`PvaCard` lezen
  de tabellen generiek uit en tonen de 105 nieuwe vragen en 13 nieuwe acties vanzelf, inclusief
  hun Ja/Nee/NVT-badge (die styling bestond al, alleen nooit gebruikt voor SeysCentra).

## Te controleren in de browser (voor Kees)

1. Log in bij SeysCentra, ga naar `/rie`. Elke van de 12 FLOP-modules toont nu een substantieel
   aantal vragen; klap er een paar open (bv. F1, O3, P3 — voorheen bijna leeg) en zie een mix van
   groene Ja-badges, rode Nee-badges en grijze NVT-badges.
2. Zoek specifiek naar `NUM-L1-6` (via de vraagtekst "periodiek ontruimingsoefeningen") en
   vergelijk met `O1-6` (BHV-organisatie op orde) in dezelfde module — dit is het genoteerde
   twijfelgeval dat je zelf moet beoordelen.
3. Controleer een paar van de oorspronkelijke 61 aandachtspunten (bv. zoek op "hurken of gebogen"
   in F2) — tekst, antwoord, bevinding en PvA-link moeten precies zijn zoals voorheen.
4. Ga naar `/pva`: de 13 nieuwe acties (nr 61 t/m 73) staan onderaan de lijst, allemaal status
   "Open", zonder locatie (organisatiebreed) — de bestaande 60 acties en hun status/locatie zijn
   ongewijzigd.
5. Locatiefilter op `/rie` testen (bv. "Malden"): moet nog steeds precies dezelfde bestaande
   vragen tonen als vanochtend plus alle organisatiebrede vragen (nu dus ook de 105 nieuwe) — geen
   van de nieuwe Numodo-vragen hoort bij een specifieke vestiging te verschijnen.
6. Dutch Waste (of een ander bedrijf) op `/rie` en `/pva`: ongewijzigd (regressietoets).

## Fase 3 — Hernummering: NUM-voorvoegsel eruit, schone doorlopende nr per module

Op Kees' expliciete verzoek na het lezen van dit rapport: de `NUM-`-labels op de 105 toegevoegde
vragen (en de oude, module-vreemde labels op de oorspronkelijke 63, bv. "F4-5" onder module F1)
zijn vervangen door een gewone doorlopende reeks per module — `F1-1, F1-2, ..., F1-25`,
`L1-1 ... L1-34`, enzovoort. Geen enkele andere aanduiding van herkomst meer in het nr-veld.

**Migratie:** `supabase/migrations/0091_seyscentra_nr_hernummering.sql`. Raakt uitsluitend
`vragen.nr` en `vragen.volgorde` — `vraag`/`antwoord`/`bevinding`/`klasse`/`pva`/`locatie_id`/
`functiegroep_id`/`module_id` blijven per rij (gevolgd op `id`, niet op `nr`) letterlijk
ongewijzigd. Volgorde per module: dezelfde weergave-volgorde die al gold (module.volgorde, dan
vraag.volgorde, dan nr) — de oorspronkelijke SeysCentra-vragen staan dus nog steeds vóór de
Numodo-aanvulling in elke module, alleen zonder zichtbaar onderscheid meer in het label.

**Uitvoering:** eerst alle 168 `nr`'s tijdelijk op een gegarandeerd unieke waarde (`TMP-<id>`) gezet
om de unieke `(company_id, nr)`-constraint niet te breken bij het omwisselen (nieuwe nr's als
"F1-1" bestonden al als tijdelijk label ergens anders in dezelfde module), daarna in dezelfde
transactie de definitieve nr+volgorde gezet. Verificatie binnen de migratie zelf (breekt af bij
afwijking): 168 vragen vooraf, 168 erna, en een hash over alle vragen (op `id`, met opzet zonder
`nr`/`volgorde`) identiek voor en na — bewijs dat alleen het label is veranderd, geen inhoud.
Eerst getest met `rollback;`, daarna pas echt toegepast.

**Resultaat, geverifieerd:**

| Module | Reeks | Aantal |
|---|---|---|
| F1 | F1-1 t/m F1-25 | 25 |
| F2 | F2-1 t/m F2-16 | 16 |
| F3 | F3-1 t/m F3-19 | 19 |
| L1 | L1-1 t/m L1-34 | 34 |
| L2 | L2-1 t/m L2-11 | 11 |
| L3 | L3-1 t/m L3-10 | 10 |
| O1 | O1-1 t/m O1-12 | 12 |
| O2 | O2-1 t/m O2-10 | 10 |
| O3 | O3-1 t/m O3-8 | 8 |
| P1 | P1-1 t/m P1-13 | 13 |
| P2 | P2-1 t/m P2-7 | 7 |
| P3 | P3-1 t/m P3-3 | 3 |

Inhouds-hash (op `id`, exclusief `nr`/`volgorde`) vóór en na: **identiek**
(`b38e6f056551d0d54ffead425573af88`). `npx tsc --noEmit` groen, `npm run build` groen, volledige
testronde 37/37 groen (dezelfde run als hierboven aangevuld, opnieuw gedraaid na deze migratie).
Dutch Waste ongewijzigd (149 vragen). Geen enkel `.tsx`/`.ts`-bestand aangepast — het nr-veld
wordt alleen gebruikt als weergavelabel en als vrij tekstveld voor de `#vraag-<nr>`-URL-anker;
oude gedeelde anker-links naar een specifieke vraag (bv. `#vraag-NUM-F1-1`) werken hierdoor niet
meer, maar die zijn nooit extern gedeeld (dit is een interne demo-omgeving).

**Kanttekening:** de herkomst (welke vragen oorspronkelijk van SeysCentra kwamen en welke uit de
Numodo-aanvulling) is nu ALLEEN nog af te leiden via `vragen.created_at`/de migratiegeschiedenis
in de database, niet meer aan het `nr`-label zelf. Dat was expliciet de bedoeling van dit verzoek.

## Bestanden van deze sessie

- `supabase/migrations/0090_seyscentra_numodo_aanvulling.sql` — de migratie zelf (bevat de
  volledige, letterlijke Numodo-tekst voor de 105 toegevoegde vragen en 13 pva-acties).
- `supabase/migrations/0091_seyscentra_nr_hernummering.sql` — de hernummering (Fase 3 hierboven).
- `audit/2026-09-24_seys-aanvulling/` — veiligheidskopie van vóór de wijziging
  (`backup_vragen_full.json`, `backup_pva_items_full.json`, `backup_modules_full.json`,
  `seyscentra_huidig_per_module.json`).
- Dit rapport.
- Niet gecommit (bewust, `/import/*`-gitignore voor klantcontent): `import/docx_dump.txt`,
  `import/docx_dump.json`, `import/numodo_vragen.json`, `import/numodo_pva.json`,
  `import/numodo_adviezen.json`, `import/numodo_added.json`, de twee generatiescripts
  (`import/gen_numodo_added.py`, `import/gen_numodo_sql.py`) — puur bouwmateriaal voor de
  migratie hierboven, die zelf wel gecommit is en de bron van waarheid blijft.
- Niet meegenomen: Numodo's `17. Functie-RI&E`-sectie (functiegroep-specifieke checklists) —
  buiten scope, dat zou precies de functiegroep-opsplitsing terugbrengen die vanochtend is
  verwijderd. Ook Numodo's 4 losse "Adviezen" (niet-genummerde suggesties zonder eigen PvA-actie)
  zijn niet overgenomen — geen aandachtspunt, geen vaste plek in het datamodel voor zo'n vrijblijvend
  advies zonder actienummer.
