'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import HuisstijlLogo from './HuisstijlLogo'

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
  }

  function changeVoorstel(val: string) {
    setVoorstel(val)
    bewaar(val, opm)
  }

  function ditHebIkGedaan() {
    setVoorstel('Afgerond')
    bewaar('Afgerond', opm)
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
              className="text-sm border border-ink/20 rounded px-2 py-1 bg-white"
            >
              {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={ditHebIkGedaan}
            disabled={bezig || voorstel === 'Afgerond'}
            className="text-sm px-4 py-1.5 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
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
      </div>
    </div>
  )
}
