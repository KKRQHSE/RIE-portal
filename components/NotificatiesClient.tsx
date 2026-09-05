'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import { NOTIFICATIE_EVENT_TYPES, type Company, type Notificatie, type NotificatieModus, type NotificatieVoorkeur } from '@/lib/types'

type Props = {
  company: Company
  initialMeldingen: Notificatie[]
  initialVoorkeuren: NotificatieVoorkeur[]
  huisstijl?: HuisstijlView
}

const MODUS_LABEL: Record<NotificatieModus, string> = {
  direct: 'Direct',
  periodiek: 'Periodiek (dagbundel)',
  uit: 'Uit',
}

export default function NotificatiesClient({ company, initialMeldingen, initialVoorkeuren, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  const [meldingen, setMeldingen] = useState<Notificatie[]>(initialMeldingen)
  const [voorkeuren, setVoorkeuren] = useState<Record<string, NotificatieModus>>(
    Object.fromEntries(initialVoorkeuren.map(v => [v.event_type, v.modus]))
  )
  const [bezig, setBezig] = useState<string | null>(null)

  async function zetVoorkeur(eventType: string, modus: NotificatieModus) {
    const vorige = voorkeuren[eventType]
    setVoorkeuren(prev => ({ ...prev, [eventType]: modus }))
    setBezig(eventType)
    const supabase = createClient()
    const { error } = await supabase.rpc('notificatie_voorkeur_zetten', { p_event_type: eventType, p_modus: modus })
    setBezig(null)
    if (error) setVoorkeuren(prev => ({ ...prev, [eventType]: vorige }))
  }

  async function markeerGelezen(id: string) {
    setMeldingen(prev => prev.map(m => (m.id === id ? { ...m, gelezen_op: new Date().toISOString() } : m)))
    const supabase = createClient()
    await supabase.rpc('notificatie_gelezen_zetten', { p_id: id })
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Meldingen &amp; voorkeuren</p>
        </div>

        <div className="glass-tile rounded-2xl p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-3">Voorkeuren per soort melding</p>
          <div className="space-y-2">
            {NOTIFICATIE_EVENT_TYPES.map(t => (
              <div key={t.code} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink/70">{t.label}</span>
                <select
                  value={voorkeuren[t.code] ?? 'direct'}
                  onChange={e => zetVoorkeur(t.code, e.target.value as NotificatieModus)}
                  disabled={bezig === t.code}
                  className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white disabled:opacity-40"
                >
                  {(Object.keys(MODUS_LABEL) as NotificatieModus[]).map(m => (
                    <option key={m} value={m}>{MODUS_LABEL[m]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {meldingen.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Nog geen meldingen.</p>
          )}
          {meldingen.map(m => (
            <a
              key={m.id}
              href={m.link_pad ?? '#'}
              onClick={() => markeerGelezen(m.id)}
              className={`block glass-tile rounded-2xl p-3.5 hover:shadow-md transition-shadow ${!m.gelezen_op ? 'border border-accent/20' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!m.gelezen_op && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className={`text-sm ${!m.gelezen_op ? 'font-medium text-ink' : 'text-ink/70'}`}>{m.titel}</p>
                  <p className="text-xs text-ink/40 mt-0.5">{new Date(m.aangemaakt_op).toLocaleString('nl-NL')}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
