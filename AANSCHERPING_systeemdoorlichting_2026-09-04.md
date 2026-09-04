# Aanscherping systeemdoorlichting RI&E-portaal — vervolgopdracht

Gecombineerde en ontdubbelde feedback uit drie kritische lezingen van het rapport van
4 september 2026. Twee delen: eerst fixen, dan ronde 2. De doorlichting zelf is sterk
(strikte scheiding BEWEZEN/AANGENOMEN, twee live bewezen exploits). Wat volgt zijn de
zwakke plekken, overstatements en ontbrekende categorieën.

---

## Deel A — Fix dit eerst, vóór verdere audit

### P0 — Signup privilege-escalatie (bevinding 3.1/3.2)
Enige gat waarmee een buitenstaander met alleen de publieke anon-key tot admin- of
KAM-toegang komt. Prioriteit is uren/dagen, niet "bewuste review op termijn".

Fix-richting:
- `handle_new_user`: negeer `role` en `company_id` uit `raw_user_meta_data` volledig.
  Altijd `role='client'`, `company_id=NULL`. Rol en bedrijfskoppeling uitsluitend via een
  geautoriseerd pad (admin-API of RPC met `is_admin()`-check).
- Schakel publieke e-mail-signup uit in Supabase Auth als die niet nodig is. Bevestig
  eerst verifieerbaar (config/codepad, niet "memory") of accounts alleen via de admin-API
  worden aangemaakt.
- Bewijs de fix na afloop: opnieuw `/auth/v1/signup` met `data.role=admin` en met een echt
  `company_id`, en verifieer dat de resulterende `users`-rij `client`/`NULL` is.

### P1 — Cascade-delete toolbox-bewijs (bevinding 4.4)
Elke client kan ondertekend aanwezigheidsbewijs spoorloos vernietigen door de gekoppelde
persoon direct te verwijderen. Compliance-impact (VCA/ISO/toolbox), beperkt tot eigen bedrijf.

Fix-richting, kies één:
- FK `toolbox_deelname.persoon_id` naar `ON DELETE SET NULL` (zoals `inspectie.persoon_id`), of
- `personen`-DELETE uit de client-`ALL`-policy halen en alleen toestaan via een gelogde RPC.

Verifieer daarna: client kan de persoon niet meer hard-deleten zonder spoor, en het
bewijsstuk overleeft.

### P2 — Heartbeat dood (1.2)
Fix de service-role vs `mag_bedrijf_beheren`-mismatch. Laat de route de fout niet stil
wegslikken: log en tel mislukte verzendingen, maak het zichtbaar. Lager risico, maar het
illustreert precies waarom logging (ronde 2, punt 11) nodig is.

---

## Deel B — Rapportcorrecties (goedkoop, meteen door te voeren)

1. **Bewijsstatus klopt intern niet.** Je definieert BEWEZEN als "query echt uitgevoerd,
   ruwe uitkomst hieronder", maar labelt 2.1 en 2.2 als "BEWEZEN (code-inspectie)". Dat is
   geen BEWEZEN volgens je eigen definitie. Gebruik vier statussen:
   BEWEZEN / CODE BEVESTIGD / AANGENOMEN / NIET GETEST.
2. **Nummering consistent maken.** De matrix gebruikt R6/R7/D4/F3/G1-G3/S1-S3, de tekst
   gebruikt 1.2/3.1/4.4. Koppel beide met een sleutel of haal de letters weg. Nu lijkt het
   alsof er controles ontbreken.
3. **"memory bevestigt" eruit.** Een onafhankelijke lezer kan "memory" niet controleren.
   Vervang door een verifieerbare bron (configbestand, codepad, bevestiging opdrachtgever
   met datum) of schrap de zin.
4. **Toon de na-opruim-query.** Je claimt "geverifieerd met een na-query dat er niets
   resteert" maar laat die query en de lege uitkomst niet zien. Inconsequent voor een
   rapport dat op bewijs hamert.
5. **Schrap "eenvoudig giswerk" bij company_id (3.2).** Een UUID is niet te gissen. Lek via
   URL, log, screenshot of gedeelde link is al genoeg. De formulering is niet nodig.
6. **Maak expliciet dat 3.1 3.2 overbodig maakt.** Wie zichzelf admin maakt heeft geen
   company_id nodig; een admin kan alle bedrijven benaderen. Nu staan isolatie en
   privilege-escalatie te gescheiden.
7. **Hoofdvraag "werkt alles?" nuanceren.** Zolang UI/E2E niet getest is, is het antwoord
   "niet volledig vastgesteld", niet "alles werkt". Groene DB + testsuite dekt happy-path
   en isolatie, niet de UI-laag.
8. **Reproduceerbaarheid vastleggen.** `git status clean` zegt niet wélke versie is
   doorgelicht. Vermeld git commit SHA, migratieversie, Supabase project/env, Node- en
   npm-versie, datum/tijd. Bewaar ruwe output, gebruikte queries en resultaten
   (gesaniteerd) in `audit/2026-09-04/`, niet alleen in lokale scratchpads.

---

## Deel C — Ronde 2, dit moet nog getest worden (geprioriteerd)

### Must vóór een veiligheidskundige eindconclusie

1. **Signup end-to-end.** HTTP 200 + een adminrij in `public.users` bewijst de injectie,
   niet dat de aanvaller kan handelen. Doe: signup als admin, authenticeer, verkrijg JWT,
   voer één admin-only read uit, leg vast, verwijder account. Check ook de actuele
   Auth-config: publieke signup aan/uit, confirm-email aan/uit, invite-instellingen. Bij
   verplichte e-mailbevestiging ligt de exploiteerbaarheid anders.

