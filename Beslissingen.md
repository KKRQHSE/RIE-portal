# Beslissingen — QVOX RI&E-portaal

> **Let op — repo-lokaal log.** Dit bestand is op 20 juni 2026 in de repo gestart.
> De canonieke besluitenlijst (Beslissingen 1–59) beheert Kees buiten deze repo;
> die is leidend. Nieuwe besluiten die in de codebase landen leggen we vanaf nu
> hier vast, zodat ze reviewbaar naast de code staan. **Nummering 60+ is
> voorlopig** en moet bij gelegenheid met het externe log worden afgestemd.

---

## Beslissing 60 — Laad-optimalisatie van het portaal (20 juni 2026)

**Aanleiding.** Het managementdashboard voelde "net niet 100% interactief": na een
klik op een tegel gebeurde er zichtbaar even niets. Diagnose toonde aan dat dit
geen kapotte tegel was (elke tegel is een echte `<Link>`), maar een
laad-ervaring: pagina's gaven geen directe feedback en haalden hun data traag op.

**Besluit.** Drie additieve optimalisaties, zonder de werking of beveiliging te
wijzigen:

1. **Loading-skeletten.** Elke beveiligde route (`/[company_id]/dashboard`, `/pva`,
   `/rie`, `/inspecties`, `/personen` en het admin-`/dashboard`) krijgt een
   `loading.tsx` die een gedeeld skelet (`components/LaadSkeleton.tsx`) toont. Next
   prefetcht deze fallback, waardoor een klik meteen reageert in plaats van op de
   oude pagina te blijven hangen.
2. **Parallelle queries.** Onafhankelijke Supabase-leesacties per pagina draaien
   samen in één `Promise.all` in plaats van een waterval van losse round-trips
   naar de database (EU/Ierland). De autorisatie-gating (`redirect`/`notFound`)
   gebeurt onveranderd ná het ophalen.
3. **Minder schrijfacties.** `koppel_mij_als_persoon` draaide bij élke PvA-/
   Personen-lading. Via `lib/personen-data.ts` wordt die (idempotente) RPC nog
   alleen aangeroepen als de ingelogde KAM nog niet in de personenlijst staat.

**Afwegingen.**
- **Veilige standaard gehandhaafd** (vgl. werkwijze in `Projectstand.md`): puur
  frontend/data-ophaling, geen gedrags- of schemawijziging; `tsc` + `next build`
  groen.
- **Bewuste tradeoff van de skeletten:** door streaming kan een `notFound()` ná de
  await geen echte HTTP 404-status meer zetten. De gebruiker ziet wél de
  niet-gevonden-pagina (gemarkeerd `noindex`). Voor dit interne portaal
  acceptabel; alleen relevant als er ooit een harde 404-status nodig is.
- **Niet aangeraakt:** de `auth.getUser()`-aanroep in de middleware bij elke
  request blijft staan — dat is een bewuste beveiligingskeuze, geen
  prestatieprobleem om weg te optimaliseren.

**Bewijs.** Browsergetest op het KAM-dashboard (alle tegels navigeren correct);
`tsc --noEmit` en `next build` groen. Commits `6e6c378` (optimalisatie) en de
voorafgaande dashboard-reparatie `d3dc2b5` (RI&E-geldigheid-tegel → `/rie`).
