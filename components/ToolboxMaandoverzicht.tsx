'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Gauge from './Gauge'
import type { ToolboxSessiesOverzicht, ToolboxSessieRegel, ToolboxSessiePersoon, ToolboxOverzichtItem, ToolboxBron } from '@/lib/types'

type Supa = ReturnType<typeof createClient>

const MAANDEN = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]

function datumNL(iso: string) {
  const [j, m, d] = iso.split('-')
  return d && m && j ? `${d}-${m}-${j}` : iso
}
function jaarVan(iso: string) { return parseInt(iso.slice(0, 4), 10) }
function maandVan(iso: string) { return parseInt(iso.slice(5, 7), 10) - 1 }

// Antwoord op de hoofdvraag: wat is er per maand gehouden en zitten we op target?
export default function ToolboxMaandoverzicht({
  companyId, initial, gekoppeldeToolboxen, bronnen = [],
}: {
  companyId: string
  initial: ToolboxSessiesOverzicht | null
  gekoppeldeToolboxen: ToolboxOverzichtItem[]
  // Onderwerpenbibliotheek (0043): alleen-lezen inspiratie bij het aanmaken.
  bronnen?: ToolboxBron[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [data, setData] = useState<ToolboxSessiesOverzicht | null>(initial)
  const [fout, setFout] = useState<string | null>(null)
  const [jaar, setJaar] = useState<number>(() => new Date().getFullYear())
  const [openSessie, setOpenSessie] = useState<string | null>(null)
  const [nieuwVoor, setNieuwVoor] = useState<string | null>(null) // maandsleutel of 'los'

  async function herlaad() {
    const { data: d, error } = await supabase.rpc('toolbox_sessies_overzicht', { p_company_id: companyId })
    if (error) { setFout(error.message); return }
    setData(d as ToolboxSessiesOverzicht)
  }
  useEffect(() => { herlaad() /* verse stand bij openen */ }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const personen = data?.personen ?? []
  const target = data?.sessie_doel_per_jaar ?? 12

  // Sessies van het gekozen jaar, gegroepeerd per maand.
  const perMaand = useMemo(() => {
    const groepen: ToolboxSessieRegel[][] = Array.from({ length: 12 }, () => [])
    for (const s of data?.sessies ?? []) {
      if (jaarVan(s.datum) === jaar) groepen[maandVan(s.datum)].push(s)
    }
    return groepen
  }, [data, jaar])

  const sessiesDitJaar = perMaand.reduce((n, g) => n + g.length, 0)
  const maandenGedekt = perMaand.filter(g => g.length > 0).length

  if (!data) return <p className="text-sm text-ink/50">Het overzicht kon niet worden geladen.</p>

  return (
    <div className="space-y-4">
      {fout && <p className="text-sm text-red-600">{fout}</p>}

      {/* Target-kop */}
      <TargetKop
        companyId={companyId} supabase={supabase}
        target={target} sessiesDitJaar={sessiesDitJaar} maandenGedekt={maandenGedekt}
        jaar={jaar} onJaar={setJaar} onOpgeslagen={herlaad} setFout={setFout}
      />

      {/* Nieuwe losse sessie */}
      {nieuwVoor === 'los' ? (
        <NieuweSessie
          companyId={companyId} supabase={supabase} gekoppeldeToolboxen={gekoppeldeToolboxen}
          bronnen={bronnen} setFout={setFout}
          onKlaar={async (id) => { setNieuwVoor(null); await herlaad(); if (id) setOpenSessie(id) }}
          onAnnuleer={() => setNieuwVoor(null)}
        />
      ) : (
        <button type="button" onClick={() => { setFout(null); setNieuwVoor('los') }}
          className="text-sm px-4 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90">
          + Nieuwe sessie
        </button>
      )}

      {/* Per maand */}
      <div className="space-y-2">
        {MAANDEN.map((naam, i) => {
          const sessies = perMaand[i]
          const maandKey = `${jaar}-${String(i + 1).padStart(2, '0')}`
          return (
            <div key={naam} className="glass-tile rounded-2xl">
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{naam}</p>
                  <p className="text-xs text-ink/40">
                    {sessies.length === 0
                      ? 'nog geen toolbox'
                      : `${sessies.length} ${sessies.length === 1 ? 'sessie' : 'sessies'}`}
                  </p>
                </div>
                {sessies.length === 0 && (
                  <button type="button"
                    onClick={() => { setFout(null); setNieuwVoor(maandKey) }}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-accent hover:text-accent">
                    + sessie
                  </button>
                )}
              </div>

              {/* Nieuwe sessie voorgevuld op deze maand (dag 1) */}
              {nieuwVoor === maandKey && (
                <div className="px-5 pb-4">
                  <NieuweSessie
                    companyId={companyId} supabase={supabase} gekoppeldeToolboxen={gekoppeldeToolboxen}
                    bronnen={bronnen} setFout={setFout} startDatum={`${maandKey}-01`}
                    onKlaar={async (id) => { setNieuwVoor(null); await herlaad(); if (id) setOpenSessie(id) }}
                    onAnnuleer={() => setNieuwVoor(null)}
                  />
                </div>
              )}

              {sessies.length > 0 && (
                <ul className="border-t border-surface divide-y divide-surface">
                  {sessies.map(s => (
                    <SessieRij
                      key={s.sessie_id} sessie={s} companyId={companyId} supabase={supabase}
                      personen={personen} open={openSessie === s.sessie_id}
                      onToggle={() => setOpenSessie(openSessie === s.sessie_id ? null : s.sessie_id)}
                      gekoppeldeToolboxen={gekoppeldeToolboxen} setFout={setFout} onGewijzigd={herlaad}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TargetKop({
  companyId, supabase, target, sessiesDitJaar, maandenGedekt, jaar, onJaar, onOpgeslagen, setFout,
}: {
  companyId: string; supabase: Supa; target: number
  sessiesDitJaar: number; maandenGedekt: number; jaar: number
  onJaar: (j: number) => void; onOpgeslagen: () => Promise<void>; setFout: (v: string | null) => void
}) {
  const [bewerk, setBewerk] = useState(false)
  const [waarde, setWaarde] = useState(String(target))
  const [bezig, setBezig] = useState(false)
  useEffect(() => { setWaarde(String(target)) }, [target])

  async function opslaan() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_sessie_doel_zetten', {
      p_company_id: companyId, p_doel: Math.max(0, parseInt(waarde, 10) || 0),
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setBewerk(false)
    await onOpgeslagen()
  }

  const opTarget = sessiesDitJaar >= target && target > 0

  return (
    <div className="glass-tile rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Toolboxsessies · {jaar}</p>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" onClick={() => onJaar(jaar - 1)} aria-label="Vorig jaar"
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-ink/5 text-ink/60">◀</button>
          <span className="tabular-nums text-ink/70 w-12 text-center">{jaar}</span>
          <button type="button" onClick={() => onJaar(jaar + 1)} aria-label="Volgend jaar"
            className="min-h-[36px] min-w-[36px] rounded-full hover:bg-ink/5 text-ink/60">▶</button>
        </div>
      </div>

      {/* Kernboodschap: X van [target] gehouden dit jaar, met gauge */}
      <div className="flex items-center gap-4">
        <Gauge value={sessiesDitJaar} total={target} size={72} />
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-semibold text-ink tabular-nums">{sessiesDitJaar}</span>
          <span className="text-xl text-ink/30 tabular-nums">van {target}</span>
          <span className="text-sm text-ink/60 ml-1">gehouden dit jaar</span>
        </div>
      </div>

      {/* Maanddekking */}
      <div className="flex items-center gap-1 mt-4 mb-2" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < maandenGedekt ? 'bg-accent' : 'bg-ink/10'}`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${opTarget ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
          {maandenGedekt} van 12 maanden gedekt
        </span>
        {bewerk ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs text-ink/50">doel/jaar</span>
            <input type="number" min={0} value={waarde} onChange={e => setWaarde(e.target.value)}
              aria-label="Jaartarget" className="w-16 text-sm border border-ink/20 rounded px-2 py-1 bg-white" />
            <button type="button" onClick={opslaan} disabled={bezig}
              className="text-xs px-2 py-1 rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40">OK</button>
            <button type="button" onClick={() => { setBewerk(false); setWaarde(String(target)) }}
              className="text-xs px-2 py-1 rounded-full border border-ink/20 text-ink/60">×</button>
          </span>
        ) : (
          <button type="button" onClick={() => setBewerk(true)}
            className="text-xs text-ink/50 underline decoration-dotted underline-offset-2 hover:text-accent">
            doel aanpassen
          </button>
        )}
      </div>
    </div>
  )
}

function SessieRij({
  sessie, supabase, companyId, personen, open, onToggle, gekoppeldeToolboxen, setFout, onGewijzigd,
}: {
  sessie: ToolboxSessieRegel; supabase: Supa; companyId: string
  personen: ToolboxSessiePersoon[]; open: boolean; onToggle: () => void
  gekoppeldeToolboxen: ToolboxOverzichtItem[]; setFout: (v: string | null) => void; onGewijzigd: () => Promise<void>
}) {
  const [bewerk, setBewerk] = useState(false)
  const [bevestigVerwijder, setBevestigVerwijder] = useState(false)
  const [bezig, setBezig] = useState(false)
  const aanwezigSet = new Set(sessie.aanwezigen)
  const aanwezigen = personen.filter(p => aanwezigSet.has(p.persoon_id))
  const afwezigen = personen.filter(p => !aanwezigSet.has(p.persoon_id))

  async function zetAanwezig(persoonId: string, aanwezig: boolean) {
    setFout(null)
    const { error } = await supabase.rpc('toolbox_sessie_aanwezigheid_zetten', {
      p_sessie_id: sessie.sessie_id, p_persoon_id: persoonId, p_aanwezig: aanwezig,
    })
    if (error) { setFout(error.message); return }
    await onGewijzigd()
  }
  async function verwijder() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessie.sessie_id })
    setBezig(false)
    if (error) { setFout(error.message); return }
    await onGewijzigd()
  }

  // Bericht voor de afwezigen — de KAM kiest zelf de ontvanger(s) in mail/WhatsApp.
  const namen = afwezigen.map(p => p.naam).join(', ')
  const bericht =
    `Beste collega,\n\nJe stond genoteerd als afwezig bij de toolbox "${sessie.onderwerp}" van ${datumNL(sessie.datum)}. ` +
    `Wil je deze alsnog inhalen bij de KAM? Alvast bedankt.` +
    (namen ? `\n\nBetreft: ${namen}` : '')
  const mailto = `mailto:?subject=${encodeURIComponent('Gemiste toolbox: ' + sessie.onderwerp)}&body=${encodeURIComponent(bericht)}`
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(bericht)}`

  return (
    <li className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="min-w-0 text-left flex-1">
          <p className="text-sm text-ink truncate">{sessie.onderwerp}</p>
          <p className="text-xs text-ink/40">
            {datumNL(sessie.datum)} · <span className="tabular-nums">{sessie.opkomst}</span> van {personen.length} aanwezig
            {sessie.notitie ? ` · ${sessie.notitie}` : ''}
          </p>
        </button>
        <button type="button" onClick={onToggle}
          className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">
          {open ? 'Sluiten' : 'Aanwezigheid'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {bewerk ? (
            <NieuweSessie
              companyId={companyId} supabase={supabase} gekoppeldeToolboxen={gekoppeldeToolboxen}
              setFout={setFout} bestaand={sessie}
              onKlaar={async () => { setBewerk(false); await onGewijzigd() }}
              onAnnuleer={() => setBewerk(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {afwezigen.length > 0 && (
                <>
                  <a href={mailto}
                    className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">
                    ✉ Mail afwezigen ({afwezigen.length})
                  </a>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">
                    WhatsApp afwezigen
                  </a>
                </>
              )}
              <button type="button" onClick={() => setBewerk(true)}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Bewerken</button>
              {bevestigVerwijder ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-ink/60">Sessie én aanwezigheid verwijderen?</span>
                  <button type="button" onClick={() => { setBevestigVerwijder(false); verwijder() }} disabled={bezig}
                    className="text-xs px-3 py-1.5 rounded-full bg-red-600 text-white hover:opacity-90 disabled:opacity-40">Ja, verwijderen</button>
                  <button type="button" onClick={() => setBevestigVerwijder(false)}
                    className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Annuleer</button>
                </span>
              ) : (
                <button type="button" onClick={() => setBevestigVerwijder(true)}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-200 bg-white text-red-600 hover:border-red-400">Verwijderen</button>
              )}
            </div>
          )}

          {/* Aanwezig / afwezig overzicht + corrigeren (namen only, geen bewijs-per-persoon) */}
          <div className="rounded-lg bg-surface/50 p-3">
            <p className="text-xs text-ink/50 mb-1">
              <span className="text-green-700 font-medium">Aanwezig ({aanwezigen.length})</span>
              {afwezigen.length > 0 && <> · <span className="text-amber-700 font-medium">Afwezig ({afwezigen.length})</span></>}
            </p>
            {personen.length === 0 ? (
              <p className="text-xs text-ink/40">Nog geen personen. Voeg ze eerst toe bij Personen.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-1">
                {personen.map(p => {
                  const isAan = aanwezigSet.has(p.persoon_id)
                  return (
                    <li key={p.persoon_id}>
                      <label className="flex items-center gap-2 py-1.5 px-1 rounded cursor-pointer hover:bg-white">
                        <input type="checkbox" checked={isAan}
                          onChange={e => zetAanwezig(p.persoon_id, e.target.checked)}
                          className="h-4 w-4 accent-[color:var(--color-accent)]" />
                        <span className={`text-sm truncate ${isAan ? 'text-ink' : 'text-ink/50'}`}>{p.naam}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function NieuweSessie({
  companyId, supabase, gekoppeldeToolboxen, bronnen = [], setFout, onKlaar, onAnnuleer, bestaand, startDatum,
}: {
  companyId: string; supabase: Supa; gekoppeldeToolboxen: ToolboxOverzichtItem[]
  bronnen?: ToolboxBron[]
  setFout: (v: string | null) => void
  onKlaar: (nieuwId?: string) => void | Promise<void>; onAnnuleer: () => void
  bestaand?: ToolboxSessieRegel; startDatum?: string
}) {
  const [datum, setDatum] = useState(bestaand?.datum ?? startDatum ?? '')
  const [onderwerp, setOnderwerp] = useState(bestaand?.onderwerp ?? '')
  const [notitie, setNotitie] = useState(bestaand?.notitie ?? '')
  const [toolboxId, setToolboxId] = useState<string>(bestaand?.toolbox_id ?? '')
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    if (!datum || !onderwerp.trim()) return
    setBezig(true); setFout(null)
    const { data, error } = await supabase.rpc('toolbox_sessie_opslaan', {
      p_company_id: companyId, p_sessie_id: bestaand?.sessie_id ?? null,
      p_datum: datum, p_onderwerp: onderwerp.trim(),
      p_notitie: notitie.trim() || null, p_toolbox_id: toolboxId || null,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    await onKlaar(typeof data === 'string' ? data : undefined)
  }

  // Een toolbox kiezen vult het onderwerp alleen als het nog leeg is — een zelf
  // getypt onderwerp wordt nooit overschreven.
  function kiesToolbox(id: string) {
    setToolboxId(id)
    if (!onderwerp.trim() && id) {
      const t = gekoppeldeToolboxen.find(x => x.toolbox_id === id)
      if (t) setOnderwerp(t.geldende_titel)
    }
  }

  return (
    <div className="rounded-lg bg-white shadow-sm border border-accent/30 p-4 space-y-2">
      <p className="text-sm font-medium text-ink">{bestaand ? 'Sessie bewerken' : 'Nieuwe sessie'}</p>

      {/* Het onderwerp is leidend: je mag vrij typen. De toolbox-koppeling eronder
          is optioneel en vult het onderwerp hooguit voor als het nog leeg is. */}
      <label className="text-xs text-ink/50 flex flex-col gap-1">
        Onderwerp
        <input value={onderwerp} onChange={e => setOnderwerp(e.target.value)}
          placeholder="Waar ging de toolbox over?" aria-label="Onderwerp"
          className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white" />
      </label>

      <BronnenHint bronnen={bronnen} />

      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink/50 flex flex-col gap-1">
          Datum
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
            className="text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white" />
        </label>
        {gekoppeldeToolboxen.length > 0 && (
          <label className="text-xs text-ink/50 flex flex-col gap-1 flex-1 min-w-[12rem]">
            Koppel aan een toolbox (optioneel)
            <select value={toolboxId} onChange={e => kiesToolbox(e.target.value)}
              className="text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white">
              <option value="">— geen —</option>
              {gekoppeldeToolboxen.map(t => (
                <option key={t.toolbox_id} value={t.toolbox_id}>{t.geldende_titel}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <textarea value={notitie} onChange={e => setNotitie(e.target.value)} rows={2}
        placeholder="Notitie (optioneel)" aria-label="Notitie"
        className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white resize-y" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={opslaan} disabled={!datum || !onderwerp.trim() || bezig}
          className="text-xs px-3 py-1.5 rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40">
          {bestaand ? 'Opslaan' : 'Sessie aanmaken'}
        </button>
        <button type="button" onClick={onAnnuleer}
          className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Annuleer</button>
      </div>
    </div>
  )
}

// Onderwerpenbibliotheek (0043): inklapbare inspiratielijst bij het aanmaken van
// een sessie. Puur lezen — de uitvoerder typt zijn onderwerp zelf. Links openen
// in een nieuw tabblad; rel=noopener voorkomt dat de bron aan window.opener komt.
function BronnenHint({ bronnen }: { bronnen: ToolboxBron[] }) {
  const zichtbaar = bronnen.filter(b => !b.gearchiveerd_op)
  if (zichtbaar.length === 0) return null

  return (
    <details className="rounded-lg border border-ink/10 bg-surface/40 px-3 py-2">
      <summary className="text-xs text-ink/60 cursor-pointer hover:text-accent">
        Inspiratie nodig? Bekijk de onderwerpenbibliotheek ({zichtbaar.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {zichtbaar.map(b => (
          <li key={b.id} className="text-xs">
            <a href={b.url} target="_blank" rel="noopener noreferrer"
              className="font-medium text-accent hover:underline">
              {b.naam} ↗
            </a>
            {b.omschrijving && <p className="text-ink/50 mt-0.5">{b.omschrijving}</p>}
          </li>
        ))}
      </ul>
    </details>
  )
}
