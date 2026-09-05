# Data-inventaris AVG — QVOX RI&E-portaal

Peildatum: 5 september 2026. Bron: uitsluitend code/schema — `db/schema.sql` (committe hoofdtak,
commit `7661a1b`), `lib/`, `app/`. Geen aannames: wat niet met een citaat vast te stellen was, staat
expliciet als **ONBEKEND, UITZOEKEN**.

**Bewust buiten scope**: in de gedeelde working directory liep tijdens dit onderzoek een aparte,
nog niet gecommitte feature van een andere sessie (persoon-koppelen/goedkeuringsverzoek-flow, tabel
`goedkeuringsverzoek`, pagina's `goedkeuringen`/`medewerker-toevoegen`, migratie
`0071_concept_medewerkers.sql`). Die staat niet op `main`, is nog in beweging, en is daarom NIET in
deze inventaris meegenomen — een AVG-inventaris over een moving target is geen betrouwbare
inventaris. Zodra die feature gemerged is, moet dit document met dat onderdeel aangevuld worden.
Regelnummers hieronder zijn opgetekend uit de gecommitte staat van `db/schema.sql`; enkele citaten
zijn kruislings met Git HEAD geverifieerd om vervuiling door de bovengenoemde parallelle, ongecommitte
wijziging uit te sluiten.

---

## Deel 1 — Per tabel met persoonsgegevens

### personen
- **Persoonsgegevens**: naam, e-mail, functiegroep_id, datum_in_dienst, datum_uit_dienst, status.
- **Bijzonder persoonsgegeven**: nee.
- **Wie kan erbij**: lezen — eigen bedrijf of admin (RLS `personen_select`). Schrijven (RLS `FOR ALL`)
  — alleen `mag_bedrijf_beheren` = admin of client/KAM, **niet** teamleider (`mag_bedrijf_beheren`
  sluit `is_teamleider()` expliciet uit, `db/schema.sql:4629-4641`). Geen enkele app-route gebruikt
  vandaag een directe DELETE op deze tabel, al staat de RLS-policy dat in theorie toe.
- **Extern**: nee.
- **Bewaartermijn**: geen ingericht (`datum_uit_dienst` is puur informatief, geen enkel proces
  reageert erop met een verwijder- of archiveeractie).
- **Verwijderpad**: geen zelfstandige "verwijder persoon"-functie. De enige hárde `DELETE FROM
  personen` in de hele codebase zit verstopt in `personen_samenvoegen` (verwijdert de bronpersoon ná
  het verplaatsen van diens gegevens naar de doelpersoon, `db/schema.sql:4587`) — bedoeld voor het
  opschonen van dubbele records, niet als AVG-verwijderroute. Elke verwijdering (via die weg) wordt
  gelogd door trigger `personen_verwijderd_loggen()` (`db/schema.sql:4602-4614`), die naam + e-mail
  van de verwijderde persoon **permanent** in `audit_log.detail` zet — en die tabel is zelf niet meer
  te wissen (zie audit_log hieronder). Er bestaat dus geen pad waarmee de naam/het e-mailadres van
  een verwijderde medewerker daadwerkelijk overal uit het systeem verdwijnt.

### users (koppeling met Supabase Auth)
- **Persoonsgegevens**: e-mail, naam, rol.
- **Wie kan erbij**: eigen rij, of admin (RLS `users_select`, `db/schema.sql:1128`).
- **Aanmaak**: trigger `handle_new_user()` op `auth.users` (`db/schema.sql:2932-2950`) — bij signup
  wordt rol/bedrijf NOOIT overgenomen uit de eigen aanvraag (migratie 0062-fix); elk account start
  als machteloze 'client' zonder bedrijf, een admin kent nadien apart rol/bedrijf toe.
  **ONBEKEND, UITZOEKEN**: het exacte proces waarmee die toekenning gebeurt (geen code in `app/admin`
  gevonden die dit doet — vermoedelijk handmatig via het Supabase-dashboard).
