'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ToolboxBewijsRegel } from '@/lib/types'
import { BEWIJSSOORT_LABEL } from '@/lib/toolbox-bewijs'

type Supa = ReturnType<typeof createClient>

function quizTekst(r: ToolboxBewijsRegel): string {
  if (!r.quiz_resultaat) return '—'
  const q = r.quiz_resultaat
  return `${q.score}/${q.totaal} (${q.gehaald ? 'gehaald' : 'niet gehaald'})`
}

function datumNL(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ToolboxExport({ companyId }: { companyId: string }) {
  const [supabase] = useState<Supa>(() => createClient())
  const jaar = new Date().getFullYear()
  const [van, setVan] = useState(`${jaar}-01-01`)
  const [tot, setTot] = useState(`${jaar}-12-31`)
  const [regels, setRegels] = useState<ToolboxBewijsRegel[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    setLaden(true); setFout(null)
    const { data, error } = await supabase.rpc('toolbox_bewijs_overzicht', { p_company_id: companyId, p_van: van, p_tot: tot })
    setLaden(false)
    if (error) { setFout(error.message); return }
    setRegels((data ?? []) as ToolboxBewijsRegel[])
  }, [supabase, companyId, van, tot])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { laad() }, [laad])

  function downloadCsv() {
    const head = ['Naam', 'Toolbox', 'Afgerond op', 'Getekend', 'Quiz', 'Bewijssoort']
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    const rows = regels.map(r => [
      r.bevestigde_naam, r.titel_snap, datumNL(r.afgerond_op),
      r.getekend ? 'ja' : 'nee', quizTekst(r), BEWIJSSOORT_LABEL[r.bewijssoort],
    ])
    const csv = '﻿' + [head, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `toolbox-deelnames_${van}_${tot}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pdfHref = `/${companyId}/toolbox/overzicht?van=${van}&tot=${tot}`

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Overzicht van afgeronde toolbox-deelnames over een periode — voor de KAM/auditor om aan
        te tonen dat de ploeg de instructie gevolgd heeft. Per regel kun je het individuele
        bewijsstuk (PDF) openen. Alle gegevens komen uit het onveranderlijke deelname-record.
      </p>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink/50">
          <span className="block mb-1">Van</span>
          <input type="date" value={van} onChange={e => setVan(e.target.value)} className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white" />
        </label>
        <label className="text-xs text-ink/50">
          <span className="block mb-1">Tot en met</span>
          <input type="date" value={tot} onChange={e => setTot(e.target.value)} className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white" />
        </label>
        <button onClick={downloadCsv} disabled={regels.length === 0}
          className="text-sm px-4 py-2 min-h-[40px] rounded-full bg-ink text-white hover:opacity-90 disabled:opacity-40">
          Download CSV
        </button>
        <Link href={pdfHref} target="_blank"
          className="text-sm px-4 py-2 min-h-[40px] inline-flex items-center rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
          PDF-lijst openen
        </Link>
      </div>

      {fout && <p className="text-sm text-red-600">{fout}</p>}

      <div className="bg-white rounded-lg shadow-sm p-4">
        {laden ? (
          <p className="text-sm text-ink/40">Laden…</p>
        ) : regels.length === 0 ? (
          <p className="text-sm text-ink/40">Geen afgeronde deelnames in deze periode.</p>
        ) : (
          <ul className="divide-y divide-surface">
            {regels.map(r => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{r.bevestigde_naam} · <span className="text-ink/60">{r.titel_snap}</span></p>
                  <p className="text-xs text-ink/40">
                    {datumNL(r.afgerond_op)} · {r.getekend ? 'getekend' : 'niet getekend'}
                    {r.quiz_resultaat ? ` · quiz ${quizTekst(r)}` : ''} · {BEWIJSSOORT_LABEL[r.bewijssoort]}
                  </p>
                </div>
                <Link href={`/${companyId}/toolbox/bewijs/${r.id}`} target="_blank"
                  className="shrink-0 text-xs px-3 py-2 min-h-[40px] inline-flex items-center rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
                  Bewijs (PDF)
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
