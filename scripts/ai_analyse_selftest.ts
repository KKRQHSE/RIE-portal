// ============================================================================
// Zelftest voor de AI-foto-analyse — draaien: node scripts/ai_analyse_selftest.ts
// (Node 24 strip-types; met --use-system-ca voor DEEL 2, zie hieronder.)
// ----------------------------------------------------------------------------
// DEEL 1 (altijd, geen netwerk, geen sleutel): de antwoord-parser uit
// lib/ai/prompt.ts. Dat is het brosste stuk van de keten — een model dat zijn
// JSON in een ```-hek zet, er een <think>-blok voor plakt of gewoon proza
// terugstuurt, mag de inspecteur nooit een lege hand opleveren.
//
// DEEL 2 (alleen mét GROQ_API_KEY in .env.local): één échte aanroep naar Groq
// met een zelfgemaakt testplaatje. Bewijst drie dingen die je niet kunt
// nabootsen: de sleutel wordt geaccepteerd, het ingestelde model bestaat én
// kan beelden aan, en het antwoord komt in een vorm die onze parser leest.
// Het verzoek wordt opgebouwd met bouwGroqBody uit lib/ai/groq-bericht.ts —
// exact dezelfde functie als de app gebruikt, geen kopie.
//
// Draai dit met `node --use-system-ca ...` als je achter de bedrijfsproxy zit;
// zonder die vlag faalt de TLS-verbinding naar api.groq.com (zie Projectstand).
//
// Er gaat GEEN echte inspectiefoto naar buiten: DEEL 2 stuurt een 32x32-blokje
// dat dit script zelf tekent.
// ============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'

import { leesAntwoord, SYSTEEM_PROMPT, gebruikersPrompt } from '../lib/ai/prompt.ts'
import { GROQ_ENDPOINT, GROQ_STANDAARD_MODEL, bouwGroqBody } from '../lib/ai/groq-bericht.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch {
    // geen .env.local — valt terug op process.env
  }
  return { ...env, ...process.env }
}

const results: { naam: string; ok: boolean }[] = []
function check(naam: string, ok: boolean, detail?: string) {
  results.push({ naam, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${detail ? ` (${detail})` : ''}`)
}

// ---------------------------------------------------------------------------
// DEEL 1 — de parser
// ---------------------------------------------------------------------------
console.log('DEEL 1 — antwoord-parser (geen netwerk)\n')

{
  const u = leesAntwoord('{"beschrijving": "Een ladder tegen een gevel.", "concept_bevinding": "Ladder niet vastgezet."}')
  check('kale JSON wordt in twee velden gesplitst',
    u.beschrijving === 'Een ladder tegen een gevel.' && u.conceptBevinding === 'Ladder niet vastgezet.')
}
{
  const u = leesAntwoord('```json\n{"beschrijving": "Rommel in het gangpad.", "concept_bevinding": "Struikelgevaar."}\n```')
  check('JSON in een ```-hek wordt gelezen',
    u.beschrijving === 'Rommel in het gangpad.' && u.conceptBevinding === 'Struikelgevaar.')
}
{
  const u = leesAntwoord('<think>Even nadenken over de foto...</think>\n{"beschrijving": "Losse kabel.", "concept_bevinding": "Kabel over looppad."}')
  check('een <think>-blok wordt weggeknipt',
    u.beschrijving === 'Losse kabel.' && u.conceptBevinding === 'Kabel over looppad.')
}
{
  const u = leesAntwoord('Hier is mijn antwoord:\n{"beschrijving": "Steiger zonder leuning.", "concept_bevinding": "Valgevaar."}\nTot zover.')
  check('JSON tussen omringende tekst wordt eruit gevist',
    u.beschrijving === 'Steiger zonder leuning.' && u.conceptBevinding === 'Valgevaar.')
}
{
  // Het model negeert het formaat en antwoordt in proza. Dan liever de hele
  // tekst als beschrijving dan een verzonnen bevinding.
  const u = leesAntwoord('Ik zie een werkbank met gereedschap dat door elkaar ligt.')
  check('proza zonder JSON belandt in de beschrijving, concept blijft leeg',
    u.beschrijving === 'Ik zie een werkbank met gereedschap dat door elkaar ligt.' && u.conceptBevinding === '',
    `concept=${JSON.stringify(u.conceptBevinding)}`)
}
{
  const u = leesAntwoord('{"beschrijving": "Alleen dit veld."}')
  check('een half ingevuld JSON-antwoord levert nog steeds de beschrijving',
    u.beschrijving === 'Alleen dit veld.' && u.conceptBevinding === '')
}
{
  const u = leesAntwoord('')
  check('een leeg antwoord geeft twee lege velden (geen crash)',
    u.beschrijving === '' && u.conceptBevinding === '')
}
{
  const u = leesAntwoord('<think>alleen maar denken</think>')
  check('een antwoord dat alléén uit denkwerk bestaat geeft niets terug',
    u.beschrijving === '' && u.conceptBevinding === '')
}
{
  const ok = SYSTEEM_PROMPT.includes('Nederlands')
    && /nooit persoonlijk/i.test(SYSTEEM_PROMPT)
    && /VOORSTEL/.test(SYSTEEM_PROMPT)
  check('de opdracht schrijft Nederlands, geen persoonsbeschrijving en "voorstel" voor', ok)
}
{
  const met = gebruikersPrompt('Nooduitgang vrij?')
  const zonder = gebruikersPrompt(null)
  check('de checklistvraag komt als context mee, en ontbreken mag',
    met.includes('Nooduitgang vrij?') && !zonder.includes('undefined') && zonder.length > 0)
}

// ---------------------------------------------------------------------------
// DEEL 2 — echte aanroep (alleen met sleutel)
// ---------------------------------------------------------------------------
const env = loadEnv()
const SLEUTEL = (env.GROQ_API_KEY || '').trim()
const MODEL = (env.GROQ_MODEL || '').trim() || GROQ_STANDAARD_MODEL

// Een klein PNG dat dit script zelf tekent: bovenhelft rood, onderhelft blauw.
// Genoeg om te zien of het model daadwerkelijk naar het beeld kijkt.
function maakTestPng(): Buffer {
  const W = 32, H = 32
  const rauw: number[] = []
  for (let y = 0; y < H; y++) {
    rauw.push(0) // filter-byte per rij
    for (let x = 0; x < W; x++) {
      const boven = y < H / 2
      rauw.push(boven ? 220 : 20, boven ? 30 : 40, boven ? 30 : 200)
    }
  }
  const blok = (type: string, data: Buffer) => {
    const lengte = Buffer.alloc(4); lengte.writeUInt32BE(data.length)
    const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typeData) >>> 0)
    return Buffer.concat([lengte, typeData, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8   // bitdiepte
  ihdr[9] = 2   // kleurtype 2 = truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(Buffer.from(rauw))),
    blok('IEND', Buffer.alloc(0)),
  ])
}

