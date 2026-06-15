'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PvaItem } from '@/lib/types'

const PRIO_STYLE: Record<string, string> = {
  Laag:   'bg-yellow-100 text-yellow-800',
  Middel: 'bg-orange-100 text-orange-800',
  Hoog:   'bg-red-100 text-red-800',
}

const STATUS_STYLE: Record<string, string> = {
  'Open':           'text-ink/50',
  'In behandeling': 'text-blue-600',
  'Afgerond':       'text-green-600',
}

type Props = {
  item: PvaItem
  onUpdate: (id: string, updates: Partial<PvaItem>) => void
}

export default function PvaCard({ item, onUpdate }: Props) {
  const [open, setOpen]       = useState(false)
  const [status, setStatus]   = useState(item.status)
  const [verantw, setVerantw] = useState(item.verantw ?? '')
  const [opm, setOpm]         = useState(item.opm ?? '')
  const [saved, setSaved]     = useState(false)

  async function save(updates: Partial<PvaItem>) {
    const supabase = createClient()
    await supabase
      .from('pva_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function changeStatus(val: string) {
    setStatus(val)
    onUpdate(item.id, { status: val })
    save({ status: val })
  }

  function blurVerantw() {
    onUpdate(item.id, { verantw })
    save({ verantw })
  }

  function blurOpm() {
    onUpdate(item.id, { opm })
    save({ opm })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">

      {/* Klikbare kopregel */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={`shrink-0 inline-block font-mono text-xs font-medium px-2 py-1 rounded mt-0.5
          ${PRIO_STYLE[item.prio] ?? 'bg-gray-100 text-gray-700'}`}>
          {item.prio}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink/40">{item.nr}</span>
            <span className="font-medium text-ink">{item.onderwerp}</span>
          </div>
          <p className="text-xs text-ink/50 font-mono mt-0.5 truncate">
            {item.ref} · {item.termijn}
          </p>
        </div>
        <span className="text-ink/30 text-xs mt-1 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Bewerkbare velden */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 border-t border-surface">
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-ink/40">Status</span>
          <select
            value={status}
            onChange={e => changeStatus(e.target.value)}
            className={`text-sm border border-ink/20 rounded px-2 py-1 font-medium bg-white
              ${STATUS_STYLE[status] ?? ''}`}
          >
            <option>Open</option>
            <option>In behandeling</option>
            <option>Afgerond</option>
          </select>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-1 min-w-[160px]">
          <span className="text-xs text-ink/40 shrink-0">Verantw.</span>
          <input
            value={verantw}
            onChange={e => setVerantw(e.target.value)}
            onBlur={blurVerantw}
            placeholder="Naam"
            className="text-sm border border-ink/20 rounded px-2 py-1 flex-1 min-w-0 bg-white"
          />
        </div>

        {saved && (
          <span className="text-xs text-green-600 mt-2 font-medium">✓ Opgeslagen</span>
        )}
      </div>

      {/* Uitklapbaar detail */}
      {open && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-4">
          {item.maatregel && (
            <div>
              <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-1">Maatregel</p>
              <p className="text-sm text-ink leading-relaxed">{item.maatregel}</p>
            </div>
          )}
          {item.tree && (
            <div>
              <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-1">Aanpak</p>
              <p className="text-sm text-ink/70 leading-relaxed">{item.tree}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-1">Opmerking</p>
            <textarea
              value={opm}
              onChange={e => setOpm(e.target.value)}
              onBlur={blurOpm}
              placeholder="Voeg een opmerking toe…"
              rows={2}
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 resize-none bg-white"
            />
          </div>
        </div>
      )}
    </div>
  )
}
