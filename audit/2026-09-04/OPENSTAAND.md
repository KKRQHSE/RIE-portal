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

## 2. KRITIEK — Open redirect in `app/auth/callback/route.ts` (auth-infra, niet gefixt)

**Bron:** gevonden door sessie `rie-portal-0c` (parallel, op `main`, commit `912c073`,
`SYSTEEMDOORLICHTING_APPLICATIEBEVEILIGING_2026-09-04.md` + bewijsbestand
`audit/2026-09-04/applicatiebeveiliging_open_redirect_callback.txt`). Onafhankelijk door mij
geverifieerd (zie hieronder) — dezelfde uitkomst, andere sessie, andere aanroep.

**Waar precies:** `app/auth/callback/route.ts:20-21` (geverifieerd op deze branch,
`fix/audit-restpunten`, ongewijzigd t.o.v. `main` — dit bestand is door niemand vanavond
aangeraakt):
```ts
if (next) {
  return NextResponse.redirect(`${origin}${next}`)
}
```
`next` komt rechtstreeks uit `searchParams.get('next')` (regel 7) — **volledig ongevalideerd**, geen
allowlist, geen padcontrole, direct de query-string van de aanvrager.

**Het misbruikscenario, precies:** `${origin}${next}` is stringconcatenatie, geen padjoin. Met
`next` beginnend op `@` leest de WHATWG-URL-parser (dezelfde parser die elke browser gebruikt) de
hele string vóór het volgende `/` als **userinfo@host**, niet als pad. Dus
`https://portal.nl` + `@evil.com/phish` wordt geparsed als de URL
`https://portal.nl@evil.com/phish`, met **host `evil.com`**, `portal.nl` gedegradeerd tot een
(genegeerd) gebruikersnaamdeel. Dit is precies de klassieke RFC-3986-`userinfo@host`-truc.

**Reproductiepad (niet live geëxploiteerd — vereist een echte magic-link/reset-code):**
`GET /auth/callback?code=<geldige-code>&next=@evil.com/phish` → na een succesvolle
`exchangeCodeForSession(code)` (dus ná een ECHTE, geldige login-/reset-code) redirect de route naar
`https://evil.com/phish` in plaats van het eigen domein.

**Waarom dit gevaarlijk is, specifiek:** de `code`-parameter is een eenmalig geldig, door Supabase
zelf verstuurd token (uit een wachtwoord-reset-mail of uitnodigingsmail) — de aanvaller heeft dus
altijd een **link met het eigen, vertrouwde domein als host** (`https://portal.nl/auth/callback?
code=...&next=@evil.com/...`), die na het klikken alsnog naar `evil.com` doorstuurt. Dat is precies
het patroon dat phishing-detectie (en een oplettend slachtoffer dat de link-preview checkt) omzeilt:
de zichtbare/preview-URL is legitiem, de uiteindelijke bestemming niet. In combinatie met een
geoogste reset-/uitnodigingslink (bv. via een afgevangen e-mail, of een slachtoffer dat zelf een
reset aanvraagt en de link doorstuurt) kan dit gebruikt worden om een neplogin-/nep-
wachtwoordpagina te tonen op een domein dat de aanvaller controleert, vlak na een schijnbaar
legitieme klik.

**Wat het NIET is:** geen directe account-overname of datatoegang op zichzelf — de sessie/cookie
van het slachtoffer wordt niet gestolen door deze bug alleen; het is een **phishing-versterker**,
geen privilege-escalatie. Vandaar P2/P3 (niet P0/P1, die zijn voorbehouden aan de al-gefixte
3.1/3.2/4.4).

**Mogelijk (deels) al afgevangen, niet vast te stellen:** Supabase Auth heeft een eigen "Redirect
URLs"-allowlist-instelling op projectniveau; als `next` daar (indirect) tegenaan geverifieerd wordt
zou dit al gedeeltelijk dicht kunnen zitten — **NIET VAST TE STELLEN** zonder een
Management-API-token (zelfde beperking als eerder gedocumenteerd voor confirm-email/invite-
instellingen).