if (!SLEUTEL) {
  console.log('\nDEEL 2 — echte Groq-aanroep: OVERGESLAGEN (geen GROQ_API_KEY in .env.local).')
  console.log('  Dat is geen fout: zonder sleutel hoort de app netjes te melden dat AI-analyse')
  console.log('  nog niet is geconfigureerd. Zet de sleutel erin en draai opnieuw voor DEEL 2.')
} else {
  console.log(`\nDEEL 2 — echte Groq-aanroep (model: ${MODEL})\n`)

  const png = maakTestPng()
  const body = bouwGroqBody({
    model: MODEL,
    mimeType: 'image/png',
    afbeeldingBase64: png.toString('base64'),
    systeemPrompt: SYSTEEM_PROMPT,
    gebruikersTekst: gebruikersPrompt('Is het werkgebied vrij van struikelgevaar?'),
  })

  // Groq kan tijdelijk "over capacity" geven; dat is geen defect aan onze kant.
  // Een paar keer opnieuw met oplopende pauze, precies zoals hun foutmelding vraagt.
  let response: Response | null = null
  let laatsteFout = ''
  for (let poging = 1; poging <= 4; poging++) {
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLEUTEL}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      })
    } catch (e) {
      laatsteFout = e instanceof Error ? e.message : String(e)
      response = null
    }
    if (response && response.ok) break
    if (response && response.status !== 429 && response.status !== 503) break
    if (poging < 4) {
      const wacht = poging * 4000
      console.log(`  … Groq is bezet (poging ${poging}), ${wacht / 1000}s wachten en opnieuw`)
      await new Promise(r => setTimeout(r, wacht))
    }
  }

  if (!response) {
    check('Groq is bereikbaar', false, laatsteFout.slice(0, 120))
  } else if (!response.ok) {
    const tekst = await response.text().catch(() => '')
    const bezet = response.status === 429 || response.status === 503
    check(`Groq accepteert het verzoek (HTTP ${response.status})`, false,
      bezet ? 'dienst bezet — sleutel/model niet te beoordelen, later opnieuw draaien' : tekst.slice(0, 160))
  } else {
    check('Groq accepteert de sleutel en het model', true, `HTTP ${response.status}`)
    const json = await response.json() as { choices?: { message?: { content?: string } }[] }
    const inhoud = json?.choices?.[0]?.message?.content ?? ''
    check('er komt inhoud terug', inhoud.trim().length > 0, `${inhoud.length} tekens`)

    const uitkomst = leesAntwoord(inhoud)
    check('de parser haalt er een beschrijving uit', uitkomst.beschrijving.trim().length > 0)
    check('de parser haalt er een concept-bevinding uit', uitkomst.conceptBevinding.trim().length > 0)
    check('het model kijkt echt naar het beeld (noemt rood of blauw)',
      /rood|blauw|red|blue/i.test(inhoud))

    console.log('\n--- wat het model teruggaf ---')
    console.log('beschrijving :', uitkomst.beschrijving.slice(0, 300))
    console.log('concept      :', uitkomst.conceptBevinding.slice(0, 300))
    console.log('------------------------------')
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} checks geslaagd.`)

// Bewust process.exitCode en géén process.exit(): op Windows crasht Node met een
// libuv-assertie als je afsluit terwijl de HTTPS-verbinding naar Groq nog aan het
// opruimen is. Dat kostte een exitcode 127 bij een test die gewoon slaagde.
process.exitCode = falen > 0 ? 1 : 0
