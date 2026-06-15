type Props = { value: number; total: number }

export default function ProgressRing({ value, total }: Props) {
  const r = 28
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? value / total : 0
  const offset = circ * (1 - pct)

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      {/* Achtergrondsring */}
      <circle cx="36" cy="36" r={r} fill="none" stroke="#E5E7EB" strokeWidth="6" />
      {/* Voortgangsring */}
      <circle
        cx="36" cy="36" r={r}
        fill="none"
        stroke="#FF5200"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}
