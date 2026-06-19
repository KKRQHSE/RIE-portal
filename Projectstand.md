# Projectstand — QVOX RI&E

> Levend document, de enige plek voor "waar staan we". Status, geen verantwoording: het waarom van keuzes staat in `Beslissingen.md`. Overschrijf vrij bij elke sessie.
>
> **Laatst bijgewerkt:** 19 juni 2026 — werkplekinspectie-module live (alpha), managementdashboard gebouwd (KAM + admin), directe DB-tooling + schemadump als bron van waarheid. Open: Geissler-termijnanker, rie_versie-backfill.

## Het project in het kort

Twee sporen onder één dak:
- **Spoor 1 — De RI&E (de Toverspreuk):** vakmodel, datamodel, generator, intake. Kernlijn: AI bereidt voor, Kees toetst.
- **Spoor 2 — Het klantportaal:** Next.js/Supabase-app waar de getoetste RI&E en het Plan van Aanpak gaan leven.

De naad tussen beide is het belangrijkste open punt: delen ze één datamodel? Zie "Overkoepelend".

## Spoor 1 — RI&E: waar staan we

- Vakmodel/Toverspreuk: ingevuld en getest. P3 hernoemd naar "Ingrijpende gebeurtenissen en PSA-incidenten" (Beslissing 51), O3-10 thuiswerkersvraag toegevoegd (Beslissing 52).
- Datamodel: schema v1.1 vastgesteld als JSON Schema (Beslissing 36). `geissler_all.json` is de canonieke referentie-dataset.
- Consistentie-checker (`check_dataset.py`): verplichte poort vóór de generator (Beslissing 37).
- Vragenbibliotheek: 140 vragen, 12 modules, generiek en bedrijfsneutraal (Beslissing 40).
- Intake-wizard: gebouwd en getest op een nep-bedrijf (correcte module-activering, aanpakniveau, kwetsbare groepen).
- Generator (`build_qvox.py`): functioneel, levert het juiste format, maar leest de nieuwe velden (kinney, brf_categorie, toetsbrief) nog niet. Uitbreiden.
- Geissler-rapport: inhoudelijk af.

## Spoor 2 — Klantportaal: waar staan we

Werkende Next.js/Supabase-app, in twee browsertest-ronden groen op de kritieke punten. Wat staat:
- Rollen: admin (Kees), KAM-coördinator (ziet eigen bedrijf), actiehouder (geen account, geheime link).
- Vrijgavemodel: actiehouder dient voorstel in, KAM geeft vrij of stuurt terug; de officiële status is alleen via dat proces wijzigbaar (Beslissing 41-43).
- Volledige audit-trail via een loggende RPC-laag (Beslissing 44); geen datalek tussen bedrijven (getest).
- White-label per klant (logo/kleur/lettertype); veilige standaard: uit tenzij geactiveerd (Beslissing 46-50).
- Bewijs-upload (foto/PDF, beveiligd, naspeurbaar, auto-verkleind), acties doorgeven aan een collega, mobiel.
- E-mailmeldingen (toewijzen/doorgeven) + herinneringen (handmatig + automatisch, met maximum per persoon en logboek): gebouwd.
- **Werkplekinspectie-module (alpha):** sjabloonbeheer + inspectie uitvoeren via een loggende RPC-laag; niet-in-orde-bevindingen worden PvA-acties. Per bedrijf aan/uit (`bedrijf_modules`). Negatieve isolatietests 9/9 en E2E 18/18 groen tegen de live DB.
- **Managementdashboard:** KAM per bedrijf (`/[company_id]/dashboard`, white-label) + admin-roll-up (`/dashboard`), gevoed door één lees-RPC `dashboard_overzicht` / `dashboard_admin_overzicht`. Tegels: te beoordelen, voortgang PvA, termijn-urgentie, prioriteit, RI&E-geldigheid, inspecties, bewijslast.
- **DB-tooling:** directe SQL-runner (`scripts/db_run.mjs`) en schemadumper (`npm run db:schema` → `db/schema.sql`) als reviewbare bron van waarheid naast `supabase/migrations`.

## Wat ligt open

### Spoor 1 (RI&E)
- Generator uitbreiden voor de nieuwe velden (kinney, brf_categorie, toetsbrief, scope-matrix met HVK-groen, gekleurde klasse-cellen, PvA-kolom, bijlagen in de inhoudsopgave).
- O2-3 en P2-4 in Geissler: brf + klasse goedkeuren (Beslissing 38, openstaand).
- Geissler actie 9 hangt aan een Ja-vraag (F3-17): borgingsactie, of moet F3-17 naar Nee?
- Geissler foto-captions: eerdere feedback mogelijk onvolledig verwerkt, nalopen vóór oplevering.
- Geissler oplevering: certificaatnummer, datum, PvA-verantwoordelijken + deadlines, ondertekening toetsbrief.
- O3-10 nog doorvoeren in de vragenbibliotheek (voorgestelde E-waarde 3).
- Laag 2 (AI-assistentie per module): uitgesteld tot na alignment.
- Wettelijke meetlat compleet maken (artikel-voor-artikel) + review-routine vastleggen (Beslissing 14).
- Wettelijke meetlat: thuiswerk citeert nu Arbobesluit 2.34/2.34a, terwijl Beslissing 52 1.43-1.53/1.47/1.48 noemt. Welke artikelen kloppen is jouw vakoordeel.
- Vakinhoudelijke meetlat: eigen dekking spiegelen aan gevestigde instrumenten (eenmalig).

