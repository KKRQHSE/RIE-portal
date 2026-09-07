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
import type { FotoAnalyseUitkomst, OnderwerpAdviesUitkomst, ToolboxQuizVoorstel } from './leverancier'

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
// Geëxporteerd: leesOnderwerpAdvies hieronder gebruikt 'm ook.
export function ontdoeVanRuis(tekst: string): string {
  return tekst
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

// Een lijst uit het antwoord: alleen niet-lege strings, getrimd, hard afgekapt
// op `max`. Geen ander type dan string telt mee — een model dat per ongeluk
// objecten teruggeeft levert dan een kortere lijst, geen crash.
function leesLijst(waarde: unknown, max: number = AI_MAX_ITEMS): string[] {
  if (!Array.isArray(waarde)) return []
  const items: string[] = []
  for (const el of waarde) {
    if (typeof el !== 'string') continue
    const t = el.trim()
    if (t) items.push(t)
    if (items.length >= max) break
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

// ============================================================================
// Toolbox-onderwerp-advies (0077) — de optionele AI-AANVULLING op de
// trefwoord-matching in toolbox_suggesties. Alleen aangeroepen voor een
// onderwerp waar die matching GEEN eigen toolbox en GEEN bibliotheekbron voor
// vond. De AI mag hier NOOIT toolbox-inhoud/veiligheidsinstructies verzinnen —
// alleen een korte duiding + naar welke externe bronnen te kijken (er staat
// online al veel goed materiaal, dat wijs je aan, dat bedenk je niet).
// ============================================================================
export const AI_MAX_BRONNEN = 3

export const SYSTEEM_PROMPT_ONDERWERP_ADVIES = [
  'Je helpt een KAM-coördinator/toolbox-uitvoerder in Nederland een toolbox-onderwerp te',
  'verkennen waarvoor het bedrijf zelf nog geen passende toolbox of bibliotheekbron heeft.',
  '',
  'Regels, HARD:',
  '- Je schrijft GEEN veiligheidsinstructie, procedure of toolbox-inhoud. Dat verzin je niet.',
  '- Je geeft alleen: (1) een korte duiding in 1-2 zinnen van waarom dit onderwerp relevant',
  '  is gezien de aangeleverde signalen, en (2) een lijst met waar goed materiaal te vinden',
  '  is: noem bestaande organisaties/bronnen bij naam (bijvoorbeeld Arboportaal, SSVV, een',
  `  brancheorganisatie of vakbond) — verzin GEEN url's. Maximaal ${AI_MAX_BRONNEN}.`,
  '- Nederlands, nuchter, kort. Geen wetsartikelen of normnummers.',
  '',
  'Antwoord UITSLUITEND met JSON in precies deze vorm, zonder tekst eromheen. Gebruik accolades',
  '{ } als buitenste haakjes (géén vierkante haken [ ] als buitenste haakjes):',
  '{"advies": "1-2 zinnen duiding, geen instructie",',
  ' "bronnen_suggestie": ["bron of organisatie 1", "bron of organisatie 2"]}',
].join('\n')

// ============================================================================
// Toolbox-AI-quiz — de organisator (KAM/admin) laat conceptvragen genereren
// bij een toolbox (app/api/toolbox/quiz-genereren). Elke vraag toetst
// UITSLUITEND de meegegeven toolbox-tekst; de AI verzint geen nieuwe norm.
// Niets wordt hier opgeslagen — dat gebeurt pas als de organisator minstens
// AI_QUIZ_MINIMUM_OVERGENOMEN vragen aanvinkt en op Opslaan drukt (RPC
// toolbox_quiz_opslaan, migratie 0079).
// ============================================================================
export const AI_MAX_QUIZ_OPTIES = 5

export const SYSTEEM_PROMPT_TOOLBOX_QUIZ = [
  'Je helpt een KAM-coördinator een korte kennischeck (quiz) samenstellen bij een',
  'toolbox-veiligheidsonderwerp in Nederland.',
  '',
  'Regels, HARD:',
  '- Je toetst UITSLUITEND de inhoud die je krijgt (de toolbox-tekst, en de genoemde bronnen',
  '  alleen als "waar meer over te lezen is"). Je verzint GEEN nieuwe veiligheidsnorm, wet of',
  '  getal dat niet in de toolbox-tekst staat of daar rechtstreeks uit volgt.',
  '- Elke vraag heeft precies 1 juist antwoord en 3 of 4 opties, kort en concreet — geen',
  '  meerkeuze met twee bijna-identieke antwoorden.',
  '- Elke vraag krijgt een korte uitleg (1 zin) waarom dat antwoord juist is.',
  '- Nederlands, nuchter, voor een medewerker op de werkvloer — geen jargon, geen wetsartikelen.',
  '- Maak GEEN vraag die (bijna) letterlijk overeenkomt met een vraag uit "al gebruikte',
  '  vragen" hieronder — kies een andere invalshoek op het onderwerp.',
  '',
  'Antwoord UITSLUITEND met JSON in precies deze vorm, zonder tekst eromheen:',
  '{"vragen": [',
  '  {"vraagtekst": "...", "opties": ["...", "...", "..."], "juist_antwoord": 0, "uitleg": "..."}',
  ']}',
  '"juist_antwoord" is de 0-gebaseerde index in "opties" van het juiste antwoord.',
].join('\n')

export function toolboxQuizPrompt(invoer: {
  toolboxTitel: string
  toolboxTekst: string
  bronnen: { naam: string; omschrijving: string | null }[]
  aantal: number
  uitsluitenTeksten: string[]
}): string {
  const bronnenTekst = invoer.bronnen.length
    ? invoer.bronnen.map(b => `- ${b.naam}${b.omschrijving ? `: ${b.omschrijving}` : ''}`).join('\n')
    : '(geen specifieke bron meegegeven)'
  const uitsluitenTekst = invoer.uitsluitenTeksten.length
    ? invoer.uitsluitenTeksten.map(t => `- ${t}`).join('\n')
    : '(nog geen)'
  return [
    `Toolbox: "${invoer.toolboxTitel}"`,
    `Toolbox-tekst:`,
    invoer.toolboxTekst,
    '',
    `Waar meer over dit onderwerp te lezen is (context, geen vindplaats voor nieuwe normen):`,
    bronnenTekst,
    '',
    `Al gebruikte vragen (verzin iets anders):`,
    uitsluitenTekst,
    '',
    `Genereer precies ${invoer.aantal} nieuwe, verschillende vragen.`,
  ].join('\n')
}

function leesQuizVraag(waarde: unknown): ToolboxQuizVoorstel | null {
  if (typeof waarde !== 'object' || waarde === null) return null
  const obj = waarde as Record<string, unknown>
  const vraagtekst = typeof obj.vraagtekst === 'string' ? obj.vraagtekst.trim() : ''
  if (!vraagtekst) return null
  const optiesRuw = Array.isArray(obj.opties) ? obj.opties : []
  const opties = optiesRuw
    .filter((o): o is string => typeof o === 'string')
    .map(o => o.trim())
    .filter(Boolean)
    .slice(0, AI_MAX_QUIZ_OPTIES)
  if (opties.length < 2) return null
  const juistRuw = obj.juist_antwoord
  const juistAntwoord = typeof juistRuw === 'number' ? Math.trunc(juistRuw) : Number.NaN
  if (!Number.isInteger(juistAntwoord) || juistAntwoord < 0 || juistAntwoord >= opties.length) return null
  const uitleg = typeof obj.uitleg === 'string' ? obj.uitleg.trim() : ''
  return { vraagtekst, opties, juistAntwoord, uitleg }
}

/**
 * Leest de conceptvragen uit. Zelfde vergevingsgezinde aanpak als de rest van
 * dit bestand: JSON-object met "vragen", of (sommige modellen doen dat) een
 * kale array. Een vraag die niet aan de vorm voldoet (geen 2+ opties, geen
 * geldige juist_antwoord-index) valt eruit in plaats van de hele batch te
 * laten mislukken — de organisator ziet dan gewoon iets minder voorstellen.
 */
export function leesToolboxQuizVoorstellen(ruw: string, maxAantal: number): ToolboxQuizVoorstel[] {
  const tekst = ontdoeVanRuis(ruw ?? '')
  if (!tekst) return []

  const kandidaten: string[] = [tekst]
  const eersteObj = tekst.indexOf('{')
  const laatsteObj = tekst.lastIndexOf('}')
  if (eersteObj >= 0 && laatsteObj > eersteObj) kandidaten.push(tekst.slice(eersteObj, laatsteObj + 1))
  const eersteArr = tekst.indexOf('[')
  const laatsteArr = tekst.lastIndexOf(']')
  if (eersteArr >= 0 && laatsteArr > eersteArr) kandidaten.push(tekst.slice(eersteArr, laatsteArr + 1))

  for (const kandidaat of kandidaten) {
    try {
      const parsed = JSON.parse(kandidaat) as unknown
      const lijst = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>)?.vragen)
          ? (parsed as Record<string, unknown>).vragen as unknown[]
          : null
      if (!lijst) continue
      const vragen = lijst.map(leesQuizVraag).filter((v): v is ToolboxQuizVoorstel => v !== null).slice(0, maxAantal)
      if (vragen.length > 0) return vragen
    } catch {
      // volgende kandidaat
    }
  }
  return []
}

export function onderwerpAdviesPrompt(onderwerpNaam: string, redenen: string[]): string {
  const redenTekst = redenen.length ? redenen.map(r => `- ${r}`).join('\n') : '(geen specifieke reden meegegeven)'
  return `Onderwerp: "${onderwerpNaam}".\nSignalen uit de eigen data van het bedrijf:\n${redenTekst}`
}

export function leesOnderwerpAdvies(ruw: string): OnderwerpAdviesUitkomst {
  const tekst = ontdoeVanRuis(ruw ?? '')
  if (!tekst) return { advies: '', bronnenSuggestie: [] }

  const kandidaten = [tekst]
  const eerste = tekst.indexOf('{')
  const laatste = tekst.lastIndexOf('}')
  if (eerste >= 0 && laatste > eerste) kandidaten.push(tekst.slice(eerste, laatste + 1))

  // Sommige modellen verpakken het object per ongeluk in [ ] in plaats van
  // { } (in de praktijk gezien bij dit tekst-only advies, niet bij de
  // foto-analyse hierboven) — herkenbaar aan een blok dat met `["sleutel":`
  // begint. Zelfde vergevingsgezinde aanpak als de rest van deze functie: een
  // extra kandidaat proberen is goedkoper dan de tekst als onbruikbaar
  // wegschrijven.
  const openBlok = tekst.indexOf('[')
  const sluitBlok = tekst.lastIndexOf(']')
  if (openBlok >= 0 && sluitBlok > openBlok) {
    const blok = tekst.slice(openBlok, sluitBlok + 1)
    if (/^\[\s*"[a-zA-Z_]+"\s*:/.test(blok)) kandidaten.push('{' + blok.slice(1, -1) + '}')
  }

  for (const kandidaat of kandidaten) {
    try {
      const obj = JSON.parse(kandidaat) as Record<string, unknown>
      const advies = typeof obj.advies === 'string' ? obj.advies.trim() : ''
      const bronnenSuggestie = leesLijst(obj.bronnen_suggestie, AI_MAX_BRONNEN)
      if (advies || bronnenSuggestie.length) return { advies, bronnenSuggestie }
    } catch {
      // volgende kandidaat
    }
  }

  return { advies: tekst, bronnenSuggestie: [] }
}
