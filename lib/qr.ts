// Zelfstandige, dependency-vrije QR-encoder (byte- en numeriek-modus), EC-niveau L,
// versies 1-10. Levert een boolean-matrix (true = zwarte module). Bewust géén npm-
// dependency en géén externe call: het bedrijfstoken in de meldlink blijft intern.
//
// Volgt ISO/IEC 18004: mode + char-count, RS-foutcorrectie over GF(256) (primitief
// 0x11D), standaard patroonplaatsing (finder/timing/alignment/dark), masking met
// straf-score, en BCH-gecodeerde format- + versie-informatie. Geverifieerd met
// scripts/qr_selftest.mjs (RS-eigenschap, structuur, format/versie round-trip,
// data round-trip). Voor productiegebruik: één keer met een echte scanner testen.

// ---- GF(256) ----
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i])
      next[j + 1] ^= poly[j]
    }
    poly = next
  }
  return poly
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen)
  const res = new Array<number>(ecLen).fill(0)
  for (const d of data) {
    const factor = d ^ res[0]
    res.shift()
    res.push(0)
    if (factor !== 0) for (let i = 0; i < gen.length - 1; i++) res[i] ^= gfMul(gen[i + 1], factor)
  }
  return res
}

// ---- Capaciteitstabellen (EC-niveau L), versies 1-10 ----
// [ecPerBlock, [blokken, dataPerBlok]...]
const EC_L: Record<number, [number, Array<[number, number]>]> = {
  1: [7, [[1, 19]]],
  2: [10, [[1, 34]]],
  3: [15, [[1, 55]]],
  4: [20, [[1, 80]]],
  5: [26, [[1, 108]]],
  6: [18, [[2, 68]]],
  7: [20, [[2, 78]]],
  8: [24, [[2, 97]]],
  9: [30, [[2, 116]]],
  10: [18, [[2, 68], [2, 69]]],
}
const totaalData = (v: number) => EC_L[v][1].reduce((s, [n, d]) => s + n * d, 0)

// Alignment-centers per versie (v1 = geen).
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}
// 18-bit versie-info (v7+).
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3,
}

// ---- Bitbuffer ----
class Bits {
  bits: number[] = []
  put(val: number, len: number) { for (let i = len - 1; i >= 0; i--) this.bits.push((val >> i) & 1) }
}

const isNumeriek = (s: string) => /^[0-9]*$/.test(s)

function encodeData(text: string, version: number): number[] {
  const bytes = new TextEncoder().encode(text)
  const bb = new Bits()
  const numeriek = isNumeriek(text)

  if (numeriek) {
    bb.put(1, 4) // numeriek-modus
    bb.put(text.length, version <= 9 ? 10 : 12)
    for (let i = 0; i < text.length; i += 3) {
      const groep = text.slice(i, i + 3)
      bb.put(parseInt(groep, 10), groep.length === 3 ? 10 : groep.length === 2 ? 7 : 4)
    }
  } else {
    bb.put(4, 4) // byte-modus
    bb.put(bytes.length, version <= 9 ? 8 : 16)
    for (const b of bytes) bb.put(b, 8)
  }

  const capBits = totaalData(version) * 8
  if (bb.bits.length > capBits) throw new Error('QR: tekst past niet in versie ' + version)

  // Terminator + byte-uitlijning + opvulbytes.
  const term = Math.min(4, capBits - bb.bits.length)
  bb.put(0, term)
  while (bb.bits.length % 8 !== 0) bb.bits.push(0)
  const codewords: number[] = []
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j]
    codewords.push(v)
  }
  const pad = [0xec, 0x11]
  let pi = 0
  while (codewords.length < totaalData(version)) codewords.push(pad[pi++ % 2])
  return codewords
}

// Data + EC opdelen in blokken en interleaven.
function interleave(dataCw: number[], version: number): number[] {
  const [ecLen, groepen] = EC_L[version]
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let idx = 0
  for (const [aantal, dataPer] of groepen) {
    for (let b = 0; b < aantal; b++) {
      const blok = dataCw.slice(idx, idx + dataPer)
      idx += dataPer
      dataBlocks.push(blok)
      ecBlocks.push(rsEncode(blok, ecLen))
    }
  }
  const out: number[] = []
  const maxData = Math.max(...dataBlocks.map(b => b.length))
  for (let i = 0; i < maxData; i++) for (const blok of dataBlocks) if (i < blok.length) out.push(blok[i])
  for (let i = 0; i < ecLen; i++) for (const blok of ecBlocks) out.push(blok[i])
  return out
}

