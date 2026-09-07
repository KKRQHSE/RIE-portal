'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Locatie } from '@/lib/types'
import Bevestig from './Bevestig'

// Optionele vestigingen van het bedrijf. Zelfde vorm als FunctiegroepBeheer
// (attribuut, geen rechtenlaag — migratie 0080), met twee verschillen:
// geen voorbeeldset (een locatienaam is altijd bedrijfsspecifiek) en een
// in-app bevestigingsscherm bij archiveren in plaats van native confirm().

export default function LocatieBeheer({
  companyId,
  locaties,
  setLocaties,
}: {
  companyId: string
  locaties: Locatie[]
  setLocaties: React.Dispatch<React.SetStateAction<Locatie[]>>
}) {
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [teArchiveren, setTeArchiveren] = useState<Locatie | null>(null)

  async function voegToe(naam: string) {
    const schoon = naam.trim()
    if (!schoon || bezig) return
    setBezig(true)
    setFout(null)
    const volgorde = (locaties.at(-1)?.volgorde ?? 0) + 1
    const { data, error } = await supabase.rpc('locatie_opslaan', {
      p_id: null,
      p_company_id: companyId,
      p_naam: schoon,
      p_volgorde: volgorde,
    })
    setBezig(false)
    if (error || !data) { setFout('Toevoegen mislukt. Probeer het opnieuw.'); return }
    setLocaties(prev => [
      ...prev,
      { id: data as string, company_id: companyId, naam: schoon, volgorde, gearchiveerd_op: null },
    ])
    setNieuw('')
  }

  async function hernoem(locatie: Locatie, naam: string) {
    const schoon = naam.trim()
    if (!schoon || schoon === locatie.naam) return
    setFout(null)
    const { error } = await supabase.rpc('locatie_opslaan', {
      p_id: locatie.id,
      p_company_id: companyId,
      p_naam: schoon,
      p_volgorde: locatie.volgorde,
    })
    if (error) { setFout('Hernoemen mislukt.'); return }
    setLocaties(prev => prev.map(l => (l.id === locatie.id ? { ...l, naam: schoon } : l)))
  }

  async function archiveerBevestigd() {
    if (!teArchiveren) return
    setBezig(true)
    setFout(null)
    const { error } = await supabase.rpc('locatie_archiveren', { p_id: teArchiveren.id })
    setBezig(false)
    if (error) { setFout('Archiveren mislukt.'); setTeArchiveren(null); return }
    setLocaties(prev => prev.filter(l => l.id !== teArchiveren.id))
    setTeArchiveren(null)
  }

  return (
    <div className="glass-tile rounded-2xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="btn w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Locaties</p>
          <p className="text-xs text-ink/50 mt-0.5">
            Optionele vestigingen — laat leeg als dit bedrijf op één locatie werkt.
            {locaties.length > 0 ? ` ${locaties.length} actief.` : ' Nog geen.'}
          </p>
        </div>
        <span className="text-ink/30 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          {locaties.length === 0 ? (
            <p className="text-xs text-ink/50">
              Nog geen locaties. Voeg er een toe zodra dit bedrijf meerdere vestigingen krijgt.
            </p>
          ) : (
            <ul className="space-y-2">
              {locaties.map(l => (
                <li key={l.id} className="flex items-center gap-2">
                  <input
                    defaultValue={l.naam}
                    onBlur={e => hernoem(l, e.target.value)}
                    aria-label={`Naam locatie ${l.naam}`}
                    className="flex-1 text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                  />
                  <button
                    onClick={() => setTeArchiveren(l)}
                    className="btn text-xs px-3 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  >
                    Archiveren
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Nieuwe locatie toevoegen */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface">
            <input
              value={nieuw}
              onChange={e => setNieuw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') voegToe(nieuw) }}
              placeholder="Nieuwe locatie…"
              className="flex-1 min-w-[160px] text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
            />
            <button
              onClick={() => voegToe(nieuw)}
              disabled={!nieuw.trim() || bezig}
              className="btn btn-dark text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white disabled:opacity-40"
            >
              Toevoegen
            </button>
          </div>

          {fout && <p className="text-xs text-red-600">{fout}</p>}
        </div>
      )}

      <Bevestig
        open={teArchiveren !== null}
        titel="Locatie archiveren?"
        bevestigLabel="Archiveren"
        gevaar
        bezig={bezig}
        onBevestig={archiveerBevestigd}
        onAnnuleer={() => setTeArchiveren(null)}
      >
        <p>Locatie &ldquo;{teArchiveren?.naam}&rdquo; archiveren? Bestaande koppelingen (RI&amp;E-vragen, inspecties, toolbox-sessies, acties, incidenten) blijven bewaard.</p>
      </Bevestig>
    </div>
  )
}
