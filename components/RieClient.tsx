'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import type { Company, Module, Vraag, Foto, Locatie, DashboardOverzicht, RieToetsing } from '@/lib/types'
import { isNietAantoonbaar, type RieFilter } from '@/lib/rie-aantoonbaar'
import { filterVragenOpLocatie } from '@/lib/rie-locatie-filter'
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
  locaties?: Locatie[]
  rie?: DashboardOverzicht['rie']
  pvaRie?: PvaRieVoortgang | null
  // GETOETST-kenmerk + of er een leesbaar toetsverslag bij hoort (migratie 0087).
  toetsing?: RieToetsing | null
  heeftToetsverslag?: boolean
  huisstijl?: HuisstijlView
}

// 'alle' = geen locatiefilter (huidig gedrag, ook het enige mogelijke pad bij
// een bedrijf zonder locaties). Anders: toon organisatiebrede vragen +
// vragen van precies deze locatie.
type LocatieFilter = 'alle' | string

export default function RieClient({
  company, modules, vragen, fotos, locaties = [], rie = null, pvaRie = null,
  toetsing = null, heeftToetsverslag = false, huisstijl = VEILIGE_HUISSTIJL,
}: Props) {
  const [filter, setFilter] = useState<RieFilter>('Alle')
  const [locatieFilter, setLocatieFilter] = useState<LocatieFilter>('alle')

  // Organisatiebrede vragen (locatie_id null) blijven altijd zichtbaar; bij
  // een gekozen locatie komen alleen de vragen van díe locatie erbij. Bij
  // 'alle' (default, en het enige pad zonder locaties) verandert er niets
  // t.o.v. het gedrag van vóór migratie 0080.
  const locatieNaam = Object.fromEntries(locaties.map(l => [l.id, l.naam]))
  const vragenZichtbaar = filterVragenOpLocatie(vragen, locatieFilter)

  // Lees de URL-hash client-side uit zonder hydration-mismatch of setState in
  // een effect: server-snapshot is leeg, na hydratie volgt de echte hash.
  const hash = useSyncExternalStore(
    () => () => {},
    () => window.location.hash,
    () => ''
  )
  const m = hash.match(/^#vraag-(.+)$/)
  const highlightVraag = m ? decodeURIComponent(m[1]) : null

  const neeCount = vragenZichtbaar.filter(v => v.antwoord === 'Nee').length
  const nietAantoonbaarCount = vragenZichtbaar.filter(isNietAantoonbaar).length

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
          titel={rie ? `RI&E versie ${rie.versie} · ${rie.status}` : 'RI&E'}
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
        >
          {toetsing?.toetser_naam && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-ink/70">
                <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full mr-2 align-middle">
                  Getoetst
                </span>
                RI&amp;E getoetst op {formatDatum(rie?.toets_datum ?? null)} door {toetsing.toetser_naam}, gecertificeerd
                kerndeskundige/HVK{toetsing.toetser_certificaatnummer ? ` (certificaatnummer ${toetsing.toetser_certificaatnummer})` : ''}
                {toetsing.toetser_namens ? `, namens ${toetsing.toetser_namens}.` : '.'}
              </p>
              {heeftToetsverslag && (
                <Link
                  href={`/${company.id}/rie/toetsverslag`}
                  className="text-sm text-accent hover:underline shrink-0"
                >
                  Bekijk toetsverslag →
                </Link>
              )}
            </div>
          )}
        </ModuleStatuskop>

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

        {/* Locatiefilter — alleen zichtbaar bij een bedrijf met locaties.
            Organisatiebrede vragen blijven bij elke keuze zichtbaar. */}
        {locaties.length > 0 && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button onClick={() => setLocatieFilter('alle')} className={knop(locatieFilter === 'alle')}>
              Alle locaties
            </button>
            {locaties.map(l => (
              <button key={l.id} onClick={() => setLocatieFilter(l.id)} className={knop(locatieFilter === l.id)}>
                {l.naam}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {modules.map(mod => (
            <ModuleCard
              key={mod.id}
              companyId={company.id}
              module={mod}
              vragen={vragenZichtbaar.filter(v => v.module_id === mod.id)}
              fotos={fotos}
              locatieNaam={locatieNaam}
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
