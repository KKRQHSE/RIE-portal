# Openstaand voor Kees — nachtopdracht 4/5 september 2026

Dit bestand verzamelt elke businesskeuze, AVG-afweging, onduidelijke productiestatus of
authenticatie-/migratie-infra-vraag waarbij ik NIETS heb gebouwd, zoals afgesproken (Regel 1).
Per item: de vraag, wat ik aantrof, en mijn aanbevolen richting — geen van deze is doorgevoerd.

---

## 1. Teamleider-inzage in individuele toolbox-bewijsstukken — bedoeld of niet?

**Bron:** `audit/2026-09-04/teamleider-inventaris.md` (fork-onderzoek, zie daar voor de volledige
citaten). `/[company_id]/toolbox/bewijs/[deelname_id]` is voor teamleider toegankelijk — zowel de
page-gate als de RLS op `toolbox_deelname` laten hem door. Dit wordt nergens expliciet genoemd in de
bouw-memory van de teamleider-feature (die wél expliciet benoemt wat teamleider bij toolbox-sessies
mag: bewerken van elke sessie, verwijderen alleen van eigen sessies).

**Wat ik aantrof:** een individueel bewijsstuk toont de bevroren naam, handtekening en
titel/tekst-snapshot van een toolbox-deelname — geen gezondheidsgegevens, wel een handtekening
(persoonsgegeven). Niet per se problematisch, maar ook niet aantoonbaar een bewuste keuze.

**Aanbevolen richting:** geen technisch oordeel van mij — dit is precies het soort "mag teamleider
dit zien"-vraag die bij het rechtenmodel hoort (dat is jouw beslissing, expliciet niet aan mij).
Ik heb hier niets aan gewijzigd.

---
