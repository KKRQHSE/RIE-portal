'use client'

import Link from 'next/link'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type {
  InspectieRapport as InspectieRapportData,
  BevindingResultaat,
} from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDatumTijd(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<string, string> = {
  concept: 'Concept', ingediend: 'Ingediend', afgerond: 'Afgerond', geannuleerd: 'Geannuleerd',
}
const STATUS_STIJL: Record<string, string> = {
  concept: 'bg-blue-100 text-blue-800',
  ingediend: 'bg-blue-100 text-blue-800',
  afgerond: 'bg-green-100 text-green-800',
  geannuleerd: 'bg-gray-100 text-gray-600',
}

const RESULTAAT_LABEL: Record<BevindingResultaat, string> = {
  in_orde: 'In orde', niet_in_orde: 'Niet in orde', nvt: 'N.v.t.',
}
const RESULTAAT_STIJL: Record<BevindingResultaat, string> = {
  in_orde: 'bg-green-600 text-white',
  niet_in_orde: 'bg-red-600 text-white',
  nvt: 'bg-ink text-white',
}

const AFHANDELING_LABEL: Record<string, string> = {
  meteen_hersteld: 'Meteen hersteld',
  actie: 'Actie aangemaakt',
}

type Props = {
  companyId: string
  rapport: InspectieRapportData
  huisstijl?: HuisstijlView
}

export default function InspectieRapport({ companyId, rapport, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  const datum = rapport.uitgevoerd_op ?? rapport.aangemaakt_op
  const isAfgerond = rapport.status === 'afgerond'

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Werkbalk — verdwijnt bij afdrukken */}
        <div className="flex items-center justify-between gap-3 mb-6 no-print">
          <Link
            href={`/${companyId}/inspecties`}
            className="text-sm text-ink/50 hover:text-ink inline-flex items-center gap-1 min-h-[44px]"
          >
            ← Terug naar bibliotheek
          </Link>
          <button
            onClick={() => window.print()}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity"
          >
            Afdrukken / PDF
          </button>
        </div>

        {/* Print-only kopregel: bedrijf + afdrukdatum bovenaan elke pagina-afdruk. */}
        <div className="print-only mb-4 text-xs text-black border-b border-black/30 pb-2">
          {rapport.company_naam} · Werkplekinspectie · afgedrukt {formatDatum(new Date().toISOString())}
        </div>

        {/* Kop */}
        <section className="bg-white rounded-lg shadow-sm p-5 mb-4 rapport-card">
          <div className="no-print mb-3">
            <HuisstijlLogo huisstijl={huisstijl} />
          </div>
          <p className="text-sm text-ink/50">{rapport.company_naam}</p>
          <h1 className="text-2xl font-semibold text-ink mt-0.5">{rapport.naam ?? 'Inspectie'}</h1>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4 text-sm">
            {rapport.controlesoort && (
              <Veld label="Controlesoort" waarde={rapport.controlesoort} />
            )}
            <Veld label={isAfgerond ? 'Uitgevoerd op' : 'Aangemaakt op'} waarde={formatDatum(datum)} />
            <Veld label="Uitvoerder" waarde={rapport.uitvoerder_naam ?? '—'} />
            <div>
              <dt className="text-xs text-ink/40 uppercase tracking-wider">Status</dt>
              <dd className="mt-1">
                <span className={`text-xs font-medium px-3 py-1 rounded-full rapport-badge ${STATUS_STIJL[rapport.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[rapport.status] ?? rapport.status}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Bevindingen */}
        <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Bevindingen</h2>
        {rapport.bevindingen.length === 0 ? (
          <p className="text-sm text-ink/40 bg-white rounded-lg shadow-sm p-4 rapport-card">
            Deze inspectie heeft geen punten.
          </p>
        ) : (
          <div className="space-y-3">
            {rapport.bevindingen.map((b, i) => (
              <article key={b.id} className="bg-white rounded-lg shadow-sm p-4 rapport-card">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-ink/40 mt-1 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink">
                      {b.punt_tekst_snap}
                      {b.verplicht && <span className="text-accent ml-1" title="Verplicht">*</span>}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {b.resultaat ? (
                        <span className={`text-xs font-medium px-3 py-1 rounded-full rapport-badge ${RESULTAAT_STIJL[b.resultaat]}`}>
                          {RESULTAAT_LABEL[b.resultaat]}
                        </span>
                      ) : (
                        <span className="text-xs text-ink/40">Geen resultaat</span>
                      )}

                      {/* Afhandeling is alleen relevant bij 'niet in orde'. */}
                      {b.resultaat === 'niet_in_orde' && AFHANDELING_LABEL[b.afhandeling] && (
                        <span className="text-xs text-ink/60">
                          {b.afhandeling === 'actie' && b.actie_nr ? (
                            <>
                              Actie aangemaakt —{' '}
                              <Link href={`/${companyId}/pva#actie-${b.actie_nr}`} className="text-accent hover:underline no-print">
                                #{b.actie_nr}
                              </Link>
                              <span className="print-only">#{b.actie_nr}</span>
                            </>
                          ) : (
                            AFHANDELING_LABEL[b.afhandeling]
                          )}
                        </span>
                      )}
                    </div>

                    {b.opmerking && (
                      <p className="text-sm text-ink/70 mt-2 whitespace-pre-wrap">{b.opmerking}</p>
                    )}

                    {/* Ruimte voor toekomstige bijlagen (foto/document) — nu nog niets. */}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Eruit voortgekomen acties */}
        {rapport.acties.length > 0 && (
          <>
            <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">
              Acties in het Plan van Aanpak
            </h2>
            <div className="bg-white rounded-lg shadow-sm p-4 rapport-card space-y-2">
              {rapport.acties.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-ink/40 mr-2">#{a.nr}</span>
                    <Link
                      href={`/${companyId}/pva#actie-${a.nr}`}
                      className="text-ink hover:text-accent hover:underline no-print"
                    >
                      {a.onderwerp ?? 'Actie'}
                    </Link>
                    <span className="text-ink print-only">{a.onderwerp ?? 'Actie'}</span>
                  </div>
                  <span className="text-xs text-ink/60 shrink-0">
                    {a.prio ? `${a.prio} · ` : ''}{a.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Conclusie */}
        {rapport.conclusie && (
          <>
            <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Conclusie</h2>
            <div className="bg-white rounded-lg shadow-sm p-4 rapport-card">
              <p className="text-sm text-ink whitespace-pre-wrap">{rapport.conclusie}</p>
            </div>
          </>
        )}

        {/* Historie als bescheiden tijdlijn onderaan */}
        {rapport.historie.length > 0 && (
          <>
            <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Geschiedenis</h2>
            <div className="bg-white rounded-lg shadow-sm p-4 rapport-card">
              <ul className="space-y-2">
                {rapport.historie.map(h => (
                  <li key={h.id} className="text-xs text-ink/60 border-l-2 border-ink/10 pl-2">
                    {h.wijziging}
                    <span className="text-ink/40">
                      {' · '}{formatDatumTijd(h.wanneer)}{h.wie_naam ? ` · ${h.wie_naam}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Veld({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <dt className="text-xs text-ink/40 uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-ink">{waarde || '—'}</dd>
    </div>
  )
}
