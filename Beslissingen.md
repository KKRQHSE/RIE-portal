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

---

## Beslissing 61 — Module-abonnement + zelfbeheer per bedrijf (20 juni 2026)

**Aanleiding.** Modules (te beginnen met de werkplekinspectie) moeten per bedrijf
aan/uit kunnen, maar "een module gebruiken" en "een abonnement op een module
aangaan" zijn twee verschillende dingen. Tot nu toe was er alleen één platte
`actief`-vlag in `bedrijf_modules` — niet genoeg om later facturatie op te laten
leunen.

**Besluit.** Drie expliciete toestanden per module per bedrijf, bovenop de
bestaande gebruiks-toggle:

1. **Geen abonnement** (`abonnement_status = 'geen'`, default) — nooit geactiveerd,
   niet bruikbaar, niet zichtbaar.
2. **Abonnement actief** (`'actief'`) — de beheerder zet het *gebruik* vrij aan/uit
   via de bestaande kolom `actief`. "Uit" pauzeert alleen het gebruik; het
   abonnement loopt door.
3. **Opgezegd** (`'opgezegd'`) — een aparte, bewuste handeling die het abonnement
   beëindigt. Daarna niet meer bruikbaar; opnieuw aanzetten is een nieuwe
   abonnementsstap.

De eerste activatie is de bewuste **abonnementsstap** (bevestiging in de UI;
`geactiveerd_op` vastgelegd). Opzeggen heeft een eigen knop + bevestiging
(`opgezegd_op`).

**Afbakening.** *Nu géén* betaalintegratie of incasso (geen Stripe e.d.). We leggen
alleen de status en de momenten vast, zodat facturatie er later op kan leunen. De
abonnementsstap is een bewuste statuswijziging, geen betaling.

**Datamodel (additief).** Migratie `0004_module_abonnement.sql`: `bedrijf_modules`
uitgebreid met `abonnement_status` (check geen/actief/opgezegd, default 'geen'),
`geactiveerd_op` en `opgezegd_op` (beide nullable timestamptz); nieuwe loggende
tabel `module_historie` (RLS via `mag_bedrijf_beheren`). De bestaande Alpha-rij
(inspectie, actief=true) is geïnterpreteerd als lopend abonnement
(`abonnement_status='actief'`, `geactiveerd_op` gestempeld op het migratiemoment —
er was geen historisch startmoment bewaard —, `actief` bleef true). Geen
niet-additieve wijziging nodig.

**Autorisatie & RPC's.** Alleen wie het bedrijf mag beheren (KAM/admin, bestaande
`mag_bedrijf_beheren`-check) mag schakelen; gewone gebruikers en gast-actiehouders
zien hooguit de status. Drie SECURITY DEFINER-RPC's
(`db/module_abonnement_rpcs.sql`), elk met een regel in `module_historie`:
`module_abonneren` (eerste of hernieuwde activatie), `module_gebruik_zetten`
(aan/uit), `module_opzeggen`.

**UI & gating.** Beheerscherm `/[company_id]/modules` (`ModuleBeheer`) met per
module de status, "sinds"-datum en de juiste actieknop (echte buttons/links,
bevestiging bij abonneren en opzeggen). Nav én dashboard tonen een module alleen
als `abonnement_status='actief'` én `actief=true` — dezelfde gating als waarmee de
inspectie-tegel al verscheen.

**Bewijs.** Isolatietest `scripts/module_isolatie_test.mjs` 8/8 groen (bedrijf A
kan abonnementen van bedrijf B niet zien of muteren), testdata opgeruimd;
`tsc --noEmit` en `next build` groen. Commit `369b845`.
