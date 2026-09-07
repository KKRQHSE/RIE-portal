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
import type { AiLeverancierStatus, AiRegio } from '@/lib/ai-analyse'
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

// Toolbox-onderwerp-advies (0077, aanvulling op de trefwoord-matching in
// toolbox_suggesties): alleen voor een onderwerp waar de trefwoord-koppeling
// GEEN eigen toolbox en GEEN bibliotheekbron voor vond. Bewust tekst-only,
// geen foto — de invoer is puur wat de matching al had gevonden.
export type OnderwerpAdviesInvoer = {
  onderwerpNaam: string
  // Waarom dit onderwerp naar boven kwam (uit toolbox_suggesties.redenen) —
  // context voor de AI, geen persoonsgegeven.
  redenen: string[]
}

export type OnderwerpAdviesUitkomst = {
  advies: string
  bronnenSuggestie: string[]
}

// Toolbox-AI-quiz: de organisator (KAM/admin) laat op basis van de toolbox-
// inhoud + relevante bronnen uit de onderwerpenbibliotheek conceptvragen
// genereren. Puur veiligheidsonderwerp uit standaardbronnen — geen
// persoonsgegevens. `uitsluitenTeksten` voorkomt dat "opnieuw genereren voor
// de rest" dezelfde vraag als een al bevestigde of al eerder afgewezen vraag
// teruggeeft.
export type ToolboxQuizInvoer = {
  toolboxTitel: string
  toolboxTekst: string
  bronnen: { naam: string; omschrijving: string | null }[]
  aantal: number
  uitsluitenTeksten: string[]
}

export type ToolboxQuizVoorstel = {
  vraagtekst: string
  opties: string[]
  juistAntwoord: number
  uitleg: string
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
  adviseerOnderwerp(invoer: OnderwerpAdviesInvoer): Promise<OnderwerpAdviesUitkomst>
  genereerToolboxQuiz(invoer: ToolboxQuizInvoer): Promise<ToolboxQuizVoorstel[]>
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

// Gedeelde GET-status voor elke AI-route (welke leverancier, geconfigureerd of
// niet) — nooit de sleutel. Eén plek, zodat een nieuwe AI-route (zoals
// app/api/toolbox/onderwerp-advies) 'm hergebruikt in plaats van de
// bekabeling van app/api/inspectie/ai-analyse te kopiëren.
export function leverancierStatus(): AiLeverancierStatus {
  const leverancier = kiesLeverancier()
  return leverancier
    ? {
        geconfigureerd: leverancier.sleutelAanwezig,
        leverancier: leverancier.naam,
        weergavenaam: leverancier.weergavenaam,
        model: leverancier.model,
        regio: leverancier.regio,
      }
    : {
        geconfigureerd: false,
        leverancier: 'onbekend',
        weergavenaam: 'AI-dienst',
        model: '',
        regio: 'buiten_eu',
      }
}

// ---------------------------------------------------------------------------
// EEN NIEUWE LEVERANCIER TOEVOEGEN
// ---------------------------------------------------------------------------
// 1. Maak lib/ai/<naam>.ts met een maak<Naam>Leverancier(): Leverancier.
//    Vul naam/weergavenaam/model/regio/sleutelAanwezig en implementeer
//    analyseerFoto() ÉN adviseerOnderwerp(). Gooi bij storing een AiStoring
//    met een NEDERLANDS gebruikersbericht; zet het technische detail in het
//    tweede argument.
// 2. Zet hem in KIES hierboven: <naam>: maak<Naam>Leverancier.
// 3. Zet AI_LEVERANCIER=<naam> en de bijbehorende sleutel in de omgeving
//    (.env.local lokaal, projectinstellingen op Vercel).
//
// Verder verandert er NIETS: de route, de RPC's, het datamodel en het scherm
// blijven ongewijzigd. Zet regio op 'eu' zodra de dienst binnen de EU draait —
// de waarschuwing bij het toestemmingsvinkje past zich daar vanzelf op aan.
// ---------------------------------------------------------------------------
