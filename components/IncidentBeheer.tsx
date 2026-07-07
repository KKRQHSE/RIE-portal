'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import {
  STATUS_LABEL,
  type Incident,
  type OorzaakOptie,
  type GevolgOptie,
  type IncidentFotoItem,
} from '@/lib/incident'
import HuisstijlLogo from './HuisstijlLogo'

type Meldlink = { token: string; ingetrokken: boolean }

const STATUS_STIJL: Record<Incident['status'], string> = {
  open: 'bg-amber-100 text-amber-800',
  in_onderzoek: 'bg-blue-100 text-blue-800',
  afgehandeld: 'bg-green-100 text-green-800',
}

function datumNL(d: string | null): string {
  if (!d) return '—'
  const [y, m, dag] = d.slice(0, 10).split('-')
  return dag && m && y ? `${dag}-${m}-${y}` : d
}

export default function IncidentBeheer({
  company, huisstijl = VEILIGE_HUISSTIJL, initialIncidenten, initialMeldlink,
  directeOorzaken, basisOorzaken, gevolgOpties,
}: {
  company: { id: string; name: string }
  huisstijl?: HuisstijlView
  initialIncidenten: Incident[]
  initialMeldlink: Meldlink | null
  directeOorzaken: OorzaakOptie[]
  basisOorzaken: OorzaakOptie[]
  gevolgOpties: GevolgOptie[]
}) {
  const [supabase] = useState(() => createClient())
  const [incidenten, setIncidenten] = useState<Incident[]>(initialIncidenten)
  const [meldlink, setMeldlink] = useState<Meldlink | null>(initialMeldlink)
  const [openId, setOpenId] = useState<string | null>(null)
  const [periode, setPeriode] = useState<'jaar' | '12m' | 'alles'>('jaar')
  const [filter, setFilter] = useState<{ soort: 'status' | 'gevolg'; waarde: string } | null>(null)

  const gevolgLabel = (code: string) => gevolgOpties.find(g => g.code === code)?.omschrijving ?? code
  const open = incidenten.find(i => i.id === openId) ?? null

  // Periode-ondergrens (client-side; de lijst is al RLS-scoped op het eigen bedrijf).
  const periodeVanaf = (() => {
    if (periode === 'alles') return null
    const d = new Date()
    if (periode === 'jaar') return `${d.getFullYear()}-01-01`
    d.setMonth(d.getMonth() - 12)
    return d.toISOString().slice(0, 10)
  })()
  const inPeriode = (i: Incident) => !periodeVanaf || i.datum >= periodeVanaf
  const periodeIncidenten = incidenten.filter(inPeriode)
  const zichtbaar = periodeIncidenten.filter(i =>
    !filter
      ? true
      : filter.soort === 'status'
        ? i.status === filter.waarde
        : i.gevolgen.includes(filter.waarde),
  )

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Incidenten &amp; ongevallen</p>
        </div>

        {open ? (
          <IncidentDetail
            supabase={supabase}
            companyId={company.id}
            incident={open}
            directeOorzaken={directeOorzaken}
            basisOorzaken={basisOorzaken}
            gevolgLabel={gevolgLabel}
            onTerug={() => setOpenId(null)}
            onOpgeslagen={updated => {
              setIncidenten(prev => prev.map(i => (i.id === updated.id ? updated : i)))
            }}
          />
        ) : (
          <>
            <MeldlinkPaneel
              supabase={supabase}
              companyId={company.id}
              meldlink={meldlink}
              onWijzig={setMeldlink}
            />

            {/* Periodekeuze */}
            <div className="flex items-center gap-2 mt-8 mb-3">
              <span className="text-sm font-semibold text-ink/70">Overzicht</span>
              <div className="ml-auto flex gap-1">
                {([['jaar', 'Dit jaar'], ['12m', 'Laatste 12 mnd'], ['alles', 'Alles']] as const).map(([w, lbl]) => (
                  <button key={w} onClick={() => { setPeriode(w); setFilter(null) }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${periode === w ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <IncidentDashboard
              incidenten={periodeIncidenten}
              gevolgOpties={gevolgOpties}
              directeOorzaken={directeOorzaken}
              basisOorzaken={basisOorzaken}
              filter={filter}
              onFilter={setFilter}
            />

            <div className="flex items-center gap-2 mt-8 mb-2">
              <h2 className="text-sm font-semibold text-ink/70">
                {filter
                  ? `Meldingen — ${filter.soort === 'status' ? STATUS_LABEL[filter.waarde as Incident['status']] : gevolgLabel(filter.waarde)}`
                  : 'Alle meldingen'}
                <span className="text-ink/40 font-normal"> ({zichtbaar.length})</span>
              </h2>
              {filter && (
                <button onClick={() => setFilter(null)} className="text-xs text-accent hover:underline" style={{ color: 'var(--color-accent)' }}>
                  toon alle
                </button>
              )}
            </div>

            {zichtbaar.length === 0 ? (
              <p className="text-center text-ink/40 py-10 text-sm">
                {periodeIncidenten.length === 0 ? 'Er zijn nog geen meldingen in deze periode.' : 'Geen meldingen in deze selectie.'}
              </p>
            ) : (
              <div className="space-y-2">
                {zichtbaar.map(i => (
                  <button key={i.id} onClick={() => setOpenId(i.id)}
                    className="w-full text-left glass-tile glass-tile-hover rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{i.omschrijving}</p>
                        <p className="text-xs text-ink/50 mt-0.5">
                          {datumNL(i.datum)}{i.tijd ? ` ${i.tijd.slice(0, 5)}` : ''} · {i.locatie}
                        </p>
                        {i.gevolgen.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {i.gevolgen.map(g => (
                              <span key={g} className="text-[11px] px-1.5 py-0.5 rounded bg-ink/5 text-ink/60">{gevolgLabel(g)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full font-medium ${STATUS_STIJL[i.status]}`}>
                        {STATUS_LABEL[i.status]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ============================================================
// Dashboard (niveau 1): aantallen per status/gevolg + meest voorkomende oorzaken.
// Klik op een status- of gevolg-tegel filtert de lijst eronder (niveau 2).
// ============================================================
function IncidentDashboard({
  incidenten, gevolgOpties, directeOorzaken, basisOorzaken, filter, onFilter,
}: {
  incidenten: Incident[]
  gevolgOpties: GevolgOptie[]
  directeOorzaken: OorzaakOptie[]
  basisOorzaken: OorzaakOptie[]
  filter: { soort: 'status' | 'gevolg'; waarde: string } | null
  onFilter: (f: { soort: 'status' | 'gevolg'; waarde: string } | null) => void
}) {
  const totaal = incidenten.length
  const statusTelling = (s: Incident['status']) => incidenten.filter(i => i.status === s).length
  const gevolgTelling = (code: string) => incidenten.filter(i => i.gevolgen.includes(code)).length

  const telOorzaken = (kies: (i: Incident) => number[], opties: OorzaakOptie[]) => {
    const telling = new Map<number, number>()
    for (const i of incidenten) for (const c of kies(i)) telling.set(c, (telling.get(c) ?? 0) + 1)
    return [...telling.entries()]
      .map(([code, aantal]) => ({ code, aantal, label: opties.find(o => o.code === code)?.omschrijving ?? String(code) }))
      .sort((a, b) => b.aantal - a.aantal)
      .slice(0, 5)
  }
  const topDirecte = telOorzaken(i => i.directe_oorzaken, directeOorzaken)
  const topBasis = telOorzaken(i => i.basis_oorzaken, basisOorzaken)

  const actief = (soort: 'status' | 'gevolg', waarde: string) => filter?.soort === soort && filter.waarde === waarde
  const klik = (soort: 'status' | 'gevolg', waarde: string) => onFilter(actief(soort, waarde) ? null : { soort, waarde })

  const statusKleur: Record<Incident['status'], string> = {
    open: 'text-amber-700', in_onderzoek: 'text-blue-700', afgehandeld: 'text-green-700',
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="glass-tile rounded-2xl p-3">
          <div className="text-2xl font-semibold text-ink">{totaal}</div>
          <div className="text-xs text-ink/50 mt-0.5">Meldingen totaal</div>
        </div>
        {(['open', 'in_onderzoek', 'afgehandeld'] as const).map(s => (
          <button key={s} onClick={() => klik('status', s)}
            className={`text-left bg-white rounded-lg shadow-sm p-3 border-2 transition-colors ${actief('status', s) ? 'border-accent' : 'border-transparent hover:border-ink/10'}`}
            style={actief('status', s) ? { borderColor: 'var(--color-accent)' } : undefined}>
            <div className={`text-2xl font-semibold ${statusKleur[s]}`}>{statusTelling(s)}</div>
            <div className="text-xs text-ink/50 mt-0.5">{STATUS_LABEL[s]}</div>
          </button>
        ))}
      </div>

      <div className="glass-tile rounded-2xl p-3">
        <div className="text-xs font-medium text-ink/60 mb-2">Naar gevolg</div>
        <div className="flex flex-wrap gap-1.5">
          {gevolgOpties.map(g => {
            const n = gevolgTelling(g.code)
            return (
              <button key={g.code} onClick={() => klik('gevolg', g.code)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${actief('gevolg', g.code) ? 'bg-accent text-white border-accent' : 'bg-white text-ink/70 border-ink/15 hover:border-ink/40'}`}
                style={actief('gevolg', g.code) ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : undefined}>
                {g.omschrijving} <span className="font-semibold">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <OorzaakTop titel="Meest voorkomende directe oorzaken" rijen={topDirecte} />
        <OorzaakTop titel="Meest voorkomende basisoorzaken" rijen={topBasis} />
      </div>
    </div>
  )
}

function OorzaakTop({ titel, rijen }: { titel: string; rijen: Array<{ code: number; aantal: number; label: string }> }) {
  const max = Math.max(1, ...rijen.map(r => r.aantal))
  return (
    <div className="glass-tile rounded-2xl p-3">
      <div className="text-xs font-medium text-ink/60 mb-2">{titel}</div>
      {rijen.length === 0 ? (
        <p className="text-xs text-ink/40">Nog niet ingevuld.</p>
      ) : (
        <ul className="space-y-1.5">
          {rijen.map(r => (
            <li key={r.code} className="text-xs">
              <div className="flex justify-between gap-2 text-ink/70">
                <span className="truncate">{String(r.code).padStart(2, '0')} {r.label}</span>
                <span className="font-semibold shrink-0">{r.aantal}</span>
              </div>
              <div className="h-1 rounded bg-ink/5 mt-0.5 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${(r.aantal / max) * 100}%`, backgroundColor: 'var(--color-accent)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================
// Meldlink-paneel: URL delen, roteren, in-/uitschakelen.
// ============================================================
function MeldlinkPaneel({
  supabase, companyId, meldlink, onWijzig,
}: {
  supabase: ReturnType<typeof createClient>
  companyId: string
  meldlink: Meldlink | null
  onWijzig: (m: Meldlink) => void
}) {
  const [bezig, setBezig] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)
  const [bevestigRoteren, setBevestigRoteren] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const meldUrl = meldlink ? `${origin}/melden/${meldlink.token}` : ''

  async function roep(fn: string, params: Record<string, unknown>) {
    setBezig(true); setFout(null)
    const { data, error } = await supabase.rpc(fn, params)
    setBezig(false)
    if (error) { setFout('Actie mislukt.'); return null }
    return (typeof data === 'string' ? JSON.parse(data) : data) as Meldlink
  }

  async function genereer() {
    const m = await roep('incident_meldlink_zorg', { p_company_id: companyId })
    if (m) onWijzig(m)
  }
  async function roteer() {
    setBevestigRoteren(false)
    const m = await roep('incident_meldlink_roteren', { p_company_id: companyId })
    if (m) onWijzig(m)
  }
  async function zetIngetrokken(ingetrokken: boolean) {
    const m = await roep('incident_meldlink_intrekken', { p_company_id: companyId, p_ingetrokken: ingetrokken })
    if (m) onWijzig(m)
  }
  async function kopieer() {
    try {
      await navigator.clipboard.writeText(meldUrl)
      setGekopieerd(true)
      setTimeout(() => setGekopieerd(false), 2000)
    } catch { /* clipboard geweigerd */ }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h2 className="text-sm font-semibold text-ink mb-1">Meldlink &amp; QR</h2>
      <p className="text-xs text-ink/50 mb-3">
        De vaste link waarmee iedereen op de werkvloer — zonder in te loggen — een melding maakt. Hang hem op of deel de QR.
      </p>

      {!meldlink ? (
        <button type="button" onClick={genereer} disabled={bezig}
          className="min-h-[44px] px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-accent)' }}>
          {bezig ? 'Bezig…' : 'Meldlink aanmaken'}
        </button>
      ) : (
        <>
          {meldlink.ingetrokken && (
            <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800">
              Deze meldlink is ingetrokken — meldingen via deze link worden geweigerd.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <QrCode url={meldUrl} />
            <div className="flex-1 min-w-0 w-full">
              <label className="block text-xs font-medium text-ink/60 mb-1">Meldlink</label>
              <div className="flex gap-2">
                <input readOnly value={meldUrl}
                  className="flex-1 min-w-0 px-3 py-2 min-h-[44px] rounded-lg border border-ink/15 bg-gray-50 text-sm text-ink/70" />
                <button type="button" onClick={kopieer}
                  className="shrink-0 min-h-[44px] px-3 rounded-lg border border-ink/20 text-sm text-ink/70 hover:border-ink/40">
                  {gekopieerd ? 'Gekopieerd' : 'Kopieer'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {bevestigRoteren ? (
                  <span className="inline-flex items-center gap-2 text-xs text-ink/60">
                    Nieuwe link maken? De oude QR werkt dan niet meer.
                    <button type="button" onClick={roteer} disabled={bezig}
                      className="min-h-[36px] px-3 rounded-lg bg-ink text-white">Ja, vervang</button>
                    <button type="button" onClick={() => setBevestigRoteren(false)}
                      className="min-h-[36px] px-3 rounded-lg border border-ink/20">Annuleer</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setBevestigRoteren(true)} disabled={bezig}
                    className="min-h-[36px] px-3 rounded-lg border border-ink/20 text-xs text-ink/70 hover:border-ink/40">
                    Vervang link (roteer)
                  </button>
                )}
                {meldlink.ingetrokken ? (
                  <button type="button" onClick={() => zetIngetrokken(false)} disabled={bezig}
                    className="min-h-[36px] px-3 rounded-lg border border-ink/20 text-xs text-ink/70 hover:border-ink/40">
                    Weer inschakelen
                  </button>
                ) : (
                  <button type="button" onClick={() => zetIngetrokken(true)} disabled={bezig}
                    className="min-h-[36px] px-3 rounded-lg border border-ink/20 text-xs text-red-600 hover:border-red-300">
                    Intrekken
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {fout && <p className="text-xs text-red-600 mt-2">{fout}</p>}
    </div>
  )
}

// ============================================================
// QR-code — zelfstandige, dependency-vrije encoder → inline SVG.
// ============================================================
function QrCode({ url }: { url: string }) {
  const [matrix, setMatrix] = useState<boolean[][] | null>(null)
  useEffect(() => {
    let levend = true
    import('@/lib/qr').then(({ maakQrMatrix }) => {
      if (levend) { try { setMatrix(maakQrMatrix(url)) } catch { setMatrix(null) } }
    })
    return () => { levend = false }
  }, [url])

  if (!matrix) return <div className="w-[132px] h-[132px] rounded-lg bg-gray-50 shrink-0" aria-hidden />
  const n = matrix.length
  const q = 4 // stille rand
  const size = n + q * 2
  return (
    <svg width={132} height={132} viewBox={`0 0 ${size} ${size}`} className="shrink-0 rounded-lg border border-ink/10 bg-white"
      role="img" aria-label="QR-code naar de meldlink">
      <rect width={size} height={size} fill="#fff" />
      {matrix.flatMap((rij, y) =>
        rij.map((aan, x) => (aan
          ? <rect key={`${x}-${y}`} x={x + q} y={y + q} width={1} height={1} fill="#000" />
          : null)),
      )}
    </svg>
  )
}

// ============================================================
// Incident-detail: Deel 1 (lezen) + foto's + Deel 2 (bewerken).
// ============================================================
function IncidentDetail({
  supabase, companyId, incident, directeOorzaken, basisOorzaken, gevolgLabel, onTerug, onOpgeslagen,
}: {
  supabase: ReturnType<typeof createClient>
  companyId: string
  incident: Incident
  directeOorzaken: OorzaakOptie[]
  basisOorzaken: OorzaakOptie[]
  gevolgLabel: (code: string) => string
  onTerug: () => void
  onOpgeslagen: (i: Incident) => void
}) {
  const [status, setStatus] = useState<Incident['status']>(incident.status)
  const [directe, setDirecte] = useState<number[]>(incident.directe_oorzaken)
  const [basis, setBasis] = useState<number[]>(incident.basis_oorzaken)
  const [toelichting, setToelichting] = useState(incident.oorzaak_toelichting ?? '')
  const [rapportage, setRapportage] = useState(incident.onderzoeksrapportage_bijgevoegd)
  const [telDirectie, setTelDirectie] = useState(incident.telefonische_melding_directie)
  const [telAan, setTelAan] = useState(incident.telefonische_melding_aan ?? '')
  const [inActielijst, setInActielijst] = useState(incident.maatregelen_in_actielijst)
  const [tra, setTra] = useState(incident.tra_aanpassen)
  const [andere, setAndere] = useState(incident.andere_maatregelen ?? '')
  const [toolboxDatum, setToolboxDatum] = useState(incident.besproken_in_toolbox_datum ?? '')
  const [functie, setFunctie] = useState(incident.functie_slachtoffer ?? '')
  const [medisch, setMedisch] = useState<string>(incident.medische_dienst_bezocht ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [opgeslagen, setOpgeslagen] = useState(false)

  const [fotos, setFotos] = useState<IncidentFotoItem[] | null>(null)
  const laadFotos = useCallback(async () => {
    try {
      const res = await fetch('/api/incident/foto-download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId: incident.id }),
      })
      if (!res.ok) { setFotos([]); return }
      const { fotos } = (await res.json()) as { fotos: IncidentFotoItem[] }
      setFotos(fotos)
    } catch { setFotos([]) }
  }, [incident.id])
  useEffect(() => { laadFotos() }, [laadFotos])

  function toggle(arr: number[], set: (v: number[]) => void, code: number) {
    set(arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code])
  }

  async function opslaan() {
    setBezig(true); setFout(null); setOpgeslagen(false)
    const { error } = await supabase.rpc('incident_deel2_opslaan', {
      p_company_id: companyId,
      p_incident_id: incident.id,
      p_status: status,
      p_directe_oorzaken: directe,
      p_basis_oorzaken: basis,
      p_oorzaak_toelichting: toelichting,
      p_onderzoeksrapportage_bijgevoegd: rapportage,
      p_telefonische_melding_directie: telDirectie,
      p_telefonische_melding_aan: telAan,
      p_maatregelen_in_actielijst: inActielijst,
      p_tra_aanpassen: tra,
      p_andere_maatregelen: andere,
      p_besproken_in_toolbox_datum: toolboxDatum || null,
      p_functie_slachtoffer: functie,
      p_medische_dienst_bezocht: medisch || null,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setOpgeslagen(true)
    onOpgeslagen({
      ...incident,
      status,
      directe_oorzaken: directe, basis_oorzaken: basis,
      oorzaak_toelichting: toelichting || null,
      onderzoeksrapportage_bijgevoegd: rapportage,
      telefonische_melding_directie: telDirectie,
      telefonische_melding_aan: telAan || null,
      maatregelen_in_actielijst: inActielijst,
      tra_aanpassen: tra, andere_maatregelen: andere || null,
      besproken_in_toolbox_datum: toolboxDatum || null,
      functie_slachtoffer: functie || null,
      medische_dienst_bezocht: (medisch || null) as Incident['medische_dienst_bezocht'],
    })
  }

  const kaart = 'bg-white rounded-lg shadow-sm p-4'
  const label = 'block text-sm font-medium text-ink mb-1'
  const veld = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-ink/15 bg-white text-ink text-base focus:outline-none focus:border-accent'
  const vink = 'flex items-center gap-2.5 min-h-[40px] cursor-pointer text-sm text-ink'

  return (
    <div className="space-y-4">
      <button type="button" onClick={onTerug} className="text-sm text-ink/60 hover:text-ink">← Terug naar meldingen</button>

      {/* DEEL 1 — melding (lezen) */}
      <div className={kaart}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-ink">De melding</h2>
          <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${STATUS_STIJL[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-ink/40 text-xs">Datum &amp; tijd</dt><dd className="text-ink">{datumNL(incident.datum)}{incident.tijd ? ` ${incident.tijd.slice(0, 5)}` : ''}</dd></div>
          <div><dt className="text-ink/40 text-xs">Locatie</dt><dd className="text-ink">{incident.locatie}</dd></div>
          <div><dt className="text-ink/40 text-xs">Project</dt><dd className="text-ink">{incident.project ?? '—'}</dd></div>
          <div><dt className="text-ink/40 text-xs">Melder</dt><dd className="text-ink">{incident.naam_melder ?? 'Anoniem'}</dd></div>
        </dl>
        <div className="mt-3">
          <dt className="text-ink/40 text-xs">Wat is er gebeurd?</dt>
          <dd className="text-sm text-ink whitespace-pre-wrap mt-0.5">{incident.omschrijving}</dd>
        </div>
        {incident.gevolgen.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {incident.gevolgen.map(g => (
              <span key={g} className="text-[11px] px-1.5 py-0.5 rounded bg-ink/5 text-ink/60">{gevolgLabel(g)}</span>
            ))}
          </div>
        )}

        {/* Foto's */}
        <div className="mt-4">
          <dt className="text-ink/40 text-xs mb-1.5">Foto’s</dt>
          {fotos === null ? (
            <p className="text-xs text-ink/40">Laden…</p>
          ) : fotos.length === 0 ? (
            <p className="text-xs text-ink/40">Geen foto’s.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fotos.map(f => (
                <a key={f.id} href={f.downloadUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="block w-20 h-20 rounded-lg overflow-hidden border border-ink/10 bg-gray-50">
                  {f.downloadUrl && f.type?.startsWith('image/')
                    ? <img src={f.downloadUrl} alt={f.bestandsnaam ?? 'foto'} className="w-full h-full object-cover" />
                    : <span className="flex items-center justify-center w-full h-full text-xs text-ink/40">bestand</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DEEL 2 — KAM-afhandeling (bewerken) */}
      <div className={kaart}>
        <h2 className="text-sm font-semibold text-ink mb-3">Afhandeling (VGM-coördinator)</h2>

        <div className="mb-4">
          <label className={label} htmlFor="status">Status</label>
          <select id="status" className={veld} value={status} onChange={e => setStatus(e.target.value as Incident['status'])}>
            <option value="open">Open</option>
            <option value="in_onderzoek">In onderzoek</option>
            <option value="afgehandeld">Afgehandeld</option>
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <span className={label}>Directe oorzaken</span>
            <div className="max-h-56 overflow-y-auto pr-1 rounded-lg border border-ink/10 p-2 space-y-0.5">
              {directeOorzaken.map(o => (
                <label key={o.code} className={vink}>
                  <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]"
                    checked={directe.includes(o.code)} onChange={() => toggle(directe, setDirecte, o.code)} />
                  <span className="text-xs">{String(o.code).padStart(2, '0')} {o.omschrijving}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Basisoorzaken</span>
            <div className="max-h-56 overflow-y-auto pr-1 rounded-lg border border-ink/10 p-2 space-y-0.5">
              {basisOorzaken.map(o => (
                <label key={o.code} className={vink}>
                  <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]"
                    checked={basis.includes(o.code)} onChange={() => toggle(basis, setBasis, o.code)} />
                  <span className="text-xs">{String(o.code).padStart(2, '0')} {o.omschrijving}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className={label} htmlFor="toelichting">Toelichting op de oorzaken</label>
          <textarea id="toelichting" rows={3} className={`${veld} resize-y`} value={toelichting} onChange={e => setToelichting(e.target.value)} />
        </div>

        <div className="space-y-2 mb-4">
          <label className={vink}><input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]" checked={rapportage} onChange={e => setRapportage(e.target.checked)} /> Onderzoeksrapportage bijgevoegd</label>
          <label className={vink}><input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]" checked={telDirectie} onChange={e => setTelDirectie(e.target.checked)} /> Telefonische melding aan directie</label>
          {telDirectie && (
            <input type="text" className={veld} placeholder="Aan wie?" value={telAan} onChange={e => setTelAan(e.target.value)} />
          )}
          <label className={vink}><input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]" checked={inActielijst} onChange={e => setInActielijst(e.target.checked)} /> Maatregelen in de actielijst gezet</label>
          <label className={vink}><input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]" checked={tra} onChange={e => setTra(e.target.checked)} /> TRA aanpassen</label>
        </div>

        <div className="mb-4">
          <label className={label} htmlFor="andere">Andere maatregelen</label>
          <textarea id="andere" rows={2} className={`${veld} resize-y`} value={andere} onChange={e => setAndere(e.target.value)} />
        </div>

        <div className="mb-4">
          <label className={label} htmlFor="tbdatum">Besproken in toolbox op <span className="text-ink/40 font-normal">(optioneel)</span></label>
          <input id="tbdatum" type="date" className={veld} value={toolboxDatum} onChange={e => setToolboxDatum(e.target.value)} />
        </div>

        {/* Gevoelige velden — gezondheidsgegevens */}
        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3 mb-4">
          <p className="text-xs font-medium text-red-700/80 mb-2">Gevoelig — gezondheidsgegevens (alleen zichtbaar voor jou)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="functie">Functie slachtoffer</label>
              <input id="functie" type="text" className={veld} value={functie} onChange={e => setFunctie(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="medisch">Medische dienst bezocht?</label>
              <select id="medisch" className={veld} value={medisch} onChange={e => setMedisch(e.target.value)}>
                <option value="">—</option>
                <option value="ja">Ja</option>
                <option value="nee">Nee</option>
                <option value="onbekend">Onbekend</option>
              </select>
            </div>
          </div>
        </div>

        {fout && <p className="text-sm text-red-600 mb-2">{fout}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={opslaan} disabled={bezig}
            className="min-h-[48px] px-6 rounded-lg bg-accent text-white font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-accent)' }}>
            {bezig ? 'Opslaan…' : 'Afhandeling opslaan'}
          </button>
          {opgeslagen && <span className="text-sm text-green-700">Opgeslagen ✓</span>}
        </div>
      </div>
    </div>
  )
}