// ---- Matrixplaatsing ----
type Cell = { v: boolean; fixed: boolean }

function leegMatrix(n: number): Cell[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => ({ v: false, fixed: false })))
}
function zet(m: Cell[][], r: number, c: number, v: boolean) { m[r][c] = { v, fixed: true } }

function plaatsFinder(m: Cell[][], r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
    const rr = r + dr, cc = c + dc
    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue
    const rand = dr === -1 || dr === 7 || dc === -1 || dc === 7
    const buiten = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
      (dr === 0 || dr === 6 || dc === 0 || dc === 6)
    const binnen = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
    zet(m, rr, cc, rand ? false : (buiten || binnen))
  }
}

function plaatsAlignment(m: Cell[][], r: number, c: number) {
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    const ring = Math.max(Math.abs(dr), Math.abs(dc))
    zet(m, r + dr, c + dc, ring !== 1)
  }
}

function bouwFunctiepatronen(version: number): Cell[][] {
  const n = version * 4 + 17
  const m = leegMatrix(n)
  plaatsFinder(m, 0, 0)
  plaatsFinder(m, 0, n - 7)
  plaatsFinder(m, n - 7, 0)
  // Timing-patronen
  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0
    if (!m[6][i].fixed) zet(m, 6, i, v)
    if (!m[i][6].fixed) zet(m, i, 6, v)
  }
  // Alignment (niet over finders)
  const centers = ALIGN[version]
  for (const r of centers) for (const c of centers) {
    if (m[r][c].fixed) continue
    plaatsAlignment(m, r, c)
  }
  // Reserveer format-gebieden (worden later gevuld) → markeer fixed zodat data ze mijdt.
  for (let i = 0; i < 9; i++) { if (!m[8][i].fixed) zet(m, 8, i, false); if (!m[i][8].fixed) zet(m, i, 8, false) }
  // Horizontale strip bij rechtsboven-finder (8 cellen) + verticale strip bij
  // linksonder-finder (7 cellen: n-1..n-7; n-8 is de dark module).
  for (let i = 0; i < 8; i++) if (!m[8][n - 1 - i].fixed) zet(m, 8, n - 1 - i, false)
  for (let i = 0; i < 7; i++) if (!m[n - 1 - i][8].fixed) zet(m, n - 1 - i, 8, false)
  // Dark module (ná de reservering, zodat hij niet wordt overschreven).
  zet(m, n - 8, 8, true)
  // Reserveer versie-info-gebieden (v7+)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      zet(m, i, n - 11 + j, false)
      zet(m, n - 11 + j, i, false)
    }
  }
  return m
}

function plaatsData(m: Cell[][], codewords: number[]) {
  const n = m.length
  const bitsArr: number[] = []
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bitsArr.push((cw >> i) & 1)
  let bitIdx = 0
  let opwaarts = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col-- // timing-kolom overslaan
    for (let i = 0; i < n; i++) {
      const row = opwaarts ? n - 1 - i : i
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (m[row][cc].fixed) continue
        const bit = bitIdx < bitsArr.length ? bitsArr[bitIdx++] : 0
        m[row][cc] = { v: bit === 1, fixed: false }
      }
    }
    opwaarts = !opwaarts
  }
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function pasMaskToe(m: Cell[][], mask: number): Cell[][] {
  const fn = MASKS[mask]
  return m.map((rij, r) => rij.map((cel, c) => (cel.fixed ? cel : { v: cel.v !== fn(r, c), fixed: false })))
}

function formatBits(ecLevel: number, mask: number): number[] {
  // ecLevel-indicator: L=01. data = 5 bits (2 ec + 3 mask).
  const data = (ecLevel << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0x537 : 0)
  const bits = ((data << 10) | rem) ^ 0x5412
  const out: number[] = []
  for (let i = 14; i >= 0; i--) out.push((bits >> i) & 1)
  return out
}

