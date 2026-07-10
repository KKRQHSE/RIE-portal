'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CentraleToolboxMetVragen, CentraleToolboxVraag, ToolboxBron } from '@/lib/types'
import LogoutButton from './LogoutButton'

type Toolbox = CentraleToolboxMetVragen
type Supa = ReturnType<typeof createClient>

function Archiveerknop({ label, onBevestig }: { label: string; onBevestig: () => void }) {
  const [vraag, setVraag] = useState(false)
  if (!vraag) {
    return (
      <button type="button" onClick={() => setVraag(true)}
        className="text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors">
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-ink/60">Weet je het zeker?</span>
      <button type="button" onClick={() => { setVraag(false); onBevestig() }}
        className="text-xs px-3 py-2 min-h-[40px] rounded-full bg-red-600 text-white hover:opacity-90">Ja, archiveren</button>
      <button type="button" onClick={() => setVraag(false)}
        className="text-xs px-3 py-2 min-h-[40px] rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Annuleer</button>
    </span>
  )
}

export default function ToolboxAdmin({
  initialToolboxen, initialBronnen = [],
}: {
  initialToolboxen: Toolbox[]
  initialBronnen?: ToolboxBron[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [toolboxen, setToolboxen] = useState<Toolbox[]>(initialToolboxen)
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function patch(id: string, u: Partial<Toolbox>) {
    setToolboxen(prev => prev.map(t => (t.id === id ? { ...t, ...u } : t)))
  }

  async function nieuwToolbox() {
    const titel = nieuw.trim()
    if (!titel || bezig) return
    setBezig(true); setFout(null)
    const volgorde = (toolboxen.at(-1)?.volgorde ?? 0) + 1
    const { data, error } = await supabase.rpc('centrale_toolbox_opslaan', {
      p_id: null, p_titel: titel, p_tekst: '', p_video_url: null,
      p_vereist_video: true, p_vereist_quiz: false, p_quiz_slaaggrens: 70,
      p_quiz_uitleg_modus: 'aan_eind', p_toegang: 'link', p_volgorde: volgorde,
    })
    setBezig(false)
    if (error || !data) { setFout('Toevoegen mislukt.'); return }
    setToolboxen(prev => [...prev, {
      id: data as string, titel, tekst: '', video_url: null, vereist_video: true, vereist_quiz: false,
      quiz_slaaggrens: 70, quiz_uitleg_modus: 'aan_eind', toegang: 'link', volgorde, versie: 1,
      gearchiveerd_op: null, vragen: [],
    }])
    setNieuw('')
  }

  async function archiveer(id: string) {
    setFout(null)
    const { error } = await supabase.rpc('centrale_toolbox_archiveren', { p_id: id })
    if (error) { setFout('Archiveren mislukt.'); return }
    setToolboxen(prev => prev.filter(t => t.id !== id))
  }

  return (
    <main className="min-h-screen glass-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2"><LogoutButton /></div>
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-ink/50 hover:text-accent transition-colors">← Beheer</Link>
          <h1 className="text-xl font-semibold text-ink mt-1">Centrale toolboxen</h1>
          <p className="text-sm text-ink/50 mt-0.5">
            Onderwerpen met tekst, een ingesloten video-link en een optionele quiz. Klanten
            koppelen hieraan en kunnen lokaal afwijken. De video is een link (YouTube/Vimeo), geen upload.
          </p>
        </div>

        {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-2">Nieuwe toolbox</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={nieuw} onChange={e => setNieuw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') nieuwToolbox() }}
              placeholder="Titel (bv. Werken op hoogte)" aria-label="Titel nieuwe toolbox"
              className="flex-1 min-w-[200px] text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white" />
            <button onClick={nieuwToolbox} disabled={!nieuw.trim() || bezig}
              className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
              Toolbox toevoegen
            </button>
          </div>
        </div>

        {toolboxen.length === 0 && <p className="text-center text-ink/40 py-8 text-sm">Nog geen toolboxen.</p>}

        <div className="space-y-3">
          {toolboxen.map(t => (
            <ToolboxKaart key={t.id} toolbox={t} supabase={supabase}
              onPatch={u => patch(t.id, u)} onArchiveer={() => archiveer(t.id)} setFout={setFout} />
          ))}
        </div>

        <BronnenBeheer supabase={supabase} initial={initialBronnen} setFout={setFout} />
      </div>
    </main>
  )
}

function ToolboxKaart({
  toolbox, supabase, onPatch, onArchiveer, setFout,
}: {
  toolbox: Toolbox
  supabase: Supa
  onPatch: (u: Partial<Toolbox>) => void
  onArchiveer: () => void
  setFout: (v: string | null) => void
}) {
  const [uit, setUit] = useState(false)
  const t = toolbox

  // Eén opslagpad voor de toolbox-velden (stuurt de volledige set mee).
  async function bewaar(u: Partial<Toolbox>) {
    const n = { ...t, ...u }
    if (!n.titel.trim()) return
    setFout(null)
    const { error } = await supabase.rpc('centrale_toolbox_opslaan', {
      p_id: t.id, p_titel: n.titel.trim(), p_tekst: n.tekst, p_video_url: n.video_url,
      p_vereist_video: n.vereist_video, p_vereist_quiz: n.vereist_quiz, p_quiz_slaaggrens: n.quiz_slaaggrens,
      p_quiz_uitleg_modus: n.quiz_uitleg_modus, p_toegang: n.toegang, p_volgorde: n.volgorde,
    })
    if (error) { setFout('Opslaan mislukt: ' + error.message); return }
    onPatch(u)
  }

  return (
    <div className="glass-tile rounded-2xl overflow-hidden">
      <button onClick={() => setUit(o => !o)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50" aria-expanded={uit}>
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{t.titel}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {t.vragen.length} quizvra{t.vragen.length === 1 ? 'ag' : 'gen'} · v{t.versie}
            {t.vereist_video ? ' · video vereist' : ''}{t.vereist_quiz ? ' · quiz vereist' : ''}
            {t.toegang === 'login' ? ' · alleen via login' : ''}
          </p>
        </div>
        <span className="text-ink/30 text-xs shrink-0">{uit ? '▲' : '▼'}</span>
      </button>

      {uit && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          <label className="block">
            <span className="block text-xs text-ink/40 mb-1">Titel</span>
            <input defaultValue={t.titel} onBlur={e => bewaar({ titel: e.target.value })}
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white" />
          </label>
          <label className="block">
            <span className="block text-xs text-ink/40 mb-1">Tekst (wat de werknemer leest)</span>
            <textarea defaultValue={t.tekst} onBlur={e => bewaar({ tekst: e.target.value })} rows={4}
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white resize-y" />
          </label>
          <label className="block">
            <span className="block text-xs text-ink/40 mb-1">Video-link (YouTube/Vimeo)</span>
            <input defaultValue={t.video_url ?? ''} onBlur={e => bewaar({ video_url: e.target.value.trim() || null })}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white" />
          </label>

          {/* Telt-mee- en gedrag-instellingen */}
          <div className="rounded border border-surface bg-surface/30 p-3 space-y-2">
            <p className="text-xs font-medium text-ink/50">Afronden telt mee als…</p>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={t.vereist_video} onChange={e => bewaar({ vereist_video: e.target.checked })} className="accent-[color:var(--color-accent)]" />
              Video moet bekeken zijn
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={t.vereist_quiz} onChange={e => bewaar({ vereist_quiz: e.target.checked })} className="accent-[color:var(--color-accent)]" />
              Quiz moet gehaald zijn
            </label>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="text-xs text-ink/50 flex items-center gap-2">
                Slaaggrens
                <input type="number" min={0} max={100} defaultValue={t.quiz_slaaggrens}
                  onBlur={e => bewaar({ quiz_slaaggrens: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                  className="w-16 text-sm border border-ink/20 rounded px-2 py-1 bg-white" />%
              </label>
              <label className="text-xs text-ink/50 flex items-center gap-2">
                Uitleg
                <select value={t.quiz_uitleg_modus} onChange={e => bewaar({ quiz_uitleg_modus: e.target.value as Toolbox['quiz_uitleg_modus'] })}
                  className="text-sm border border-ink/20 rounded px-2 py-1 bg-white">
                  <option value="per_vraag">na elke vraag</option>
                  <option value="aan_eind">aan het eind</option>
                </select>
              </label>
              <label className="text-xs text-ink/50 flex items-center gap-2">
                Toegang
                <select value={t.toegang} onChange={e => bewaar({ toegang: e.target.value as Toolbox['toegang'] })}
                  className="text-sm border border-ink/20 rounded px-2 py-1 bg-white">
                  <option value="link">persoonlijke link</option>
                  <option value="login">alleen via login</option>
                </select>
              </label>
            </div>
          </div>

          {/* Quizvragen */}
          <Quizbeheer toolbox={t} supabase={supabase} onPatch={onPatch} setFout={setFout} />

          <div className="pt-2">
            <Archiveerknop label="Toolbox archiveren" onBevestig={onArchiveer} />
          </div>
        </div>
      )}
    </div>
  )
}

function Quizbeheer({
  toolbox, supabase, onPatch, setFout,
}: {
  toolbox: Toolbox
  supabase: Supa
  onPatch: (u: Partial<Toolbox>) => void
  setFout: (v: string | null) => void
}) {
  const vragen = toolbox.vragen
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)

  async function voegToe() {
    const vraagtekst = nieuw.trim()
    if (!vraagtekst) return
    setBezig(true); setFout(null)
    const volgorde = (vragen.at(-1)?.volgorde ?? 0) + 1
    const opties = ['Juist', 'Onjuist']
    const { data, error } = await supabase.rpc('centrale_toolbox_vraag_opslaan', {
      p_id: null, p_toolbox_id: toolbox.id, p_vraagtekst: vraagtekst, p_opties: opties,
      p_juist_antwoord: 0, p_uitleg: null, p_volgorde: volgorde,
    })
    setBezig(false)
    if (error || !data) { setFout('Vraag toevoegen mislukt: ' + (error?.message ?? '')); return }
    onPatch({ vragen: [...vragen, { id: data as string, toolbox_id: toolbox.id, vraagtekst, opties, juist_antwoord: 0, uitleg: null, volgorde, versie: 1, gearchiveerd_op: null }] })
    setNieuw('')
  }

  async function bewaarVraag(v: CentraleToolboxVraag, u: Partial<CentraleToolboxVraag>) {
    const n = { ...v, ...u }
    if (!n.vraagtekst.trim() || n.opties.length < 2) return
    setFout(null)
    const { error } = await supabase.rpc('centrale_toolbox_vraag_opslaan', {
      p_id: v.id, p_toolbox_id: toolbox.id, p_vraagtekst: n.vraagtekst.trim(), p_opties: n.opties,
      p_juist_antwoord: Math.min(n.juist_antwoord, n.opties.length - 1), p_uitleg: n.uitleg, p_volgorde: n.volgorde,
    })
    if (error) { setFout('Vraag opslaan mislukt: ' + error.message); return }
    onPatch({ vragen: vragen.map(x => (x.id === v.id ? n : x)) })
  }

  async function archiveerVraag(v: CentraleToolboxVraag) {
    setFout(null)
    const { error } = await supabase.rpc('centrale_toolbox_vraag_archiveren', { p_id: v.id })
    if (error) { setFout('Vraag archiveren mislukt.'); return }
    onPatch({ vragen: vragen.filter(x => x.id !== v.id) })
  }

  return (
    <div className="rounded border border-surface p-3 space-y-3">
      <p className="text-xs font-medium text-ink/50">Quizvragen</p>
      {vragen.length === 0 && <p className="text-xs text-ink/40">Nog geen vragen.</p>}

      {vragen.map(v => (
        <div key={v.id} className="rounded border border-surface bg-surface/20 p-2 space-y-2">
          <textarea defaultValue={v.vraagtekst} onBlur={e => bewaarVraag(v, { vraagtekst: e.target.value })} rows={2}
            aria-label="Vraagtekst" className="w-full text-sm border border-ink/20 rounded px-2 py-1.5 bg-white resize-y" />
          <div className="space-y-1">
            {v.opties.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name={`juist-${v.id}`} checked={v.juist_antwoord === i}
                  onChange={() => bewaarVraag(v, { juist_antwoord: i })} aria-label={`Optie ${i + 1} is juist`}
                  className="accent-[color:var(--color-accent)]" />
                <input defaultValue={opt}
                  onBlur={e => { const opties = [...v.opties]; opties[i] = e.target.value; bewaarVraag(v, { opties }) }}
                  className="flex-1 text-sm border border-ink/20 rounded px-2 py-1 bg-white" />
                {v.opties.length > 2 && (
                  <button type="button" onClick={() => { const opties = v.opties.filter((_, j) => j !== i); bewaarVraag(v, { opties, juist_antwoord: Math.min(v.juist_antwoord, opties.length - 1) }) }}
                    className="text-red-500 hover:text-red-700 text-sm px-1" aria-label="Optie verwijderen">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => bewaarVraag(v, { opties: [...v.opties, 'Nieuwe optie'] })}
              className="text-xs text-accent hover:underline">+ optie</button>
          </div>
          <input defaultValue={v.uitleg ?? ''} onBlur={e => bewaarVraag(v, { uitleg: e.target.value.trim() || null })}
            placeholder="Uitleg (verschijnt bij het juiste antwoord)…"
            className="w-full text-sm border border-ink/20 rounded px-2 py-1.5 bg-white" />
          <Archiveerknop label="Vraag archiveren" onBevestig={() => archiveerVraag(v)} />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input value={nieuw} onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') voegToe() }} placeholder="Nieuwe quizvraag…"
          aria-label="Nieuwe quizvraag" className="flex-1 min-w-[180px] text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white" />
        <button onClick={voegToe} disabled={!nieuw.trim() || bezig}
          className="text-sm px-4 py-2 min-h-[44px] rounded-full bg-ink text-white hover:opacity-90 disabled:opacity-40">Vraag toevoegen</button>
      </div>
    </div>
  )
}

// ---- Onderwerpenbibliotheek (0043) ----
// Beheerde links naar externe toolbox-bronnen. De uitvoerder ziet ze als
// inspiratie bij het aanmaken van een sessie; hij typt het onderwerp zelf.
// Archiveren is een soft delete — er is bewust geen verwijder-RPC.

function BronnenBeheer({
  supabase, initial, setFout,
}: {
  supabase: Supa
  initial: ToolboxBron[]
  setFout: (v: string | null) => void
}) {
  const [bronnen, setBronnen] = useState<ToolboxBron[]>(initial)
  const [naam, setNaam] = useState('')
  const [url, setUrl] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [bezig, setBezig] = useState(false)

  const actief = bronnen.filter(b => !b.gearchiveerd_op)
  const gearchiveerd = bronnen.filter(b => b.gearchiveerd_op)

  async function voegToe() {
    if (!naam.trim() || !url.trim()) return
    setBezig(true); setFout(null)
    const volgorde = actief.reduce((m, b) => Math.max(m, b.volgorde), 0) + 1
    const { data, error } = await supabase.rpc('toolbox_bron_opslaan', {
      p_id: null, p_naam: naam.trim(), p_url: url.trim(),
      p_omschrijving: omschrijving.trim() || null, p_volgorde: volgorde,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setBronnen(prev => [...prev, {
      id: data as string, naam: naam.trim(), url: url.trim(),
      omschrijving: omschrijving.trim() || null, volgorde, gearchiveerd_op: null,
    }])
    setNaam(''); setUrl(''); setOmschrijving('')
  }

  async function bewaar(b: ToolboxBron, u: Partial<ToolboxBron>) {
    const nieuw = { ...b, ...u }
    setBronnen(prev => prev.map(x => (x.id === b.id ? nieuw : x)))
    setFout(null)
    const { error } = await supabase.rpc('toolbox_bron_opslaan', {
      p_id: b.id, p_naam: nieuw.naam, p_url: nieuw.url,
      p_omschrijving: nieuw.omschrijving, p_volgorde: nieuw.volgorde,
    })
    if (error) setFout(error.message)
  }

  async function archiveer(id: string) {
    setFout(null)
    const { error } = await supabase.rpc('toolbox_bron_archiveren', { p_id: id })
    if (error) { setFout(error.message); return }
    setBronnen(prev => prev.map(b => (b.id === id ? { ...b, gearchiveerd_op: new Date().toISOString() } : b)))
  }

  async function herstel(id: string) {
    setFout(null)
    const { error } = await supabase.rpc('toolbox_bron_herstellen', { p_id: id })
    if (error) { setFout(error.message); return }
    setBronnen(prev => prev.map(b => (b.id === id ? { ...b, gearchiveerd_op: null } : b)))
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">Onderwerpenbibliotheek</h2>
      <p className="text-sm text-ink/50 mt-0.5 mb-4">
        Links naar externe toolbox-bronnen. De uitvoerder ziet deze lijst bij het aanmaken
        van een sessie, als inspiratie voor het onderwerp. Ze openen in een nieuw tabblad.
      </p>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 space-y-2">
        <p className="text-sm font-medium text-ink">Nieuwe bron</p>
        <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Naam (bv. Arboportaal)"
          aria-label="Naam bron" className="w-full text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white" />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url"
          aria-label="URL bron" className="w-full text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white" />
        <input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Korte omschrijving (optioneel)"
          aria-label="Omschrijving bron" className="w-full text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white" />
        <button onClick={voegToe} disabled={!naam.trim() || !url.trim() || bezig}
          className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
          Bron toevoegen
        </button>
        <p className="text-xs text-ink/40">De URL moet met https:// beginnen.</p>
      </div>

      {actief.length === 0 && <p className="text-center text-ink/40 py-6 text-sm">Nog geen bronnen.</p>}

      <div className="space-y-3">
        {actief.map(b => (
          <div key={b.id} className="bg-white rounded-lg shadow-sm p-4 space-y-2">
            <input defaultValue={b.naam} onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.naam) bewaar(b, { naam: v }) }}
              aria-label={`Naam van ${b.naam}`} className="w-full text-sm font-medium border border-ink/20 rounded px-3 py-2 bg-white" />
            <input defaultValue={b.url} onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.url) bewaar(b, { url: v }) }}
              aria-label={`URL van ${b.naam}`} inputMode="url" className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white" />
            <input defaultValue={b.omschrijving ?? ''} onBlur={e => { const v = e.target.value.trim() || null; if (v !== b.omschrijving) bewaar(b, { omschrijving: v }) }}
              aria-label={`Omschrijving van ${b.naam}`} placeholder="Korte omschrijving"
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white" />
            <div className="flex flex-wrap items-center gap-2">
              <a href={b.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-accent hover:underline">Openen ↗</a>
              <span className="ml-auto"><Archiveerknop label="Bron archiveren" onBevestig={() => archiveer(b.id)} /></span>
            </div>
          </div>
        ))}
      </div>

      {gearchiveerd.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-ink/50 cursor-pointer hover:text-ink">
            Gearchiveerd ({gearchiveerd.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {gearchiveerd.map(b => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-sm bg-white rounded-lg shadow-sm p-3">
                <span className="text-ink/40 line-through truncate">{b.naam}</span>
                <button type="button" onClick={() => herstel(b.id)}
                  className="shrink-0 text-xs px-3 py-2 min-h-[40px] rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">
                  Terugzetten
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
