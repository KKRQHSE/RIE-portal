'use client'

import Link from 'next/link'
import type { Company, DashboardOverzicht } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import ProgressRing from './ProgressRing'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'

type Props = {
  company: Company
  overzicht: DashboardOverzicht
  huisstijl?: HuisstijlView
  toonInspecties?: boolean
}

function datumNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Eén tegel: titel + inhoud, klikbaar als er een href is.
function Tegel({
  titel, children, href, urgent,
}: {
  titel: string
  children: React.ReactNode
  href?: string
  urgent?: boolean
}) {
  const inner = (
    <div
      className={`bg-white rounded-lg shadow-sm p-5 h-full min-h-[124px] ${
        href ? 'hover:shadow-md transition-shadow' : ''
      } ${urgent ? 'border-l-4 border-red-500' : ''}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-3">{titel}</p>
      {children}
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

// Rij met gelijke kolommen, zodat de getallen op elke schermbreedte netjes
// uitlijnen i.p.v. uit de kaart te lopen.
function Rij({ kolommen = 3, children }: { kolommen?: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid ${kolommen === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>{children}</div>
}

// Klein gekleurd getal-met-label-blokje binnen een tegel.
function Cijfer({ n, label, kleur }: { n: number; label: string; kleur?: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xl font-semibold tabular-nums ${kleur ?? 'text-ink'}`}>{n}</p>
      <p className="text-xs text-ink/50 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

export default function DashboardClient({
  company, overzicht, huisstijl = VEILIGE_HUISSTIJL, toonInspecties = false,
}: Props) {
  const { pva, te_beoordelen, prio_open, termijn, rie, inspecties, bewijs } = overzicht
  const cid = company.id

  const navItem = 'text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full transition-colors'
  const navActive = `${navItem} bg-ink text-white`
  const navRest = `${navItem} bg-white text-ink/60 border border-ink/20 hover:border-ink/40`

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
            <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
            <p className="text-sm text-ink/50 mt-0.5">Dashboard</p>
          </div>
          {company.approved_at && (
            <div className="text-right">
              <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
                RI&amp;E goedgekeurd
              </span>
              {company.approved_by && (
                <p className="text-xs text-ink/40 mt-1">{company.approved_by}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigatie */}
        <div className="flex flex-wrap gap-3 mb-6">
          <span className={navActive}>Dashboard</span>
          <Link href={`/${cid}/pva`} className={navRest}>Plan van Aanpak</Link>
          <Link href={`/${cid}/rie`} className={navRest}>Volledige RI&amp;E</Link>
          <Link href={`/${cid}/personen`} className={navRest}>Personen</Link>
          {toonInspecties && (
            <Link href={`/${cid}/inspecties`} className={navRest}>Werkplekinspectie</Link>
          )}
        </div>

        {/* Te beoordelen — de inbox. Alleen prominent als er iets wacht. */}
        {te_beoordelen > 0 && (
          <Link
            href={`/${cid}/pva`}
            className="block bg-accent/10 ring-1 ring-accent/30 rounded-lg p-5 mb-6 hover:bg-accent/15 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl font-semibold text-accent">{te_beoordelen}</span>
              <div>
                <p className="text-sm font-medium text-ink">
                  {te_beoordelen === 1 ? 'Actie wacht' : 'Acties wachten'} op jouw beoordeling
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  Een actiehouder diende een voorstel in — beoordeel het in het Plan van Aanpak →
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Tegelraster */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Voortgang PvA */}
          <Tegel titel="Voortgang Plan van Aanpak" href={`/${cid}/pva`}>
            <div className="flex items-center gap-5">
              <ProgressRing value={pva.afgerond} total={pva.totaal} />
              <div>
                <p className="text-2xl font-semibold text-ink">{pva.pct}%</p>
                <p className="text-sm text-ink/50">{pva.afgerond} van {pva.totaal} afgerond</p>
                <p className="text-xs text-ink/40 mt-1">
                  {pva.open} open · {pva.in_behandeling} in behandeling
                </p>
              </div>
            </div>
          </Tegel>

          {/* Termijn-urgentie */}
          <Tegel titel="Termijn" href={`/${cid}/pva`} urgent={termijn.over > 0}>
            <Rij>
              <Cijfer n={termijn.over} label="over de termijn"
                kleur={termijn.over > 0 ? 'text-red-600' : 'text-ink/30'} />
              <Cijfer n={termijn.binnenkort} label="binnen 30 dagen"
                kleur={termijn.binnenkort > 0 ? 'text-amber-600' : 'text-ink/30'} />
              <Cijfer n={termijn.zonder_datum} label="zonder datum" kleur="text-ink/40" />
            </Rij>
            {termijn.zonder_datum > 0 && (
              <p className="text-xs text-ink/40 mt-3">
                {termijn.zonder_datum} open {termijn.zonder_datum === 1 ? 'actie heeft' : 'acties hebben'} nog
                geen harde deadline.
              </p>
            )}
          </Tegel>

          {/* Openstaand per prioriteit */}
          <Tegel titel="Openstaand per prioriteit" href={`/${cid}/pva`}>
            <Rij>
              <Cijfer n={prio_open.Hoog} label="Hoog"
                kleur={prio_open.Hoog > 0 ? 'text-red-600' : 'text-ink/30'} />
              <Cijfer n={prio_open.Middel} label="Middel" kleur="text-ink" />
              <Cijfer n={prio_open.Laag} label="Laag" kleur="text-ink/60" />
            </Rij>
          </Tegel>

          {/* RI&E-geldigheid */}
          <Tegel titel="RI&E-geldigheid">
            {rie ? (
              <div>
                <p className="text-sm text-ink">
                  Versie {rie.versie} · <span className="capitalize">{rie.status}</span>
                </p>
                <p className={`text-sm mt-1 ${rie.verloopt_binnenkort ? 'text-amber-600 font-medium' : 'text-ink/50'}`}>
                  {rie.geldig_tot ? `Geldig tot ${datumNL(rie.geldig_tot)}` : 'Geen einddatum vastgelegd'}
                </p>
                {rie.verloopt_binnenkort && (
                  <p className="text-xs text-amber-600 mt-1">Verloopt binnenkort — hertoets inplannen.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink/40">Nog geen getoetste RI&amp;E-versie vastgelegd.</p>
            )}
          </Tegel>

          {/* Inspecties (alleen als de module aanstaat) */}
          {toonInspecties && (
            <Tegel titel="Werkplekinspecties" href={`/${cid}/inspecties`} urgent={inspecties.open_bevindingen > 0}>
              <Rij>
                <Cijfer n={inspecties.open} label="lopend" kleur="text-ink" />
                <Cijfer n={inspecties.afgerond} label="afgerond" kleur="text-ink/60" />
                <Cijfer n={inspecties.open_bevindingen} label="open bevindingen"
                  kleur={inspecties.open_bevindingen > 0 ? 'text-red-600' : 'text-ink/30'} />
              </Rij>
            </Tegel>
          )}

          {/* Bewijslast */}
          <Tegel titel="Bewijslast afgeronde acties" href={`/${cid}/pva`}>
            <Rij kolommen={2}>
              <Cijfer n={bewijs.afgerond_met_bewijs} label="met bewijs" kleur="text-green-700" />
              <Cijfer n={bewijs.afgerond_zonder_bewijs} label="zonder bewijs"
                kleur={bewijs.afgerond_zonder_bewijs > 0 ? 'text-amber-600' : 'text-ink/30'} />
            </Rij>
          </Tegel>

        </div>
      </div>
    </main>
  )
}
