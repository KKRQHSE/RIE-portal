'use client'

import { useRef } from 'react'

// HTML5-afspeeldetectie voor een direct videobestand. Meldt onBekeken zodra de
// afspeelpositie ≥ 90% van de duur bereikt (doorspoelen telt). onFout bij een
// laadfout (netwerk, 404, niet-afspeelbaar formaat).
export default function BestandSpeler({
  src, onBekeken, onFout,
}: {
  src: string
  onBekeken: () => void
  onFout: () => void
}) {
  const bekekenRef = useRef(false)

  function markBekeken() {
    if (bekekenRef.current) return
    bekekenRef.current = true
    onBekeken()
  }

  function bijTijd(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget
    if (el.duration && isFinite(el.duration) && el.currentTime / el.duration >= 0.9) markBekeken()
  }

  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      onTimeUpdate={bijTijd}
      onEnded={markBekeken}
      onError={onFout}
      className="w-full aspect-video rounded border border-surface bg-black"
    />
  )
}
