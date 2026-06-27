'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CentraleRubriekMetVragen, CentraleVraag } from '@/lib/types'
import LogoutButton from './LogoutButton'

type Rubriek = CentraleRubriekMetVragen

// Nette in-app bevestiging (geen native confirm): de knop klapt om naar
// "Weet je het zeker?" met Ja/Annuleer. Echte buttons, toetsenbordbedienbaar.
function Archiveerknop({ label, onBevestig }: { label: string; onBevestig: () => void }) {
  const [vraag, setVraag] = useState(false)
  if (!vraag) {
    return (
      <button
        type="button"
        onClick={() => setVraag(true)}
        className="text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors"
      >
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-ink/60">Weet je het zeker?</span>
      <button
        type="button"
        onClick={() => { setVraag(false); onBevestig() }}
        className="text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full bg-red-600 text-white hover:opacity-90 transition-opacity"
      >
        Ja, archiveren
      </button>
      <button
        type="button"
        onClick={() => setVraag(false)}
        className="text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors"
      >
        Annuleer
      </button>
    </span>
  )
}

export default function CentraleBibliotheekAdmin({ initialRubrieken }: { initialRubrieken: Rubriek[] }) {
  const [supabase] = useState(() => createClient())
  const [rubrieken, setRubrieken] = useState<Rubriek[]>(initialRubrieken)
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function patchRubriek(id: string, updates: Partial<Rubriek>) {
    setRubrieken(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)))
  }

  async function nieuwRubriek() {
    const naam = nieuwNaam.trim()
    if (!naam || bezig) return
    setBezig(true); setFout(null)
    const volgorde = (rubrieken.at(-1)?.volgorde ?? 0) + 1
    const { data, error } = await supabase.rpc('centrale_rubriek_opslaan', {
      p_id: null, p_naam: naam, p_volgorde: volgorde, p_rie_code: null,
    })
    setBezig(false)
    if (error || !data) { setFout('Rubriek toevoegen mislukt.'); return }
    setRubrieken(prev => [...prev, {
      id: data as string, naam, volgorde, rie_code: null, versie: 1,
      gewijzigd_op: new Date().toISOString(), gearchiveerd_op: null, vragen: [],
    }])
    setNieuwNaam('')
  }

  // Eén opslagpad voor naam/rie_code/volgorde van een rubriek.
  async function bewaarRubriek(r: Rubriek, patch: Partial<Pick<Rubriek, 'naam' | 'rie_code' | 'volgorde'>>) {
    const next = { ...r, ...patch }
    if (!next.naam.trim()) return
    setFout(null)
    const { error } = await supabase.rpc('centrale_rubriek_opslaan', {
      p_id: r.id, p_naam: next.naam.trim(), p_volgorde: next.volgorde, p_rie_code: next.rie_code,
    })
    if (error) { setFout('Opslaan mislukt.'); return }
    patchRubriek(r.id, patch)
  }

  async function archiveerRubriek(id: string) {
    setFout(null)
    const { error } = await supabase.rpc('centrale_rubriek_archiveren', { p_id: id })
    if (error) { setFout('Archiveren mislukt.'); return }
    setRubrieken(prev => prev.filter(r => r.id !== id))
  }

  // Rubriek wisselen met buur en beide volgordes persisteren.
  async function verplaatsRubriek(index: number, richting: -1 | 1) {
    const buur = index + richting
    if (buur < 0 || buur >= rubrieken.length || bezig) return
    const a = rubrieken[index], b = rubrieken[buur]
    setBezig(true); setFout(null)
    const r1 = await supabase.rpc('centrale_rubriek_opslaan', { p_id: a.id, p_naam: a.naam, p_volgorde: b.volgorde, p_rie_code: a.rie_code })
    const r2 = await supabase.rpc('centrale_rubriek_opslaan', { p_id: b.id, p_naam: b.naam, p_volgorde: a.volgorde, p_rie_code: b.rie_code })
    setBezig(false)
    if (r1.error || r2.error) { setFout('Herordenen mislukt.'); return }
    setRubrieken(prev => prev
      .map(r => r.id === a.id ? { ...a, volgorde: b.volgorde } : r.id === b.id ? { ...b, volgorde: a.volgorde } : r)
      .sort((x, y) => x.volgorde - y.volgorde))
  }

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2"><LogoutButton /></div>

        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-ink/50 hover:text-accent transition-colors">← Beheer</Link>
          <h1 className="text-xl font-semibold text-ink mt-1">Centrale inspectie-bibliotheek</h1>
          <p className="text-sm text-ink/50 mt-0.5">
            De leidende norm voor alle klanten. Klanten koppelen hieraan en kunnen op eigen
            initiatief lokaal afwijken. De RIE-code is intern en wordt nooit aan de uitvoerder getoond.
          </p>
        </div>

        {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

        {/* Nieuwe rubriek */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-2">Nieuwe rubriek</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nieuwNaam}
              onChange={e => setNieuwNaam(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') nieuwRubriek() }}
              placeholder="Rubrieknaam (bv. PBM)"
              aria-label="Naam nieuwe rubriek"
              className="flex-1 min-w-[180px] text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white"
            />
            <button
              onClick={nieuwRubriek}
              disabled={!nieuwNaam.trim() || bezig}
              className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Rubriek toevoegen
            </button>
          </div>
        </div>

        {rubrieken.length === 0 && (
          <p className="text-center text-ink/40 py-8 text-sm">Nog geen rubrieken.</p>
        )}

        <div className="space-y-3">
          {rubrieken.map((r, i) => (
            <RubriekKaart
              key={r.id}
              rubriek={r}
              isEerste={i === 0}
              isLaatste={i === rubrieken.length - 1}
              bezig={bezig}
              supabase={supabase}
              onBewaar={patch => bewaarRubriek(r, patch)}
              onArchiveer={() => archiveerRubriek(r.id)}
              onVerplaats={richting => verplaatsRubriek(i, richting)}
              onPatch={updates => patchRubriek(r.id, updates)}
              setFout={setFout}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

function RubriekKaart({
  rubriek, isEerste, isLaatste, bezig, supabase, onBewaar, onArchiveer, onVerplaats, onPatch, setFout,
}: {
  rubriek: Rubriek
  isEerste: boolean
  isLaatste: boolean
  bezig: boolean
  supabase: ReturnType<typeof createClient>
  onBewaar: (patch: Partial<Pick<Rubriek, 'naam' | 'rie_code' | 'volgorde'>>) => void
  onArchiveer: () => void
  onVerplaats: (richting: -1 | 1) => void
  onPatch: (updates: Partial<Rubriek>) => void
  setFout: (v: string | null) => void
}) {
  const [uit, setUit] = useState(false)
  const [nieuwVraag, setNieuwVraag] = useState('')
  const [vraagBezig, setVraagBezig] = useState(false)
  const vragen = rubriek.vragen

  async function voegVraagToe() {
    const tekst = nieuwVraag.trim()
    if (!tekst) return
    setVraagBezig(true); setFout(null)
    const volgorde = (vragen.at(-1)?.volgorde ?? 0) + 1
    const { data, error } = await supabase.rpc('centrale_vraag_opslaan', {
      p_id: null, p_rubriek_id: rubriek.id, p_tekst: tekst, p_volgorde: volgorde,
    })
    setVraagBezig(false)
    if (error || !data) { setFout('Vraag toevoegen mislukt.'); return }
    onPatch({ vragen: [...vragen, {
      id: data as string, rubriek_id: rubriek.id, tekst, volgorde, versie: 1,
      gewijzigd_op: new Date().toISOString(), gearchiveerd_op: null,
    }] })
    setNieuwVraag('')
  }

  async function hernoemVraag(v: CentraleVraag, tekst: string) {
    const schoon = tekst.trim()
    if (!schoon || schoon === v.tekst) return
    setFout(null)
    const { error } = await supabase.rpc('centrale_vraag_opslaan', {
      p_id: v.id, p_rubriek_id: rubriek.id, p_tekst: schoon, p_volgorde: v.volgorde,
    })
    if (error) { setFout('Vraag opslaan mislukt.'); return }
    onPatch({ vragen: vragen.map(x => (x.id === v.id ? { ...x, tekst: schoon, versie: x.versie + 1 } : x)) })
  }

  async function archiveerVraag(v: CentraleVraag) {
    setFout(null)
    const { error } = await supabase.rpc('centrale_vraag_archiveren', { p_id: v.id })
    if (error) { setFout('Vraag archiveren mislukt.'); return }
    onPatch({ vragen: vragen.filter(x => x.id !== v.id) })
  }

  async function verplaatsVraag(index: number, richting: -1 | 1) {
    const buur = index + richting
    if (buur < 0 || buur >= vragen.length || vraagBezig) return
    const a = vragen[index], b = vragen[buur]
    setVraagBezig(true); setFout(null)
    const r1 = await supabase.rpc('centrale_vraag_opslaan', { p_id: a.id, p_rubriek_id: rubriek.id, p_tekst: a.tekst, p_volgorde: b.volgorde })
    const r2 = await supabase.rpc('centrale_vraag_opslaan', { p_id: b.id, p_rubriek_id: rubriek.id, p_tekst: b.tekst, p_volgorde: a.volgorde })
    setVraagBezig(false)
    if (r1.error || r2.error) { setFout('Herordenen mislukt.'); return }
    onPatch({ vragen: vragen
      .map(x => x.id === a.id ? { ...a, volgorde: b.volgorde } : x.id === b.id ? { ...b, volgorde: a.volgorde } : x)
      .sort((x, y) => x.volgorde - y.volgorde) })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4">
        <div className="flex flex-col shrink-0">
          <button onClick={() => onVerplaats(-1)} disabled={isEerste || bezig} className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1" aria-label="Rubriek omhoog">▲</button>
          <button onClick={() => onVerplaats(1)} disabled={isLaatste || bezig} className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1" aria-label="Rubriek omlaag">▼</button>
        </div>
        <button onClick={() => setUit(o => !o)} className="flex-1 min-w-0 text-left" aria-expanded={uit}>
          <p className="font-medium text-ink truncate">{rubriek.naam}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {vragen.length} vra{vragen.length === 1 ? 'ag' : 'gen'}
            {rubriek.rie_code ? ` · RIE-code ${rubriek.rie_code}` : ''} · v{rubriek.versie}
          </p>
        </button>
        <span className="text-ink/30 text-xs shrink-0">{uit ? '▲' : '▼'}</span>
      </div>

      {uit && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          {/* Rubriek-eigenschappen */}
          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-[180px]">
              <span className="block text-xs text-ink/40 mb-1">Rubrieknaam</span>
              <input
                defaultValue={rubriek.naam}
                onBlur={e => onBewaar({ naam: e.target.value })}
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
            </label>
            <label className="min-w-[160px]">
              <span className="block text-xs text-ink/40 mb-1">RIE-code (intern)</span>
              <input
                defaultValue={rubriek.rie_code ?? ''}
                onBlur={e => onBewaar({ rie_code: e.target.value.trim() || null })}
                placeholder="optioneel"
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
            </label>
          </div>

          {/* Vragen */}
          {vragen.length === 0 && <p className="text-xs text-ink/40">Nog geen vragen.</p>}
          <ul className="space-y-2">
            {vragen.map((v, i) => (
              <li key={v.id} className="flex items-start gap-2">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => verplaatsVraag(i, -1)} disabled={i === 0 || vraagBezig} className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1" aria-label="Vraag omhoog">▲</button>
                  <button onClick={() => verplaatsVraag(i, 1)} disabled={i === vragen.length - 1 || vraagBezig} className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1" aria-label="Vraag omlaag">▼</button>
                </div>
                <textarea
                  defaultValue={v.tekst}
                  onBlur={e => hernoemVraag(v, e.target.value)}
                  rows={2}
                  aria-label="Vraagtekst"
                  className="flex-1 text-sm border border-ink/20 rounded px-3 py-2 bg-white resize-y"
                />
                <Archiveerknop label="Archiveren" onBevestig={() => archiveerVraag(v)} />
              </li>
            ))}
          </ul>

          {/* Nieuwe vraag */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface">
            <input
              value={nieuwVraag}
              onChange={e => setNieuwVraag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') voegVraagToe() }}
              placeholder="Nieuwe vraag…"
              aria-label="Nieuwe vraag"
              className="flex-1 min-w-[180px] text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
            />
            <button
              onClick={voegVraagToe}
              disabled={!nieuwVraag.trim() || vraagBezig}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Vraag toevoegen
            </button>
          </div>

          <div className="pt-2">
            <Archiveerknop label="Rubriek archiveren" onBevestig={onArchiveer} />
          </div>
        </div>
      )}
    </div>
  )
}
