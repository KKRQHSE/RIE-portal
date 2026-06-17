// SERVER-ONLY. Deze module bouwt een Resend-client met de RESEND_API_KEY en
// verstuurt actie-mails. De mailsleutel geeft volledige verzendrechten op het
// geverifieerde domein, dus deze module mag UITSLUITEND in server-code
// (route handlers / server components) gebruikt worden en NOOIT in een client
// component of in code die naar de browser-bundle gaat.
//
// De `server-only` import hieronder is geen decoratie: importeert iets dit
// bestand (direct of indirect) in een client bundle, dan FAALT de build. Zo kan
// de mailsleutel nooit per ongeluk in de browser belanden — net als bij
// lib/supabase/service.ts.
import 'server-only'
import { Resend } from 'resend'

// Vast afzenderadres op het in Resend geverifieerde domein qhsetotaal.nl.
const AFZENDER_ADRES = 'portaal@qhsetotaal.nl'
// Vast deel van de weergavenaam; de bedrijfsnaam wordt er dynamisch achter gezet.
const AFZENDER_NAAM_BASIS = 'Acties Veiligheid en Arbo'

/**
 * Bouwt de From-header met een zelfverklarende weergavenaam:
 *   "Acties Veiligheid en Arbo - <bedrijfsnaam>" <portaal@qhsetotaal.nl>
 * Resend verwacht `from` als RFC 5322-string; de weergavenaam staat tussen
 * aanhalingstekens vanwege de spaties en het koppelstreepje.
 *
 * De bedrijfsnaam wordt veilig ingevoegd: CR/LF en andere stuurtekens worden
 * verwijderd (header-injectie voorkomen) en `"`/`\` worden ge-escaped binnen de
 * quoted-string. Ontbreekt de bedrijfsnaam, dan valt de naam terug op alleen het
 * vaste deel — nooit een hangend " - ".
 */
function afzenderHeader(bedrijf: string | null | undefined): string {
  // Stuurtekens (incl. CR/LF) eruit; daarna trimmen.
  const schoon = (bedrijf ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim()
  const naam = schoon ? `${AFZENDER_NAAM_BASIS} - ${schoon}` : AFZENDER_NAAM_BASIS
  // Quoted-string: backslash en aanhalingsteken escapen.
  const quoted = naam.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${quoted}" <${AFZENDER_ADRES}>`
}

/**
 * Basis-URL van het portaal voor het opbouwen van deellinks.
 *
 * Voorkeur: NEXT_PUBLIC_SITE_URL (bv. https://portaal.qhsetotaal.nl) — expliciet
 * gezet zodat de mail altijd naar de juiste publieke URL wijst. Bewust NIET
 * NEXT_PUBLIC_SUPABASE_URL: dat is de database-host, niet het portaal.
 *
 * Fallbacks (in volgorde): VERCEL_URL (door Vercel gezet op deploys) en als
 * laatste localhost voor lokale ontwikkeling. Zet NEXT_PUBLIC_SITE_URL in
 * productie zodat links nooit naar localhost wijzen.
 */
function siteUrl(): string {
  const expliciet = process.env.NEXT_PUBLIC_SITE_URL
  if (expliciet) return expliciet.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function bouwClient(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Bewust generiek: lek geen config-details naar buiten.
    throw new Error('Mailconfiguratie ontbreekt op de server.')
  }
  return new Resend(key)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type StuurActieMailArgs = {
  naarEmail: string
  naarNaam: string
  bedrijf: string
  /** Specifiek actienummer (bv. bij doorgeven). Weglaten bij een algemene uitnodiging. */
  actieNr?: string | null
  /** Onderwerp van de actie (bv. bij doorgeven). Weglaten bij een algemene uitnodiging. */
  actieOnderwerp?: string | null
  /** Deellink-token van de ontvanger; de URL wordt hier opgebouwd. */
  deellinkToken: string
}

export type StuurActieMailResultaat =
  | { ok: true; id: string | null }
  | { ok: false; fout: string }

/**
 * Verstuurt een nette Nederlandse actie-mail naar de actiehouder. Geeft de
 * directe uitkomst defensief terug ({ ok } / { ok:false, fout }) en GOOIT NIET:
 * de aanroeper bepaalt zelf hoe een fout getoond wordt. De mail is altijd een
 * extra — een mislukking mag de onderliggende actie nooit blokkeren.
 */
export async function stuurActieMail(
  args: StuurActieMailArgs
): Promise<StuurActieMailResultaat> {
  const { naarEmail, naarNaam, bedrijf, actieNr, actieOnderwerp, deellinkToken } = args

  if (!naarEmail || !deellinkToken) {
    return { ok: false, fout: 'Onvoldoende gegevens om een e-mail te versturen.' }
  }

  const url = `${siteUrl()}/a/${encodeURIComponent(deellinkToken)}`
  const naam = naarNaam?.trim() || 'collega'

  // Specifieke actie (doorgeven) vs. algemene uitnodiging (toewijzen).
  const heeftActie = !!(actieNr && actieNr.trim())
  const actieZin = heeftActie
    ? `: actie ${actieNr}${actieOnderwerp ? ` — ${actieOnderwerp}` : ''}`
    : ''

  const onderwerp = `Er staat een actie voor je klaar — ${bedrijf}`

  const tekst =
    `Hoi ${naam},\n\n` +
    `Er staat een actie voor je klaar in het veiligheidsportaal van ${bedrijf}${actieZin}.\n` +
    `Via onderstaande link kun je hem bekijken en bijwerken:\n\n` +
    `${url}\n\n` +
    `Met vriendelijke groet,\n${bedrijf}`

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;max-width:520px">` +
    `<p>Hoi ${escapeHtml(naam)},</p>` +
    `<p>Er staat een actie voor je klaar in het veiligheidsportaal van ` +
    `<strong>${escapeHtml(bedrijf)}</strong>` +
    `${heeftActie ? `: actie ${escapeHtml(actieNr!)}${actieOnderwerp ? ` — ${escapeHtml(actieOnderwerp)}` : ''}` : ''}.` +
    ` Via onderstaande knop kun je hem bekijken en bijwerken.</p>` +
    `<p style="margin:24px 0">` +
    `<a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;` +
    `text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600">Actie bekijken</a>` +
    `</p>` +
    `<p style="font-size:13px;color:#666">Werkt de knop niet? Open dan deze link:<br>` +
    `<a href="${escapeHtml(url)}" style="color:#666">${escapeHtml(url)}</a></p>` +
    `<p style="font-size:13px;color:#666">Met vriendelijke groet,<br>${escapeHtml(bedrijf)}</p>` +
    `</div>`

  try {
    const resend = bouwClient()
    const { data, error } = await resend.emails.send({
      from: afzenderHeader(bedrijf),
      to: naarEmail,
      subject: onderwerp,
      html,
      text: tekst,
    })

    if (error) {
      // Directe weigering (bv. ongeldig adres). Nette, niet-lekkende melding.
      return { ok: false, fout: error.message || 'De e-mail kon niet worden verstuurd.' }
    }
    return { ok: true, id: data?.id ?? null }
  } catch {
    // Netwerk-/configuratiefout: nooit doorgooien, de actie zelf blijft staan.
    return { ok: false, fout: 'De e-mail kon niet worden verstuurd.' }
  }
}
