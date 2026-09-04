'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Company, Module, Vraag, Foto, DashboardOverzicht } from '@/lib/types'
import { isNietAantoonbaar, type RieFilter } from '@/lib/rie-aantoonbaar'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { PvaRieVoortgang } from './DashboardClient'
import LogoutButton from './LogoutButton'
import ModuleCard from './ModuleCard'
import ModuleStatuskop from './ModuleStatuskop'
import HuisstijlLogo from './HuisstijlLogo'

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = {
  company: Company
  modules: Module[]
  vragen: Vraag[]
  fotos: Foto[]
  rie?: DashboardOverzicht['rie']
  pvaRie?: PvaRieVoortgang | null
  huisstijl?: HuisstijlView
}

export default function RieClient({
  company, modules, vragen, fotos, rie = null, pvaRie = null, huisstijl = VEILIGE_HUISSTIJL,
}: Props) {
  const [filter, setFilter] = useState<RieFilter>('Alle')

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
  const nietAantoonbaarCount = vragen.filter(isNietAantoonbaar).length

  // Eén knopstijl voor de drie filterstanden; alleen de actieve is gevuld.
  const knop = (actief: boolean) =>
    `btn text-xs px-3 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${
      actief ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20'
    }`

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

        <ModuleStatuskop
          titel={rie ? `RI&E versie ${rie.versie} — ${rie.status}` : 'RI&E'}
          ondertitel={
            rie?.toets_datum
              ? `Laatste toetsing: ${formatDatum(rie.toets_datum)}`
              : 'Nog geen toetsing vastgelegd.'
          }
          ring={pvaRie && pvaRie.totaal > 0 ? { waarde: pvaRie.afgerond, totaal: pvaRie.totaal, ringLabel: 'afgerond' } : null}
          cijfers={[
            { label: 'aandachtspunten', waarde: neeCount, kleur: neeCount > 0 ? 'text-amber-600' : 'text-ink' },
            ...(pvaRie ? [{ label: 'openstaande acties', waarde: pvaRie.open }] : []),
          ]}
          actie={{ label: 'Naar plan van aanpak', href: `/${company.id}/pva` }}
        />

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => setFilter('Alle')} className={knop(filter === 'Alle')}>
            Alle vragen
          </button>
          <button onClick={() => setFilter('Nee')} className={knop(filter === 'Nee')}>
            Alleen aandachtspunten ({neeCount})
          </button>
          <button
            onClick={() => setFilter('NietAantoonbaar')}
            className={knop(filter === 'NietAantoonbaar')}
            title="Vragen met antwoord Ja die niet aantoonbaar zijn"
          >
            Niet aantoonbaar ({nietAantoonbaarCount})
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
