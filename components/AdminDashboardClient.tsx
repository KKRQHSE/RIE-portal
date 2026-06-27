'use client'

import Link from 'next/link'
import type { DashboardAdminRegel } from '@/lib/types'
import LogoutButton from './LogoutButton'

function datumNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Klein telbolletje; gekleurd zodra er aandacht nodig is, anders grijs/onzichtbaar.
function Badge({ n, label, urgent }: { n: number; label: string; urgent?: boolean }) {
  if (!n) return <span className="text-xs text-ink/25">0 {label}</span>
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        urgent ? 'bg-red-100 text-red-700' : 'bg-accent/10 text-accent'
      }`}
    >
      {n} {label}
    </span>
  )
}

export default function AdminDashboardClient({
  bedrijven, email,
}: {
  bedrijven: DashboardAdminRegel[]
  email: string | null
}) {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-ink">Beheer</h1>
          <LogoutButton />
        </div>
        <p className="text-sm text-ink/50 mb-6">
          {bedrijven.length} {bedrijven.length === 1 ? 'bedrijf' : 'bedrijven'} · gesorteerd op wat aandacht vraagt
          {email && <span className="text-ink/30"> · {email}</span>}
        </p>

        {bedrijven.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-ink/50">Nog geen bedrijven om te tonen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bedrijven.map((b) => {
              // Visuele aandacht-signalering: rood bij overschreden termijn,
              // accent bij wachtende beoordelingen, anders neutraal.
              const rand = b.over_termijn > 0
                ? 'border-l-4 border-red-500'
                : b.te_beoordelen > 0
                ? 'border-l-4 border-accent'
                : 'border-l-4 border-transparent'
              return (
                <Link
                  key={b.id}
                  href={`/${b.id}/dashboard`}
                  className={`block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow ${rand}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{b.name}</p>
                      <p className="text-xs text-ink/40 mt-0.5">
                        Laatste activiteit: {datumNL(b.laatste_activiteit)}
                        {b.rie_status && <> · RI&amp;E {b.rie_status}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-semibold text-ink tabular-nums">{b.pct}%</p>
                      <p className="text-xs text-ink/40 tabular-nums">{b.pva_afgerond}/{b.pva_totaal}</p>
                    </div>
                  </div>
                  {/* Dunne voortgangsbalk voor snel scannen */}
                  <div className="h-1.5 rounded-full bg-ink/10 mt-3 overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${b.pct}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge n={b.te_beoordelen} label="te beoordelen" />
                    <Badge n={b.over_termijn} label="over termijn" urgent />
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/bibliotheek"
            className="inline-block text-sm px-4 py-2 rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
          >
            Centrale bibliotheek beheren
          </Link>
          <Link
            href="/admin/toolboxen"
            className="inline-block text-sm px-4 py-2 rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
          >
            Centrale toolboxen beheren
          </Link>
          <Link
            href="/admin/huisstijl"
            className="inline-block text-sm px-4 py-2 rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
          >
            Huisstijl beheren
          </Link>
        </div>
      </div>
    </main>
  )
}
