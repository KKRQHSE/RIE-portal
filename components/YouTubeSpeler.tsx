'use client'

import { useEffect, useRef } from 'react'

// YouTube-afspeeldetectie via de IFrame Player API. Meldt onBekeken zodra de
// afspeelpositie ≥ 90% van de duur bereikt (doorspoelen telt). onFout bij een
// niet-insluitbare/ontbrekende video.

type YTPlayer = {
  getCurrentTime?: () => number
  getDuration?: () => number
  destroy?: () => void
}
type YTNamespace = {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
  PlayerState: { PLAYING: number; ENDED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null
function laadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    const vorige = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { vorige?.(); resolve() }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

export default function YouTubeSpeler({
  videoId, onBekeken, onFout,
}: {
  videoId: string
  onBekeken: () => void
  onFout: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<number | null>(null)
  const bekekenRef = useRef(false)
  // Callbacks in een ref, zodat het effect niet herstart bij een nieuwe render.
  const cb = useRef({ onBekeken, onFout })
  cb.current = { onBekeken, onFout }

  useEffect(() => {
    let afgebroken = false

    function stop() { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
    function markBekeken() {
      if (bekekenRef.current) return
      bekekenRef.current = true
      stop()
      cb.current.onBekeken()
    }
    function startPolling() {
      if (intervalRef.current) return
      intervalRef.current = window.setInterval(() => {
        const p = playerRef.current
        const dur = p?.getDuration?.() ?? 0
        const cur = p?.getCurrentTime?.() ?? 0
        if (dur > 0 && cur / dur >= 0.9) markBekeken()
      }, 1000)
    }

    laadYouTubeApi().then(() => {
      if (afgebroken || !containerRef.current || !window.YT) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onError: () => cb.current.onFout(),
          onStateChange: (e: { data: number }) => {
            if (!window.YT) return
            if (e.data === window.YT.PlayerState.PLAYING) startPolling()
            if (e.data === window.YT.PlayerState.ENDED) markBekeken()
          },
        },
      })
    }).catch(() => cb.current.onFout())

    return () => {
      afgebroken = true
      stop()
      try { playerRef.current?.destroy?.() } catch { /* al weg */ }
      playerRef.current = null
    }
  }, [videoId])

  return (
    <div className="aspect-video w-full rounded overflow-hidden border border-surface bg-black">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
