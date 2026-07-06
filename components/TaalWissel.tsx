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

// Knoppenpaar NL | TR. Alleen op de werknemer-facing schermen.
export default function TaalWissel({ taal, onTaal }: { taal: Taal; onTaal: (t: Taal) => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink/15 bg-white p-0.5" role="group" aria-label="Taal / Dil">
      {TALEN.map(t => (
        <button
          key={t.code}
          type="button"
          onClick={() => onTaal(t.code)}
          aria-pressed={taal === t.code}
          className={`text-xs font-medium px-3 py-1.5 min-h-[36px] rounded-full transition-colors ${
            taal === t.code ? 'bg-ink text-white' : 'text-ink/50 hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
