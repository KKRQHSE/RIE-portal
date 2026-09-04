# Systeemdoorlichting RI&E-portaal — bredere applicatiebeveiliging — 4 september 2026

Aanvulling op `SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md`, should-punt 9. Die ronde liet cookie-
instellingen, session-lifecycle, password-reset-flow, XSS en CSRF expliciet als **NIET GETEST**
staan (tijdgebrek). Dit document vult precies dat gat — puur onderzoek, geen fixes, geen echte
accounts/e-mails aangeraakt. Uitgevoerd naast (niet in plaats van) het lopende vervolgwerk op
`fix/audit-restpunten` — zie coördinatie onderaan.

**Reproduceerbaarheid.** Git-commit bij afronding: zie `git log -1` op het moment van committen
van dit bestand. Supabase-project/Node/npm-versie: ongewijzigd t.o.v. ronde 1/2.
Oordeel-definities: BEWEZEN / CODE BEVESTIGD / AANGENOMEN / NIET GETEST, zoals
`SYSTEEMDOORLICHTING_2026-09-04.md`. Ruwe evidence in `audit/2026-09-04/applicatiebeveiliging_*`.

---

## 1. Cookie-instellingen — CODE BEVESTIGD

Geen van de drie plekken die de Supabase-sessiecookie zetten (`lib/supabase/server.ts`,
`lib/supabase/client.ts`, `proxy.ts`) geeft eigen `cookieOptions` mee — dus gelden de defaults uit
`@supabase/ssr` ongewijzigd (bron: `node_modules/@supabase/ssr/dist/main/utils/constants.js`,
zie `audit/2026-09-04/applicatiebeveiliging_cookie_defaults.txt`):

```
path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 dagen
```

- **`httpOnly: false` is geen bug** — dit is bewuste Supabase-SSR-architectuur: de browser-client
  moet de sessie zelf kunnen lezen om `Authorization`-headers naar Supabase te zetten. Wel betekent
  het dat een succesvolle XSS (zie §4) de sessie zou kunnen stelen; met `httpOnly` had dat niet
  gekund. Een architecturale afweging, geen losstaand gat.
- **Geen expliciete `Secure`-attribuut.** Op een HTTPS-only deployment (Vercel, aannemelijk maar
  niet vanuit code te verifiëren) is het praktische risico beperkt, maar de cookie zelf sluit
  verzending over plain-HTTP niet expliciet uit. Samen met de al gedocumenteerde afwezigheid van
  HSTS (ronde 2, should-punt 9) is er geen enkele in-code garantie dat de sessiecookie nooit
  onversleuteld over de lijn gaat.
- `maxAge` (400 dagen) is de **cookie**-levensduur, niet de sessie/JWT-geldigheid: `proxy.ts` ververst
  de sessie op elke request (`supabase.auth.getUser()`), dus een sliding-window-sessie die in de
  praktijk nooit verloopt zolang de gebruiker de app periodiek opent. De onderliggende JWT-/
  refresh-token-expiry zijn Supabase-projectinstellingen — **NIET VAST TE STELLEN** vanuit hier
  (zelfde beperking als de Auth-config in ronde 2, punt 1: geen Management-API-token beschikbaar).

## 2. Session-lifecycle — CODE BEVESTIGD

- **Refresh:** elke request ververst de sessie via de proxy (`proxy.ts:53`, commentaar bevestigt dit
  bewust: "voorkomt willekeurig uitloggen").
- **Logout is een echte server-side revocatie, niet alleen cookies wissen.** `LogoutButton.tsx` roept
  `supabase.auth.signOut()` aan **zonder** `scope`-optie. In `@supabase/auth-js` is de default
  `scope: 'global'` (bron + volledig citaat: `audit/2026-09-04/applicatiebeveiliging_signout_scope.txt`)
  — dat trekt de refresh-token server-side in op **alle** apparaten, niet alleen de huidige sessie.
  Positieve bevinding.
- **Geen applicatie-eigen inactiviteitstimeout** los van wat Supabase zelf als refresh-token-expiry
  hanteert — **NIET VAST TE STELLEN** vanuit code (zelfde Management-API-beperking).

