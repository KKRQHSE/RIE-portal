'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Functiegroep } from '@/lib/types'

// Voorbeeldset — NIET hard vastgelegd: een bedrijf kan ze hernoemen, toevoegen of
// archiveren. We bieden ze alleen als startpunt aan wanneer de lijst leeg is.
const VOORBEELDGROEPEN = ['QHSE-er', 'Uitvoerder', 'Projectleider', 'Directie']

export default function FunctiegroepBeheer({
  companyId,
  functiegroepen,
  setFunctiegroepen,
}: {
  companyId: string
  functiegroepen: Functiegroep[]
  setFunctiegroepen: React.Dispatch<React.SetStateAction<Functiegroep[]>>
}) {
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function voegToe(naam: string) {
    const schoon = naam.trim()
    if (!schoon || bezig) return
    setBezig(true)
    setFout(null)
    const volgorde = (functiegroepen.at(-1)?.volgorde ?? 0) + 1
    const { data, error } = await supabase.rpc('functiegroep_opslaan', {
      p_id: null,
      p_company_id: companyId,
      p_naam: schoon,
      p_volgorde: volgorde,
    })
    setBezig(false)
    if (error || !data) { setFout('Toevoegen mislukt. Probeer het opnieuw.'); return }
    setFunctiegroepen(prev => [
      ...prev,
      { id: data as string, company_id: companyId, naam: schoon, volgorde, gearchiveerd_op: null },
    ])
    setNieuw('')
  }

  async function voegVoorbeeldenToe() {
    setBezig(true)
    setFout(null)
    let volgorde = (functiegroepen.at(-1)?.volgorde ?? 0)
    const nieuwe: Functiegroep[] = []
    for (const naam of VOORBEELDGROEPEN) {
      volgorde += 1
      const { data, error } = await supabase.rpc('functiegroep_opslaan', {
        p_id: null,
        p_company_id: companyId,
        p_naam: naam,
        p_volgorde: volgorde,
      })
      if (error || !data) { setFout('Voorbeeldgroepen toevoegen mislukt.'); break }
      nieuwe.push({ id: data as string, company_id: companyId, naam, volgorde, gearchiveerd_op: null })
    }
    setBezig(false)
    if (nieuwe.length) setFunctiegroepen(prev => [...prev, ...nieuwe])
  }

  async function hernoem(groep: Functiegroep, naam: string) {
    const schoon = naam.trim()
    if (!schoon || schoon === groep.naam) return
    setFout(null)
    const { error } = await supabase.rpc('functiegroep_opslaan', {
      p_id: groep.id,
      p_company_id: companyId,
      p_naam: schoon,
      p_volgorde: groep.volgorde,
    })
    if (error) { setFout('Hernoemen mislukt.'); return }
    setFunctiegroepen(prev => prev.map(g => (g.id === groep.id ? { ...g, naam: schoon } : g)))
  }

  async function archiveer(groep: Functiegroep) {
    if (!confirm(`Functiegroep "${groep.naam}" archiveren? Bestaande koppelingen blijven bewaard.`)) return
    setFout(null)
    const { error } = await supabase.rpc('functiegroep_archiveren', { p_id: groep.id })
    if (error) { setFout('Archiveren mislukt.'); return }
    setFunctiegroepen(prev => prev.filter(g => g.id !== groep.id))
  }

  return (
    <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Functiegroepen</p>
          <p className="text-xs text-ink/50 mt-0.5">
            Rollen binnen het bedrijf — los van wat iemand in het portaal mag.
            {functiegroepen.length > 0 ? ` ${functiegroepen.length} actief.` : ' Nog geen.'}
          </p>
        </div>
        <span className="text-ink/30 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          {functiegroepen.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-ink/50">
                Nog geen functiegroepen. Begin met een voorbeeldset of voeg er zelf een toe.
              </p>
              <button
                onClick={voegVoorbeeldenToe}
                disabled={bezig}
                className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
              >
                {bezig ? 'Bezig…' : `Voorbeeldgroepen toevoegen (${VOORBEELDGROEPEN.join(', ')})`}
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {functiegroepen.map(g => (
                <li key={g.id} className="flex items-center gap-2">
                  <input
                    defaultValue={g.naam}
                    onBlur={e => hernoem(g, e.target.value)}
                    aria-label={`Naam functiegroep ${g.naam}`}
                    className="flex-1 text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                  />
                  <button
                    onClick={() => archiveer(g)}
                    className="text-xs px-3 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  >
                    Archiveren
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Nieuwe functiegroep toevoegen */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface">
            <input
              value={nieuw}
              onChange={e => setNieuw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') voegToe(nieuw) }}
              placeholder="Nieuwe functiegroep…"
              className="flex-1 min-w-[160px] text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
            />
            <button
              onClick={() => voegToe(nieuw)}
              disabled={!nieuw.trim() || bezig}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Toevoegen
            </button>
          </div>

          {fout && <p className="text-xs text-red-600">{fout}</p>}
        </div>
      )}
    </div>
  )
}
