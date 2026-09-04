// Gedeelde, PURE helpers en constanten voor bewijs-upload/-weergave.
// Bevat bewust GEEN geheimen of service-role: dit bestand is veilig in zowel
// client- als server-code.

export const BEWIJS_BUCKET = 'bewijs'

// Maximale bestandsgrootte ná browser-verkleining.
export const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Geldigheid van een signed download-URL.
export const DOWNLOAD_GELDIGHEID_SEC = 60 * 60 // 1 uur

// Alleen afbeeldingen en pdf's zijn toegestaan (client-kant, ruime UX-check —
// laat bv. 'image/svg+xml' door voor een nette foutmelding vóór de upload;
// de harde grens ligt server-side in TOEGESTANE_MIME_TYPES hieronder).
export function isToegestaanType(type: string | undefined | null): boolean {
  if (!type) return false
  return type === 'application/pdf' || type.startsWith('image/')
}

// Server-/bucket-kant: exacte allowlist, geen wildcard. Bewust GEEN
// 'image/svg+xml' — een SVG kan script bevatten en is daarmee een
// stored-XSS-vector zodra hij ooit inline gerenderd wordt. Dit is de lijst
// die de upload-routes controleren én die als `allowed_mime_types` op de
// Storage-buckets staat (dubbele afdwinging, niet alleen de route).
export const TOEGESTANE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
] as const

export function isServerToegestaanType(type: unknown): type is (typeof TOEGESTANE_MIME_TYPES)[number] {
  return typeof type === 'string' && (TOEGESTANE_MIME_TYPES as readonly string[]).includes(type)
}

// Server-kant grootte-check: het argument komt van de client (de route krijgt
// de bytes zelf nooit te zien, die gaan rechtstreeks naar Storage via de
// signed URL) — dit weigert dus alleen overduidelijk te grote aanvragen vóór
// er een signed URL wordt gemint. De echte grens ligt in het bucket-limiet
// (file_size_limit), dat niet te omzeilen is door hierover te liegen.
export function isToegestaneGrootte(grootte: unknown): grootte is number {
  return typeof grootte === 'number' && Number.isFinite(grootte) && grootte > 0 && grootte <= MAX_BYTES
}

export function isAfbeelding(type: string | undefined | null): boolean {
  return !!type && type.startsWith('image/')
}

// Opties voor createSignedUrl: alleen afbeeldingen mogen inline gerenderd
// worden (de app toont ze zelf als <img> in een thumbnail) — raster-
// afbeeldingen kunnen geen script uitvoeren, dus dat is veilig zolang de
// bucket-allowlist hierboven écht alleen raster-types + pdf toelaat. Alles
// wat GEEN afbeelding is (in de praktijk: pdf) wordt hier altijd via een
// <a target="_blank">-navigatie geopend, nooit als <img> — daarvoor forceren
// we content-disposition: attachment, zodat de browser 'm nooit inline
// probeert te tonen (defense-in-depth tegen embedded content in een pdf).
export function signedUrlOpties(type: string | null | undefined, bestandsnaam: string | null | undefined) {
  if (isAfbeelding(type)) return undefined
  return { download: bestandsnaam || true }
}

// Veilige, korte extensie uit een bestandsnaam (anders 'bin').
export function veiligeExt(bestandsnaam: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(bestandsnaam ?? '')
  return m ? m[1].toLowerCase() : 'bin'
}

// Defense-in-depth aan de route-grens: een opslagpad dat we aan de service role
// (signed Storage-URL) doorgeven moet een bucket-relatieve sleutel zijn die binnen
// de eigen bewijs-opslag blijft. De gast-RPC's reserveren/leveren zulke paden al
// veilig op; deze check borgt dat er nooit padmanipulatie (../, absolute paden,
// backslash-/null-trucs) doorheen glipt mocht het pad-schema ooit wijzigen.
export function isVeiligOpslagPad(pad: unknown): pad is string {
  if (typeof pad !== 'string' || !pad) return false
  if (pad.startsWith('/')) return false   // geen absoluut pad
  if (pad.includes('\\')) return false     // geen backslash-trucs
  if (pad.includes('\0')) return false     // geen null-byte
  return !pad.split('/').includes('..')    // geen '..'-segment
}

// jsonb RPC-resultaten komen soms als string binnen — net als elders in de app.
export function parseJson<T>(data: unknown): T | null {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T
    } catch {
      return null
    }
  }
  return data as T
}

// Vorm die de download-routes teruggeven aan de browser.
export type BewijsItem = {
  id: string
  bestandsnaam: string | null
  type: string | null
  grootte: number | null
  geupload_door: string | null
  created_at: string | null
  downloadUrl: string | null
}
