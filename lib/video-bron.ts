// Bepaalt het brontype van een toolbox-video, zodat de juiste speler + afspeel-
// detectie gekozen kan worden. Pure helpers (client én server bruikbaar).
// Uitbreidbaar: een nieuwe bron (bv. Vimeo) wordt hier een extra tak.

export type VideoBron =
  | { type: 'youtube'; id: string }   // YouTube → IFrame Player API
  | { type: 'bestand'; src: string }  // direct videobestand → HTML5 <video>
  | { type: 'onbekend'; url: string } // niet automatisch afspeelbaar → fallback-link

const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)$/i

export function videoBron(url: string): VideoBron {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const id = u.searchParams.get('v') || (u.pathname.startsWith('/embed/') ? u.pathname.slice('/embed/'.length) : '')
      if (id) return { type: 'youtube', id }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      if (id) return { type: 'youtube', id }
    }
    // Directe bestand-URL (extensie) of een Supabase Storage-object (public/sign URL).
    if (VIDEO_EXT.test(u.pathname) || u.pathname.includes('/storage/v1/object/')) {
      return { type: 'bestand', src: url }
    }
  } catch { /* geen geldige URL (bv. een 'storage:'-ref of leeg) */ }
  return { type: 'onbekend', url }
}

// Conventie voor een privé-Storage-video: `storage:bucket/pad/naar/bestand.mp4`.
// De server zet dit (na token-validatie) om naar een kortlevende signed URL,
// zodat de bucket niet breed publiek hoeft te zijn.
export function parseStorageRef(url: string): { bucket: string; path: string } | null {
  const m = /^storage:([^/]+)\/(.+)$/.exec((url ?? '').trim())
  return m ? { bucket: m[1], path: m[2] } : null
}
