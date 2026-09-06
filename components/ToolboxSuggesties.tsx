'use client'

// ============================================================================
// "Aanbevolen deze periode" — bovenaan de toolboxmodule (migratie 0077).
// ----------------------------------------------------------------------------
// BASIS: trefwoord-matching over RI&E-hoofdrisico's, recente "niet in orde"-
// inspectiebevindingen en incidenten (RPC toolbox_suggesties), tegen de eigen
// gekoppelde toolboxen en de onderwerpenbibliotheek. Puur SQL, geen AI, met
// een REDEN per suggestie.
//
// AANVULLING (optioneel): alleen voor een onderwerp zonder eigen toolbox/bron
// (heeft_match === false) mag de uitvoerder zelf een AI-advies opvragen —
// opt-in, server-side, leverancier-neutraal (app/api/toolbox/onderwerp-advies)
// — dat NOOIT toolbox-inhoud verzint, alleen een duiding + waar te zoeken.
//
// Het systeem beslist hier niets: elke kaart eindigt in een knop/link die de
// uitvoerder zelf aanklikt. Niets wordt automatisch gepland.
// ============================================================================

import { useEffect, useState } from 'react'
import type { ToolboxSuggestie } from '@/lib/types'
import type { AiLeverancierStatus } from '@/lib/ai-analyse'

export type ToolboxVoorstel = { onderwerp: string; toolboxId?: string }