**Voorgestelde fix-richting (niet doorgevoerd — dit raakt authenticatie-infra):**
- Optie A: valideer dat `next` met exact één `/` begint en geen `@`, `://`, `\` of een tweede `/`
  direct erna bevat, vóór 'm in de redirect te gebruiken.
- Optie B (robuuster): vervang vrije tekst door een vaste allowlist van toegestane
  vervolgpaden (`/set-wachtwoord`, `/dashboard`, eventueel `/[company_id]/pva` met een
  eigen validatie) — dan is er nooit een vrij te kiezen host mogelijk, ongeacht toekomstige
  parsing-trucjes.

**Waarom ik dit niet zelf fix:** raakt de login-/wachtwoordreset-/uitnodigingsflow (authenticatie-
infra) — expliciet buiten mijn mandaat vanavond (Regel 1: "iets dat authenticatie-... infra raakt:
bouw NIETS"). Dit is een businesskeuze over welke fix-richting (A of B) en wanneer, niet een
technisch dilemma.

*(Ondertussen door sessie rie-portal-0c gefixt op `main`, commit `8e3ec24`: `next` wordt nu
gevalideerd als eigen relatief pad. Dit item blijft hier staan als afgesloten bewijsstuk van de
bevinding zelf, niet als openstaande actie.)*

---

## 3. Open onderzoeksvraag — waarom negeert Supabase `ALTER DEFAULT PRIVILEGES ... REVOKE
   EXECUTE ON FUNCTIONS FROM PUBLIC`?

**Wat er is vastgesteld (hard, live getest, 5 sept 2026):** het door de Postgres-documentatie
voorgeschreven standaardpatroon om te voorkomen dat elke nieuwe functie in `public` standaard
`EXECUTE` krijgt voor `PUBLIC` (en dus impliciet ook `anon`) — `ALTER DEFAULT PRIVILEGES IN SCHEMA
public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` — heeft in dit Supabase-project **geen
waarneembaar effect**. Getest in vier varianten (impliciete rol, `FROM anon`, `FROM public`,
expliciet `FOR ROLE postgres`, en atomisch binnen dezelfde transactie als een proef-
`CREATE FUNCTION`) — zie migratie `supabase/migrations/0070_default_acl_geen_anon_execute.sql` en
memory `default-acl-werkt-niet` voor de volledige reproductie. `pg_default_acl` zelf toont wél de
gewenste, aangepaste lijst — maar een nieuwe functie krijgt de PUBLIC-grant toch, via een
mechanisme dat niet met SQL-introspectie te achterhalen was.

**Niet uitgezocht (bewust, op jouw verzoek):** *waarom* Supabase's postgres-omgeving dit negeert.
Vermoeden, niet bevestigd: iets hardcoded in hun eigen postgres-image/provisioning, mogelijk een
event-trigger of extensie die buiten `pg_event_trigger`/`pg_default_acl` om werkt (de zes bestaande
event-triggers zijn nagelopen en zijn het niet — alleen PostgREST-schema-reload-notificaties en
extensie-specifieke grants voor pg_cron/pg_net/pg_graphql).

**Aanbevolen richting, als je dit ooit wilt uitzoeken:** Supabase-documentatie/support raadplegen,
of vergelijken met een vers, leeg Supabase-project (zonder deze 60+ migraties historie) om te zien
of het daar hetzelfde gedrag vertoont — dat zou uitsluiten dat het aan iets project-specifieks ligt.

**Praktisch gevolg, nu al opgelost:** omdat de database-laag dit niet structureel afdwingt, is
`scripts/anon_execute_audit_test.mjs` (met een pre-push-hook, zie `scripts/hooks/pre-push` en
AGENTS.md) het enige werkende vangnet — dat staat nu, dit onderzoekspunt is puur nieuwsgierigheid
naar de onderliggende oorzaak, geen openstaand risico.

---
