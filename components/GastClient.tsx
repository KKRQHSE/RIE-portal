'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { HistorieRegel } from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import BewijsBlok from './BewijsBlok'
import Doorgeven from './Doorgeven'

export type GastActie = {
  id: string
  nr: string | null
  onderwerp: string | null
  prio: string | null
  termijn: string | null
  status: string | null
  concept_status: string | null
  concept_opm: string | null
}

type Props = {
  token: string
  persoonNaam: string | null
  bedrijfNaam: string | null
  acties: GastActie[]
  huisstijl?: HuisstijlView
}

const PRIO_STYLE: Record<string, string> = {
  Laag:   'bg-yellow-100 text-yellow-800',
  Middel: 'bg-orange-100 text-orange-800',
  Hoog:   'bg-red-100 text-red-800',
}

const STATUS_BADGE: Record<string, string> = {
  'Open':           'bg-gray-100 text-gray-700',
  'In behandeling': 'bg-blue-100 text-blue-800',
  'Afgerond':       'bg-green-100 text-green-800',
}

const STATUS_OPTS = ['Open', 'In behandeling', 'Afgerond']

// Zelfde datumnotatie als de ingelogde kant (PvaCard).
function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Leesbare labels voor de gelogde gebeurtenissen.
const GEBEURTENIS_LABEL: Record<string, string> = {
  concept_gewijzigd:     'Voorstel ingediend',
  concept_teruggestuurd: 'Teruggestuurd',
  vrijgegeven:           'Vrijgegeven',
  status_gezet:          'Status gewijzigd',
  bewijs_toegevoegd:     'Bewijs toegevoegd',
  bewijs_verwijderd:     'Bewijs verwijderd',
  doorgegeven:           'Doorgegeven',
}
function gebeurtenisLabel(g: string): string {
  return GEBEURTENIS_LABEL[g] ?? g
}

// Pure ophaler (geen state): de gast gebruikt hiervoor uitsluitend de nieuwe
// RPC deellink_actie_historie. Geeft de regels (nieuwste eerst), [] bij lege
// historie, of null als het ophalen mislukt — de aanroeper beslist wat te tonen.
async function haalHistorieOp(token: string, actieId: string): Promise<HistorieRegel[] | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('deellink_actie_historie', {
      p_token: token,
      p_actie_id: actieId,
    })
    if (error) return null
    const arr = typeof data === 'string' ? JSON.parse(data) : data
    return Array.isArray(arr) ? (arr as HistorieRegel[]) : []
  } catch {
    return null
  }
}

