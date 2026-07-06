'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type {
  Company,
  SjabloonMetPunten,
  InspectieSjabloonPunt,
  BibliotheekRegel,
  InspectieStatus,
  Functiegroep,
  NormRubriek,
} from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'
import InspectieUitvoeren from './InspectieUitvoeren'
import NormBeheer from './NormBeheer'

type Props = {
  company: Company
  huisstijl?: HuisstijlView
  initialSjablonen: SjabloonMetPunten[]
  initialRegels: BibliotheekRegel[]
  functiegroepen?: Functiegroep[]
  initialNorm?: NormRubriek[]
}

type View = 'inspecties' | 'norm' | 'sjablonen'

const STATUS_STIJL: Record<string, string> = {
  concept: 'bg-blue-100 text-blue-800',
  ingediend: 'bg-blue-100 text-blue-800',
  afgerond: 'bg-green-100 text-green-800',
  geannuleerd: 'bg-gray-100 text-gray-600',
}

const STATUS_LABEL: Record<string, string> = {
  concept: 'Concept',
  ingediend: 'Ingediend',
  afgerond: 'Afgerond',
  geannuleerd: 'Geannuleerd',
}

// Een inspectie is "klaar" (een echt rapport) zodra ze afgerond of geannuleerd is.
function isAfgehandeld(status: InspectieStatus): boolean {
  return status === 'afgerond' || status === 'geannuleerd'
}

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InspectieClient({
  company,
  huisstijl = VEILIGE_HUISSTIJL,
  initialSjablonen,
  initialRegels,
  functiegroepen = [],
  initialNorm = [],
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [view, setView] = useState<View>('inspecties')
  const [sjablonen, setSjablonen] = useState<SjabloonMetPunten[]>(initialSjablonen)
  const [regels, setRegels] = useState<BibliotheekRegel[]>(initialRegels)
  const [open, setOpen] = useState<BibliotheekRegel | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  // --- Sjabloon-mutaties ---
  function patchSjabloon(id: string, updates: Partial<SjabloonMetPunten>) {
    setSjablonen(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  async function nieuwSjabloon(naam: string, controlesoort: string) {
    setFout(null)
    const { data, error } = await supabase.rpc('sjabloon_opslaan', {
      p_sjabloon_id: null,
      p_company_id: company.id,
      p_naam: naam,
      p_controlesoort: controlesoort || null,
    })
    if (error) { setFout(error.message); return }
    setSjablonen(prev => [
      ...prev,
      {
        id: data as string,
        company_id: company.id,
        naam,
        controlesoort: controlesoort || null,
        actief: true,
        gearchiveerd_op: null,
        doel_functiegroep_id: null,
        punten: [],
      },
    ])
  }

  async function archiveerSjabloon(id: string) {
    if (!confirm('Dit sjabloon archiveren? Bestaande inspecties blijven bewaard.')) return
    const { error } = await supabase.rpc('sjabloon_archiveren', { p_sjabloon_id: id })
    if (error) { setFout(error.message); return }
    setSjablonen(prev => prev.filter(s => s.id !== id))
  }

  // Is er een bruikbare norm (gekoppelde rubriek met minstens één actieve vraag)?
  const normPunten = useMemo(
    () => initialNorm.reduce((n, r) => n + (r.gekoppeld ? r.vragen.filter(v => v.actief).length : 0), 0),
    [initialNorm],
  )

  // Telbadge: afwijkende punten waar de centrale norm is bijgewerkt (onbeantwoord).
  const normSignalen = useMemo(
    () => initialNorm.reduce((n, r) => n + r.vragen.filter(v => v.norm_gewijzigd).length, 0),
    [initialNorm],
  )

  // --- Inspectie starten vanuit de centrale norm ---
  async function startInspectieCentraal() {
    setFout(null)
    const { data, error } = await supabase.rpc('inspectie_start_centraal', { p_company_id: company.id })
    if (error) { setFout(error.message); return }
    const nieuwe: BibliotheekRegel = {
      id: data as string,
      company_id: company.id,
      sjabloon_id: null,
      persoon_id: null,
      status: 'concept',
      gepland_op: null,
      uitgevoerd_op: null,
      aangemaakt_op: new Date().toISOString(),
      conclusie: null,
      sjabloon_naam_snap: 'Werkplekinspectie (norm)',
      controlesoort_snap: null,
      uitvoerder_naam: null,
      aantal_punten: normPunten,
      aantal_niet_in_orde: 0,
      aantal_acties: 0,
    }
    setRegels(prev => [nieuwe, ...prev])
    setOpen(nieuwe)
  }

  // --- Inspectie starten vanuit een eigen (vrij) sjabloon ---
  async function startInspectie(sjabloon: SjabloonMetPunten) {
    setFout(null)
    const { data, error } = await supabase.rpc('inspectie_start', { p_sjabloon_id: sjabloon.id })
    if (error) { setFout(error.message); return }
    const nieuwe: BibliotheekRegel = {
      id: data as string,
      company_id: company.id,
      sjabloon_id: sjabloon.id,
      persoon_id: null,
      status: 'concept',
      gepland_op: null,
      uitgevoerd_op: null,
      aangemaakt_op: new Date().toISOString(),
      conclusie: null,
      sjabloon_naam_snap: sjabloon.naam,
      controlesoort_snap: sjabloon.controlesoort,
      uitvoerder_naam: null,
      aantal_punten: sjabloon.punten.length,
      aantal_niet_in_orde: 0,
      aantal_acties: 0,
    }
    setRegels(prev => [nieuwe, ...prev])
    setOpen(nieuwe)
  }

  // Klik op een bibliotheekregel: afgehandelde inspecties openen als rapport,
  // lopende inspecties openen we inline om verder te gaan.
  function openRegel(regel: BibliotheekRegel) {
    if (isAfgehandeld(regel.status)) {
      router.push(`/${company.id}/inspecties/${regel.id}`)
    } else {
      setOpen(regel)
    }
  }

  function statusBijgewerkt(id: string, status: InspectieStatus) {
    setRegels(prev => prev.map(i => (i.id === id ? { ...i, status } : i)))
    setOpen(prev => (prev && prev.id === id ? { ...prev, status } : prev))
    // Afronden voert meteen door naar het rapport: dat ís de bevestiging.
    if (status === 'afgerond') {
      router.push(`/${company.id}/inspecties/${id}`)
    }
  }

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Werkplekinspectie</p>
        </div>

        {/* Navigatie naar de andere modules + interne tabs */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Link
            href={`/${company.id}/pva`}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
          >
            Plan van Aanpak
          </Link>
          <span className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white">
            Werkplekinspectie
          </span>
        </div>

        {open ? (
          <InspectieUitvoeren
            companyId={company.id}
            inspectie={open}
            onTerug={() => setOpen(null)}
            onStatus={status => statusBijgewerkt(open.id, status)}
          />
        ) : (
          <>
            {/* Interne tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setView('inspecties')}
                className={`text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors
                  ${view === 'inspecties' ? 'bg-accent text-white border-accent' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}
              >
                Inspecties
              </button>
              <button
                onClick={() => setView('norm')}
                className={`text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-full border transition-colors
                  ${view === 'norm' ? 'bg-accent text-white border-accent' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}
              >
                Norm
                {normSignalen > 0 && (
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${view === 'norm' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'}`}
                    title="Afwijkende punten waar de centrale norm is bijgewerkt"
                  >
                    {normSignalen}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView('sjablonen')}
                className={`text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors
                  ${view === 'sjablonen' ? 'bg-accent text-white border-accent' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}
              >
                Eigen sjablonen
              </button>
            </div>

            {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

            {view === 'inspecties' ? (
              <Bibliotheek
                sjablonen={sjablonen}
                regels={regels}
                normPunten={normPunten}
                onStartCentraal={startInspectieCentraal}
                onStart={startInspectie}
                onOpen={openRegel}
                onNaarSjablonen={() => setView('sjablonen')}
                onNaarNorm={() => setView('norm')}
              />
            ) : view === 'norm' ? (
              <NormBeheer companyId={company.id} initialNorm={initialNorm} />
            ) : (
              <SjabloonBeheer
                sjablonen={sjablonen}
                functiegroepen={functiegroepen}
                onNieuw={nieuwSjabloon}
                onArchiveer={archiveerSjabloon}
                onPatch={patchSjabloon}
                setFout={setFout}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ---- De rapporten-bibliotheek: nieuwe inspectie starten + doorzoekbaar archief ----

const ALLE = '__alle__'

function jaarVan(regel: BibliotheekRegel): string | null {
  const iso = regel.uitgevoerd_op ?? regel.aangemaakt_op
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : String(d.getFullYear())
}

function Bibliotheek({
  sjablonen,
  regels,
  normPunten,
  onStartCentraal,
  onStart,
  onOpen,
  onNaarSjablonen,
  onNaarNorm,
}: {
  sjablonen: SjabloonMetPunten[]
  regels: BibliotheekRegel[]
  normPunten: number
  onStartCentraal: () => void
  onStart: (s: SjabloonMetPunten) => void
  onOpen: (r: BibliotheekRegel) => void
  onNaarSjablonen: () => void
  onNaarNorm: () => void
}) {
  const [keuze, setKeuze] = useState('')
  const [fStatus, setFStatus] = useState(ALLE)
  const [fSjabloon, setFSjabloon] = useState(ALLE)
  const [fUitvoerder, setFUitvoerder] = useState(ALLE)
  const [fJaar, setFJaar] = useState(ALLE)

  const bruikbaar = sjablonen.filter(s => s.punten.length > 0)
  const gekozen = bruikbaar.find(s => s.id === keuze)

  // Distinct filterwaarden uit de aanwezige regels (geen vaste lijsten verzinnen).
  const statussen = useMemo(
    () => Array.from(new Set(regels.map(r => r.status))),
    [regels],
  )
  const sjabloonNamen = useMemo(
    () => Array.from(new Set(regels.map(r => r.sjabloon_naam_snap).filter((v): v is string => !!v))).sort(),
    [regels],
  )
  const uitvoerders = useMemo(
    () => Array.from(new Set(regels.map(r => r.uitvoerder_naam).filter((v): v is string => !!v))).sort(),
    [regels],
  )
  const jaren = useMemo(
    () => Array.from(new Set(regels.map(jaarVan).filter((v): v is string => !!v))).sort().reverse(),
    [regels],
  )

  const zichtbaar = useMemo(
    () => regels.filter(r =>
      (fStatus === ALLE || r.status === fStatus) &&
      (fSjabloon === ALLE || r.sjabloon_naam_snap === fSjabloon) &&
      (fUitvoerder === ALLE || r.uitvoerder_naam === fUitvoerder) &&
      (fJaar === ALLE || jaarVan(r) === fJaar)
    ),
    [regels, fStatus, fSjabloon, fUitvoerder, fJaar],
  )

  const heeftFilters = fStatus !== ALLE || fSjabloon !== ALLE || fUitvoerder !== ALLE || fJaar !== ALLE

  const filterSelect = 'text-sm border border-ink/20 rounded px-2 py-2 min-h-[44px] bg-white'

  return (
    <div className="space-y-4">
      {(() => {
        const heeftNorm = normPunten > 0
        const paden = (heeftNorm ? 1 : 0) + bruikbaar.length

        // Eén relevant pad → geen norm-vs-sjabloon-keuzescherm, gewoon één startknop.
        if (paden === 1) {
          const enkel = heeftNorm ? null : bruikbaar[0]
          const naam = enkel ? enkel.naam : 'Werkplekinspectie'
          const aantal = enkel ? enkel.punten.length : normPunten
          return (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm font-medium text-ink">{naam}</p>
              <p className="text-xs text-ink/50 mt-0.5">
                Start een nieuwe werkplekinspectie ({aantal} {aantal === 1 ? 'punt' : 'punten'}).
              </p>
              <button
                onClick={() => (enkel ? onStart(enkel) : onStartCentraal())}
                className="mt-2 text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity"
              >
                Inspectie starten
              </button>
            </div>
          )
        }

        // Geen enkel pad → korte helper i.p.v. een leeg keuzescherm.
        if (paden === 0) {
          return (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-sm text-ink/60">
                Nog geen inspectie mogelijk.{' '}
                <button onClick={onNaarSjablonen} className="text-accent hover:underline">Maak een sjabloon</button>
                {' '}of <button onClick={onNaarNorm} className="text-accent hover:underline">koppel de norm</button>.
              </p>
            </div>
          )
        }

        // Meerdere relevante paden → de expliciete keuze (norm én/of eigen sjablonen).
        return (
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
            {heeftNorm && (
              <div>
                <p className="text-sm font-medium text-ink">Werkplekinspectie volgens de norm</p>
                <p className="text-xs text-ink/50 mt-0.5">
                  Gebruikt je gekoppelde centrale rubrieken, inclusief je eigen lokale aanpassingen.
                </p>
                <button
                  onClick={onStartCentraal}
                  className="mt-2 text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity"
                >
                  Inspectie starten ({normPunten} {normPunten === 1 ? 'punt' : 'punten'})
                </button>
              </div>
            )}

            <div className={heeftNorm ? 'border-t border-surface pt-3' : ''}>
              <p className="text-sm font-medium text-ink">{heeftNorm ? 'Of: vanuit een eigen sjabloon' : 'Kies een sjabloon'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <select
                  value={keuze}
                  onChange={e => setKeuze(e.target.value)}
                  aria-label="Kies een eigen sjabloon"
                  className="text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white flex-1 min-w-[180px]"
                >
                  <option value="">Kies een sjabloon…</option>
                  {bruikbaar.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.naam}{s.controlesoort ? ` — ${s.controlesoort}` : ''} ({s.punten.length})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => gekozen && onStart(gekozen)}
                  disabled={!gekozen}
                  className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Starten
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {regels.length === 0 ? (
        <p className="text-center text-ink/40 py-10 text-sm">Nog geen inspecties uitgevoerd.</p>
      ) : (
        <>
          {/* Filters: alleen tonen wat zin heeft (één status/sjabloon/uitvoerder hoeft niet). */}
          <div className="flex flex-wrap gap-2">
            {statussen.length > 1 && (
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={filterSelect} aria-label="Filter op status">
                <option value={ALLE}>Alle statussen</option>
                {statussen.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
            )}
            {sjabloonNamen.length > 1 && (
              <select value={fSjabloon} onChange={e => setFSjabloon(e.target.value)} className={filterSelect} aria-label="Filter op sjabloon">
                <option value={ALLE}>Alle sjablonen</option>
                {sjabloonNamen.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {uitvoerders.length > 1 && (
              <select value={fUitvoerder} onChange={e => setFUitvoerder(e.target.value)} className={filterSelect} aria-label="Filter op uitvoerder">
                <option value={ALLE}>Alle uitvoerders</option>
                {uitvoerders.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            {jaren.length > 1 && (
              <select value={fJaar} onChange={e => setFJaar(e.target.value)} className={filterSelect} aria-label="Filter op jaar">
                <option value={ALLE}>Alle jaren</option>
                {jaren.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            )}
            {heeftFilters && (
              <button
                onClick={() => { setFStatus(ALLE); setFSjabloon(ALLE); setFUitvoerder(ALLE); setFJaar(ALLE) }}
                className="text-sm px-3 py-2 min-h-[44px] inline-flex items-center text-ink/50 hover:text-ink"
              >
                Filters wissen
              </button>
            )}
          </div>

          <div className="space-y-2">
            {zichtbaar.length === 0 ? (
              <p className="text-center text-ink/40 py-8 text-sm">Geen inspecties voor deze filters.</p>
            ) : (
              zichtbaar.map(r => <BibliotheekRij key={r.id} regel={r} onOpen={() => onOpen(r)} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BibliotheekRij({ regel, onOpen }: { regel: BibliotheekRegel; onOpen: () => void }) {
  const afgehandeld = isAfgehandeld(regel.status)
  const datum = regel.uitgevoerd_op
    ? `Uitgevoerd ${formatDatum(regel.uitgevoerd_op)}`
    : afgehandeld ? formatDatum(regel.aangemaakt_op) : 'Nog niet afgerond'

  return (
    <button
      onClick={onOpen}
      className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{regel.sjabloon_naam_snap ?? 'Inspectie'}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {regel.controlesoort_snap ? `${regel.controlesoort_snap} · ` : ''}
            {datum}
            {regel.uitvoerder_naam ? ` · ${regel.uitvoerder_naam}` : ''}
          </p>
        </div>
        <span className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${STATUS_STIJL[regel.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[regel.status] ?? regel.status}
        </span>
      </div>

      {/* Cijfers: aantal punten, niet in orde, eruit voortgekomen acties. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink/60">
        <span>{regel.aantal_punten} punt{regel.aantal_punten === 1 ? '' : 'en'}</span>
        <span className={regel.aantal_niet_in_orde > 0 ? 'text-red-600 font-medium' : ''}>
          {regel.aantal_niet_in_orde} niet in orde
        </span>
        <span>{regel.aantal_acties} acti{regel.aantal_acties === 1 ? 'e' : 'es'}</span>
        {!afgehandeld && <span className="text-accent">· verder gaan</span>}
      </div>
    </button>
  )
}

// ---- Sjabloonbeheer ----

function SjabloonBeheer({
  sjablonen,
  functiegroepen,
  onNieuw,
  onArchiveer,
  onPatch,
  setFout,
}: {
  sjablonen: SjabloonMetPunten[]
  functiegroepen: Functiegroep[]
  onNieuw: (naam: string, controlesoort: string) => void
  onArchiveer: (id: string) => void
  onPatch: (id: string, updates: Partial<SjabloonMetPunten>) => void
  setFout: (v: string | null) => void
}) {
  const [naam, setNaam] = useState('')
  const [soort, setSoort] = useState('')

  function bewaar() {
    if (!naam.trim()) return
    onNieuw(naam.trim(), soort.trim())
    setNaam('')
    setSoort('')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
        <p className="text-sm font-medium text-ink">Nieuw sjabloon</p>
        <input
          value={naam}
          onChange={e => setNaam(e.target.value)}
          placeholder="Naam (bv. Magazijn-rondgang)"
          className="w-full text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white"
        />
        <input
          value={soort}
          onChange={e => setSoort(e.target.value)}
          placeholder="Controlesoort (optioneel)"
          className="w-full text-sm border border-ink/20 rounded px-3 py-2.5 min-h-[44px] bg-white"
        />
        <button
          onClick={bewaar}
          disabled={!naam.trim()}
          className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Sjabloon aanmaken
        </button>
      </div>

      {sjablonen.length === 0 && (
        <p className="text-center text-ink/40 py-8 text-sm">Nog geen sjablonen.</p>
      )}

      {sjablonen.map(s => (
        <SjabloonKaart
          key={s.id}
          sjabloon={s}
          functiegroepen={functiegroepen}
          onArchiveer={() => onArchiveer(s.id)}
          onPatch={updates => onPatch(s.id, updates)}
          setFout={setFout}
        />
      ))}
    </div>
  )
}

function SjabloonKaart({
  sjabloon,
  functiegroepen,
  onArchiveer,
  onPatch,
  setFout,
}: {
  sjabloon: SjabloonMetPunten
  functiegroepen: Functiegroep[]
  onArchiveer: () => void
  onPatch: (updates: Partial<SjabloonMetPunten>) => void
  setFout: (v: string | null) => void
}) {
  const supabase = createClient()
  const [uit, setUit] = useState(false)
  const [nieuwTekst, setNieuwTekst] = useState('')
  const [nieuwVerplicht, setNieuwVerplicht] = useState(false)
  const [bezig, setBezig] = useState(false)

  const punten = sjabloon.punten
  const doelNaam = functiegroepen.find(g => g.id === sjabloon.doel_functiegroep_id)?.naam ?? null

  // Doel-functiegroep: voor welke rol is deze checklist bedoeld (leeg = iedereen).
  async function zetDoelgroep(functiegroepId: string | null) {
    setFout(null)
    const { error } = await supabase.rpc('sjabloon_doelgroep_zetten', {
      p_sjabloon_id: sjabloon.id,
      p_doel_functiegroep_id: functiegroepId,
    })
    if (error) { setFout(error.message); return }
    onPatch({ doel_functiegroep_id: functiegroepId })
  }

  async function voegPuntToe() {
    if (!nieuwTekst.trim()) return
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase.rpc('punt_opslaan', {
      p_punt_id: null,
      p_sjabloon_id: sjabloon.id,
      p_tekst: nieuwTekst.trim(),
      p_verplicht: nieuwVerplicht,
      p_volgorde: null,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    const nieuw: InspectieSjabloonPunt = {
      id: data as string,
      company_id: sjabloon.company_id,
      sjabloon_id: sjabloon.id,
      volgorde: (punten[punten.length - 1]?.volgorde ?? 0) + 1,
      tekst: nieuwTekst.trim(),
      verplicht: nieuwVerplicht,
    }
    onPatch({ punten: [...punten, nieuw] })
    setNieuwTekst('')
    setNieuwVerplicht(false)
  }

  async function wijzigPunt(punt: InspectieSjabloonPunt, updates: Partial<InspectieSjabloonPunt>) {
    setFout(null)
    const next = { ...punt, ...updates }
    const { error } = await supabase.rpc('punt_opslaan', {
      p_punt_id: punt.id,
      p_sjabloon_id: sjabloon.id,
      p_tekst: next.tekst,
      p_verplicht: next.verplicht,
      p_volgorde: next.volgorde,
    })
    if (error) { setFout(error.message); return }
    onPatch({ punten: punten.map(p => (p.id === punt.id ? next : p)) })
  }

  async function verwijderPunt(punt: InspectieSjabloonPunt) {
    setFout(null)
    const { error } = await supabase.rpc('punt_verwijderen', { p_punt_id: punt.id })
    if (error) { setFout(error.message); return }
    onPatch({ punten: punten.filter(p => p.id !== punt.id) })
  }

  // Wissel een punt met zijn buur en persisteer beide volgordes.
  async function verplaats(index: number, richting: -1 | 1) {
    const buurIndex = index + richting
    if (buurIndex < 0 || buurIndex >= punten.length) return
    const a = punten[index]
    const b = punten[buurIndex]
    setFout(null)
    setBezig(true)
    const r1 = await supabase.rpc('punt_opslaan', {
      p_punt_id: a.id, p_sjabloon_id: sjabloon.id, p_tekst: a.tekst, p_verplicht: a.verplicht, p_volgorde: b.volgorde,
    })
    const r2 = await supabase.rpc('punt_opslaan', {
      p_punt_id: b.id, p_sjabloon_id: sjabloon.id, p_tekst: b.tekst, p_verplicht: b.verplicht, p_volgorde: a.volgorde,
    })
    setBezig(false)
    if (r1.error || r2.error) { setFout((r1.error ?? r2.error)?.message ?? 'Verplaatsen mislukt'); return }
    const herordend = punten
      .map(p => p.id === a.id ? { ...a, volgorde: b.volgorde } : p.id === b.id ? { ...b, volgorde: a.volgorde } : p)
      .sort((x, y) => x.volgorde - y.volgorde)
    onPatch({ punten: herordend })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={() => setUit(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{sjabloon.naam}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {sjabloon.controlesoort ? `${sjabloon.controlesoort} · ` : ''}{punten.length} punt{punten.length === 1 ? '' : 'en'}
            {doelNaam ? ` · voor ${doelNaam}` : ''}
          </p>
        </div>
        <span className="text-ink/30 text-xs shrink-0">{uit ? '▲' : '▼'}</span>
      </button>

      {uit && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          {/* Doel-functiegroep: voor welke rol is deze checklist bedoeld */}
          {functiegroepen.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor={`doel-${sjabloon.id}`} className="text-xs text-ink/50">Doel-functiegroep</label>
              <select
                id={`doel-${sjabloon.id}`}
                value={sjabloon.doel_functiegroep_id ?? ''}
                onChange={e => zetDoelgroep(e.target.value || null)}
                className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white"
              >
                <option value="">Voor iedereen</option>
                {functiegroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
              </select>
            </div>
          )}

          {punten.length === 0 && <p className="text-xs text-ink/40">Nog geen punten.</p>}

          <ul className="space-y-2">
            {punten.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2">
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => verplaats(i, -1)}
                    disabled={i === 0 || bezig}
                    className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1"
                    aria-label="Omhoog"
                  >▲</button>
                  <button
                    onClick={() => verplaats(i, 1)}
                    disabled={i === punten.length - 1 || bezig}
                    className="text-ink/40 hover:text-ink disabled:opacity-25 text-xs leading-none px-1"
                    aria-label="Omlaag"
                  >▼</button>
                </div>
                <input
                  defaultValue={p.tekst}
                  onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== p.tekst) wijzigPunt(p, { tekst: e.target.value.trim() }) }}
                  className="flex-1 text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                />
                <label className="flex items-center gap-1 text-xs text-ink/60 shrink-0 px-1 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={p.verplicht}
                    onChange={e => wijzigPunt(p, { verplicht: e.target.checked })}
                    className="accent-[color:var(--color-accent)]"
                  />
                  Verplicht
                </label>
                <button
                  onClick={() => verwijderPunt(p)}
                  className="text-red-500 hover:text-red-700 text-sm shrink-0 px-2 min-h-[44px]"
                  aria-label="Verwijderen"
                >✕</button>
              </li>
            ))}
          </ul>

          {/* Nieuw punt */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface">
            <input
              value={nieuwTekst}
              onChange={e => setNieuwTekst(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') voegPuntToe() }}
              placeholder="Nieuw controlepunt…"
              className="flex-1 min-w-[160px] text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
            />
            <label className="flex items-center gap-1 text-xs text-ink/60">
              <input
                type="checkbox"
                checked={nieuwVerplicht}
                onChange={e => setNieuwVerplicht(e.target.checked)}
                className="accent-[color:var(--color-accent)]"
              />
              Verplicht
            </label>
            <button
              onClick={voegPuntToe}
              disabled={!nieuwTekst.trim() || bezig}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Toevoegen
            </button>
          </div>

          <div className="pt-2">
            <button
              onClick={onArchiveer}
              className="text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors"
            >
              Sjabloon archiveren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