- **Extern**: nee direct; onderliggende identity-store is Supabase Auth (`auth.users`).
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: geen route/RPC gevonden die `public.users` of `auth.users` verwijdert. FK
  `auth.users → public.users` is `ON DELETE CASCADE` maar werkt maar één kant op: een account
  verwijderen via Supabase Auth (buiten deze codebase) ruimt de `public.users`-rij op; andersom niet
  — een (theoretische) delete van alleen de `public.users`-rij laat het Auth-account met
  e-mail/wachtwoord-hash onaangeroerd. Bij bedrijfsverwijdering: `users.company_id` is `ON DELETE SET
  NULL` — de gebruiker blijft bestaan, alleen ontkoppeld.

### toolbox_deelname
- **Persoonsgegevens**: bevestigde_naam (bevroren snapshot), handtekening, quiz_resultaat,
  video_bekeken, persoon_id.
- **Bijzonder persoonsgegeven**: geen gezondheidsgegeven; **handtekening apart benoemd** — een
  digitale handtekening is een persoonskenmerk dat als gevoelig behandeld moet worden.
- **Wie kan erbij**: RLS `mag_bedrijf_werken` = admin, client/KAM ÉN **teamleider**. De RPC
  `toolbox_bewijs` (individueel bewijsstuk) geeft het `handtekening`-veld ONGEFILTERD terug zodra
  `mag_bedrijf_werken` klopt (`db/schema.sql:5078,5094`, zelf tegen Git HEAD geverifieerd) — er is
  geen aparte maskering voor teamleider, in tegenstelling tot de gezondheidsvelden bij incidenten
  (zie daar). Het overzichtsrapport (`toolbox_bewijs_overzicht`) lekt de handtekeningafbeelding zelf
  niet, alleen een boolean `getekend`.
- **Extern**: CSV-export (client-side, `components/ToolboxExport.tsx`) van naam, toolbox-titel,
  datum, getekend ja/nee, quizresultaat — geen audit_log-regel voor deze export (alleen individuele
  bewijs-/foto-downloads worden gelogd).
- **Bewaartermijn**: geen ingericht — bewust, dit is onveranderlijk trainingsbewijs.
- **Verwijderpad**: geen eigen verwijder-RPC; verdwijnt alleen als bijvangst van
  `toolbox_sessie_verwijderen` (hard `DELETE FROM toolbox_sessie`, cascadeert naar alle deelnames van
  díe sessie inclusief naam en handtekening). Bij verwijdering van de `personen`-rij zelf: `persoon_id
  → ON DELETE SET NULL` (migratie 0061, bevestigd nog actief) — naam/handtekening blijven dan gewoon
  staan, alleen de koppeling naar de persoon verdwijnt.

### incident
- **Persoonsgegevens**: naam_melder (vrije tekst, geen FK naar personen), functie_slachtoffer,
  telefonische_melding_aan.
- **Bijzonder persoonsgegeven**: **JA** — `medische_dienst_bezocht` ('ja'/'nee'/'onbekend') is
  gezondheidsgerelateerd; `functie_slachtoffer` is in de code expliciet gemarkeerd
  "Gevoelig (alleen KAM)" (`lib/incident.ts:51-53`).
- **Wie kan erbij**: twee lagen. (1) RLS-backstop op de tabel zelf: `mag_bedrijf_beheren` — een
  hypothetische directe tabel-select zou teamleider dus volledig buitensluiten. (2) De daadwerkelijke
  leesroute die de app gebruikt, RPC `incident_overzicht`, draait als SECURITY DEFINER en hanteert
  zelf een ruimere maar gemaskeerde regel: `mag_bedrijf_werken` (dus óók teamleider) mag de rest van
  het incident lezen, maar de twee gevoelige velden komen voor teamleider expliciet als `null` terug
  — echte SQL-maskering, geen UI-filter: `case when is_teamleider() then null else
  i.functie_slachtoffer end` / … `medische_dienst_bezocht end` (`db/schema.sql:3518-3519`, zelf tegen
  Git HEAD geverifieerd). Wijzigen van het gevoelige "deel 2" (incl. medische_dienst_bezocht) vereist
  wél `mag_bedrijf_beheren` — teamleider kan het dus niet lezen én niet zetten.
- **Extern**: foto's kunnen naar de `incident-foto`-bucket; geen AI-doorgifte (alleen
  inspectiefoto's gaan naar de AI-leverancier).
