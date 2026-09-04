// SERVER-ONLY. Adapter voor Groq (OpenAI-compatibele chat completions).
// ----------------------------------------------------------------------------
// Alles wat Groq-specifiek en GEHEIM is, zit in dít bestand: de sleutel, het
// transport en de foutafhandeling. De vorm van het verzoek staat in
// ./groq-bericht (puur, testbaar); de rest van de app kent alleen de poort in
// lib/ai/leverancier.ts.
//
// LET OP — Groq draait in de VS, dus BUITEN de EU. Dat is geen detail: het is
// precies waarvoor de inspecteur per foto toestemming geeft, en het staat
// daarom als regio: 'buiten_eu' hieronder. Zet dit vlaggetje mee om zodra er
// een EU-leverancier komt; de waarschuwing in het scherm volgt vanzelf.
import 'server-only'
import { AiStoring, type FotoAnalyseInvoer, type FotoAnalyseUitkomst, type Leverancier } from './leverancier'
import { GROQ_ENDPOINT, GROQ_STANDAARD_MODEL, bouwGroqBody } from './groq-bericht'
import { SYSTEEM_PROMPT, gebruikersPrompt, leesAntwoord } from './prompt'

// Een trage AI mag een inspecteur niet laten hangen. Ruim onder de maxDuration
// van de route, zodat we zelf nog een nette melding kunnen teruggeven.
const TIJDSLIMIET_MS = 45_000

export function maakGroqLeverancier(): Leverancier {
  const sleutel = (process.env.GROQ_API_KEY || '').trim()
  const model = (process.env.GROQ_MODEL || '').trim() || GROQ_STANDAARD_MODEL

  return {
    naam: 'groq',
    weergavenaam: 'Groq',
    model,
    regio: 'buiten_eu',
    sleutelAanwezig: sleutel.length > 0,

    async analyseerFoto(invoer: FotoAnalyseInvoer): Promise<FotoAnalyseUitkomst> {
      if (!sleutel) {
        // Hoort niet te gebeuren: de route controleert dit vóór de aanroep.
        throw new AiStoring('AI-analyse is nog niet geconfigureerd.', 'GROQ_API_KEY ontbreekt')
      }

      const body = bouwGroqBody({
        model,
        mimeType: invoer.mimeType,
        afbeeldingBase64: Buffer.from(invoer.afbeelding).toString('base64'),
        systeemPrompt: SYSTEEM_PROMPT,
        gebruikersTekst: gebruikersPrompt(invoer.puntTekst),
      })

      let response: Response
      try {
        response = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sleutel}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIJDSLIMIET_MS),
        })
      } catch (e) {
        const reden = e instanceof Error ? e.message : String(e)
        throw new AiStoring(
          /timeout|abort/i.test(reden)
            ? 'De AI-dienst reageerde niet op tijd. Probeer het zo nog eens.'
            : 'De AI-dienst is nu niet bereikbaar. Probeer het zo nog eens.',
          `fetch naar Groq mislukt: ${reden}`,
        )
      }

      if (!response.ok) {
        // De ruwe body kan endpoints, modelnamen of accountdetails bevatten en
        // gaat daarom alleen naar het serverlog, nooit naar de browser.
        const tekst = await response.text().catch(() => '')
        throw new AiStoring(
          response.status === 401 || response.status === 403
            ? 'De AI-sleutel wordt niet geaccepteerd. Controleer de instelling.'
            : response.status === 429 || response.status === 503
              ? 'De AI-dienst is nu druk bezet. Probeer het over een minuut nog eens.'
              : 'De AI-analyse is niet gelukt.',
          `Groq HTTP ${response.status}: ${tekst.slice(0, 500)}`,
        )
      }

      let json: unknown
      try {
        json = await response.json()
      } catch (e) {
        throw new AiStoring('De AI-analyse is niet gelukt.',
          `Groq gaf geen leesbaar JSON-antwoord: ${e instanceof Error ? e.message : String(e)}`)
      }

      const inhoud = leesInhoud(json)
      if (!inhoud) {
        throw new AiStoring('De AI gaf geen bruikbaar antwoord.', 'Groq-antwoord zonder message.content')
      }

      const uitkomst = leesAntwoord(inhoud)
      if (!uitkomst.beschrijving && uitkomst.bevindingen.length === 0 && uitkomst.acties.length === 0) {
        throw new AiStoring('De AI gaf geen bruikbaar antwoord.', 'leeg antwoord na parsen')
      }
      return uitkomst
    },
  }
}

// choices[0].message.content, maar null-veilig door de hele keten heen.
function leesInhoud(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const choices = (json as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const bericht = (choices[0] as { message?: unknown })?.message
  if (typeof bericht !== 'object' || bericht === null) return null
  const inhoud = (bericht as { content?: unknown }).content
  return typeof inhoud === 'string' && inhoud.trim() ? inhoud : null
}