2. **Historische misbruiksporen (verplicht na een auth-bug).** Query alle bestaande
   auth-users op: aanmaakdatum, `raw_user_meta_data`, admins buiten het verwachte proces,
   users zonder normale onboarding, wijzigingen in role/company, Auth-logs indien
   beschikbaar. Twee admins en negen clients tellen sluit historisch misbruik niet uit.

3. **Normatieve autorisatiematrix (grootste inhoudelijke gat).** Je bewijst dat de software
   doet wat de code zegt, niet dat de code klopt met wat mag. Leg een gewenst model naast
   de implementatie: rol → module → lezen / toevoegen / wijzigen / verwijderen / exporteren
   / bijzondere persoonsgegevens. Laat de business dit bevestigen. Vooral bij incidenten
   met gezondheidsgegevens: mag een client die echt allemaal zien en exporteren?
   Cross-tenant isolatie kan perfect zijn terwijl binnen één tenant de toegang te breed is.

4. **API-routes systematisch.** De build genereert 40 routes; je hebt 18 pagina's gegate't
   en een handvol API-routes gelezen. De rest is een blinde vlek. Maak een volledige
   inventaris `/api/*`, per route: auth vereist / rolcheck / companycheck / service-client
   ja-nee / user-controlled company_id / inputvalidatie / rate limiting / publiek ja-nee.
   Service-role routes zijn kritiek: daar valt RLS weg en zit de autorisatie in de route
   zelf. De publieke paden uit middleware (heartbeat, gast-upload, gast-download,
   incident-foto-upload) apart aanvallen.

5. **Token-flows van AANGENOMEN naar BEWEZEN.** `app/a/[token]` en `app/melden/[token]`,
   inclusief de RPC-bodies (`incident_meldcontext_token` is niet eens ingezien). Test:
   verlopen / ingetrokken / ongeldig / ander-bedrijf-token / hergebruik / brute-forcebaarheid
   / token-entropie / toegang na archiveren of verwijderen / welke data lekt zonder auth.
   Publieke tokens verdienen dit vóór een eindoordeel.

6. **Alle FK ON DELETE-acties uitdraaien.** Je hebt bewezen dat één onverwachte CASCADE
   bewijs vernietigt. De vraag is niet of dit de enige was. Draai alle foreign keys uit,
   filter op CASCADE naar historische, juridische of bewijs-gerelateerde data. Controleer
   ook of er al productiedata verloren is via 4.4 (orphaned of ontbrekende bewijsstukken).

7. **Backup / PITR / restore-test.** Bepaalt hoe erg 4.4 en elke andere destructieve bug
   werkelijk is. Draait point-in-time recovery, en is een restore ooit echt getest? Nu niet
   genoemd.

### Should

8. **Browser-E2E smoke test per hoofdmodule per rol.** Groene DB + testsuite zegt niets
   over een verkeerd gekoppelde knop, een formulier dat niet submit, een stil ingeslikte
   fout, mobile-layout, of verkeerde feedback na een geslaagde mutatie.

9. **Bredere applicatielaag-security.** Hoofdstuk Beveiliging leest nu als volledig terwijl
   het alleen RLS/RPC/tenants/DB-integriteit dekt. Benoem minstens wat wel en niet is
   onderzocht: XSS, CSRF, security headers en CSP, cookie-instellingen, session-lifecycle,
   password-reset-flow, rate limiting op login/signup, upload-validatie (bestandstype,
   -grootte, onveilige content), dependency-vulnerabilities, secret- en
   service-role-key-exposure, persoonsgegevens in serverlogs, SECURITY DEFINER functies met
   veilige `search_path`.

10. **AVG/privacy als aparte toets.** Systeem bevat gezondheidsgegevens (incidenten) en
    handtekeningen. Eén AI-opt-in-check dekt dat niet. Kijk naar dataminimalisatie,
    bewaartermijnen, verwijderbeleid en -recht, logging van inzage, AI-doorgifte en
    subverwerkers, foto-verwijdering, TTL van signed URLs, rechten van betrokkenen.

11. **Audit logging en monitoring als categorie.** Wie logde in, bekeek of exporteerde
    data, verwijderde personen, wijzigde rollen, downloadde bewijs, wijzigde incidenten,
    welke serverfouten traden op. De dode heartbeat laat zien waarom: een fout die stil
    wordt weggevangen, blijft maanden ogenschijnlijk werken. Zonder logging merk je dat niet.

### Klein / housekeeping

- **Kolomnaam-inconsistentie.** 3.6 checkt `toestemming_bevestigd`, de RPC eist
  `p_toestemming`. Zelfde kolom of praat je langs de zaak heen? Verifieer.
- **pg_policies systematisch uitlezen.** 4.4 (brede `ALL`-policy op `personen`) kwam als
  toevallige vondst. Draai per tabel per command uit welke een ruime ALL/INSERT/UPDATE-policy
  hebben. Maak het resultaat van een methode, niet van toeval.
- **Vergeten testbedrijven** (`MEET_...`, `ONVTEST_...`). Hangen daar ook test-users of
  -personen aan? Eén query (`users`/`personen` waar `company_id in (...)`). Beslis daarna
  over opruimen.

---

## Volgorde

Fix P0 met spoed, dan P1, pas daarna verfijnen. Ronde-2-tests 1 t/m 7 zijn must vóór je een
uitspraak als "het portaal is veilig, integer en werkt zoals bedoeld" kunt onderbouwen. Tot
die tijd is de juiste conclusie: sterke database-, autorisatie- en integriteitsdoorlichting
die twee kritieke gaten overtuigend blootlegt, geen volledige systeemgoedkeuring.
