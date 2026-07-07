'use client'

import { useState, useEffect } from 'react'
import { TALEN, type Taal } from '@/lib/i18n-werknemer'

const SLEUTEL = 'rie-taal'

// Taalkeuze onthouden binnen de sessie (sessionStorage). Default NL; op de server
// en bij de eerste render altijd NL (geen hydration-mismatch), daarna evt. TR.
export function useTaal(): [Taal, (t: Taal) => void] {
  const [taal, setTaalState] = useState<Taal>('nl')
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(SLEUTEL)
      if (v === 'tr' || v === 'nl') setTaalState(v)
    } catch { /* geen sessionStorage → NL */ }
  }, [])
  const setTaal = (t: Taal) => {
    setTaalState(t)
    try { sessionStorage.setItem(SLEUTEL, t) } catch { /* stil */ }
  }
  return [taal, setTaal]
}

// Inline SVG-vlaggen — bewust géén emoji-vlaggen (die renderen niet op alle
// platforms, o.a. Windows). Vierkante viewBox zodat ze zonder croppen in een
// ronde knop passen.
function VlagNL() {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full" aria-hidden="true" focusable="false">
      <rect width="60" height="60" fill="#AE1C28" />
      <rect y="20" width="60" height="40" fill="#FFFFFF" />
      <rect y="40" width="60" height="20" fill="#21468B" />
    </svg>
  )
}

function VlagTR() {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full" aria-hidden="true" focusable="false">
      <rect width="60" height="60" fill="#E30A17" />
      <circle cx="24" cy="30" r="15" fill="#FFFFFF" />
      <circle cx="28" cy="30" r="12" fill="#E30A17" />
      <path
        fill="#FFFFFF"
        d="M40 22 L42 27.25 47.61 27.53 43.23 31.05 44.7 36.47 40 33.4 35.3 36.47 36.77 31.05 32.39 27.53 38 27.25 Z"
      />
    </svg>
  )
}

const VLAGGEN: Record<Taal, { naam: string; Vlag: () => React.JSX.Element }> = {
  nl: { naam: 'Nederlands', Vlag: VlagNL },
  tr: { naam: 'Türkçe', Vlag: VlagTR },
}

// Vlaggen-taalschakelaar. Alleen op de werknemer-facing schermen. De actieve taal
// is vol/scherp met ring; de inactieve is gedempt (grijs + doorzichtig).
export default function TaalWissel({ taal, onTaal }: { taal: Taal; onTaal: (t: Taal) => void }) {
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label="Taal / Dil">
      {TALEN.map(t => {
        const actief = taal === t.code
        const { naam, Vlag } = VLAGGEN[t.code]
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onTaal(t.code)}
            aria-pressed={actief}
            aria-label={naam}
            title={naam}
            className={`relative w-10 h-10 rounded-full overflow-hidden shadow-sm transition duration-150 ${
              actief
                ? 'ring-2 ring-ink scale-105'
                : 'ring-1 ring-black/10 opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
            }`}
          >
            <Vlag />
          </button>
        )
      })}
    </div>
  )
}