### Spoor 2 (portaal)
- **Geissler-termijnanker (eerstvolgende stap, vakoordeel):** 18 open PvA-acties bij Geissler hebben kwalitatieve termijnen ("binnen 12 maanden"/"binnen 2 jaar") i.p.v. data; Geissler heeft géén rie_versie met toetsdatum. Kees moet een ankerdatum + horizon-conventie geven, dan kan `termijn_datum` gevuld worden en gaat de "over de termijn"-tegel ook voor Geissler leven. De RPC/UI staat klaar.
- **Backfill rie_versie_id:** bestaande modules/vragen/pva_items/fotos nog niet aan een rie_versie_id gekoppeld. Beslissing: wel backfillen. Migratie nog te schrijven, eerst op Alpha/Bravo. LET OP nummering: de nachttest-agent claimde `0003_revoke_execute_interne_rpcs.sql` al (zie hieronder) — deze backfill wordt 0004 of de revoke wordt hernummerd.
- Werkplekinspectie verder uitbouwen (uit alpha): bredere uitrol, eventueel gast-/mobiele inspecties.
- Uitgebreid rollenmodel deskundigen (HVK/A&O/arbeidshygiënist): grote aparte uitbreiding, later.
- Gast de terugstuurreden tonen (kleine afronding).
- Leeg paneel rechtsboven (niet-kritiek, vermoedelijk externe widget).
- Middleware-deprecatie opruimen: Next 16 wil `proxy` i.p.v. `middleware` (dev-warning). Geen haast, maar de middleware regelt auth-redirects — voorzichtig migreren.
- **Schema in repo:** supabase/migrations/ (0001, 0002) + `db/schema.sql` als dump. Toekomstige schema-wijzigingen altijd als migratiebestand committen.
- **Parallelle nachttest-agent:** er draait een tweede agent op main (tenant-isolatietest, `scripts/nachttest_rls.mjs`). Liet o.a. `0003_revoke_execute_interne_rpcs.sql` na (trekt EXECUTE op interne RPC's in). NIET klakkeloos toepassen — eerst nagaan of dat geen legitieme aanroepen breekt. Kees: "geen autonome bevoegdheden inperken."
- ~~Kapot logo~~ — opgelost: /logo.jpg geeft 200 (geldig JPEG aanwezig in /public, geverifieerd 19 juni).
- ~~E-mailmeldingen + herinneringen~~ — gebouwd (zie boven).
- ~~Managementdashboard~~ — gebouwd (zie boven); resteert browsertest op fysieke devices + de smaaksuggesties (iconen, 3-koloms op breed scherm).

### Overkoepelend / blokkerend
- **AVG (blokkeert livegang):** verwerkersovereenkomst, verwerkingsregister, privacyverklaring (Beslissing 33). Datalocatie goed: Supabase EU West (Ierland).
- **Fotoprotocol:** welke foto's verplicht per aanpakniveau, datering en labeling (Beslissing 31).
- Bewuste portaal-risico's bewaken: doorgeven naar extern adres zonder seintje aan KAM; automatische mail; opslaggroei; geheime sleutels nooit in zichtbare code.
- Eigen QHSE Totaal-huisstijl uitwerken (Beslissing 54).
- ~~Alignment twee sporen~~ — opgelost 17 juni (Beslissingen 57-59).

## Status-conflicten om te bevestigen

Hierover spraken de bronnen elkaar tegen; jij weet wat klopt:
1. **Portaal:** een oudere export beschrijft het nog als HTML-proof-of-concept ("echte app = nog te bouwen"). Aangenomen: dat is verouderd, het portaal is gebouwd en getest (Beslissing 41-50 + de testronden). Klopt dat?
2. **Geissler-rapport:** ergens 49 pagina's en "nog niet opgeleverd", ergens 57 pagina's en "FROZEN v6 definitief". Welke is actueel?
3. **check_dataset.py:** één bron zegt "gebouwd", een oudere zegt "bestaat nog niet als los script". Welke klopt?
4. **Gast terugstuurreden:** één bron zegt al getoond, Beslissing 45 zegt uitgesteld. Welke klopt?

## Werkwijze

> Kandidaat om naar de projectinstructie te verplaatsen (de aangescherpte onboarding). Dit zijn semi-permanente afspraken, geen momentopname.

- Kleine, testbare stappen; per grote stap eerst het SQL-bestand, dan de Claude Code-prompt.
- Diagnose vóór fix: een gemelde bug is een hypothese tot de oorzaak met bewijs is aangetoond.
- Verbindingscheck vóór testronden (één schrijf-actie; faalt die, eerst de Supabase-config op Vercel checken).
- Testen op twee niveaus: code-checks door de codeerhulp, visueel en gedrag door browsertest.
- Veilige standaard: nieuwe functies breken bestaande werking nooit; opt-in.

---

*Dit document vervangt de losse sessieoverzichten, overdrachten, chatsamenvattingen en projectexports. Maak voortaan geen nieuwe momentopname-bestanden meer: verwerk de oogst van een chat hier, of als besluit in `Beslissingen.md`.*