function plaatsFormat(m: Cell[][], ecLevel: number, mask: number) {
  const n = m.length
  const f = formatBits(ecLevel, mask)
  // Kopie 1: rond linksboven
  const posA: Array<[number, number]> = []
  for (let i = 0; i <= 5; i++) posA.push([8, i])
  posA.push([8, 7], [8, 8], [7, 8])
  for (let i = 9; i <= 14; i++) posA.push([14 - i, 8])
  // Kopie 2: bits 0..6 langs kolom 8 bij de linksonder-finder (rijen n-1..n-7),
  // bits 7..14 langs rij 8 bij de rechtsboven-finder (kolommen n-8..n-1).
  const posB: Array<[number, number]> = []
  for (let i = 0; i <= 6; i++) posB.push([n - 1 - i, 8])
  for (let i = 7; i <= 14; i++) posB.push([8, n - 15 + i])
  f.forEach((bit, i) => { m[posA[i][0]][posA[i][1]] = { v: bit === 1, fixed: true } })
  f.forEach((bit, i) => { m[posB[i][0]][posB[i][1]] = { v: bit === 1, fixed: true } })
}

function plaatsVersie(m: Cell[][], version: number) {
  if (version < 7) return
  const n = m.length
  const info = VERSION_INFO[version]
  // Bit i op rij floor(i/3), kolom (n-11 + i%3) — en gespiegeld in het linksonder-blok.
  for (let i = 0; i < 18; i++) {
    const bit = (info >> i) & 1
    const a = Math.floor(i / 3), b = i % 3
    m[a][n - 11 + b] = { v: bit === 1, fixed: true }
    m[n - 11 + b][a] = { v: bit === 1, fixed: true }
  }
}

function strafScore(m: Cell[][]): number {
  const n = m.length
  const g = (r: number, c: number) => m[r][c].v
  let straf = 0
  // Regel 1: rijen/kolommen van 5+ gelijk
  for (let r = 0; r < n; r++) for (let dir = 0; dir < 2; dir++) {
    let run = 1
    for (let c = 1; c < n; c++) {
      const a = dir === 0 ? g(r, c) : g(c, r)
      const b = dir === 0 ? g(r, c - 1) : g(c - 1, r)
      if (a === b) { run++; if (run === 5) straf += 3; else if (run > 5) straf++ }
      else run = 1
    }
  }
  // Regel 2: 2x2 blokken
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = g(r, c)
    if (v === g(r, c + 1) && v === g(r + 1, c) && v === g(r + 1, c + 1)) straf += 3
  }
  // Regel 3: finder-achtig patroon
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false]
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true]
  for (let r = 0; r < n; r++) for (let c = 0; c <= n - 11; c++) {
    const rij: boolean[] = [], kol: boolean[] = []
    for (let k = 0; k < 11; k++) { rij.push(g(r, c + k)); kol.push(g(c + k, r)) }
    const eq = (a: boolean[], b: boolean[]) => a.every((x, i) => x === b[i])
    if (eq(rij, pat1) || eq(rij, pat2)) straf += 40
    if (eq(kol, pat1) || eq(kol, pat2)) straf += 40
  }
  // Regel 4: donker/licht-balans
  let donker = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g(r, c)) donker++
  const pct = (donker * 100) / (n * n)
  straf += Math.floor(Math.abs(pct - 50) / 5) * 10
  return straf
}

function kiesVersie(text: string): number {
  const numeriek = isNumeriek(text)
  const bytes = new TextEncoder().encode(text).length
  for (let v = 1; v <= 10; v++) {
    const cap = totaalData(v) * 8
    const count = numeriek ? (v <= 9 ? 10 : 12) : (v <= 9 ? 8 : 16)
    const overhead = 4 + count
    const nodig = numeriek
      ? overhead + Math.ceil(text.length / 3) * 10 // ruime bovengrens
      : overhead + bytes * 8
    if (nodig <= cap) return v
  }
  throw new Error('QR: tekst te lang (max versie 10)')
}

const EC_LEVEL_L = 0b01

// Publieke functie: tekst → boolean-matrix.
export function maakQrMatrix(text: string): boolean[][] {
  if (!text) throw new Error('QR: lege tekst')
  const version = kiesVersie(text)
  const codewords = interleave(encodeData(text, version), version)

  const basis = bouwFunctiepatronen(version)
  plaatsData(basis, codewords)

  let beste: Cell[][] | null = null
  let besteStraf = Infinity
  let besteMask = 0
  for (let mask = 0; mask < 8; mask++) {
    const gemaskt = pasMaskToe(basis, mask)
    plaatsFormat(gemaskt, EC_LEVEL_L, mask)
    plaatsVersie(gemaskt, version)
    const straf = strafScore(gemaskt)
    if (straf < besteStraf) { besteStraf = straf; beste = gemaskt; besteMask = mask }
  }
  void besteMask
  return (beste as Cell[][]).map(rij => rij.map(cel => cel.v))
}
