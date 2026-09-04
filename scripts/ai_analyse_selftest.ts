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
// uit scripts/_testafbeelding.ts.
// ============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { leesAntwoord, SYSTEEM_PROMPT, gebruikersPrompt } from '../lib/ai/prompt.ts'
import { GROQ_ENDPOINT, GROQ_STANDAARD_MODEL, bouwGroqBody } from '../lib/ai/groq-bericht.ts'
import { maakTestPng } from './_testafbeelding.ts'

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
  const u = leesAntwoord('{"beschrijving": "Een ladder tegen een gevel.", "bevindingen": ["Ladder niet vastgezet."], "acties": ["Ladder vastzetten."]}')
  check('kale JSON wordt in drie velden gesplitst',
    u.beschrijving === 'Een ladder tegen een gevel.'
      && u.bevindingen.length === 1 && u.bevindingen[0] === 'Ladder niet vastgezet.'
      && u.acties.length === 1 && u.acties[0] === 'Ladder vastzetten.')
}
{
  const u = leesAntwoord('```json\n{"beschrijving": "Rommel in het gangpad.", "bevindingen": ["Struikelgevaar."], "acties": []}\n```')
  check('JSON in een ```-hek wordt gelezen',
    u.beschrijving === 'Rommel in het gangpad.' && u.bevindingen[0] === 'Struikelgevaar.' && u.acties.length === 0)
}
{
  const u = leesAntwoord('<think>Even nadenken over de foto...</think>\n{"beschrijving": "Losse kabel.", "bevindingen": ["Kabel over looppad."], "acties": ["Kabel wegleggen."]}')
  check('een <think>-blok wordt weggeknipt',
    u.beschrijving === 'Losse kabel.' && u.bevindingen[0] === 'Kabel over looppad.' && u.acties[0] === 'Kabel wegleggen.')
}
{
  const u = leesAntwoord('Hier is mijn antwoord:\n{"beschrijving": "Steiger zonder leuning.", "bevindingen": ["Valgevaar."], "acties": ["Leuning plaatsen."]}\nTot zover.')
  check('JSON tussen omringende tekst wordt eruit gevist',
    u.beschrijving === 'Steiger zonder leuning.' && u.bevindingen[0] === 'Valgevaar.' && u.acties[0] === 'Leuning plaatsen.')
}
{
  // Het model negeert het formaat en antwoordt in proza. Dan liever de hele
  // tekst als beschrijving dan verzonnen bevindingen of acties.
  const u = leesAntwoord('Ik zie een werkbank met gereedschap dat door elkaar ligt.')
  check('proza zonder JSON belandt in de beschrijving, lijsten blijven leeg',
    u.beschrijving === 'Ik zie een werkbank met gereedschap dat door elkaar ligt.'
      && u.bevindingen.length === 0 && u.acties.length === 0,
    `bevindingen=${JSON.stringify(u.bevindingen)} acties=${JSON.stringify(u.acties)}`)
}
{
  const u = leesAntwoord('{"beschrijving": "Alleen dit veld."}')
  check('een half ingevuld JSON-antwoord levert nog steeds de beschrijving',
    u.beschrijving === 'Alleen dit veld.' && u.bevindingen.length === 0 && u.acties.length === 0)
}
{
  const u = leesAntwoord('')
  check('een leeg antwoord geeft lege velden (geen crash)',
    u.beschrijving === '' && u.bevindingen.length === 0 && u.acties.length === 0)
}
{
  const u = leesAntwoord('<think>alleen maar denken</think>')
  check('een antwoord dat alléén uit denkwerk bestaat geeft niets terug',
    u.beschrijving === '' && u.bevindingen.length === 0 && u.acties.length === 0)
}
{
  // Zie je niets, dan mogen bevindingen/acties gewoon leeg zijn — geen fout.
  const u = leesAntwoord('{"beschrijving": "Alles ziet er in orde uit.", "bevindingen": [], "acties": []}')
  check('lege lijsten zijn een geldig antwoord (geen risico gezien)',
    u.beschrijving === 'Alles ziet er in orde uit.' && u.bevindingen.length === 0 && u.acties.length === 0)
}
{
  // Een model dat de bovengrens negeert wordt hard afgekapt, en niet-strings
  // in de lijst worden overgeslagen in plaats van een crash te geven.
  const veel = Array.from({ length: 9 }, (_, i) => `punt ${i + 1}`)
  const u = leesAntwoord(JSON.stringify({ beschrijving: 'x', bevindingen: [...veel, 123, null], acties: veel }))
  check('lijsten worden afgekapt op AI_MAX_ITEMS en niet-strings genegeerd',
    u.bevindingen.length === 5 && u.acties.length === 5 && u.bevindingen[0] === 'punt 1',
    `bevindingen=${u.bevindingen.length} acties=${u.acties.length}`)
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
    // Geen harde eis op niet-lege lijsten: het testplaatje is twee kleurvlakken
    // zonder echt risico, en de opdracht zegt expliciet niets te verzinnen als
    // er niets te vinden is. Alleen de VORM moet kloppen (arrays, geen crash).
    check('bevindingen en acties komen als array terug (leeg mag, verzonnen niet)',
      Array.isArray(uitkomst.bevindingen) && Array.isArray(uitkomst.acties))
    check('het model kijkt echt naar het beeld (noemt rood of blauw)',
      /rood|blauw|red|blue/i.test(inhoud))

    console.log('\n--- wat het model teruggaf ---')
    console.log('beschrijving :', uitkomst.beschrijving.slice(0, 300))
    console.log('bevindingen  :', JSON.stringify(uitkomst.bevindingen).slice(0, 300))
    console.log('acties       :', JSON.stringify(uitkomst.acties).slice(0, 300))
    console.log('------------------------------')
  }
}

const falen = results.filter(r => !r.ok).length
console.log(`\n${results.length - falen}/${results.length} checks geslaagd.`)

// Bewust process.exitCode en géén process.exit(): op Windows crasht Node met een
// libuv-assertie als je afsluit terwijl de HTTPS-verbinding naar Groq nog aan het
// opruimen is. Dat kostte een exitcode 127 bij een test die gewoon slaagde.
process.exitCode = falen > 0 ? 1 : 0
