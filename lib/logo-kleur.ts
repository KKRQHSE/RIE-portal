// Client-side accentkleur-VOORSTEL uit een logo. Leest het beeld in een canvas,
// filtert (bijna-)witte/zwarte/transparante en ongekleurde (grijze) pixels weg en
// kiest uit wat overblijft de meest voorkomende, voldoende verzadigde kleur.
// Geen automatische overname: de aanroeper toont dit als voorstel ter bevestiging.

export type KleurResultaat =
  | { hex: string }
  | { fout: 'geen-kleur' | 'leesfout' }

// Drempels — bewust ruim en voorspelbaar gehouden.
const MAX_DIM = 120          // logo verkleinen: sneller, ruis middelt uit
const MIN_ALPHA = 125        // (bijna-)transparant overslaan
const MAX_LIGHT = 0.90       // (bijna-)wit overslaan
const MIN_LIGHT = 0.12       // (bijna-)zwart overslaan
const MIN_SAT = 0.25         // te grijs = geen "kleur"

function tweeHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

export function rgbNaarHex(r: number, g: number, b: number): string {
  return `#${tweeHex(r)}${tweeHex(g)}${tweeHex(b)}`.toUpperCase()
}

// Lichtheid en verzadiging uit de HSL-omzetting (we hebben de tint niet nodig).
function lichtEnSat(r: number, g: number, b: number): { light: number; sat: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const light = (max + min) / 2
  let sat = 0
  const d = max - min
  if (d !== 0) {
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min)
  }
  return { light, sat }
}

function laadBeeld(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Nodig om de canvas niet te "tainten" bij een logo van Supabase storage
    // (andere origin). Lukt dat niet, dan faalt getImageData → leesfout.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('laden mislukt'))
    img.src = url
  })
}

export async function kleurUitLogo(url: string): Promise<KleurResultaat> {
  let pixels: Uint8ClampedArray
  try {
    const img = await laadBeeld(url)
    const schaal = Math.min(1, MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * schaal))
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * schaal))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { fout: 'leesfout' }
    ctx.drawImage(img, 0, 0, w, h)
    pixels = ctx.getImageData(0, 0, w, h).data
  } catch {
    // Laadfout of getainte canvas (CORS): we kunnen de pixels niet lezen.
    return { fout: 'leesfout' }
  }

  // Kwantiseren naar 16 niveaus per kanaal en per emmer de echte kleur middelen,
  // zodat het voorstel een natuurlijke kleur is i.p.v. een emmer-hoekpunt.
  const emmers = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3]
    if (a < MIN_ALPHA) continue
    const { light, sat } = lichtEnSat(r, g, b)
    if (light > MAX_LIGHT || light < MIN_LIGHT || sat < MIN_SAT) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = emmers.get(key)
    if (e) { e.r += r; e.g += g; e.b += b; e.n += 1 }
    else { emmers.set(key, { r, g, b, n: 1 }) }
  }

  if (emmers.size === 0) return { fout: 'geen-kleur' }

  let beste: { r: number; g: number; b: number; n: number } | null = null
  for (const e of emmers.values()) {
    if (!beste || e.n > beste.n) beste = e
  }
  if (!beste) return { fout: 'geen-kleur' }

  return { hex: rgbNaarHex(beste.r / beste.n, beste.g / beste.n, beste.b / beste.n) }
}
