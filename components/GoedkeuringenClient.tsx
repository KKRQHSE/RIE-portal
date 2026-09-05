'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Company, Goedkeuringsverzoek } from '@/lib/types'

type Props = {
  company: Company
  initialVerzoeken: Goedkeuringsverzoek[]
  huisstijl?: HuisstijlView
}

type Keuze = 'terug_naar_aanmaker' | 'opnieuw_aanmaken' | 'weggooien'
const KEUZE_LABEL: Record<Keuze, string> = {
  terug_naar_aanmaker: 'Terug naar aanmaker',
  opnieuw_aanmaken: 'Opnieuw laten aanmaken',
  weggooien: 'Weggooien',
}
const ITEM_TYPE_LABEL: Record<string, string> = {
  toolbox_deelname: 'Toolbox-deelname',
  inspectie: 'Inspectie',
  actie: 'Actie',
}

// KAM/admin behandelt hier de openstaande verzoeken (nieuwe concept-medewerker
// of koppeling aan een bestaande persoon). Afwijzen vraagt per gekoppeld item
// een expliciete keuze — de RPC weigert zonder volledige item_keuzes.
export default function GoedkeuringenClient({ company, initialVerzoeken, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  const [verzoeken, setVerzoeken] = useState<Goedkeuringsverzoek[]>(initialVerzoeken)
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<Record<string, string>>({})
  const [afwijsModus, setAfwijsModus] = useState<string | null>(null)
  const [keuzes, setKeuzes] = useState<Record<string, Keuze>>({})
  const [reden, setReden] = useState('')
  const [bevestigWeggooien, setBevestigWeggooien] = useState(false)

  function fouttonen(id: string, msg: string) {
    setFout(prev => ({ ...prev, [id]: msg }))
  }

  async function goedkeuren(id: string) {
    setBezig(id)
    setFout(prev => { const r = { ...prev }; delete r[id]; return r })
    const supabase = createClient()
    const { error } = await supabase.rpc('concept_medewerker_goedkeuren', { p_goedkeuringsverzoek_id: id })
    setBezig(null)
    if (error) {
      fouttonen(id, 'Goedkeuren mislukt. Probeer het opnieuw.')
      return
    }
    setVerzoeken(prev => prev.filter(v => v.id !== id))
  }

  function startAfwijzen(v: Goedkeuringsverzoek) {
    setAfwijsModus(v.id)
    setKeuzes(Object.fromEntries(v.gekoppelde_items.map(it => [it.item_id, 'terug_naar_aanmaker' as Keuze])))
    setReden('')
    setBevestigWeggooien(false)
  }

  function annuleerAfwijzen() {
    setAfwijsModus(null)
    setKeuzes({})
    setReden('')
    setBevestigWeggooien(false)
  }

  async function bevestigAfwijzen(v: Goedkeuringsverzoek) {
    const heeftWeggooien = v.gekoppelde_items.some(it => keuzes[it.item_id] === 'weggooien')
    if (heeftWeggooien && !bevestigWeggooien) {
      // Inline bevestiging i.p.v. native confirm(): eerste klik toont de
      // waarschuwing, tweede klik voert echt uit.
      setBevestigWeggooien(true)
      return
    }
    setBezig(v.id)
    setFout(prev => { const r = { ...prev }; delete r[v.id]; return r })
    const supabase = createClient()
    const item_keuzes = v.gekoppelde_items.map(it => ({
      item_type: it.item_type,
      item_id: it.item_id,
      keuze: keuzes[it.item_id] ?? 'terug_naar_aanmaker',
    }))
    const { error } = await supabase.rpc('concept_medewerker_afwijzen', {
      p_goedkeuringsverzoek_id: v.id,
      p_item_keuzes: item_keuzes,
      p_reden: reden.trim() || null,
    })
    setBezig(null)
    if (error) {
      fouttonen(v.id, 'Afwijzen mislukt. Probeer het opnieuw.')
      return
    }
    setVerzoeken(prev => prev.filter(x => x.id !== v.id))
    annuleerAfwijzen()
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Openstaande verzoeken</p>
        </div>

        {verzoeken.length === 0 && (
          <p className="text-center text-ink/40 py-10 text-sm">Geen openstaande verzoeken.</p>
        )}

        <div className="space-y-3">
          {verzoeken.map(v => (
            <div key={v.id} className="glass-tile rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink">{v.persoon?.naam ?? '—'}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                      {v.type === 'nieuw_concept' ? 'nieuwe medewerker' : 'koppeling'}
                    </span>
                  </div>
                  <p className="text-sm text-ink/50 mt-0.5">
                    {v.persoon?.email || '— geen e-mail —'} · aangemaakt door {v.aangemaakt_door_naam ?? 'onbekend'}
                  </p>
                </div>
              </div>

              {v.type === 'nieuw_concept' ? (
                <p className="text-sm text-ink/70 mt-3">
                  Klopt deze nieuwe medewerker? Controleer naam en e-mail voordat je goedkeurt.
                </p>
              ) : (
                <p className="text-sm text-ink/70 mt-3">
                  Is dit echt dezelfde persoon als de teamleider bedoelt?
                </p>
              )}

              {v.mogelijk_duplicaat && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm text-amber-800">
                    Bij het aanmaken is een mogelijk duplicaat gesignaleerd: <strong>{v.mogelijk_duplicaat.naam}</strong>.
                    De teamleider heeft desondanks voor nieuw gekozen. Overweeg dit alsnog te koppelen
                    (via Personen → samenvoegen) in plaats van goed te keuren als aparte persoon.
                  </p>
                </div>
              )}

              {fout[v.id] && <p className="text-xs text-red-600 mt-2">{fout[v.id]}</p>}

              {afwijsModus !== v.id ? (
                <div className="mt-3 pt-3 border-t border-surface flex items-center gap-3">
                  <button
                    onClick={() => goedkeuren(v.id)}
                    disabled={bezig === v.id}
                    className="btn btn-accent text-sm px-4 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium disabled:opacity-40"
                  >
                    {bezig === v.id ? 'Bezig…' : 'Goedkeuren'}
                  </button>
                  <button
                    onClick={() => startAfwijzen(v)}
                    disabled={bezig === v.id}
                    className="btn text-sm px-4 py-2 min-h-[44px] rounded-full bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40"
                  >
                    Afwijzen
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-surface space-y-3">
                  {v.gekoppelde_items.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-ink/50">
                        Wat moet er gebeuren met de gekoppelde items?
                      </p>
                      {v.gekoppelde_items.map(it => (
                        <div key={it.item_id} className="flex items-center justify-between gap-3 border border-ink/10 rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-ink/60">{ITEM_TYPE_LABEL[it.item_type]}</span>
                            <p className="text-sm text-ink truncate">{it.omschrijving ?? '—'}</p>
                          </div>
                          <select
                            value={keuzes[it.item_id] ?? 'terug_naar_aanmaker'}
                            onChange={e => {
                              setKeuzes(prev => ({ ...prev, [it.item_id]: e.target.value as Keuze }))
                              setBevestigWeggooien(false)
                            }}
                            className="text-xs border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white shrink-0"
                          >
                            {(['terug_naar_aanmaker', 'opnieuw_aanmaken', 'weggooien'] as Keuze[]).map(k => (
                              <option key={k} value={k}>{KEUZE_LABEL[k]}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-ink/40 mb-1">Reden (optioneel)</label>
                    <textarea
                      value={reden}
                      onChange={e => { setReden(e.target.value); setBevestigWeggooien(false) }}
                      rows={2}
                      className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white"
                    />
                  </div>
                  {bevestigWeggooien && (
                    <p className="text-xs text-red-600">
                      Let op: minstens één item wordt weggegooid en de bijbehorende actie gesloten.
                      Klik nogmaals op &quot;Afwijzen bevestigen&quot; om dit definitief door te voeren.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => bevestigAfwijzen(v)}
                      disabled={bezig === v.id}
                      className="btn text-sm px-4 py-2 min-h-[44px] rounded-full bg-red-600 text-white font-medium disabled:opacity-40"
                    >
                      {bezig === v.id ? 'Bezig…' : bevestigWeggooien ? 'Afwijzen bevestigen' : 'Afwijzen bevestigen'}
                    </button>
                    <button
                      onClick={annuleerAfwijzen}
                      disabled={bezig === v.id}
                      className="btn text-sm px-4 py-2 min-h-[44px] rounded-full bg-white text-ink/60 border border-ink/20 disabled:opacity-40"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
