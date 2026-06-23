# Kennisbibliotheek — de absolute waarheid

> Eén plek die aanwijst wáár elke waarheid in dit project leeft. Dit bestand
> concurreert met niets: staat een bron hier niet als canoniek genoemd, dan is hij
> niet leidend. Bij tegenspraak wint het bestand dat hier als canoniek staat.
>
> **Laatst bijgewerkt:** 22 juni 2026

## Hoe deze bibliotheek werkt

- `kennis/` is de thuisbasis van de canonieke vakkennis (Spoor 1 — RI&E).
- Dit INDEX-bestand is de kaart: per onderwerp staat hier wélk bestand leidend is.
- De **registratie-regel** in [`../AGENTS.md`](../AGENTS.md) zorgt dat elke
  impactvolle wijziging in de juiste bron wordt bijgewerkt — code in Projectstand,
  besluiten in Beslissingen, vakkennis hier.
- Nieuwe canonieke kennis? Zet het `.md`-bestand in de passende submap en voeg een
  rij toe aan de tabel hieronder. Bevat het klant-/persoonsgegevens (PII), gitignore
  dat bestand apart — AVG.

## Canonieke bronnen — project (Spoor 2, portaal)

| Onderwerp | Canonieke bron |
|---|---|
| Waar staan we (status, open punten) | [`../Projectstand.md`](../Projectstand.md) |
| Genomen besluiten + waarom | [`../Beslissingen.md`](../Beslissingen.md) |
| Werkinstructie agent + registratie-regel | [`../AGENTS.md`](../AGENTS.md) |
| Databaseschema (bron van waarheid) | [`../db/schema.sql`](../db/schema.sql) + [`../supabase/migrations/`](../supabase/migrations/) |
| RPC-laag (databasefuncties) | [`../db/`](../db/) (`*_rpcs.sql`) |

## Canonieke bronnen — vakkennis (Spoor 1, RI&E)

| Onderwerp | Map | Status |
|---|---|---|
| Vakmodel / Toverspreuk (modules, aanpakniveaus) | [`vakmodel/`](vakmodel/) | nog te vullen |
| Wettelijke meetlat (artikel-voor-artikel) | [`wettelijk/`](wettelijk/) | nog te vullen |
| Vragenbibliotheek (de vragen, brf/klasse-conventies) | [`vragenbibliotheek/`](vragenbibliotheek/) | nog te vullen |

> Pas deze categorieën gerust aan naar wat je werkelijk hebt — de structuur volgt
> jouw kennis, niet andersom.
