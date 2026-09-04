import Link from 'next/link'
import Gauge from './Gauge'

// ============================================================================
// Statuskop: ÉÉN consistent patroon bovenaan elke module — "hoe staat het
// ervoor" (voortgangsring + kerncijfers) plus een duidelijke primaire
// "begin hier"-knop. Uitsluitend een weergave: alle cijfers komen kant-en-klaar
// binnen (dezelfde RPC's als het dashboard), dit component verzint niets.
//
// Geen 'use client': puur presentationeel, geen state. De ring volgt de
// huisstijlkleur via Gauge (--color-accent, cascadet vanaf de pagina's <main>).
// ============================================================================

export type StatuskopCijfer = { label: string; waarde: string | number; kleur?: string }

type Props = {
  titel: string
  ondertitel?: string
  // null zolang er nog geen zinnige teller is (bv. module net actief, nog geen
  // data) — dan geen ring tonen in plaats van een misleidende 0%.
  ring: { waarde: number; totaal: number; ringLabel?: string } | null
  cijfers: StatuskopCijfer[]
  actie: { label: string; href: string }
}

export default function ModuleStatuskop({ titel, ondertitel, ring, cijfers, actie }: Props) {
  return (
    <div className="glass-tile rounded-2xl p-4 sm:p-5 mb-4 flex flex-wrap items-center gap-4">
      {ring && <Gauge value={ring.waarde} total={ring.totaal} size={72} label={ring.ringLabel} />}

      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-medium text-ink">{titel}</p>
        {ondertitel && <p className="text-xs text-ink/50 mt-0.5">{ondertitel}</p>}
        {cijfers.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
            {cijfers.map(c => (
              <div key={c.label} className="min-w-0">
                <span className={`text-base font-semibold tabular-nums ${c.kleur ?? 'text-ink'}`}>{c.waarde}</span>
                <span className="text-xs text-ink/50 ml-1.5">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href={actie.href}
        className="btn btn-accent shrink-0 text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium"
      >
        {actie.label}
      </Link>
    </div>
  )
}
