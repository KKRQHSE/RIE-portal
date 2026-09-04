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

// Bovengrens per lijst. Een inspecteur moet in één oogopslag kunnen kiezen —
// tien aanvinkbare opties is geen keuzehulp meer. leesAntwoord kapt hier ook
// hard op af, zodat een model dat de instructie negeert de UI niet volproppen.
export const AI_MAX_ITEMS = 5

// De opdracht. Vier dingen zijn hier bewust in vastgelegd:
//   * Nederlands, kort, nuchter — de inspecteur moet het kunnen overnemen.
//   * De AI doet een VOORSTEL, geen oordeel. Geen stelligheid over normen of
//     overtredingen die je op een foto niet kunt vaststellen.
//   * Geen persoonsbeschrijvingen. Staat er toch iemand op, dan benoemt het
//     model dat als situatie ("een medewerker werkt op hoogte"), niet als
//     signalement.
//   * Bevindingen (wat je ziet) en acties (wat je eraan zou kunnen doen) zijn
//     twee gescheiden lijsten, geen twee namen voor hetzelfde: een bevinding
//     beschrijft het risico, een actie is de voorgestelde maatregel ertegen.
//     Beide komen als korte, los aanvinkbare items — geen alinea's.
export const SYSTEEM_PROMPT = [
  'Je helpt een KAM-coördinator bij een werkplekinspectie in Nederland.',
  'Je krijgt één foto van een werkplek en beschrijft wat erop te zien is.',
  '',
  'Regels:',
  '- Antwoord in het Nederlands, nuchter en kort. Geen aannames over wat je niet ziet.',
  '- Je doet een VOORSTEL, geen eindoordeel. De inspecteur beslist zelf wat hij overneemt.',
  '- Beschrijf mensen nooit persoonlijk (geen kleding, geslacht, leeftijd of uiterlijk).',
  '  Benoem hooguit de situatie, bijvoorbeeld "er wordt op hoogte gewerkt".',
  '- Noem geen wetsartikelen of normnummers; die controleert de inspecteur zelf.',
  '- Zie je niets dat op een risico wijst, laat de lijsten dan leeg — verzin niets.',
  `- Elke bevinding en elke actie is één kort, concreet zinnetje (geen alinea). Maximaal ${AI_MAX_ITEMS} per lijst.`,
  '',
  'Antwoord UITSLUITEND met JSON in precies deze vorm, zonder tekst eromheen:',
  '{"beschrijving": "kort, 1 of 2 zinnen: wat er op de foto te zien is",',
  ' "bevindingen": ["risico of aandachtspunt 1", "risico of aandachtspunt 2"],',
  ' "acties": ["voorgestelde maatregel 1", "voorgestelde maatregel 2"]}',
  'Zie je geen risico, dan mogen "bevindingen" en "acties" allebei een lege lijst zijn.',
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

// Een lijst uit het antwoord: alleen niet-lege strings, getrimd, hard afgekapt
// op AI_MAX_ITEMS. Geen ander type dan string telt mee — een model dat per
// ongeluk objecten teruggeeft levert dan een kortere lijst, geen crash.
function leesLijst(waarde: unknown): string[] {
  if (!Array.isArray(waarde)) return []
  const items: string[] = []
  for (const el of waarde) {
    if (typeof el !== 'string') continue
    const t = el.trim()
    if (t) items.push(t)
    if (items.length >= AI_MAX_ITEMS) break
  }
  return items
}

/**
 * Leest het antwoord uit. Bewust vergevingsgezind: een model dat zich niet aan
 * het JSON-formaat houdt mag geen lege hand opleveren. Lukt JSON niet, dan gaat
 * de hele tekst als beschrijving mee en blijven de lijsten leeg — dat is
 * eerlijker dan een verzonnen bevinding of actie.
 */
export function leesAntwoord(ruw: string): FotoAnalyseUitkomst {
  const tekst = ontdoeVanRuis(ruw ?? '')
  if (!tekst) return { beschrijving: '', bevindingen: [], acties: [] }

  // Eerst het hele antwoord, anders het eerste object dat erin zit.
  const kandidaten = [tekst]
  const eerste = tekst.indexOf('{')
  const laatste = tekst.lastIndexOf('}')
  if (eerste >= 0 && laatste > eerste) kandidaten.push(tekst.slice(eerste, laatste + 1))

  for (const kandidaat of kandidaten) {
    try {
      const obj = JSON.parse(kandidaat) as Record<string, unknown>
      const beschrijving = typeof obj.beschrijving === 'string' ? obj.beschrijving.trim() : ''
      const bevindingen = leesLijst(obj.bevindingen)
      const acties = leesLijst(obj.acties)
      if (beschrijving || bevindingen.length || acties.length) {
        return { beschrijving, bevindingen, acties }
      }
    } catch {
      // volgende kandidaat
    }
  }

  return { beschrijving: tekst, bevindingen: [], acties: [] }
}
