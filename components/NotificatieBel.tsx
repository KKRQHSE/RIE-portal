'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Notificatie } from '@/lib/types'

type Props = { companyId: string }

function relatieveTijd(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min}m geleden`
  const uur = Math.round(min / 60)
  if (uur < 24) return `${uur}u geleden`
  const dag = Math.round(uur / 24)
  return `${dag}d geleden`
}

// Belletje in de bovenbalk — meldingen ophalen via notificaties_ophalen (die
// ook meteen de scan-soorten ververst), ongelezen tellen, per melding naar het
// bronscherm linken en meteen als gelezen markeren.
export default function NotificatieBel({ companyId }: Props) {
  const [meldingen, setMeldingen] = useState<Notificatie[]>([])
  const [open, setOpen] = useState(false)
  const [geladen, setGeladen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function laad() {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('notificaties_ophalen', { p_company_id: companyId })
    if (!error) setMeldingen((data ?? []) as Notificatie[])
    setGeladen(true)
  }

  useEffect(() => {
    laad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    function buitenKlik(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', buitenKlik)
    return () => document.removeEventListener('mousedown', buitenKlik)
  }, [open])

  async function markeerGelezen(id: string) {
    setMeldingen(prev => prev.map(m => (m.id === id ? { ...m, gelezen_op: new Date().toISOString() } : m)))
    const supabase = createClient()
    await supabase.rpc('notificatie_gelezen_zetten', { p_id: id })
  }

  async function allesGelezen() {
    setMeldingen(prev => prev.map(m => ({ ...m, gelezen_op: m.gelezen_op ?? new Date().toISOString() })))
    const supabase = createClient()
    await supabase.rpc('notificaties_alles_gelezen', { p_company_id: companyId })
  }

  const ongelezen = meldingen.filter(m => !m.gelezen_op).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Meldingen${ongelezen > 0 ? ` (${ongelezen} ongelezen)` : ''}`}
        aria-expanded={open}
        className="btn relative min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink/70 hover:bg-ink/5"
      >
        <span aria-hidden="true" className="text-lg leading-none">🔔</span>
        {ongelezen > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-medium inline-flex items-center justify-center">
            {ongelezen > 9 ? '9+' : ongelezen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-ink/10 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface">
            <span className="text-sm font-medium text-ink">Meldingen</span>
            {ongelezen > 0 && (
              <button onClick={allesGelezen} className="text-xs text-accent hover:underline">
                Alles gelezen
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {geladen && meldingen.length === 0 && (
              <p className="text-center text-ink/40 py-6 text-sm">Geen meldingen.</p>
            )}
            {meldingen.map(m => (
              <Link
                key={m.id}
                href={m.link_pad ?? '#'}
                onClick={() => { markeerGelezen(m.id); setOpen(false) }}
                className={`block px-3 py-2.5 border-b border-surface last:border-b-0 hover:bg-surface/50 transition-colors ${!m.gelezen_op ? 'bg-accent/5' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!m.gelezen_op && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className={`text-sm ${!m.gelezen_op ? 'font-medium text-ink' : 'text-ink/70'}`}>{m.titel}</p>
                    <p className="text-xs text-ink/40 mt-0.5">{relatieveTijd(m.aangemaakt_op)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Link
            href={`/${companyId}/notificaties`}
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-ink/50 hover:text-accent py-2 border-t border-surface"
          >
            Voorkeuren beheren
          </Link>
        </div>
      )}
    </div>
  )
}
