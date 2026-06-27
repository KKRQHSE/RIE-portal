'use client'

import type { ToolboxDashboard, ToolboxDashboardStatus } from '@/lib/types'

const STATUS: Record<ToolboxDashboardStatus, { label: string; stijl: string }> = {
  loopt_achter: { label: 'Loopt achter', stijl: 'bg-red-100 text-red-700' },
  op_schema:    { label: 'Op schema',    stijl: 'bg-green-100 text-green-800' },
  klaar:        { label: 'Klaar',        stijl: 'bg-green-100 text-green-800' },
  geen_doel:    { label: 'Geen doel',    stijl: 'bg-gray-100 text-gray-600' },
  uit_dienst:   { label: 'Niet meer in dienst', stijl: 'bg-gray-100 text-gray-500' },
}

function Balk({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
    </div>
  )
}

export default function ToolboxDashboardView({ dashboard }: { dashboard: ToolboxDashboard | null }) {
  if (!dashboard) {
    return <p className="text-sm text-ink/50">Het dashboard kon niet worden geladen.</p>
  }
  const { jaar, bedrijf, per_functiegroep, personen } = dashboard
  const heeftDoel = bedrijf.doel > 0

  return (
    <div className="space-y-4">
      {/* Bedrijfsbreed */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-2">Bedrijfsbreed · {jaar}</p>
        {heeftDoel ? (
          <>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-3xl font-semibold text-ink tabular-nums">{bedrijf.pct ?? 0}%</span>
              <span className="text-sm text-ink/50 mb-1">{bedrijf.gedaan} van {bedrijf.doel} (naar rato) aantoonbaar gedaan</span>
            </div>
            <Balk pct={bedrijf.pct} />
          </>
        ) : (
          <p className="text-sm text-ink/50">Nog geen doelstelling ingesteld. Stel bij <span className="font-medium">Doelstellingen</span> een aantal per functiegroep in.</p>
        )}
      </div>

      {/* Per functiegroep */}
      {per_functiegroep.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Per functiegroep</p>
          {per_functiegroep.map(g => (
            <div key={g.functiegroep_id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink">{g.naam ?? '—'} <span className="text-ink/40">· {g.aantal_personen} {g.aantal_personen === 1 ? 'persoon' : 'personen'}</span></span>
                <span className="tabular-nums text-ink/60">{g.pct ?? 0}% · {g.gedaan}/{g.doel}</span>
              </div>
              <Balk pct={g.pct} />
            </div>
          ))}
        </div>
      )}

      {/* Personen */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-3">Personen</p>
        {personen.length === 0 ? (
          <p className="text-sm text-ink/40">Nog geen personen.</p>
        ) : (
          <ul className="divide-y divide-surface">
            {personen.map(p => (
              <li key={p.persoon_id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{p.naam}</p>
                  <p className="text-xs text-ink/40">
                    {p.functiegroep_naam ?? 'geen functiegroep'}
                    {p.status !== 'uit_dienst' && p.status !== 'geen_doel' && (
                      <> · verwacht nu {p.verwacht_nu}</>
                    )}
                    {p.datum_uit_dienst ? ` · uit dienst ${p.datum_uit_dienst}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm tabular-nums text-ink/70">{p.gedaan}/{p.doel}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS[p.status].stijl}`}>{STATUS[p.status].label}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
