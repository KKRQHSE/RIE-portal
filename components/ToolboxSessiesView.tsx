'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ToolboxSessiesOverzicht, ToolboxSessieRegel, ToolboxOverzichtItem } from '@/lib/types'

type Supa = ReturnType<typeof createClient>

function datumNL(iso: string) {
  const [j, m, d] = iso.split('-')
  return d && m && j ? `${d}-${m}-${j}` : iso
}

export default function ToolboxSessiesView({
  companyId, initial, gekoppeldeToolboxen,
}: {
  companyId: string
  initial: ToolboxSessiesOverzicht | null
  gekoppeldeToolboxen: ToolboxOverzichtItem[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [data, setData] = useState<ToolboxSessiesOverzicht | null>(initial)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [openSessie, setOpenSessie] = useState<string | null>(null)

  async function herlaad() {
    const { data: d, error } = await supabase.rpc('toolbox_sessies_overzicht', { p_company_id: companyId })
    if (error) { setFout(error.message); return }
    setData(d as ToolboxSessiesOverzicht)
  }

  // Bij het openen van de tab (mount) verse stand ophalen: de tab-wissel un/remount
  // deze view, die anders uit de mogelijk verouderde server-`initial`-prop opnieuw
  // initialiseert. Zo klopt de weergave zonder harde refresh.
  useEffect(() => {
    let actief = true
    ;(async () => {
      const { data: d, error } = await supabase.rpc('toolbox_sessies_overzicht', { p_company_id: companyId })
      if (!actief) return
      if (error) { setFout(error.message); return }
      setData(d as ToolboxSessiesOverzicht)
    })()
    return () => { actief = false }
  }, [supabase, companyId])

  if (!data) {
    return <p className="text-sm text-ink/50">Het sessie-overzicht kon niet worden geladen.</p>
  }

  const personen = data.personen
  const aantalPersonen = personen.length

  async function verwijderSessie(sessieId: string) {
    // Bevestiging gebeurt in-app in SessieRij (geen native confirm()).
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_sessie_verwijderen', { p_sessie_id: sessieId })
    setBezig(false)
    if (error) { setFout(error.message); return }
    if (openSessie === sessieId) setOpenSessie(null)
    await herlaad()
  }

  async function zetAanwezig(sessieId: string, persoonId: string, aanwezig: boolean) {
    setFout(null)
    const { error } = await supabase.rpc('toolbox_sessie_aanwezigheid_zetten', {
      p_sessie_id: sessieId, p_persoon_id: persoonId, p_aanwezig: aanwezig,
    })
    if (error) { setFout(error.message); return }
    await herlaad()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-4">
        <p className="text-sm text-ink/60">
          Registreer gehouden toolbox-<span className="font-medium">sessies</span> en wie erbij was.
          Aanwezigheid is een aparte, groepsgewijze telling naast het digitale doel per persoon —
          <span className="font-medium"> wie er niet was, loopt hierdoor niet achter</span>.
        </p>
      </div>

      {fout && <p className="text-sm text-red-600">{fout}</p>}

      {/* Nieuwe sessie */}
      {nieuwOpen ? (
        <NieuweSessie
          companyId={companyId} supabase={supabase} gekoppeldeToolboxen={gekoppeldeToolboxen}
          setFout={setFout}
          onKlaar={async (nieuwId) => { setNieuwOpen(false); await herlaad(); if (nieuwId) setOpenSessie(nieuwId) }}
          onAnnuleer={() => setNieuwOpen(false)}
        />
      ) : (
        <button type="button" onClick={() => { setFout(null); setNieuwOpen(true) }}
          className="text-sm px-4 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90">
          + Nieuwe sessie
        </button>
      )}

      {/* Sessies */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-3">
          Sessies {data.totaal_sessies > 0 && <span className="text-ink/30">· {data.totaal_sessies}</span>}
        </p>
        {data.sessies.length === 0 ? (
          <p className="text-sm text-ink/40">Nog geen sessies geregistreerd.</p>
        ) : (
          <ul className="divide-y divide-surface">
            {data.sessies.map(s => (
              <SessieRij
                key={s.sessie_id} sessie={s} companyId={companyId} supabase={supabase}
                personen={personen} aantalPersonen={aantalPersonen}
                open={openSessie === s.sessie_id}
                onToggle={() => setOpenSessie(openSessie === s.sessie_id ? null : s.sessie_id)}
                onAanwezig={zetAanwezig} onVerwijder={() => verwijderSessie(s.sessie_id)}
                gekoppeldeToolboxen={gekoppeldeToolboxen} setFout={setFout} onGewijzigd={herlaad}
                bezig={bezig}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Aanwezigheid per persoon — neutraal, geen doel/achterstand */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-1">Aanwezigheid per persoon</p>
        <p className="text-xs text-ink/40 mb-3">Aantal bijgewoonde sessies. Puur informatief — geen doel, geen achterstand.</p>
        {personen.length === 0 ? (
          <p className="text-sm text-ink/40">Nog geen personen.</p>
        ) : (
          <ul className="divide-y divide-surface">
            {personen.map(p => (
              <li key={p.persoon_id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{p.naam}</p>
                  <p className="text-xs text-ink/40">{p.functiegroep_naam ?? 'geen functiegroep'}</p>
                </div>
                <span className="text-sm tabular-nums text-ink/70 shrink-0">
                  {p.bijgewoond} {p.bijgewoond === 1 ? 'sessie' : 'sessies'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SessieRij({
  sessie, supabase, companyId, personen, aantalPersonen, open, onToggle, onAanwezig, onVerwijder,
  gekoppeldeToolboxen, setFout, onGewijzigd, bezig,
}: {
  sessie: ToolboxSessieRegel
  supabase: Supa
  companyId: string
  personen: ToolboxSessiesOverzicht['personen']
  aantalPersonen: number
  open: boolean
  onToggle: () => void
  onAanwezig: (sessieId: string, persoonId: string, aanwezig: boolean) => void
  onVerwijder: () => void
  gekoppeldeToolboxen: ToolboxOverzichtItem[]
  setFout: (v: string | null) => void
  onGewijzigd: () => Promise<void>
  bezig: boolean
}) {
  const [bewerk, setBewerk] = useState(false)
  const [bevestigVerwijder, setBevestigVerwijder] = useState(false)
  const aanwezig = new Set(sessie.aanwezigen)

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="min-w-0 text-left flex-1">
          <p className="text-sm text-ink truncate">{sessie.onderwerp}</p>
          <p className="text-xs text-ink/40">
            {datumNL(sessie.datum)} · <span className="tabular-nums">{sessie.opkomst}</span> van {aantalPersonen} aanwezig
            {sessie.notitie ? ` · ${sessie.notitie}` : ''}
          </p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onToggle}
            className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">
            {open ? 'Sluiten' : 'Aanwezigheid'}
          </button>
        </div>
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
              <button type="button" onClick={() => setBewerk(true)}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Bewerken</button>
              {bevestigVerwijder ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-ink/60">Sessie én aanwezigheid verwijderen?</span>
                  <button type="button" onClick={() => { setBevestigVerwijder(false); onVerwijder() }} disabled={bezig}
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

          <div className="rounded-lg bg-surface/50 p-3">
            <p className="text-xs font-medium text-ink/50 mb-2">Wie was aanwezig?</p>
            {personen.length === 0 ? (
              <p className="text-xs text-ink/40">Nog geen personen. Voeg ze eerst toe bij Personen.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-1">
                {personen.map(p => {
                  const isAan = aanwezig.has(p.persoon_id)
                  return (
                    <li key={p.persoon_id}>
                      <label className="flex items-center gap-2 py-1.5 px-1 rounded cursor-pointer hover:bg-white">
                        <input type="checkbox" checked={isAan}
                          onChange={e => onAanwezig(sessie.sessie_id, p.persoon_id, e.target.checked)}
                          className="h-4 w-4 accent-[color:var(--accent)]" />
                        <span className="text-sm text-ink truncate">{p.naam}</span>
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
  companyId, supabase, gekoppeldeToolboxen, setFout, onKlaar, onAnnuleer, bestaand,
}: {
  companyId: string
  supabase: Supa
  gekoppeldeToolboxen: ToolboxOverzichtItem[]
  setFout: (v: string | null) => void
  onKlaar: (nieuwId?: string) => void | Promise<void>
  onAnnuleer: () => void
  bestaand?: ToolboxSessieRegel
}) {
  const [datum, setDatum] = useState(bestaand?.datum ?? '')
  const [onderwerp, setOnderwerp] = useState(bestaand?.onderwerp ?? '')
  const [notitie, setNotitie] = useState(bestaand?.notitie ?? '')
  const [toolboxId, setToolboxId] = useState<string>(bestaand?.toolbox_id ?? '')
  const [bezig, setBezig] = useState(false)

  function kiesToolbox(id: string) {
    setToolboxId(id)
    // Prefill het onderwerp met de gekozen toolbox-titel als het nog leeg is.
    if (id && !onderwerp.trim()) {
      const t = gekoppeldeToolboxen.find(x => x.toolbox_id === id)
      if (t) setOnderwerp(t.geldende_titel)
    }
  }

  async function opslaan() {
    if (!datum || !onderwerp.trim()) return
    setBezig(true); setFout(null)
    const { data, error } = await supabase.rpc('toolbox_sessie_opslaan', {
      p_company_id: companyId,
      p_sessie_id: bestaand?.sessie_id ?? null,
      p_datum: datum,
      p_onderwerp: onderwerp.trim(),
      p_notitie: notitie.trim() || null,
      p_toolbox_id: toolboxId || null,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    await onKlaar(typeof data === 'string' ? data : undefined)
  }

  return (
    <div className="rounded-lg bg-white shadow-sm border border-accent/30 p-4 space-y-2">
      <p className="text-sm font-medium text-ink">{bestaand ? 'Sessie bewerken' : 'Nieuwe sessie'}</p>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink/50 flex flex-col gap-1">
          Datum
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
            className="text-sm border border-ink/20 rounded px-3 py-2 min-h-[40px] bg-white" />
        </label>
        {gekoppeldeToolboxen.length > 0 && (
          <label className="text-xs text-ink/50 flex flex-col gap-1 flex-1 min-w-[12rem]">
            Toolbox (optioneel)
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
      <input value={onderwerp} onChange={e => setOnderwerp(e.target.value)} placeholder="Onderwerp"
        aria-label="Onderwerp" className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white" />
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