## 3. Password-reset-flow — CODE BEVESTIGD, één nieuw gevonden gat

`app/reset-wachtwoord/page.tsx` → `app/auth/callback/route.ts` → `app/set-wachtwoord/page.tsx`:

- **Geen e-mail-enumeratie**: de UI-boodschap na het versturen ("Als dit e-mailadres bekend is...")
  onthult niet of het adres bestaat. Goed.
- Client-side minimaal 8 tekens; een eventueel server-side wachtwoordbeleid is een
  Supabase-Auth-projectinstelling — **NIET VAST TE STELLEN**.
- Rate limiting op reset-aanvragen: geen applicatie-eigen limiet gevonden (consistent met ronde 2's
  bredere "rate limiting overal afwezig"-bevinding); Supabase's eigen platform-rate-limit op de
  Auth-endpoints is niet vanuit hier te verifiëren.

**Nieuw gevonden — open redirect in `app/auth/callback/route.ts:20-21`** (niet eerder gemeld in
ronde 1/2):

```ts
if (next) {
  return NextResponse.redirect(`${origin}${next}`)
}
```

`next` komt ongevalideerd uit de query-string. **BEWEZEN** (echt met Node's URL-parser getest —
dezelfde WHATWG-parser als browsers gebruiken, zie
`audit/2026-09-04/applicatiebeveiliging_open_redirect_callback.txt`): een waarde als
`next=@evil.com/pad` maakt van `${origin}${next}` een geldige URL met **host `evil.com`**, niet het
eigen domein — een klassiek `userinfo@host`-URL-parsing-trucje (RFC 3986). `next=//evil.com` bleek
juist **wél** veilig (blijft op eigen origin).

Reproductie: `GET /auth/callback?code=<geldige-code>&next=@evil.com/phish` → redirect naar
`https://evil.com/phish`. **Niet live geëxploiteerd**: vereist een geldige `code` uit een echte
magic-link/reset-mail, en dat is in dit onderzoek niet aangevraagd op een bestaand account. Mogelijk
(deels) afgevangen door Supabase's eigen "Redirect URLs"-allowlist in de Auth-projectinstellingen —
**NIET VAST TE STELLEN** vanuit hier (geen Management-API-token, zelfde beperking als eerder).

**Ernst-inschatting:** een open redirect, geen directe account-/data-compromittering — bruikbaar voor
phishing ("klik deze link op het legitieme domein, kom uit bij een nagemaakte inlogpagina").
Waarschijnlijk **P2/P3**, niet P0/P1 (die zijn voorbehouden aan directe privilege-escalatie/
data-toegang, zoals de al gefixte 3.1/3.2/4.4). Conform de opdracht: niet gefixt, alleen
gedocumenteerd. **Voorgestelde fix (voor wie beslist):** valideer dat `next` met exact één `/`
begint en geen `@`, `://` of backslash bevat, óf vervang door een vaste allowlist van toegestane
vervolgpaden (`/set-wachtwoord`, `/dashboard`) in plaats van vrije tekst.

## 4. XSS — grotendeels CODE BEVESTIGD afwezig, twee kanttekeningen

- **`dangerouslySetInnerHTML`: 0 treffers in de hele codebase** (grep over alle `.ts`/`.tsx`,
  inclusief `app/`, `components/`, `lib/`). React's standaard JSX-escaping dekt dus alle
  tekstweergave. Dit is de sterkste, meest generieke XSS-bescherming en staat overal aan.
- **`toolbox_bron_opslaan`** (de "onderwerpenbibliotheek"-links, `db/schema.sql`) valideert al
  `btrim(p_url) not like 'https://%'` → weigert alles behalve `https://`-URL's. Een `javascript:`-URI
  kan hier dus niet doorheen. Goed, al eerder zo gebouwd.
- **Kanttekening (klein, admin-only):** `toolbox_lokaal_aanpassen` (alleen `is_admin()`, dus niet
  door een klant/teamleider aan te roepen) valideert `p_lokale_video_url` **niet** op schema — geen
  `https://`-eis zoals bij `toolbox_bron_opslaan`. Gerenderd als kaal `<a href={open.video_url}>` in
  `ToolboxGastClient.tsx`. Een `javascript:`-URI zou hier in theorie doorheen kunnen, maar vereist een
  kwaadwillende of gecompromitteerde **admin**-account (niet klant-input) — laag risico, wel een
  kleine inconsistentie t.o.v. de wél gevalideerde bron-links. Housekeeping-niveau, geen P0-P2.
