// De opdracht aan de AI en het uitlezen van het antwoord.
// ----------------------------------------------------------------------------
// Bewust leverancier-ONAFHANKELIJK: bijna elk vision-model werkt met een
// systeem- plus gebruikersinstructie en antwoordt met tekst. Een nieuwe adapter
// hergebruikt dit bestand en hoeft alleen het transport te schrijven.
//
// Géén `server-only` hier, met opzet: dit bestand bevat alleen vaste tekst en
// pure functies — geen sleutel, geen endpoint, geen netwerk. Daardoor kan
// scripts/ai_analyse_selftest.ts de échte parser testen in plaats van een
// nagebouwde kopie. De sleutel zit één laag dieper, in lib/ai/groq.ts.
import type { FotoAnalyseUitkomst } from './leverancier'

// De opdracht. Drie dingen zijn hier bewust in vastgelegd:
//   * Nederlands, kort, nuchter — de inspecteur moet het kunnen overnemen.
//   * De AI doet een VOORSTEL, geen oordeel. Geen stelligheid over normen of
//     overtredingen die je op een foto niet kunt vaststellen.
//   * Geen persoonsbeschrijvingen. Staat er toch iemand op, dan benoemt het
//     model dat als situatie ("een medewerker werkt op hoogte"), niet als
//     signalement.
export const SYSTEEM_PROMPT = [
  'Je helpt een KAM-coördinator bij een werkplekinspectie in Nederland.',
  'Je krijgt één foto van een werkplek en beschrijft wat erop te zien is.',
  '',
  'Regels:',
  '- Antwoord in het Nederlands, nuchter en kort. Geen aannames over wat je niet ziet.',
  '- Je doet een VOORSTEL, geen eindoordeel. De inspecteur beslist zelf.',
  '- Beschrijf mensen nooit persoonlijk (geen kleding, geslacht, leeftijd of uiterlijk).',
  '  Benoem hooguit de situatie, bijvoorbeeld "er wordt op hoogte gewerkt".',
  '- Noem geen wetsartikelen of normnummers; die controleert de inspecteur zelf.',
  '- Zie je niets dat op een risico wijst, zeg dat dan gewoon.',
  '',
  'Antwoord UITSLUITEND met JSON in precies deze vorm, zonder tekst eromheen:',
  '{"beschrijving": "wat er op de foto te zien is, 1 tot 3 zinnen",',
  ' "concept_bevinding": "het risico of aandachtspunt als concepttekst, 1 tot 3 zinnen"}',
].join('\n')

export function gebruikersPrompt(puntTekst: string | null): string {
  const punt = (puntTekst ?? '').trim()
  return punt
    ? `Deze foto hoort bij het inspectiepunt: "${punt}". Beschrijf de foto en stel een concept-bevinding voor.`
    : 'Beschrijf deze foto en stel een concept-bevinding voor.'
}

// Redeneermodellen zetten hun tussenstappen soms in <think>-blokken, en veel
// modellen verpakken JSON in een ```-hek. Beide eraf voordat we gaan lezen.
function ontdoeVanRuis(tekst: string): string {
  return tekst
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

/**
 * Leest het antwoord uit. Bewust vergevingsgezind: een model dat zich niet aan
 * het JSON-formaat houdt mag geen lege hand opleveren. Lukt JSON niet, dan gaat
 * de hele tekst als beschrijving mee en laat de inspecteur het concept zelf
 * schrijven — dat is eerlijker dan een verzonnen bevinding.
 */
export function leesAntwoord(ruw: string): FotoAnalyseUitkomst {
  const tekst = ontdoeVanRuis(ruw ?? '')
  if (!tekst) return { beschrijving: '', conceptBevinding: '' }

  // Eerst het hele antwoord, anders het eerste object dat erin zit.
  const kandidaten = [tekst]
  const eerste = tekst.indexOf('{')
  const laatste = tekst.lastIndexOf('}')
  if (eerste >= 0 && laatste > eerste) kandidaten.push(tekst.slice(eerste, laatste + 1))

  for (const kandidaat of kandidaten) {
    try {
      const obj = JSON.parse(kandidaat) as Record<string, unknown>
      const beschrijving = typeof obj.beschrijving === 'string' ? obj.beschrijving.trim() : ''
      const concept = typeof obj.concept_bevinding === 'string' ? obj.concept_bevinding.trim() : ''
      if (beschrijving || concept) return { beschrijving, conceptBevinding: concept }
    } catch {
      // volgende kandidaat
    }
  }

  return { beschrijving: tekst, conceptBevinding: '' }
}
