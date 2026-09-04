// SERVER-ONLY. De poort waarachter élke AI-leverancier verdwijnt.
// ----------------------------------------------------------------------------
// De rest van de applicatie (de route, de UI) kent alléén dit bestand. Wie de
// analyse doet, met welk model, via welk endpoint en met welk sleutelformaat is
// van hier naar beneden verborgen.
//
// VAN LEVERANCIER WISSELEN = één adapter erbij + één regel in KIES hieronder.
// Er verandert niets aan de route, de RPC's, het datamodel of het scherm. Zie
// de instructie onderaan dit bestand.
//
// De `server-only` import is geen decoratie: importeert iets dit bestand (direct
// of indirect) in een clientbundel, dan FAALT de build. Zo kan een API-sleutel
// nooit per ongeluk in de browser belanden.
import 'server-only'
import type { AiRegio } from '@/lib/ai-analyse'
import { maakGroqLeverancier } from './groq'

// Wat de leverancier krijgt. De foto gaat als bytes mee, niet als URL: de server
// haalt hem zelf op via een kortlevende signed URL en geeft de inhoud door. Zo
// belandt er nooit een (bearer-achtige) storage-URL in de logs van een derde.
export type FotoAnalyseInvoer = {
  afbeelding: Uint8Array
  mimeType: string
  // De checklistvraag waar de foto bij hoort, als context. Bevat geen
  // persoonsgegevens — het is de norm-tekst uit de bibliotheek.
  puntTekst: string | null
}

// Wat de leverancier teruggeeft. Drie gescheiden velden, want ze hebben een
// verschillende status: de beschrijving is waarneming, bevindingen/acties zijn
// aanvinkbare voorstellen die de mens nog moet wegen — en apart van elkaar,
// want "wat ik zie" en "wat je eraan kunt doen" zijn geen synoniemen.
export type FotoAnalyseUitkomst = {
  beschrijving: string
  bevindingen: string[]
  acties: string[]
}

// Een storing bij de leverancier, met een reden die veilig aan de gebruiker
// getoond mag worden. De onderliggende technische fout wordt server-side gelogd
// en NOOIT doorgegeven — anders lekt een foutmelding endpoints, sleutelresten of
// modelnamen naar de browser.
export class AiStoring extends Error {
  constructor(readonly gebruikersbericht: string, technisch: string) {
    super(technisch)
    this.name = 'AiStoring'
  }
}

export type Leverancier = {
  naam: string           // technische naam, komt zo in de database
  weergavenaam: string   // wat de inspecteur op het scherm ziet
  model: string
  regio: AiRegio
  // Staat de sleutel in de omgeving? Zo niet, dan is er niets kapot — dan is er
  // alleen nog niets ingesteld, en dat zegt de route ook zo.
  sleutelAanwezig: boolean
  analyseerFoto(invoer: FotoAnalyseInvoer): Promise<FotoAnalyseUitkomst>
}

// De beschikbare adapters. Eén regel per leverancier.
const KIES: Record<string, () => Leverancier> = {
  groq: maakGroqLeverancier,
}

export const STANDAARD_LEVERANCIER = 'groq'

/**
 * De leverancier die deze installatie gebruikt, gestuurd door AI_LEVERANCIER.
 * Geeft null bij een onbekende naam — de route meldt dan hetzelfde als bij een
 * ontbrekende sleutel: nog niet geconfigureerd.
 */
export function kiesLeverancier(): Leverancier | null {
  const naam = (process.env.AI_LEVERANCIER || STANDAARD_LEVERANCIER).trim().toLowerCase()
  const maak = KIES[naam]
  return maak ? maak() : null
}

// ---------------------------------------------------------------------------
// EEN NIEUWE LEVERANCIER TOEVOEGEN
// ---------------------------------------------------------------------------
// 1. Maak lib/ai/<naam>.ts met een maak<Naam>Leverancier(): Leverancier.
//    Vul naam/weergavenaam/model/regio/sleutelAanwezig en implementeer
//    analyseerFoto(). Gooi bij storing een AiStoring met een NEDERLANDS
//    gebruikersbericht; zet het technische detail in het tweede argument.
// 2. Zet hem in KIES hierboven: <naam>: maak<Naam>Leverancier.
// 3. Zet AI_LEVERANCIER=<naam> en de bijbehorende sleutel in de omgeving
//    (.env.local lokaal, projectinstellingen op Vercel).
//
// Verder verandert er NIETS: de route, de RPC's, het datamodel en het scherm
// blijven ongewijzigd. Zet regio op 'eu' zodra de dienst binnen de EU draait —
// de waarschuwing bij het toestemmingsvinkje past zich daar vanzelf op aan.
// ---------------------------------------------------------------------------