- **Niet onderzocht:** een systematische scan van élk veld dat ooit als `href`/`src` in vrije tekst
  terechtkomt (buiten de steekproef hierboven) — tijdgebrek, aanbevolen vervolgstap indien gewenst.

## 5. CSRF — AANGENOMEN (redenering + CODE BEVESTIGD bouwstenen, niet live tegen een echte
cross-site request getest)

- **SameSite=lax** (CODE BEVESTIGD, zie §1) op de sessiecookie geeft in moderne browsers
  (Chrome/Firefox, huidige implementatie) praktische bescherming: Lax-cookies worden **niet**
  meegestuurd bij cross-site `fetch`/`XHR`/formulier-POST vanaf een ander domein, alleen bij
  top-level GET-navigatie. Dat dekt de klassieke cross-site-POST-CSRF tegen de eigen `/api/*`-routes,
  die wél op ditzelfde domein draaien en op de sessiecookie leunen.
- **Mutaties naar Supabase zelf** (RPC's via de browser-client) gaan naar een **ander domein**
  (`*.supabase.co`) met een `Authorization`-header die de browser-client zelf uit de cookie leest en
  toevoegt — niet een automatisch meegestuurde cookie. Cross-origin cookies worden sowieso niet
  automatisch naar dat andere domein gestuurd, dus klassieke cookie-CSRF is daar structureel niet van
  toepassing, los van SameSite.
- Geen apart CSRF-token-mechanisme aanwezig — gezien de twee punten hierboven vermoedelijk niet
  nodig, maar dit is een **aanname op basis van architectuur + browserspec**, geen uitgevoerde
  aanval vanaf een echt ander domein. Zou met een headless-browser-test (should-punt 8, al eerder
  als ontbrekend gemeld) definitief te bewijzen zijn.

---

## Samenvatting — nieuw t.o.v. ronde 1/2

| # | Bevinding | Status | Ernst |
|---|---|---|---|
| N1 | Open redirect in `auth/callback` via `next=@host`-trucje | BEWEZEN (URL-parsing), niet live geëxploiteerd | P2/P3 — phishing-risico, geen directe compromittering |
| N2 | Sessiecookie zonder expliciete `Secure`-attribuut | CODE BEVESTIGD | Laag, samenhangend met ontbrekende HSTS (al gemeld) |
| N3 | `toolbox_lokaal_aanpassen` valideert video-URL-schema niet (admin-only) | CODE BEVESTIGD | Zeer laag — vereist gecompromitteerde admin |
| — | Logout is echte server-side revocatie (scope=global) | BEWEZEN | Positief, geen actie nodig |
| — | Geen `dangerouslySetInnerHTML` in de hele codebase | BEWEZEN (grep) | Positief |
| — | Bron-links al server-side https-only gevalideerd | CODE BEVESTIGD | Positief |

**Nog steeds open na dit document:** CSRF blijft AANGENOMEN, niet live BEWEZEN (vergt een
headless-browsertest — zelfde blinde vlek als should-punt 8 in ronde 2). Supabase-projectinstellingen
(JWT-/refresh-token-expiry, Redirect-URLs-allowlist, wachtwoordbeleid) blijven **NIET VAST TE
STELLEN** vanuit code — te controleren in het Supabase-dashboard, zelfde beperking als eerder
meermaals gedocumenteerd.

---

## Coördinatie

Deze aanvulling is uitgevoerd door sessie `rie-portal-0c`, in overleg met sessie `rie-portal-4b` (die
Ronde 2 schreef en nu op branch `fix/audit-restpunten` verder werkt aan audit-logging, een
teamleider-page-gate-fix, en herverificatie van eerdere punten). Geen overlap: dit document raakt
alleen de vijf onderwerpen die Ronde 2 expliciet NIET GETEST liet staan, en wijzigt geen code.