export default function GastClient({ token, persoonNaam, bedrijfNaam, acties, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-3" />
          {bedrijfNaam && <p className="text-sm text-ink/50">{bedrijfNaam}</p>}
          <h1 className="text-xl font-semibold text-ink">Hoi {persoonNaam ?? 'daar'}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Dit zijn de acties die aan jou zijn toegewezen.</p>
        </div>

        <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-ink/70">
            Dit is een <span className="font-medium">concept</span>. Je KAM-coördinator geeft het vrij.
          </p>
        </div>

        <div className="space-y-3">
          {acties.map(actie => (
            <GastActieKaart key={actie.id} token={token} actie={actie} />
          ))}
          {acties.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">
              Er zijn nog geen acties aan jou toegewezen.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

function GastActieKaart({ token, actie }: { token: string; actie: GastActie }) {
  // De echte status is read-only; de gast levert alleen een concept (voorstel).
  const [voorstel, setVoorstel] = useState(actie.concept_status ?? actie.status ?? 'Open')
  const [opm, setOpm] = useState(actie.concept_opm ?? '')
  const [bezig, setBezig] = useState(false)
  const [ingediendStatus, setIngediendStatus] = useState<string | null>(actie.concept_status)
  const [netIngediend, setNetIngediend] = useState(false)

  // Na doorgeven verhuist de actie naar de collega en is hij niet meer van deze
  // gast. We tonen dan een rustige bevestiging i.p.v. de bewerkbare kaart.
  const [doorgegevenAan, setDoorgegevenAan] = useState<string | null>(null)

  // Geschiedenis van deze ene eigen actie (nieuwste eerst). null = nog niet geladen.
  const [historie, setHistorie] = useState<HistorieRegel[] | null>(null)
  const [histOpen, setHistOpen] = useState(false)

  // Eén ophaling per actie bij mount. setState gebeurt pas ná de await (in de
  // .then), zodat het geen synchrone state-update in het effect is.
  useEffect(() => {
    let actief = true
    haalHistorieOp(token, actie.id).then(rows => {
      if (actief && rows) setHistorie(rows)
    })
    return () => { actief = false }
  }, [token, actie.id])

  async function bewaar(nieuwVoorstel: string, nieuweOpm: string) {
    setBezig(true)
    const supabase = createClient()
    // Gast muteert uitsluitend via deze RPC (token is de toegang); logt zelf historie.
    const { error } = await supabase.rpc('deellink_concept_update', {
      p_token: token,
      p_actie_id: actie.id,
      p_status: nieuwVoorstel,
      p_opm: nieuweOpm,
    })
    setBezig(false)
    if (error) return
    setIngediendStatus(nieuwVoorstel)
    setNetIngediend(true)
    setTimeout(() => setNetIngediend(false), 4000)
    // Historie opnieuw ophalen: het terugstuur-blokje verdwijnt nu het nieuwe
    // voorstel de laatste gebeurtenis is.
    const rows = await haalHistorieOp(token, actie.id)
    if (rows) setHistorie(rows)
  }

  // Toon het terugstuur-blokje alleen als terugsturen de laatste gebeurtenis was
  // én er nu geen lopend voorstel is.
  const laatste = historie && historie.length > 0 ? historie[0] : null
  const toonTerugstuur = !ingediendStatus && laatste?.gebeurtenis === 'concept_teruggestuurd'

  function changeVoorstel(val: string) {
    setVoorstel(val)
    bewaar(val, opm)
  }

  function ditHebIkGedaan() {
    setVoorstel('Afgerond')
    bewaar('Afgerond', opm)
  }

  // Doorgegeven: de actie is verhuisd; toon alleen nog een bevestiging.
  if (doorgegevenAan) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          {actie.nr && <span className="font-mono text-xs text-ink/40">{actie.nr}</span>}
          <span className="font-medium text-ink">{actie.onderwerp}</span>
        </div>
        <p className="text-sm text-green-600 font-medium mt-2">
          Doorgegeven aan {doorgegevenAan}. Deze actie staat niet meer op jouw lijst.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-start gap-3">
        {actie.prio && (
          <span className={`shrink-0 font-mono text-xs font-medium px-2 py-1 rounded mt-0.5 ${PRIO_STYLE[actie.prio] ?? 'bg-gray-100 text-gray-700'}`}>
            {actie.prio}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {actie.nr && <span className="font-mono text-xs text-ink/40">{actie.nr}</span>}
            <span className="font-medium text-ink">{actie.onderwerp}</span>
          </div>
          {actie.termijn && (
            <p className="text-xs text-ink/50 font-mono mt-0.5">{actie.termijn}</p>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-surface space-y-3">
        {/* Terugstuur-reden: rustig maar opvallend, alleen als terugsturen het laatst gebeurde */}
        {toonTerugstuur && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-sm text-amber-900">
              {laatste?.opmerking ? (
                <>Je vorige voorstel is teruggestuurd: <span className="font-medium">{laatste.opmerking}</span></>
              ) : (
                'Je vorige voorstel is teruggestuurd.'
              )}
            </p>
          </div>
        )}

        {/* Echte status (read-only) + huidige voorstel */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">Status</span>
            <span className={`text-sm font-medium px-2 py-0.5 rounded ${STATUS_BADGE[actie.status ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
              {actie.status ?? 'Open'}
            </span>
          </div>
          {ingediendStatus && (
            <span className="text-xs text-accent">Jouw voorstel: {ingediendStatus}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">Jouw voorstel</span>
            <select
              value={voorstel}
              onChange={e => changeVoorstel(e.target.value)}
              disabled={bezig}
              className="text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white"
            >
              {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={ditHebIkGedaan}
            disabled={bezig}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Dit heb ik gedaan
          </button>
        </div>

        <div>
          <textarea
            value={opm}
            onChange={e => setOpm(e.target.value)}
            onBlur={() => bewaar(voorstel, opm)}
            placeholder="Opmerking (optioneel)…"
            rows={2}
            disabled={bezig}
            className="w-full text-sm border border-ink/20 rounded px-3 py-2 resize-none bg-white"
          />
        </div>

        {netIngediend && (
          <p className="text-xs text-green-600 font-medium">
            Concept ingediend — je KAM-coördinator geeft het vrij.
          </p>
        )}

        {/* Bewijs (foto's/pdf) — extra blok, los van de voorstel-flow */}
        <div className="space-y-2">
          <span className="text-xs text-ink/40">Bewijs</span>
          <BewijsBlok modus="gast" token={token} actieId={actie.id} />
        </div>

        {/* Doorgeven aan een collega — rustige secundaire actie */}
        <Doorgeven
          modus="gast"
          token={token}
          actieId={actie.id}
          onDoorgegeven={r => setDoorgegevenAan(r.ontvangerNaam)}
        />

        {/* Geschiedenis-uitklap van deze eigen actie (zelfde stijl als ingelogde kant) */}
        <div>
          <button
            onClick={() => setHistOpen(o => !o)}
            className="text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/50 hover:border-ink/40 transition-colors"
          >
            Geschiedenis {histOpen ? '▲' : '▼'}
          </button>
          {histOpen && (
            <div className="mt-2 rounded border border-surface bg-surface/40 p-3">
              {historie === null && <p className="text-xs text-ink/40">Laden…</p>}
              {historie && historie.length === 0 && (
                <p className="text-xs text-ink/40">Nog geen geschiedenis.</p>
              )}
              {historie && historie.length > 0 && (
                <ul className="space-y-2">
                  {historie.map((h, i) => (
                    <li key={i} className="text-xs text-ink/60 border-l-2 border-ink/10 pl-2">
                      <span className="font-medium text-ink/80">{h.actor_naam ?? 'Onbekend'}</span>
                      {' — '}{gebeurtenisLabel(h.gebeurtenis)}
                      {(h.van_status || h.naar_status) && (
                        <span className="text-ink/50"> · {h.van_status ?? '—'} → {h.naar_status ?? '—'}</span>
                      )}
                      <span className="text-ink/40"> · {formatDatum(h.created_at)}</span>
                      {h.opmerking && <p className="text-ink/50 mt-0.5">{h.opmerking}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
