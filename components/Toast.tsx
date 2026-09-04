'use client'

import { useEffect } from 'react'

// Korte, niet-blokkerende bevestiging na een gelukte (of mislukte) actie.
// Puur presentationeel — elke aanroeper houdt zijn eigen `bericht`-state
// (zelfde patroon als de bestaande lokale `melding`/`fout`-state overal in
// de app) en zet die na een paar seconden zelf weer op null via onSluiten.
// Geen backdrop-blur, geen zware effecten: alleen een korte fade+schuif.

type Props = {
  bericht: string | null
  soort?: 'succes' | 'fout'
  onSluiten: () => void
  duur?: number
}

export default function Toast({ bericht, soort = 'succes', onSluiten, duur = 2500 }: Props) {
  useEffect(() => {
    if (!bericht) return
    const t = setTimeout(onSluiten, duur)
    return () => clearTimeout(t)
  }, [bericht, duur, onSluiten])

  if (!bericht) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-50 left-1/2 -translate-x-1/2 bottom-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom)))]
        px-4 py-2.5 rounded-full shadow-lg text-sm font-medium text-white
        motion-safe:animate-[toast-in_200ms_ease-out]
        ${soort === 'fout' ? 'bg-red-600' : 'bg-ink'}`}
    >
      {soort === 'succes' ? '✓ ' : '⚠ '}{bericht}
    </div>
  )
}