- **Aanmaken**: geen ingelogd aanmaakpad voor enige rol — een incident ontstaat uitsluitend via de
  publieke, tokenbeveiligde meldroute (`incident_melden_token`, `/melden/[token]`).
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: geen — geen `incident_verwijderen`-functie en geen DELETE-actie op deze tabel
  aangetroffen in de hele codebase. Bij bedrijfsverwijdering: `ON DELETE CASCADE`.

### incident_foto
- **Persoonsgegevens**: potentieel (een foto van een ongevalsituatie kan personen tonen) — niet
  inhoudelijk te beoordelen uit code.
- **Wie kan erbij**: RLS `mag_bedrijf_beheren` — **strenger dan de rest van hetzelfde incident**: een
  teamleider kan via `incident_overzicht` de (gemaskeerde) incidenttekst lezen maar niet de
  bijbehorende foto's downloaden.
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: geen — geen `incident_foto_verwijderen`-functie gevonden (in tegenstelling tot
  `inspectie_foto_verwijderen`, die wél bestaat). Cascade bij incident-delete is wel gedefinieerd,
  maar zonder bereikbaar incident-verwijderpad is dat theoretisch.

### inspectie / inspectie_foto / inspectie_ai_suggestie
- **Persoonsgegevens**: `inspectie.persoon_id` (uitvoerder); AI-gegenereerde beschrijvingen kunnen
  indirect personen op een foto beschrijven.
