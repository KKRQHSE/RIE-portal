// Zelftest voor lib/qr.ts — draaien: node scripts/qr_selftest.ts
// (Node 24 strip-types.) Geen camera nodig; combineert drie onafhankelijke checks:
//  1. codeword-totalen per versie == bekende QR-spec-waarden (valideert EC-tabel);
//  2. format-info leest ec-niveau L + gekozen mask terug (valideert format-BCH/plaatsing);
//  3. volledige round-trip: encode → onafhankelijke decode → moet EXACT de invoer geven
//     (valideert plaatsing, timing-skip, alignment, interleave, masking, data-codering).

import { maakQrMatrix } from '../lib/qr.ts'

const EC_L: Record<number, [number, Array<[number, number]>]> = {
  1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]],
  5: [26, [[1, 108]]], 6: [18, [[2, 68]]], 7: [20, [[2, 78]]], 8: [24, [[2, 97]]],
  9: [30, [[2, 116]]], 10: [18, [[2, 68], [2, 69]]],
}
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}
// Bekende totale codeword-aantallen (data+ec) per versie — externe spec-anker.
const TOTAAL_CW: Record<number, number> = {
  1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
}

// GF(256)
const EXP: number[] = new Array(512), LOG: number[] = new Array(256)
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] }
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])
function rsGen(deg: number): number[] { let p = [1]; for (let i = 0; i < deg; i++) { const n = new Array(p.length + 1).fill(0); for (let j = 0; j < p.length; j++) { n[j] ^= gfMul(p[j], EXP[i]); n[j + 1] ^= p[j] } p = n } return p }
function rsEc(data: number[], ecLen: number): number[] { const g = rsGen(ecLen); const r = new Array(ecLen).fill(0); for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < g.length - 1; i++) r[i] ^= gfMul(g[i + 1], f) } return r }

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

// Onafhankelijke functie-/reserveringskaart (true = géén datacel).
function functieKaart(version: number, n: number): boolean[][] {
  const f = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const mark = (r: number, c: number) => { if (r >= 0 && c >= 0 && r < n && c < n) f[r][c] = true }
  // Finders + separators + format-gebieden (9x9-hoeken).
  for (let r = 0; r <= 8; r++) for (let c = 0; c <= 8; c++) mark(r, c)
  for (let r = 0; r <= 8; r++) for (let c = n - 8; c < n; c++) mark(r, c)
  for (let r = n - 8; r < n; r++) for (let c = 0; c <= 8; c++) mark(r, c)
  // Timing
  for (let i = 0; i < n; i++) { mark(6, i); mark(i, 6) }
  // Alignment
  const ctr = ALIGN[version]
  for (const r of ctr) for (const c of ctr) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 8) || (r >= n - 8 && c <= 8)) continue
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc)
  }
  // Versie-info (v7+)
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { mark(i, n - 11 + j); mark(n - 11 + j, i) }
  return f
}

