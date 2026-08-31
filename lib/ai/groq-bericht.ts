// De vorm van het Groq-verzoek. Puur: geen sleutel, geen netwerk, geen state,
// en bewust ook geen imports — dit bestand gaat alléén over hoe Groq zijn
// berichten wil zien.
// ----------------------------------------------------------------------------
// Losgetrokken van lib/ai/groq.ts (die de sleutel leest en dus `server-only`
// is), zodat scripts/ai_analyse_selftest.ts exact hetzelfde verzoek kan
// opbouwen als de app in plaats van een kopie die stilletjes uit elkaar groeit.
// De prompts komen als argument binnen: wát we vragen hoort bij ./prompt, hóé
// het over de lijn gaat hoort hier.

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// Groq wisselt zijn modelaanbod regelmatig; welk vision-model beschikbaar is,
// verschilt per account. Daarom instelbaar via GROQ_MODEL, met een werkende
// standaard. De actuele lijst staat op https://console.groq.com/docs/models
// (of via GET https://api.groq.com/openai/v1/models) — kies er een met
// "image" in input_modalities.
export const GROQ_STANDAARD_MODEL = 'qwen/qwen3.8-27b'

export function bouwGroqBody(opties: {
  model: string
  mimeType: string
  afbeeldingBase64: string
  systeemPrompt: string
  gebruikersTekst: string
}) {
  return {
    model: opties.model,
    temperature: 0.2,
    max_completion_tokens: 700,
    messages: [
      { role: 'system', content: opties.systeemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: opties.gebruikersTekst },
          {
            type: 'image_url',
            image_url: { url: `data:${opties.mimeType};base64,${opties.afbeeldingBase64}` },
          },
        ],
      },
    ],
  }
}