- **Wie kan erbij**: RLS `mag_bedrijf_werken` — admin, client/KAM ÉN teamleider, voor lezen én de
  meeste schrijfacties (starten/invullen/afronden/foto's/AI-analyse). Alleen het per-persoon
  inspectiedoel zetten vereist `mag_bedrijf_beheren`.
- **Extern**: **JA** — inspectiefoto's kunnen naar Groq (VS, buiten de EU) voor AI-analyse, zie Deel 2.
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: individuele foto — `inspectie_foto_verwijderen`, hard delete, maar geblokkeerd
  zolang de inspectie "bevroren" is (afgerond/geannuleerd). De inspectie zelf — geen verwijderpad
  gevonden. `inspectie_ai_suggestie` heeft geen eigen verwijderpad; verdwijnt alleen via cascade als
  de inspectie zelf verwijderd wordt, wat in de praktijk niet kan. Bij persoon-delete:
  `inspectie.persoon_id → ON DELETE SET NULL`.

### deellinks
- **Persoonsgegevens**: `persoon_id` (koppeling); het token zelf is een authenticatiemiddel zonder
  account, geen persoonsgegeven op zich.
- **Wie kan erbij**: lezen — eigen bedrijf/admin. Functioneel: wie de tokenwaarde heeft (ontvangen
  per e-mail) kan zonder account de gekoppelde acties van díe ene persoon zien/bewerken.
- **Token-generatie**: `gen_deellink_token()` = `encode(gen_random_bytes(18), 'hex')` — 144 bit
  cryptografisch random, niet raadbaar.
- **Extern**: de tokenwaarde gaat naar buiten via e-mail (Resend).
- **Bewaartermijn**: kolom `vervalt_op` bestaat maar wordt **niet uniform** gezet — één aanmaakpad
  zet 'm, een ander niet — en wordt alleen op leesmoment gecontroleerd ("is dit al verlopen?"); er is
  geen proces dat verlopen rijen daadwerkelijk opruimt.
- **Verwijderpad**: `intrek_deellink` is een **soft** intrek (`ingetrokken = true`), geen delete. De
  enige harde delete zit in `personen_samenvoegen`. Bij persoon-delete: `ON DELETE CASCADE` — hier
  verdwijnt de link dus wél volledig, in tegenstelling tot toolbox-bewijs.

### herinnering_log
- **Persoonsgegevens**: persoon_id, e-mail, acties (jsonb met actienummers/-onderwerpen).
- **Wie kan erbij**: `mag_bedrijf_beheren`.
- **Extern**: het e-mailadres hierin wordt gebruikt om te mailen (Resend).
- **Bewaartermijn**: **geen — groeit ongelimiteerd**, bevestigd geen opschoning (geen `pg_cron`, geen
  script) aangetroffen.
- **Verwijderpad**: geen. Bij persoon-delete: `ON DELETE CASCADE` — maar omdat personen vrijwel nooit
  hard verwijderd worden, blijft dit in de praktijk onbeperkt staan.

### persoon_merge_log
- **Persoonsgegevens**: doel_naam, bron_naam, verschoven (jsonb met verplaatste gegevens), wie.
- **Wie kan erbij**: `mag_bedrijf_beheren`.
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: geen. `doel_id` heeft geen FK-bescherming (kan na een latere verwijdering naar
  een niet meer bestaande uuid wijzen zonder dat de logregel zelf wordt opgeschoond).

### audit_log
- **Persoonsgegevens**: `wie` (uuid) en, aantoonbaar, persoonsgegevens in de vrije `detail`-jsonb
  (bewezen: naam + e-mail bij `persoon_verwijderd`; bestandsnamen bij downloads).
- **Wie kan erbij**: uitsluitend admin (`audit_log_admin_read`) — geen client/KAM, geen teamleider.
- **Bewaartermijn**: **structureel onmogelijk te beperken.** Triggers `audit_log_no_delete`,
  `audit_log_no_update`, `audit_log_no_truncate` (`db/schema.sql:6184-6186`, functie
  `audit_log_immutable()` op `db/schema.sql:1439`) blokkeren élke wijziging of verwijdering — expliciet
  óók voor de service-role. Geen FK naar `companies`, dus ook niet gekoppeld aan een
  bedrijfslevenscyclus.
- **Verwijderpad**: **geen, met opzet.** Dit is het scherpste AVG-spanningspunt in de hele inventaris:
  zodra een naam/e-mailadres eenmaal in `audit_log.detail` staat (bv. via de
  persoon-verwijder-logging hierboven), is er binnen de applicatie geen enkel technisch pad om dat
  gegeven weer te verwijderen. → OPENSTAAND.md.

### audit / audit_iso_observatie / audit_vca_bevinding / audit_verbeterpunt (VCA/ISO-auditmodule — niet te verwarren met audit_log)
- **Persoonsgegevens**: `gesproken_met`, `auditor`, `gericht_aan` (vrije tekst, namen).
- **Wie kan erbij**: `mag_bedrijf_beheren` voor lezen én alle mutaties — teamleider heeft **hier
  helemaal geen toegang** (page-gate én RLS beide `mag_bedrijf_beheren`, niet -werken).
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: sub-items (`audit_iso_observatie`, `audit_verbeterpunt`) hebben een hard-delete-
  RPC, geblokkeerd zolang de audit "bevroren" is. Voor het audit-record zelf en
  `audit_vca_bevinding` is geen verwijder-RPC gevonden.

### bewijs
- **Persoonsgegevens**: geupload_door, uploader_type (wie iets uploadde), bestandsnaam.
- **Wie kan erbij**: eigen bedrijf/admin.
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: `bewijs_verwijderen` is een **soft**-delete (zet `verwijderd_op`/`verwijderd_door`,
  géén `DELETE FROM`, zelf tegen Git HEAD geverifieerd). **ONBEKEND, UITZOEKEN**: of het
  onderliggende bestand in Storage hierbij ooit alsnog verwijderd wordt, of alleen de DB-rij
  gemarkeerd wordt terwijl het bestand blijft staan.

### fotos (RI&E-werkplekfoto's)
- **Persoonsgegevens**: potentieel, afhankelijk van foto-inhoud (werkplekfoto's kunnen personen tonen).
- **Bewaartermijn**: geen automatische opschoning gevonden. Heeft een `archived_at`-kolom, maar
  **ONBEKEND, UITZOEKEN** of/hoe deze rijen ooit hard verwijderd worden — geen `fotos_verwijderen`-RPC
  aangetroffen.

### rate_limiet_log
- **Persoonsgegevens**: `sleutel` bevat bij gastroutes `token:<deellink/meldlink-token>`, bij
  ingelogde routes `user:<uuid>` — een pseudoniem, geen ruwe naam/e-mail/IP, maar wel indirect tot
  een persoon herleidbaar.
- **Bewaartermijn**: **geen — groeit ongelimiteerd**, bevestigd geen opschoning.
- **Verwijderpad**: geen.

### pva_items
- **Persoonsgegevens**: `persoon_id` (verantwoordelijke), `verantw`/`updated_by` (vrije tekst, naam).
- **Wie kan erbij**: lezen — eigen bedrijf/admin. Toevoegen (losse actie) en beheer-mutaties
  (vrijgeven, terugsturen, doorgeven) — `mag_bedrijf_beheren`. Statuswijziging/opmerking bijwerken —
  `mag_bedrijf_werken` (dus ook teamleider).
- **Bewaartermijn**: geen ingericht.
- **Verwijderpad**: geen `pva_item_verwijderen`-RPC gevonden — een actiepunt zelf lijkt niet
  verwijderbaar te zijn (alleen de bijlagen via `bewijs_verwijderen`, en statuswijzigingen). Bij
  persoon-delete: `persoon_id → ON DELETE SET NULL`.

### companies (het bedrijf zelf)
- **Niet direct persoonsgegevens**, maar bepalend voor de reikwijdte van "recht op vergetelheid":
  vrijwel elke tabel hierboven heeft `company_id → companies(id) ON DELETE CASCADE`, dus het
  verwijderen van een bedrijf zou al zijn data in één klap wissen — ALS die route zou bestaan.
- **Verwijderpad**: **geen route/RPC gevonden die een `companies`-rij verwijdert.** Bovendien zou een
  poging dat sowieso laten vastlopen: `rie_versies.company_id → companies(id)` heeft géén
  `ON DELETE`-actie (dus RESTRICT, de Postgres-default) en `audit_log`/`rate_limiet_log` hebben
  helemaal geen FK naar `companies`. Een bedrijfsverwijdering is dus zowel niet gebouwd als, mocht hij
  ooit rechtstreeks op de database uitgevoerd worden, technisch problematisch.

---

## Deel 2 — Signed URLs, AI-fotodoorgifte, e-mail

### Signed URLs

| Bucket | Publiek? | Download-TTL | Upload-TTL | Audit-log bij gebruik? |
|---|---|---|---|---|
| `bewijs` | nee | 1 uur (`DOWNLOAD_GELDIGHEID_SEC`, `lib/bewijs.ts:11`) | vast, niet parametriseerbaar in deze code (`createSignedUploadUrl(pad)` zonder TTL-argument) — **ONBEKEND, UITZOEKEN** exacte Supabase-standaardwaarde | JA — actie `bewijs_gedownload`, bij elke download (beheerder én gast) |
| `incident-foto` | nee | 1 uur (zelfde constante) | idem | JA — actie `foto_gedownload` |
| `inspectie-foto` | nee | 1 uur voor gebruikersdownload; **60 seconden** voor de interne AI-aanroep (`app/api/inspectie/ai-analyse/route.ts:141`) | idem | JA voor gebruikersdownload; NEE voor de interne AI-signed-URL zelf (alleen het AI-resultaat wordt vastgelegd, niet de foto-ophaalactie) |
| `merk-assets` | **ja**, publiek leesbaar (logo/huisstijl, geen persoonsgegevens) | n.v.t. | n.v.t., admin-only upload via storage-policy | n.v.t. |
| toolbox-video (`app/tb/[token]/page.tsx`) | nee, aparte signed URL | **4 uur** (`VIDEO_GELDIGHEID_SEC`, regel 14) | n.v.t. | NEE — geen audit_log-regel voor het ophalen van de toolbox-video |

Alle drie de privé-buckets hebben storage-RLS die alleen een SELECT-policy kent (padprefix moet het
eigen `company_id` zijn, of admin) — er is géén INSERT/UPDATE/DELETE-storage-policy voor
authenticated gebruikers; alle uploads lopen dus verplicht via een server-gemint
`createSignedUploadUrl`, nooit via een rechtstreekse client-upload.

### AI-fotodoorgifte (uitsluitend inspecties)
- **Leverancier**: Groq — expliciet gemarkeerd `regio: 'buiten_eu'` in de code, met het commentaar
  "Groq draait in de VS, dus BUITEN de EU" (`lib/ai/groq.ts:8-11,29`).
- **Wat gaat erheen**: de foto als base64 + het MIME-type + de inspectiepunt-normtekst
  (`punt_tekst_snap`) — expliciet in de code gedocumenteerd als "geen persoonsgegeven"
  (`app/api/inspectie/ai-analyse/route.ts:126-127). Geen naam, geen bedrijfsnaam, geen metadata.
- **Opt-in**: verplicht, per foto, letterlijk `toestemming === true` vanaf de client — geen default,
  geen "onthoud mijn keuze". Zonder toestemming verlaat geen enkele byte de privé-bucket (volgorde
  vastgelegd in code-commentaar: login → toestemming → leverancier-check → pas dán de foto ophalen).
- **Wat komt terug**: beschrijving + bevindingen[] + acties[], opgeslagen als **concept** in
  `inspectie_ai_suggestie` (met leverancier, model en `toestemming_bevestigd` erbij vastgelegd). Een
  mens moet het concept apart bekrachtigen (`inspectie_ai_suggestie_besluit`) — het raakt nooit
  automatisch de echte bevinding.
- **Rate limit**: 60 analyses per uur per gebruiker — kostenbeheersing, geen privacymaatregel.

### E-mail (Resend)
- **Leverancier**: Resend, vast verzendadres `portaal@qhsetotaal.nl` op geverifieerd domein.
- **Wat gaat erheen, naar wie**: e-mailadres + naam van de ontvanger (actiehouder), bedrijfsnaam,
  actienummer/-onderwerp of een lijst openstaande acties, plus de deellink-URL mét het token erin.
  Gaat dus naar de eigen medewerker/actiehouder, met Resend als subverwerker.
- **Wachtwoord-reset** loopt NIET via Resend maar via Supabase Auth's eigen
  `resetPasswordForEmail` — **ONBEKEND, UITZOEKEN** welke mailinfrastructuur Supabase Auth zelf
  gebruikt (standaard Supabase-SMTP of eigen SMTP — niet vast te stellen zonder
  Management-API-toegang).
- **Nieuwe-accountmail** (signup-bevestiging/uitnodiging): zelfde beperking, loopt via Supabase Auth,
  geen app-code gevonden die dit zelf verstuurt.

---

## Deel 3 — Autorisatiematrix (IS-kant): rol × module × recht, zoals de code het nu afdwingt

Basis-RBAC: `is_admin()`, `is_teamleider()`, `mag_bedrijf_beheren()` = admin + client,
`mag_bedrijf_werken()` = admin + client + teamleider (`db/schema.sql:4563-4654`).
**Let op**: `app/[company_id]/layout.tsx` is géén hard toegangsgate — die bouwt alleen de
navigatie; elke pagina/RPC blokkeert (of niet) voor zichzelf. Vandaar dat de kolommen hieronder soms
per actie binnen dezelfde module verschillen.

| Module | Recht | Admin | Client | Teamleider | Bewijs |
|---|---|---|---|---|---|
| **PvA** | Lezen | ✅ | ✅ | ✅ | RLS `pva_select`: eigen bedrijf of admin |
| PvA | Toevoegen (losse actie) | ✅ | ✅ | ❌ | `actie_los_toevoegen` → `mag_bedrijf_beheren` |
| PvA | Wijzigen (status/opmerking) | ✅ | ✅ | ✅ | `actie_status_zetten` → `mag_bedrijf_werken` |
| PvA | Wijzigen (concept vrijgeven/terugsturen) | ✅ | ✅ | ❌ | `geef_actie_vrij`/`stuur_concept_terug`/`zet_concept_beheerder` → `mag_bedrijf_beheren` |
| PvA | Verwijderen | ❌ | ❌ | ❌ | Geen verwijder-RPC, geen DELETE-policy — voor niemand mogelijk |
| PvA | Bewijs lezen | ✅ | ✅ | ✅ | `bewijs_lijst` → `mag_bedrijf_werken` |
| PvA | Bewijs toevoegen/verwijderen | ✅ | ✅ | ❌ | `bewijs_registreren`/`bewijs_verwijderen` → `mag_bedrijf_beheren` |
| PvA | Actie doorgeven (mail) | ✅ | ✅ | ❌ | `actie_doorgeven` → `mag_bedrijf_beheren` |
| PvA | Exporteren | — | — | — | Geen CSV/PDF/export gevonden |
| **Actielijst** | Lezen/schrijven/exporteren | zie PvA | zie PvA | zie PvA | Zelfde RPC's als PvA; incident-join beperkt server-side tot niet-gevoelige velden |
| **Personen** | Pagina bekijken | ✅ | ✅ | ❌ | Page-gate blokkeert teamleider (`notFound()`) |
| Personen | RLS-tabeltoegang (lezen) | ✅ | ✅ | ⚠️ RLS sluit teamleider niet uit | `personen_select` checkt alleen bedrijf/admin, geen rolcheck — bescherming zit alleen in de pagina, dus een andere route die rechtstreeks van deze RLS leunt zou teamleider wél personendata kunnen geven |
| Personen | Toevoegen/wijzigen/(hard)verwijderen | ✅ | ✅ | ❌ | RLS `personen_write` (FOR ALL) → `mag_bedrijf_beheren` |
| Personen | Samenvoegen (enige hard-delete-pad) | ✅ | ❌ | ❌ | `persoon_merge_context`/`personen_samenvoegen` → strikt `is_admin()`, client expliciet uitgesloten |
| **Toolbox (sessies)** | Lezen/pagina | ✅ | ✅ | ✅ | Page-gate `mag_bedrijf_werken` |
| Toolbox | Sessie aanmaken/wijzigen/aanwezigheid | ✅ | ✅ | ✅ | → `mag_bedrijf_werken` |
| Toolbox | Sessie verwijderen | ✅ (alle) | ✅ (alle) | ⚠️ alleen eigen sessies | `toolbox_sessie_verwijderen` |
| Toolbox | Jaardoel zetten | ✅ | ✅ | ❌ | → `mag_bedrijf_beheren` |
| Toolbox | Centraal koppelen/uitzetten | ✅ | ❌ | ❌ | → `is_admin()` |
| Toolbox | **Handtekening individueel bewijs zien** | ✅ | ✅ | **✅, ongefilterd** | `toolbox_bewijs` → alleen `mag_bedrijf_werken`, geen aparte maskering (zie Deel 1) |
| Toolbox | CSV-export (UI-knop) | ✅ | ⚠️ geen knop in UI | ⚠️ geen knop in UI | UI-tab toont alleen bij `role === 'admin'`, maar de onderliggende RPC accepteert iedereen met `mag_bedrijf_werken` — client/teamleider kunnen dezelfde data via een directe RPC-aanroep ophalen, alleen zonder knop |
| Toolbox | PDF/print-overzicht | ✅ | ✅ | ✅ | Page-gate = alleen bedrijfsmatch, geen rolcheck; toont geen handtekeningbeeld, alleen boolean |
| **Inspecties** | Lezen/uitvoeren/foto's/AI-analyse | ✅ | ✅ | ✅ | → `mag_bedrijf_werken` |
| Inspecties | Doel per persoon zetten | ✅ | ✅ | ❌ | → `mag_bedrijf_beheren` |
| Inspecties | Verwijderen (hele inspectie) | ❌ | ❌ | ❌ | Geen verwijder-RPC gevonden |
| Inspecties | Rapport bekijken/printen | ✅ | ✅ | ✅ | Export = `window.print()`, geen apart bestand |
| **Incidenten** | Lezen (algemeen, gemaskeerd) | ✅ | ✅ | ✅ (gemaskeerd) | `incident_overzicht` → `mag_bedrijf_werken`, met SQL-maskering van de twee gevoelige velden voor teamleider |
| Incidenten | Bijzondere gezondheidsvelden zien | ✅ | ✅ | **❌, server-side genald** | Zie Deel 1 |
| Incidenten | Wijzigen niet-medisch (oorzaken) | ✅ | ✅ | ✅ | `incident_oorzaak_opslaan` → `mag_bedrijf_werken`, nult medische velden expliciet |
| Incidenten | Wijzigen incl. medisch ("deel 2") | ✅ | ✅ | ❌ | → `mag_bedrijf_beheren` |
| Incidenten | Foto's downloaden | ✅ | ✅ | ❌ | RLS `mag_bedrijf_beheren` — strenger dan de rest van hetzelfde incident |
| Incidenten | Aanmaken (ingelogd) | n.v.t. | n.v.t. | n.v.t. | Alleen via publieke tokenroute, geen enkele rol heeft een eigen aanmaakknop |
| Incidenten | Verwijderen/exporteren | ❌/— | ❌/— | ❌/— | Geen delete-RPC, geen export gevonden |
| **Audits (VCA/ISO)** | Alles | ✅ | ✅ | **❌, ook RLS** | Page-gate én RLS beide `mag_bedrijf_beheren` — teamleider heeft hier geen enkele toegang |
| **Dashboard** (bedrijf + bedrijfsvoering) | Lezen/wijzigen | ✅ | ✅ | ❌ | Page-gate + RPC's → `mag_bedrijf_beheren` |
| **Modules-beheer** | Lezen/wijzigen | ✅ | ✅ | ❌ | → `mag_bedrijf_beheren` |
| **RI&E** | Lezen/werken | ✅ | ✅ | ✅ | Page-gate alleen bedrijfsmatch; RPC → `mag_bedrijf_werken` |
| **Admin** (huisstijl/bibliotheek/toolboxen) | Alles | ✅ (uitsluitend) | ❌ | ❌ | Elke pagina/RPC: strikt `is_admin()` |

### Losse bevindingen bij de matrix
1. **Server-side maskering van gezondheidsvelden bij incidenten is correct geïmplementeerd** — een
   echte SQL-`CASE WHEN`, geen UI-filter (Deel 1). Positieve bevinding.
2. **Handtekening in toolbox-bewijs is NIET op dezelfde manier gemaskeerd** — teamleider ziet de
   handtekeningafbeelding van elke deelnemer in zijn bedrijf. Mogelijk bewust (teamleider begeleidt de
   toolbox en moet kunnen aantonen wie tekende), mogelijk een gat — geen ontwerpbeslissing hierover
   teruggevonden. → OPENSTAAND.md.
3. **Incident-foto's zijn strenger afgeschermd dan de rest van hetzelfde incident** — teamleider kan
   de (gemaskeerde) tekst lezen maar niet de foto's.
4. **Export-tab voor toolbox-CSV is alleen UI-gating** — de onderliggende RPC is voor iedereen met
   `mag_bedrijf_werken` bereikbaar, ook zonder zichtbare knop. Blijft wel beperkt tot het eigen
   bedrijf.
5. **Geen verwijdermogelijkheid voor pva-acties, incidenten, inspecties, audits** — alleen cascade
   bij (een niet-bestaand) bedrijfsverwijderpad. Onbekend of dit een bewuste keuze is
   (bewijswaarde/audit-trail) of een gat.
6. **Personen: RLS staat teamleider leestoegang toe, de pagina blokkeert het alsnog** — consistent in
   de huidige app, maar betekent dat een toekomstige route die rechtstreeks van deze RLS-policy leunt
   (in plaats van de page-gate) personendata aan teamleider zou tonen.

---

## Deel 4 — Samenvatting van de belangrijkste openstaande AVG-vragen

Zie `audit/2026-09-04/OPENSTAAND.md` voor de formele lijst met aanbevolen richting. Kernpunten die
uit deze inventaris komen:

1. `audit_log` is per ontwerp onverwijderbaar (triggers blokkeren zelfs service-role) en bevat
   aantoonbaar namen/e-mailadressen — botst met een eventueel "recht op vergetelheid"-verzoek.
2. Geen enkele tabel heeft een automatische bewaartermijn; `herinnering_log`, `rate_limiet_log` en
   verlopen `deellinks` groeien ongelimiteerd door.
3. Er bestaat geen end-to-end "verwijder deze medewerker volledig"-pad. Het enige hard-delete-pad op
   `personen` (via `personen_samenvoegen`) is bedoeld voor dubbele records, niet voor AVG-verzoeken,
   en laat toolbox-bewijs met naam+handtekening bewust staan.
4. Voor `incident`, `incident_foto`, `inspectie`, `audit` (VCA/ISO) en `pva_items` bestaat geen
   verwijder-RPC — onbekend of dat bewust is (bewijswaarde) of een gat.
5. Er bestaat geen route om een `companies`-rij te verwijderen — en zou die er komen, zou hij
   vastlopen op `rie_versies` (geen ON DELETE-actie) en wezen achterlaten in `audit_log`/
   `rate_limiet_log` (geen FK naar companies).
6. Handtekening in toolbox-bewijs is voor teamleider zichtbaar zonder maskering, in tegenstelling tot
   de bewust gemaskeerde gezondheidsvelden bij incidenten — inconsistent beschermingsniveau tussen
   twee vergelijkbare categorieën gevoelige persoonsgegevens.
