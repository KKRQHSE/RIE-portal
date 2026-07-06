'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Company, Module, Vraag, Foto } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import LogoutButton from './LogoutButton'
import ModuleCard from './ModuleCard'
import HuisstijlLogo from './HuisstijlLogo'

type Props = {
  company: Company
  modules: Module[]
  vragen: Vraag[]
  fotos: Foto[]
  huisstijl?: HuisstijlView
}

export default function RieClient({ company, modules, vragen, fotos, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  const [filter, setFilter] = useState<'Alle' | 'Nee'>('Alle')

  // Lees de URL-hash client-side uit zonder hydration-mismatch of setState in
  // een effect: server-snapshot is leeg, na hydratie volgt de echte hash.
  const hash = useSyncExternalStore(
    () => () => {},
    () => window.location.hash,
    () => ''
  )
  const m = hash.match(/^#vraag-(.+)$/)
  const highlightVraag = m ? decodeURIComponent(m[1]) : null

  const neeCount = vragen.filter(v => v.antwoord === 'Nee').length

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Risico-inventarisatie &amp; -evaluatie</p>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setFilter('Alle')}
            className={`text-xs px-3 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${
              filter === 'Alle' ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20'
            }`}
          >
            Alle vragen
          </button>
          <button
            onClick={() => setFilter('Nee')}
            className={`text-xs px-3 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${
              filter === 'Nee' ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20'
            }`}
          >
            Alleen aandachtspunten ({neeCount})
          </button>
        </div>

        <div className="space-y-3">
          {modules.map(mod => (
            <ModuleCard
              key={mod.id}
              companyId={company.id}
              module={mod}
              vragen={vragen.filter(v => v.module_id === mod.id)}
              fotos={fotos}
              filter={filter}
              highlightVraag={highlightVraag}
            />
          ))}
          {modules.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Geen RI&amp;E-inhoud gevonden.</p>
          )}
        </div>
      </div>
    </main>
  )
}
