'use client'

import Link from 'next/link'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { ToolboxBewijsRegel } from '@/lib/types'
import { BEWIJSSOORT_LABEL, datumTijdNL } from '@/lib/toolbox-bewijs'
import HuisstijlLogo from './HuisstijlLogo'

function datumKort(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ToolboxOverzichtPrint({
  companyId, bedrijfNaam, van, tot, regels, huisstijl = VEILIGE_HUISSTIJL,
}: {
  companyId: string
  bedrijfNaam: string
  van: string
  tot: string
  regels: ToolboxBewijsRegel[]
  huisstijl?: HuisstijlView
}) {
  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between gap-3 mb-6 no-print">
          <Link href={`/${companyId}/toolbox`} className="text-sm text-ink/50 hover:text-ink inline-flex items-center gap-1 min-h-[44px]">
            ← Terug naar Toolboxen
          </Link>
          <button onClick={() => window.print()}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity">
            Afdrukken / PDF
          </button>
        </div>

        <div className="print-only mb-4 text-xs text-black border-b border-black/30 pb-2">
          {bedrijfNaam} · Toolbox-deelnames · afgedrukt {datumTijdNL(new Date().toISOString())}
        </div>

        <section className="bg-white rounded-lg shadow-sm p-5 mb-4 rapport-card">
          <div className="no-print mb-3"><HuisstijlLogo huisstijl={huisstijl} /></div>
          <p className="text-sm text-ink/50">{bedrijfNaam}</p>
          <h1 className="text-2xl font-semibold text-ink mt-0.5">Toolbox-deelnames</h1>
          <p className="text-sm text-ink/50 mt-1">Periode {van} t/m {tot} · {regels.length} {regels.length === 1 ? 'deelname' : 'deelnames'}</p>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-5 rapport-card">
          {regels.length === 0 ? (
            <p className="text-sm text-ink/50">Geen afgeronde deelnames in deze periode.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-ink/50 border-b border-ink/20">
                  <th className="py-1 pr-2 font-medium">Naam</th>
                  <th className="py-1 pr-2 font-medium">Toolbox</th>
                  <th className="py-1 pr-2 font-medium">Afgerond</th>
                  <th className="py-1 pr-2 font-medium">Getekend</th>
                  <th className="py-1 pr-2 font-medium">Quiz</th>
                  <th className="py-1 font-medium">Bewijssoort</th>
                </tr>
              </thead>
              <tbody>
                {regels.map(r => (
                  <tr key={r.id} className="border-b border-surface align-top">
                    <td className="py-1.5 pr-2 text-ink">{r.bevestigde_naam}</td>
                    <td className="py-1.5 pr-2 text-ink/80">{r.titel_snap}</td>
                    <td className="py-1.5 pr-2 text-ink/70">{datumKort(r.afgerond_op)}</td>
                    <td className="py-1.5 pr-2 text-ink/70">{r.getekend ? 'ja' : 'nee'}</td>
                    <td className="py-1.5 pr-2 text-ink/70">{r.quiz_resultaat ? `${r.quiz_resultaat.score}/${r.quiz_resultaat.totaal}${r.quiz_resultaat.gehaald ? ' ✓' : ''}` : '—'}</td>
                    <td className="py-1.5 text-ink/70">{BEWIJSSOORT_LABEL[r.bewijssoort]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-xs text-ink/40 mt-3">
          Samengesteld uit de onveranderlijke deelname-records. Voor het volledige bewijsstuk
          (incl. handtekening) per persoon: open de individuele bewijs-PDF in de Toolbox-module.
        </p>
      </div>
    </main>
  )
}
