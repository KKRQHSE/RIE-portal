'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Ritme = 'uit' | 'dagelijks' | 'wekelijks' | 'maandelijks'

export type Actiehouder = { id: string; naam: string; aantal: number }

type Props = {
  companyId: string
  initialRitme: Ritme
  actiehouders: Actiehouder[]
}

const RITME_OPTIES: { waarde: Ritme; label: string }[] = [
  { waarde: 'uit', label: 'Uit' },
  { waarde: 'dagelijks', label: 'Dagelijks' },
  { waarde: 'wekelijks', label: 'Wekelijks' },
  { waarde: 'maandelijks', label: 'Maandelijks' },
]

type Samenvatting = {
  verstuurd: number
  mislukt: { persoonId: string; naam: string | null; reden: string }[]
  overgeslagen: { persoonId: string }[]
}

export default function HerinnerBeheer({ companyId, initialRitme, actiehouders }: Props) {
  // Instelscherm (automatische heartbeat)
  const [ritme, setRitme] = useState<Ritme>(initialRitme)
  const [ritmeBezig, setRitmeBezig] = useState(false)
  const [ritmeMelding, setRitmeMelding] = useState<string | null>(null)

  // Handmatige herinnering
  const [open, setOpen] = useState(false)
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [versturen, setVersturen] = useState(false)
  const [samenvatting, setSamenvatting] = useState<Samenvatting | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const naamVan = (id: string) => actiehouders.find(a => a.id === id)?.naam ?? 'Een actiehouder'

  async function kiesRitme(nieuw: Ritme) {
    if (ritmeBezig || nieuw === ritme) return
    setRitmeBezig(true)
    setRitmeMelding(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('zet_herinner_ritme', {
        p_company_id: companyId,
        p_ritme: nieuw,
      })
      if (error) {
        setRitmeMelding('Instellen mislukt. Probeer het opnieuw.')
        return
      }
      setRitme(nieuw)
      setRitmeMelding(
        nieuw === 'uit'
          ? 'Automatische herinneringen staan uit.'
          : `Ingesteld op ${nieuw}.`
      )
    } catch {
      setRitmeMelding('Instellen mislukt. Probeer het opnieuw.')
    } finally {
      setRitmeBezig(false)
    }
  }

  function toggle(id: string) {
    setSelectie(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function allenSelecteren() {
    if (selectie.size === actiehouders.length) setSelectie(new Set())
    else setSelectie(new Set(actiehouders.map(a => a.id)))
  }

  async function verstuur() {
    if (versturen || selectie.size === 0) return
    setVersturen(true)
    setFout(null)
    setSamenvatting(null)
    try {
      const r = await fetch('/api/herinneringen/handmatig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, personIds: [...selectie] }),
      })
      const j = (await r.json().catch(() => null)) as
        | (Samenvatting & { ok?: boolean; fout?: string })
        | null
      if (!j || !j.ok) {
        setFout(j?.fout || 'Versturen mislukt. Probeer het opnieuw.')
        return
      }
      setSamenvatting({
        verstuurd: j.verstuurd ?? 0,
        mislukt: j.mislukt ?? [],
        overgeslagen: j.overgeslagen ?? [],
      })
      setSelectie(new Set())
    } catch {
      setFout('Versturen mislukt. Probeer het opnieuw.')
    } finally {
      setVersturen(false)
    }
  }

  const allesGeselecteerd = actiehouders.length > 0 && selectie.size === actiehouders.length

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-6 space-y-5">
      {/* Automatische herinneringen */}
      <div>
        <p className="text-sm font-medium text-ink mb-2">Automatische herinneringen</p>
        <div className="flex flex-wrap gap-2">
          {RITME_OPTIES.map(opt => {
            const actief = ritme === opt.waarde
            return (
              <button
                key={opt.waarde}
                onClick={() => kiesRitme(opt.waarde)}
                disabled={ritmeBezig}
                className={`text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                  actief
                    ? 'bg-ink text-white'
                    : 'bg-white text-ink/60 border border-ink/20 hover:border-ink/40'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-ink/50 mt-2">
          Mensen met openstaande acties krijgen automatisch een herinnering, maximaal twee keer per week.
        </p>
        {ritmeMelding && <p className="text-xs text-accent mt-1">{ritmeMelding}</p>}
      </div>

      {/* Handmatige herinnering */}
      <div className="pt-4 border-t border-surface">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
          >
            Herinnering sturen
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">Herinnering sturen</p>
              {actiehouders.length > 0 && (
                <button
                  onClick={allenSelecteren}
                  className="text-xs text-ink/50 hover:text-accent transition-colors min-h-[44px] px-2"
                >
                  {allesGeselecteerd ? 'Selectie wissen' : 'Allen selecteren'}
                </button>
              )}
            </div>

            {actiehouders.length === 0 ? (
              <p className="text-xs text-ink/50">Geen actiehouders met openstaande acties.</p>
            ) : (
              <ul className="space-y-1">
                {actiehouders.map(a => (
                  <li key={a.id}>
                    <label className="flex items-center gap-3 min-h-[44px] px-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectie.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="w-5 h-5 accent-[#FF5200]"
                      />
                      <span className="text-sm text-ink">{a.naam}</span>
                      <span className="text-xs text-ink/40">{a.aantal} open</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={verstuur}
                disabled={versturen || selectie.size === 0}
                className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {versturen ? 'Bezig…' : `Verstuur herinnering (${selectie.size} geselecteerd)`}
              </button>
              <button
                onClick={() => { setOpen(false); setSamenvatting(null); setFout(null) }}
                disabled={versturen}
                className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors disabled:opacity-40"
              >
                Sluiten
              </button>
            </div>

            {fout && <p className="text-xs text-red-600">{fout}</p>}

            {samenvatting && (
              <div className="text-xs space-y-1 pt-1">
                <p className="text-green-600 font-medium">
                  {samenvatting.verstuurd} herinnering{samenvatting.verstuurd === 1 ? '' : 'en'} verstuurd.
                </p>
                {samenvatting.overgeslagen.map(o => (
                  <p key={o.persoonId} className="text-ink/60">
                    {naamVan(o.persoonId)} heeft recent al een herinnering gehad en is overgeslagen.
                  </p>
                ))}
                {samenvatting.mislukt.map(m => (
                  <p key={m.persoonId} className="text-amber-600">
                    {m.naam ?? naamVan(m.persoonId)}: niet verstuurd ({m.reden}).
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
