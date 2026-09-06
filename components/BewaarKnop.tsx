'use client'

import { useRef, useState } from 'react'
import { bewaarFotoOpTelefoon } from '@/lib/foto-bewaren'

// Gedeelde "bewaar op mijn telefoon"-knop, gebruikt bij foto's in zowel de
// werkplekinspectie (InspectieUitvoeren) als het incident-meldformulier
// (IncidentMeldClient). Twee weergaven:
//   - compact: klein rond icoonknopje, voor bovenop een kleine thumbnail
//     (InspectieUitvoeren's 20x20-rooster) — de tekst zit in aria-label/title.
//   - normaal: volledige tekstknop, voor in een rij met ruimte (het
//     meldformulier).
export default function BewaarKnop({
  bron, bestandsnaam, mimeType, label, bezigLabel, opgeslagenLabel, mislukLabel, compact = false,
}: {
  bron: string | Blob
  bestandsnaam: string
  mimeType?: string
  label: string
  bezigLabel: string
  opgeslagenLabel: string
  mislukLabel: string
  compact?: boolean
}) {
  const [bezig, setBezig] = useState(false)
  const [status, setStatus] = useState<'ok' | 'fout' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function klik() {
    if (bezig) return
    setBezig(true)
    setStatus(null)
    // Synchroon vanuit deze klik-handler aangeroepen (geen eigen await ervoor)
    // — de Web Share API vereist een verse user-gesture.
    const res = await bewaarFotoOpTelefoon(bron, bestandsnaam, mimeType)
    setBezig(false)
    if (res.ok) {
      setStatus('ok')
    } else if (res.fout !== 'geannuleerd') {
      setStatus('fout')
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus(null), 3000)
  }

  if (compact) {
    return (
      <button type="button" onClick={klik} disabled={bezig} aria-label={label} title={label}
        className="btn absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full bg-white border border-ink/20 text-ink/50 hover:text-accent hover:border-accent text-xs leading-none inline-flex items-center justify-center disabled:opacity-40">
        {status === 'ok' ? '✓' : status === 'fout' ? '!' : '⬇'}
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={klik} disabled={bezig}
        className="btn text-xs px-2.5 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-accent hover:text-accent transition-colors disabled:opacity-40">
        {bezig ? bezigLabel : `⬇ ${label}`}
      </button>
      {status === 'ok' && <span className="text-xs text-green-700">✓ {opgeslagenLabel}</span>}
      {status === 'fout' && <span className="text-xs text-red-600">{mislukLabel}</span>}
    </span>
  )
}
