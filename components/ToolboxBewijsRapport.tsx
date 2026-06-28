'use client'

import Link from 'next/link'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { ToolboxBewijs } from '@/lib/types'
import { BEWIJSSOORT_ZIN, VERANTWOORDING, datumTijdNL } from '@/lib/toolbox-bewijs'
import HuisstijlLogo from './HuisstijlLogo'

export default function ToolboxBewijsRapport({
  companyId, bewijs, huisstijl = VEILIGE_HUISSTIJL,
}: {
  companyId: string
  bewijs: ToolboxBewijs
  huisstijl?: HuisstijlView
}) {
  const quiz = Array.isArray(bewijs.quiz_snap) ? bewijs.quiz_snap : []
  const res = bewijs.quiz_resultaat

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Werkbalk — verdwijnt bij afdrukken */}
        <div className="flex items-center justify-between gap-3 mb-6 no-print">
          <Link href={`/${companyId}/toolbox`} className="text-sm text-ink/50 hover:text-ink inline-flex items-center gap-1 min-h-[44px]">
            ← Terug naar Toolboxen
          </Link>
          <button
            onClick={() => window.print()}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity"
          >
            Afdrukken / PDF
          </button>
        </div>

        {/* Print-only kopregel bovenaan elke afdruk */}
        <div className="print-only mb-4 text-xs text-black border-b border-black/30 pb-2">
          {bewijs.bedrijf_naam} · Toolbox-bewijsstuk · afgedrukt {datumTijdNL(new Date().toISOString())}
        </div>

        {/* Kop */}
        <section className="bg-white rounded-lg shadow-sm p-5 mb-4 rapport-card">
          <div className="no-print mb-3"><HuisstijlLogo huisstijl={huisstijl} /></div>
          <p className="text-sm text-ink/50">{bewijs.bedrijf_naam}</p>
          <h1 className="text-2xl font-semibold text-ink mt-0.5">Bewijs van gevolgde toolbox</h1>
        </section>

        {/* Kerngegevens */}
        <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Kerngegevens</h2>
        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Veld label="Deelnemer" waarde={bewijs.bevestigde_naam} />
            <Veld label="Toolbox" waarde={bewijs.titel_snap} />
            <Veld label="Afgerond op" waarde={datumTijdNL(bewijs.afgerond_op)} />
            <Veld label="Bewijssoort" waarde={BEWIJSSOORT_ZIN[bewijs.bewijssoort]} />
          </dl>
        </section>

        {/* Inhoud zoals toen getoond */}
        <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Inhoud zoals toen getoond</h2>
        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card space-y-3">
          <p className="text-sm text-ink whitespace-pre-wrap">{bewijs.tekst_snap || '— geen tekst —'}</p>
          <div className="text-sm text-ink/70">
            <span className="text-ink/40">Video die toen gold: </span>
            {bewijs.video_url_snap
              ? <span className="break-all">{bewijs.video_url_snap}</span>
              : <span>geen video</span>}
            <span className="text-ink/40"> · bekeken: </span>{bewijs.video_bekeken ? 'ja' : 'nee'}
          </div>
        </section>

        {/* Quiz */}
        <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Quiz</h2>
        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card space-y-4">
          {quiz.length === 0 ? (
            <p className="text-sm text-ink/50">Geen quiz bij deze toolbox.</p>
          ) : (
            <>
              {quiz.map((v, i) => {
                const goed = v.gekozen === v.juist_antwoord
                return (
                  <div key={i} className="space-y-1">
                    <p className="text-sm font-medium text-ink">{i + 1}. {v.vraagtekst}</p>
                    <ul className="space-y-0.5">
                      {v.opties.map((opt, oi) => {
                        const gekozen = oi === v.gekozen
                        const juist = oi === v.juist_antwoord
                        return (
                          <li key={oi} className={`text-sm pl-2 ${juist ? 'text-green-700' : gekozen ? 'text-amber-700' : 'text-ink/60'}`}>
                            {gekozen ? '➤ ' : '· '}{opt}
                            {juist ? '  (juist antwoord)' : ''}{gekozen && !juist ? '  (gekozen)' : ''}
                          </li>
                        )
                      })}
                    </ul>
                    <p className={`text-xs ${goed ? 'text-green-700' : 'text-amber-700'}`}>
                      {goed ? '✓ Goed beantwoord.' : '✗ Niet juist beantwoord.'}{v.uitleg ? ` ${v.uitleg}` : ''}
                    </p>
                  </div>
                )
              })}
              {res && (
                <p className="text-sm text-ink border-t border-surface pt-3">
                  Uitslag: <span className="font-medium">{res.score}/{res.totaal}</span> ({res.pct}%) — gehaald: {res.gehaald ? 'ja' : 'nee'}
                </p>
              )}
            </>
          )}
        </section>

        {/* Bevestiging */}
        <h2 className="text-sm font-medium text-ink/40 uppercase tracking-wider mb-2 mt-6">Bevestiging</h2>
        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card space-y-3">
          <p className="text-sm text-ink">
            Naam bevestigd door de deelnemer: <span className="font-medium">{bewijs.naam_bevestigd ? 'ja' : 'nee'}</span>
          </p>
          {bewijs.bewijssoort === 'digitaal' && bewijs.handtekening ? (
            <div>
              <p className="text-xs text-ink/40 mb-1">Handtekening</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bewijs.handtekening} alt={`Handtekening van ${bewijs.bevestigde_naam}`}
                className="max-h-32 w-auto border border-ink/20 rounded bg-white" />
              <p className="text-xs text-ink/50 mt-1">Gezet op {datumTijdNL(bewijs.handtekening_gezet_op)}</p>
            </div>
          ) : (
            <p className="text-sm text-ink/70">
              {BEWIJSSOORT_ZIN[bewijs.bewijssoort]}
              {bewijs.presentielijst_pad ? ' Onderliggend bewijsstuk: presentielijst aanwezig.' : ''}
            </p>
          )}
        </section>

        {/* Verantwoording */}
        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card mt-4">
          <p className="text-xs text-ink/50">{VERANTWOORDING}</p>
          <p className="text-xs text-ink/40 mt-1">Document gegenereerd op {datumTijdNL(new Date().toISOString())}.</p>
        </section>
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