function decodeer(matrix: boolean[][]): { tekst: string; ecOk: boolean; mask: number } {
  const n = matrix.length
  const version = (n - 17) / 4
  // Format lezen (kopie 1) → ec-niveau + mask.
  const posA: Array<[number, number]> = []
  for (let i = 0; i <= 5; i++) posA.push([8, i])
  posA.push([8, 7], [8, 8], [7, 8])
  for (let i = 9; i <= 14; i++) posA.push([14 - i, 8])
  let raw = 0
  posA.forEach(([r, c], i) => { if (matrix[r][c]) raw |= 1 << (14 - i) })
  const unmasked = raw ^ 0x5412
  const data5 = unmasked >> 10
  const ecLevel = data5 >> 3, mask = data5 & 7
  const fn = MASKS[mask]

  // Datacellen in zigzag lezen + unmasken.
  const fk = functieKaart(version, n)
  const bits: number[] = []
  let op = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--   // timing-kolom overslaan, identiek aan de encoder
    for (let i = 0; i < n; i++) {
      const row = op ? n - 1 - i : i
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (fk[row][cc]) continue
        bits.push((matrix[row][cc] !== fn(row, cc)) ? 1 : 0)
      }
    }
    op = !op
  }
  const stream: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; stream.push(v) }

  // De-interleave.
  const [ecLen, groepen] = EC_L[version]
  const blokMaten: number[] = []
  for (const [aantal, dataPer] of groepen) for (let b = 0; b < aantal; b++) blokMaten.push(dataPer)
  const nBlok = blokMaten.length
  const dataBlok: number[][] = blokMaten.map(() => [])
  const maxData = Math.max(...blokMaten)
  let p = 0
  for (let i = 0; i < maxData; i++) for (let b = 0; b < nBlok; b++) if (i < blokMaten[b]) dataBlok[b].push(stream[p++])
  const ecBlok: number[][] = blokMaten.map(() => [])
  for (let i = 0; i < ecLen; i++) for (let b = 0; b < nBlok; b++) ecBlok[b].push(stream[p++])

  // RS-check per blok.
  let ecOk = true
  for (let b = 0; b < nBlok; b++) { const her = rsEc(dataBlok[b], ecLen); if (her.join(',') !== ecBlok[b].join(',')) ecOk = false }

  // Data-codewords → bits → mode/count/payload.
  const dataCw = dataBlok.flat()
  const db: number[] = []
  for (const cw of dataCw) for (let i = 7; i >= 0; i--) db.push((cw >> i) & 1)
  let idx = 0
  const read = (len: number) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | db[idx++]; return v }
  const mode = read(4)
  let tekst = ''
  if (mode === 4) { // byte
    const len = read(version <= 9 ? 8 : 16)
    const bytes: number[] = []
    for (let i = 0; i < len; i++) bytes.push(read(8))
    tekst = new TextDecoder().decode(new Uint8Array(bytes))
  } else if (mode === 1) { // numeriek
    const len = read(version <= 9 ? 10 : 12)
    let rest = len
    while (rest >= 3) { tekst += String(read(10)).padStart(3, '0'); rest -= 3 }
    if (rest === 2) tekst += String(read(7)).padStart(2, '0')
    else if (rest === 1) tekst += String(read(4))
  }
  return { tekst, ecOk, mask }
}

// ---- Uitvoeren ----
let fails = 0
const check = (naam: string, ok: boolean, det = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} — ${naam}${det ? ` (${det})` : ''}`) }

// 1. Codeword-totalen per versie.
for (let v = 1; v <= 10; v++) {
  const [ecLen, groepen] = EC_L[v]
  const nBlok = groepen.reduce((s, [a]) => s + a, 0)
  const data = groepen.reduce((s, [a, d]) => s + a * d, 0)
  check(`v${v}: codeword-totaal == spec`, data + nBlok * ecLen === TOTAAL_CW[v], `${data + nBlok * ecLen} vs ${TOTAAL_CW[v]}`)
}

// 2/3. Round-trip over uiteenlopende invoer (kort → lang, byte + numeriek).
const cases = [
  'HELLO',
  '01234567',
  'https://rie-portaal.example.com/melden/' + 'a'.repeat(64),
  'https://rie-portaal-qvox.vercel.app/melden/' + 'f3'.repeat(32),
  'kort',
  '9'.repeat(120),
  'Ongeval café — 30% méér € risico! ' + 'x'.repeat(40),
]
for (const invoer of cases) {
  try {
    const m = maakQrMatrix(invoer)
    const n = m.length
    const finderOk = m[0][0] && m[0][6] && m[6][0] && !m[0][7] && m[n - 8][8]
    const { tekst, ecOk, mask } = decodeer(m)
    const rt = tekst === invoer
    check(`round-trip (${invoer.length} tekens)`, rt && ecOk && finderOk,
      `rt=${rt} ec=${ecOk} finder=${finderOk} mask=${mask}${rt ? '' : ` kreeg:"${tekst.slice(0, 24)}"`}`)
  } catch (e) {
    check(`round-trip (${invoer.length} tekens)`, false, (e as Error).message)
  }
}

console.log(`\n## QR-zelftest -> ${fails === 0 ? 'PASS' : 'FAIL'} (${fails} fout)`)
process.exit(fails === 0 ? 0 : 1)
