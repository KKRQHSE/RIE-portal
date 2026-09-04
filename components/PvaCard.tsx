'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PvaItem, Persoon, HistorieRegel } from '@/lib/types'
import BewijsBlok from './BewijsBlok'
import Doorgeven from './Doorgeven'

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

// Zelfde statusset als de (voormalige) echte status-dropdown.
const STATUS_OPTS = ['Open', 'In behandeling', 'Afgerond']

// Leesbare labels voor gelogde gebeurtenissen (gelijk aan de gast-kant).
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

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  companyId: string
  item: PvaItem
  onUpdate: (id: string, updates: Partial<PvaItem>) => void
  personen?: Persoon[]
  magBeheren?: boolean
  // Teamleider: status + opmerking zetten via de smalle RPC, geschiedenis
  // inzien — geen concept-workflow, geen verantwoordelijke wijzigen, geen
  // doorgeven. Los van magBeheren, dat de volledige beheer-workflow opent.
  magStatus?: boolean
}

type Paneel = null | 'vrijgeven' | 'terugsturen'

export default function PvaCard({
  companyId,
  item,
  onUpdate,
  personen = [],
  magBeheren = false,
  magStatus = false,
}: Props) {
  const [open, setOpen] = useState(false)
  // Is deze kaart ooit opengeklapt geweest? Zo ja, dan blijft de onderkant
  // gemonteerd en verbergen we hem alleen met CSS bij dichtklappen.
  //
  // Waarom: BewijsBlok haalt zijn bewijsstukken op bij mount. Werd de onderkant
  // bij dichtklappen uit de DOM gehaald, dan was elke keer opendoen een nieuw
  // rondje naar /api/bewijs/beheerder-download — en dat rondje maakt aan de
  // serverkant ook nog eens een verse signed URL per bestand. Vijf keer
  // dicht-en-open kostte zo vijf extra rondjes.
  //
  // Alleen 'open' als voorwaarde nemen kan niet: dan zou élke kaart op de pagina
  // zijn bewijs ophalen bij het laden, ook de kaarten die niemand openklapt.
  // Vandaar deze tweede vlag: niets renderen tot de eerste keer opendoen,
  // daarna gemonteerd laten.
  const [ooitGeopend, setOoitGeopend] = useState(false)
  const router = useRouter()

  // ref bevat vraagnummers gescheiden door "/", bv "F1-1 / F1-2".
  const refNums = (item.ref ?? '').split('/').map(s => s.trim()).filter(Boolean)

  // persoon_id en opm zijn geen status/concept en mogen nog direct opgeslagen worden.
  const [persoonId, setPersoonId] = useState<string | null>(item.persoon_id)
  const [opm, setOpm] = useState(item.opm ?? '')
  const [saved, setSaved] = useState(false)

  // Vrijgeven/terugsturen/direct + geschiedenis (alles via loggende RPC's).
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [paneel, setPaneel] = useState<Paneel>(null)
  const [vOpm, setVOpm] = useState('')
  const [vBewijs, setVBewijs] = useState('')

  const [histOpen, setHistOpen] = useState(false)
  const [historie, setHistorie] = useState<HistorieRegel[] | null>(null)
  const [histBezig, setHistBezig] = useState(false)

  const houderNaam = personen.find(p => p.id === persoonId)?.naam ?? null

  async function save(updates: Partial<PvaItem>) {
    const supabase = createClient()
    await supabase
      .from('pva_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function changePersoon(val: string) {
    const id = val === '' ? null : val
    setPersoonId(id)
    onUpdate(item.id, { persoon_id: id })
    save({ persoon_id: id })
  }

  function blurOpm() {
    onUpdate(item.id, { opm })
    // Teamleider heeft geen rechtstreekse UPDATE-toegang tot pva_items (alleen
    // via de smalle status-RPC) — dus loopt de opmerking ook via die RPC, met
    // de huidige status ongewijzigd mee.
    if (magStatus && !magBeheren) {
      callJson('actie_status_zetten', { p_actie_id: item.id, p_status: item.status, p_opm: opm })
    } else {
      save({ opm })
    }
  }

  async function zetStatus(val: string) {
    if (!val || val === item.status) return
    await callJson('actie_status_zetten', { p_actie_id: item.id, p_status: val, p_opm: opm || null })
  }

  // Loggende RPC: geeft het volledige bijgewerkte item terug (jsonb of al geparsed).
  async function callJson(fn: string, args: Record<string, unknown>): Promise<boolean> {
    setBezig(true)
    setFout(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc(fn, args)
    setBezig(false)
    if (error) {
      setFout('Actie mislukt. Probeer het opnieuw.')
      setTimeout(() => setFout(null), 3000)
      return false
    }
    const obj = typeof data === 'string' ? JSON.parse(data) : data
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      onUpdate(item.id, obj as Partial<PvaItem>)
    }
    setHistorie(null) // geschiedenis kan gewijzigd zijn → opnieuw ophalen bij openen
    return true
  }

  function openPaneel(p: Exclude<Paneel, null>) {
    setPaneel(prev => (prev === p ? null : p))
    setVOpm('')
    setVBewijs('')
  }

  async function voorstelConcept(val: string) {
    if (!val) return
    await callJson('zet_concept_beheerder', { p_actie_id: item.id, p_status: val, p_opm: null })
  }

  async function doeVrijgeven() {
    const ok = await callJson('geef_actie_vrij', {
      p_actie_id: item.id,
      p_opmerking: vOpm.trim() || null,
      p_bewijs: vBewijs.trim() || null,
    })
    if (ok) setPaneel(null)
  }

  async function doeTerugsturen() {
    const ok = await callJson('stuur_concept_terug', {
      p_actie_id: item.id,
      p_opmerking: vOpm.trim() || null,
    })
    if (ok) setPaneel(null)
  }

  async function toggleHistorie() {
    if (histOpen) {
      setHistOpen(false)
      return
    }
    setHistOpen(true)
    if (historie === null) {
      setHistBezig(true)
      const supabase = createClient()
      const { data, error } = await supabase.rpc('actie_historie_ophalen', { p_actie_id: item.id })
      setHistBezig(false)
      if (error) return
      const arr = typeof data === 'string' ? JSON.parse(data) : data
      setHistorie(Array.isArray(arr) ? (arr as HistorieRegel[]) : [])
    }
  }

  const heeftConcept = !!item.concept_status
  const prioBadge = `inline-block text-xs font-medium px-2 py-0.5 rounded ${PRIO_STYLE[item.prio] ?? 'bg-gray-100 text-gray-700'}`
  const statusBadge = `inline-block text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-700'}`
  const veldLabel = 'text-[11px] font-medium text-ink/40 uppercase tracking-wider mb-1'

  return (
    <div id={`actie-${item.nr}`} className="glass-tile rounded-2xl overflow-hidden scroll-mt-20">

      {/* Rustige, scanbare kopregel: onderwerp + de kernfeiten */}
      <button
        className="btn w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => { setOpen(o => !o); setOoitGeopend(true) }}
        aria-expanded={open}
      >
        <span className={`shrink-0 mt-0.5 ${prioBadge}`}>{item.prio}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink/40">{item.nr}</span>
            <span className="font-medium text-ink">{item.onderwerp}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-ink/50">
            <span className={statusBadge}>{item.status}</span>
            <span className="truncate">{houderNaam ? `👤 ${houderNaam}` : 'Niet toegewezen'}</span>
            {item.termijn && <span className="truncate">🗓 {item.termijn}</span>}
            {heeftConcept && <span className="text-accent font-medium">Voorstel: {item.concept_status}</span>}
          </div>
        </div>
        <span className="text-ink/30 text-xs mt-1 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Alles onder de vouw: rustig detail + beheer (geen permanente tabelbrij).
          Blijft na de eerste keer opendoen gemonteerd; dichtklappen verbergt hem
          alleen, zodat BewijsBlok niet telkens opnieuw gaat ophalen. */}
      {ooitGeopend && (
        <div
          hidden={!open}
          className={`border-t border-surface px-4 pb-4 pt-3 space-y-4 ${open ? '' : 'hidden'}`}
        >

          {/* RI&E-verwijzingen */}
          {refNums.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-ink/40">RI&amp;E:</span>
              {refNums.map(nr => (
                <Link
                  key={nr}
                  href={`/${companyId}/rie#vraag-${nr}`}
                  className="inline-flex items-center px-2 py-1 text-xs font-mono text-accent hover:underline"
                >
                  {nr}
                </Link>
              ))}
            </div>
          )}

          {/* Maatregel + aanpak (inhoud 1-op-1 uit de RI&E) */}
          {item.maatregel && (
            <div>
              <p className={veldLabel}>Maatregel</p>
              <p className="text-sm text-ink leading-relaxed">{item.maatregel}</p>
            </div>
          )}
          {item.tree && (
            <div>
              <p className={veldLabel}>Aanpak</p>
              <p className="text-sm text-ink/70 leading-relaxed">{item.tree}</p>
            </div>
          )}

          {/* Kernfeiten in een rustig raster i.p.v. een dichte regel */}
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className={veldLabel}>Status</p>
              {magStatus && !magBeheren ? (
                <select
                  value={item.status}
                  onChange={e => zetStatus(e.target.value)}
                  disabled={bezig}
                  className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white"
                >
                  {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <span className={statusBadge}>{item.status}</span>
              )}
            </div>
            <div>
              <p className={veldLabel}>Prioriteit</p>
              <span className={prioBadge}>{item.prio}</span>
            </div>
            <div>
              <p className={veldLabel}>Verantwoordelijke</p>
              {magBeheren ? (
                <select
                  value={persoonId ?? ''}
                  onChange={e => changePersoon(e.target.value)}
                  className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white"
                >
                  <option value="">Niemand</option>
                  {personen.map(p => (
                    <option key={p.id} value={p.id}>{p.naam}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-ink/70">{houderNaam ?? '—'}</p>
              )}
            </div>
            <div>
              <p className={veldLabel}>Termijn</p>
              <p className="text-sm text-ink/70">
                {item.termijn || (item.termijn_datum ? formatDatum(item.termijn_datum) : '—')}
              </p>
            </div>
          </div>
          {saved && <p className="text-xs text-green-600 font-medium">✓ Opgeslagen</p>}

          {/* Vrijgave-vastlegging */}
          {item.vrijgegeven_op && (
            <p className="text-xs text-ink/50">
              Vrijgegeven door {item.vrijgegeven_door ?? '—'} op {formatDatum(item.vrijgegeven_op)}
              {item.vrijgave_opmerking ? ` — ${item.vrijgave_opmerking}` : ''}
            </p>
          )}

          {/* Opmerking */}
          <div>
            <p className={veldLabel}>Opmerking</p>
            <textarea
              value={opm}
              onChange={e => setOpm(e.target.value)}
              onBlur={blurOpm}
              placeholder="Voeg een opmerking toe…"
              rows={2}
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 resize-none bg-white"
            />
          </div>

          {/* Bewijs */}
          <div>
            <p className={veldLabel}>Bewijs</p>
            <BewijsBlok modus="beheerder" actieId={item.id} magBewijsBeheren={magBeheren} />
          </div>

          {/* Teamleider: alleen geschiedenis inzien, geen concept-workflow/doorgeven. */}
          {!magBeheren && magStatus && (
            <div className="border-t border-surface pt-3 space-y-2">
              <button
                onClick={toggleHistorie}
                className="btn text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/50 hover:border-ink/40 transition-colors"
              >
                Geschiedenis {histOpen ? '▲' : '▼'}
              </button>
              {fout && <p className="text-xs text-red-600">{fout}</p>}
              {histOpen && (
                <div className="rounded border border-surface bg-surface/40 p-3">
                  {histBezig && <p className="text-xs text-ink/40">Laden…</p>}
                  {!histBezig && historie && historie.length === 0 && (
                    <p className="text-xs text-ink/40">Nog geen geschiedenis.</p>
                  )}
                  {!histBezig && historie && historie.length > 0 && (
                    <ul className="space-y-2">
                      {historie.map((h, i) => (
                        <li key={i} className="text-xs text-ink/60 border-l-2 border-ink/10 pl-2">
                          <span className="font-medium text-ink/80">{h.actor_naam ?? 'Onbekend'}</span>
                          {h.actor_type ? <span className="text-ink/40"> ({h.actor_type})</span> : null}
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
          )}

          {/* Beheer-workflow (concept voorstellen / vrijgeven / terugsturen / geschiedenis / doorgeven) */}
          {magBeheren && (
            <div className="border-t border-surface pt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink/40 shrink-0">Concept voorstellen</span>
                <select
                  value={item.concept_status ?? ''}
                  onChange={e => voorstelConcept(e.target.value)}
                  disabled={bezig}
                  className="text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white"
                >
                  <option value="">—</option>
                  {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {heeftConcept && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-accent/50 bg-accent/5 px-3 py-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent/10 text-accent">
                    Concept: {item.concept_status}
                  </span>
                  {item.concept_opm && <span className="text-xs text-ink/60">{item.concept_opm}</span>}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {heeftConcept && (
                  <>
                    <button
                      onClick={() => openPaneel('vrijgeven')}
                      disabled={bezig}
                      className="btn btn-accent text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40"
                    >
                      Vrijgeven
                    </button>
                    <button
                      onClick={() => openPaneel('terugsturen')}
                      disabled={bezig}
                      className="btn text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      Terugsturen
                    </button>
                  </>
                )}
                <button
                  onClick={toggleHistorie}
                  className="btn text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/50 hover:border-ink/40 transition-colors"
                >
                  Geschiedenis {histOpen ? '▲' : '▼'}
                </button>
              </div>

              {paneel === 'vrijgeven' && (
                <div className="rounded border border-surface bg-surface/40 p-3 space-y-2">
                  <p className="text-xs text-ink/50">Concept “{item.concept_status}” wordt de echte status.</p>
                  <input
                    value={vOpm}
                    onChange={e => setVOpm(e.target.value)}
                    placeholder="Opmerking (optioneel)"
                    className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                  />
                  <input
                    value={vBewijs}
                    onChange={e => setVBewijs(e.target.value)}
                    placeholder="bv. https://... of 'foto in dossier map X'"
                    className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                  />
                  <p className="text-[11px] text-ink/40 -mt-1">Bewijs (link of korte verwijzing)</p>
                  <button
                    onClick={doeVrijgeven}
                    disabled={bezig}
                    className="btn btn-accent text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40"
                  >
                    {bezig ? 'Bezig…' : 'Vrijgeven'}
                  </button>
                </div>
              )}

              {paneel === 'terugsturen' && (
                <div className="rounded border border-surface bg-surface/40 p-3 space-y-2">
                  <p className="text-xs text-ink/50">Het concept wordt verworpen; de echte status blijft.</p>
                  <input
                    value={vOpm}
                    onChange={e => setVOpm(e.target.value)}
                    placeholder="Reden (optioneel)"
                    className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
                  />
                  <button
                    onClick={doeTerugsturen}
                    disabled={bezig}
                    className="btn text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-red-200 bg-white text-red-600 font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {bezig ? 'Bezig…' : 'Terugsturen'}
                  </button>
                </div>
              )}

              {fout && <p className="text-xs text-red-600">{fout}</p>}

              {histOpen && (
                <div className="rounded border border-surface bg-surface/40 p-3">
                  {histBezig && <p className="text-xs text-ink/40">Laden…</p>}
                  {!histBezig && historie && historie.length === 0 && (
                    <p className="text-xs text-ink/40">Nog geen geschiedenis.</p>
                  )}
                  {!histBezig && historie && historie.length > 0 && (
                    <ul className="space-y-2">
                      {historie.map((h, i) => (
                        <li key={i} className="text-xs text-ink/60 border-l-2 border-ink/10 pl-2">
                          <span className="font-medium text-ink/80">{h.actor_naam ?? 'Onbekend'}</span>
                          {h.actor_type ? <span className="text-ink/40"> ({h.actor_type})</span> : null}
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

              <div className="pt-1">
                <p className={veldLabel}>Doorgeven</p>
                {/* Na doorgeven verandert de houder; server-data herladen. */}
                <Doorgeven modus="beheerder" actieId={item.id} onDoorgegeven={() => router.refresh()} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
