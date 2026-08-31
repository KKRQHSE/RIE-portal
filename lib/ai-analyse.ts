// Gedeelde, CLIENT-VEILIGE typen en constanten voor de AI-foto-analyse bij de
// werkplekinspectie. Bevat GEEN sleutels, geen leveranciercode en geen
// server-import: dit bestand mag gerust in de browserbundel belanden.
//
// De echte AI-aanroep zit achter app/api/inspectie/ai-analyse (server-side).

// Waar de gekozen leverancier draait. Stuurt de waarschuwingstekst bij het
// toestemmingsvinkje: bij 'buiten_eu' krijgt de inspecteur er expliciet bij te
// zien dat de foto de EU verlaat.
export type AiRegio = 'eu' | 'buiten_eu'

// Wat de UI van de server hoort te weten om het vinkje eerlijk te kunnen
// labelen. Bewust géén sleutel, geen endpoint — alleen wie/waar/welk model.
export type AiLeverancierStatus = {
  geconfigureerd: boolean
  leverancier: string      // technische naam, bv. 'groq'
  weergavenaam: string     // wat de inspecteur ziet, bv. 'Groq'
  model: string
  regio: AiRegio
}

// Eén AI-suggestie zoals het invulscherm hem toont.
export type AiSuggestieStatus = 'concept' | 'overgenomen' | 'verworpen'

export type AiSuggestie = {
  id: string
  bevinding_id: string
  foto_id: string | null
  beschrijving: string | null
  concept: string | null
  leverancier: string
  model: string
  status: AiSuggestieStatus
}

// Foutcode die de route meestuurt als er (nog) geen sleutel is ingesteld. De UI
// toont die als nette mededeling, niet als rode fout — er is niets kapot, er is
// alleen nog niets geconfigureerd.
export const AI_NIET_GECONFIGUREERD = 'niet_geconfigureerd'

// Bovengrens op wat we naar een externe dienst sturen. De browser verkleint een
// foto al vóór upload (lib/afbeelding.ts); dit is de backstop aan de serverkant.
export const AI_MAX_FOTO_BYTES = 4 * 1024 * 1024 // 4 MB