export default function ToolboxSuggesties({
  companyId, suggesties, onKiesToolbox,
}: {
  companyId: string
  suggesties: ToolboxSuggestie[]
  onKiesToolbox: (v: ToolboxVoorstel) => void
}) {
  const heeftGat = suggesties.some(s => !s.heeft_match)
  const [aiStatus, setAiStatus] = useState<AiLeverancierStatus | null>(null)

  useEffect(() => {
    if (!heeftGat) return
    let actief = true
    fetch('/api/toolbox/onderwerp-advies')
      .then(res => (res.ok ? res.json() : null))
      .then(v => { if (actief && v) setAiStatus(v as AiLeverancierStatus) })
      .catch(() => { /* geen status beschikbaar: de knop blijft dan gewoon werken zonder vooraf-label */ })
    return () => { actief = false }
  }, [heeftGat])

  if (suggesties.length === 0) return null

  return (
    <div className="glass-tile rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-ink">Aanbevolen deze periode</p>
        <p className="text-xs text-ink/40">
          Op basis van je eigen RI&E, inspecties en incidenten — jij kiest, er wordt niets automatisch gepland.
        </p>
      </div>
      <ul className="space-y-2">
        {suggesties.map(s => (
          <li key={s.onderwerp_code}>
            <SuggestieKaart s={s} companyId={companyId} aiStatus={aiStatus} onKiesToolbox={onKiesToolbox} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SuggestieKaart({
  s, companyId, aiStatus, onKiesToolbox,
}: {
  s: ToolboxSuggestie
  companyId: string
  aiStatus: AiLeverancierStatus | null
  onKiesToolbox: (v: ToolboxVoorstel) => void
}) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-3 space-y-2">
      <p className="text-sm font-medium text-ink">{s.onderwerp_naam}</p>
      {s.redenen.length > 0 && (
        <ul className="text-xs text-ink/50 space-y-0.5">
          {s.redenen.map((r, i) => <li key={i}>· {r}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-start gap-2">
        {s.toolbox_id ? (
          <button type="button"
            onClick={() => onKiesToolbox({ onderwerp: s.toolbox_titel ?? s.onderwerp_naam, toolboxId: s.toolbox_id ?? undefined })}
            className="btn btn-accent text-xs px-3 py-1.5 rounded-full bg-accent text-white">
            Toolbox starten
          </button>
        ) : s.bron_id ? (
          <>
            <a href={s.bron_url ?? '#'} target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-accent hover:border-accent">
              {s.bron_naam ?? 'Bron bekijken'} ↗
            </a>
            <button type="button" onClick={() => onKiesToolbox({ onderwerp: s.onderwerp_naam })}
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors">
              Toolbox starten
            </button>
          </>
        ) : (
          <ToolboxOnderwerpAdvies companyId={companyId} onderwerpNaam={s.onderwerp_naam} redenen={s.redenen} aiStatus={aiStatus} />
        )}
      </div>
    </div>
  )
}

// De AI-AANVULLING: alleen zichtbaar als de trefwoord-matching hierboven niets
// vond. Standaard UIT (geen toestemming, geen aanroep) — precies zoals
// InspectieFotoAi voor de foto-analyse.
function ToolboxOnderwerpAdvies({
  companyId, onderwerpNaam, redenen, aiStatus,
}: {
  companyId: string
  onderwerpNaam: string
  redenen: string[]
  aiStatus: AiLeverancierStatus | null
}) {
  const [toestemming, setToestemming] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ soort: 'info' | 'fout'; tekst: string } | null>(null)
  const [advies, setAdvies] = useState<{ advies: string | null; bronnen_suggestie: string[] } | null>(null)

  const nietGeconfigureerd = aiStatus !== null && !aiStatus.geconfigureerd
  const dienst = aiStatus?.weergavenaam || 'een externe AI-dienst'
  const buitenEu = aiStatus?.regio !== 'eu'

  async function vraagAdvies() {
    if (!toestemming || bezig) return
    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch('/api/toolbox/onderwerp-advies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // De toestemming gaat expliciet mee; de server weigert zonder true.
        body: JSON.stringify({ companyId, onderwerp: onderwerpNaam, redenen, toestemming: true }),
      })
      const uitkomst = (await res.json().catch(() => ({}))) as {
        advies?: string | null
        bronnen_suggestie?: string[]
        fout?: string
        code?: string
      }
      if (!res.ok) {
        const isConfig = uitkomst.code === 'niet_geconfigureerd'
        setMelding({
          soort: isConfig ? 'info' : 'fout',
          tekst: uitkomst.fout || 'Het AI-advies is niet gelukt.',
        })
        return
      }
      setAdvies({ advies: uitkomst.advies ?? null, bronnen_suggestie: uitkomst.bronnen_suggestie ?? [] })
    } catch {
      setMelding({ soort: 'fout', tekst: 'Het AI-advies is niet gelukt.' })
    } finally {
      setBezig(false)
    }
  }

  if (advies) {
    return (
      <div className="w-full rounded border border-dashed border-accent/40 bg-surface/40 p-2 space-y-1">
        <p className="text-[11px] font-medium text-accent">✦ AI-advies — geen instructie, alleen een voorstel</p>
        {advies.advies && <p className="text-xs text-ink/70">{advies.advies}</p>}
        {advies.bronnen_suggestie.length > 0 && (
          <p className="text-xs text-ink/50">Kijk bijvoorbeeld bij: {advies.bronnen_suggestie.join(', ')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="w-full space-y-1.5">
      <p className="text-xs text-ink/40">Nog geen eigen toolbox of bron voor dit onderwerp.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={toestemming} onChange={e => setToestemming(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
        <span className="text-[11px] text-ink/60">
          Vraag een AI-advies (via {dienst}{buitenEu ? ', buiten de EU' : ''}) — alleen dit onderwerp + de reden
          gaat mee, geen bedrijfsgegevens. De AI schrijft geen toolbox-inhoud, alleen een duiding en waar te zoeken.
        </span>
      </label>
      <button type="button" onClick={vraagAdvies} disabled={!toestemming || bezig}
        className="btn text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-accent hover:text-accent transition-colors disabled:opacity-40">
        {bezig ? 'Bezig…' : '✦ AI-advies vragen'}
      </button>
      {nietGeconfigureerd && !melding && (
        <p className="text-[11px] text-ink/50">AI-advies is nog niet ingesteld voor dit portaal.</p>
      )}
      {melding && (
        <p className={`text-[11px] ${melding.soort === 'fout' ? 'text-red-600' : 'text-ink/50'}`}>{melding.tekst}</p>
      )}
    </div>
  )
}
