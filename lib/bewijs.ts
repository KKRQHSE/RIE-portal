// Gedeelde, PURE helpers en constanten voor bewijs-upload/-weergave.
// Bevat bewust GEEN geheimen of service-role: dit bestand is veilig in zowel
// client- als server-code.

export const BEWIJS_BUCKET = 'bewijs'

// Maximale bestandsgrootte ná browser-verkleining.
export const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Geldigheid van een signed download-URL.
export const DOWNLOAD_GELDIGHEID_SEC = 60 * 60 // 1 uur

// Alleen afbeeldingen en pdf's zijn toegestaan.
export function isToegestaanType(type: string | undefined | null): boolean {
  if (!type) return false
  return type === 'application/pdf' || type.startsWith('image/')
}

export function isAfbeelding(type: string | undefined | null): boolean {
  return !!type && type.startsWith('image/')
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
