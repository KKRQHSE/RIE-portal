'use client'

import { useEffect, useState } from 'react'

type Props = {
  value: number
  total: number
  size?: number
  /** Kort label onder het percentage, bv. "afgerond". */
  label?: string
}

// Speedometer-achtige voortgangsgauge: een 270°-boog met een neutrale track en
// een accent-gefillde waardeboog (huisstijl-gradient), met het percentage groot
// in het midden. De boog vult op bij het laden. Kleuren volledig token-gedreven
// (--color-accent / --color-ink) — niets hardcoded.
export default function Gauge({ value, total, size = 92, label }: Props) {
  const R = 40
  const CIRC = 2 * Math.PI * R
  const SWEEP = 0.75 // 270° zichtbaar, opening onderaan
  const doel = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  const procent = Math.round(doel * 100)

  // Van 0 → doel animeren zodra de component gemount is (satisfying fill-up).
  const [anim, setAnim] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnim(doel))
    return () => cancelAnimationFrame(id)
  }, [doel])

  const track = `${SWEEP * CIRC} ${CIRC}`
  const waarde = `${anim * SWEEP * CIRC} ${CIRC}`

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="block">
        <defs>
          <linearGradient id="gauge-accent" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent, #FF5200)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-accent, #FF5200)" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Track (neutraal, uit de ink-token) */}
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke="var(--color-ink, #14161B)" strokeOpacity="0.1"
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={track} transform="rotate(135 50 50)"
        />
        {/* Waardeboog (accent-gradient) */}
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke="url(#gauge-accent)"
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={waarde} transform="rotate(135 50 50)"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-ink tabular-nums leading-none">{procent}%</span>
        {label && <span className="text-[10px] text-ink/40 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
