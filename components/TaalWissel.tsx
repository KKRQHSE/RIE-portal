'use client'

import { useSyncExternalStore, useCallback } from 'react'
import { TALEN, type Taal } from '@/lib/i18n-werknemer'

const SLEUTEL = 'rie-taal'

// sessionStorage is een externe bron, en daar is useSyncExternalStore voor.
// Eerder stond hier een useEffect die na de eerste render setState deed; dat
// werkte, maar het is precies het patroon dat React afraadt (cascaderende
// renders) en het gaf een lintfout.
//
// De drie stukjes hieronder doen samen hetzelfde als voorheen:
//   * abonneren  — luister naar wijzigingen in een ander tabblad (storage-event)
//                  én naar onze eigen setTaal (custom event, want storage vuurt
//                  niet in het tabblad dat zelf schrijft);
//   * client     — lees de opgeslagen taal, val bij twijfel terug op NL;
//   * server     — altijd NL, zodat de eerste render op de server en op de
//                  client gelijk zijn en er geen hydration-mismatch ontstaat.
const TAAL_EVENT = 'rie-taal-gewijzigd'

// Terugval voor browsers waar sessionStorage gooit (privémodus). Zonder dit zou
// de taalknop daar stil niets doen, terwijl het vroeger in het geheugen wél
// werkte — alleen niet bewaard bleef.
let taalInGeheugen: Taal = 'nl'

function abonneer(herteken: () => void): () => void {
  window.addEventListener('storage', herteken)
  window.addEventListener(TAAL_EVENT, herteken)
  return () => {
    window.removeEventListener('storage', herteken)
    window.removeEventListener(TAAL_EVENT, herteken)
  }
}

function leesClient(): Taal {
  try {
    const v = sessionStorage.getItem(SLEUTEL)
    return v === 'tr' || v === 'nl' ? v : taalInGeheugen
  } catch {
    return taalInGeheugen // geen sessionStorage (privémodus, oude browser)
  }
}

const leesServer = (): Taal => 'nl'

export function useTaal(): [Taal, (t: Taal) => void] {
  const taal = useSyncExternalStore(abonneer, leesClient, leesServer)

  const setTaal = useCallback((t: Taal) => {
    taalInGeheugen = t
    try { sessionStorage.setItem(SLEUTEL, t) } catch { /* stil */ }
    // Zelf seinen: het storage-event vuurt alleen in ándere tabbladen.
    window.dispatchEvent(new Event(TAAL_EVENT))
  }, [])

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
            className={`btn relative w-10 h-10 rounded-full overflow-hidden shadow-sm transition duration-150 ${
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
