'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INSP_TEKST, vertaal, type Taal } from '@/lib/i18n-werknemer'
import TaalWissel, { useTaal } from './TaalWissel'
import type {
  Inspectie,
  InspectieBevinding,
  InspectieHistorieRegel,
  BevindingResultaat,
} from '@/lib/types'

// Vertaalhulp: dezelfde vorm als in de toolbox- en meldflow.
type Vertaler = (key: string) => string
const maakVertaler = (taal: Taal): Vertaler => key => vertaal(INSP_TEKST, key, taal)

function formatDatum(iso: string | null, taal: Taal): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(taal === 'tr' ? 'tr-TR' : 'nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_SLEUTEL: Record<string, string> = {
  open: 'statusOpen', afgerond: 'statusAfgerond', geannuleerd: 'statusGeannuleerd',
}

type Props = {
  companyId: string
  inspectie: Inspectie
  onTerug: () => void
  // Meld een statuswijziging (bv. afgerond) terug aan het overzicht.
  onStatus: (status: Inspectie['status']) => void
}

export default function InspectieUitvoeren({ companyId, inspectie, onTerug, onStatus }: Props) {
  const supabase = createClient()
  const [taal, setTaal] = useTaal()
  const t = maakVertaler(taal)

  const [status, setStatus] = useState<Inspectie['status']>(inspectie.status)
  const [bevindingen, setBevindingen] = useState<InspectieBevinding[]>([])
  const [historie, setHistorie] = useState<InspectieHistorieRegel[]>([])
  const [conclusie, setConclusie] = useState(inspectie.conclusie ?? '')
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [afrondBezig, setAfrondBezig] = useState(false)

  const readOnly = status === 'afgerond' || status === 'geannuleerd'

  const herlaad = useCallback(async () => {
    const [bev, hist] = await Promise.all([
      supabase
        .from('inspectie_bevinding')
        .select('id, company_id, inspectie_id, rubriek_naam_snap, punt_tekst_snap, verplicht, volgorde, resultaat, afhandeling, actie_id, opmerking')
        .eq('inspectie_id', inspectie.id)
        .order('volgorde', { ascending: true }),
      supabase
        .from('inspectie_historie')
        .select('id, inspectie_id, wie, wanneer, wijziging')
        .eq('inspectie_id', inspectie.id)
        .order('wanneer', { ascending: false }),
    ])
    setBevindingen((bev.data ?? []) as InspectieBevinding[])
    setHistorie((hist.data ?? []) as InspectieHistorieRegel[])
    setLaden(false)
  }, [inspectie.id, supabase])

  // Bevindingen + historie eenmalig laden bij openen. De setState's in herlaad
  // gebeuren pas ná de await (asynchroon), niet synchroon in de effect-body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { herlaad() }, [herlaad])

  function patchBevinding(id: string, updates: Partial<InspectieBevinding>) {
    setBevindingen(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)))
  }

  // Verplichte punten zonder resultaat blokkeren het afronden.
  const verplichtOpen = bevindingen.filter(b => b.verplicht && !b.resultaat).length

  async function afronden() {
    setAfrondBezig(true)
    setFout(null)
    const { error } = await supabase.rpc('inspectie_afronden', {
      p_inspectie_id: inspectie.id,
      p_conclusie: conclusie.trim() || null,
    })
    setAfrondBezig(false)
    if (error) {
      setFout(t('afrondenMislukt') + (error.message ?? t('onbekendeFout')))
      return
    }
    setStatus('afgerond')
    onStatus('afgerond')
    herlaad()
  }

  async function bewaarConclusie() {
    if (readOnly) return
    await supabase.rpc('inspectie_conclusie_opslaan', {
      p_inspectie_id: inspectie.id,
      p_conclusie: conclusie.trim() || null,
    })
  }

  return (
    <div className="space-y-4">
      {/* Terug + taalschakelaar op één regel; op smal scherm wrapt de toggle mee. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onTerug}
          className="text-sm text-ink/50 hover:text-ink inline-flex items-center gap-1 min-h-[44px]"
        >
          ← {t('terugOverzicht')}
        </button>
        <TaalWissel taal={taal} onTaal={setTaal} />
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* Sjabloonnaam en controlesoort komen uit de DB: niet vertalen. */}
            <h2 className="text-lg font-semibold text-ink">{inspectie.sjabloon_naam_snap ?? t('inspectie')}</h2>
            {inspectie.controlesoort_snap && (
              <p className="text-sm text-ink/50 mt-0.5">{inspectie.controlesoort_snap}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-3 py-1 rounded-full shrink-0
            ${status === 'afgerond' ? 'bg-green-100 text-green-800'
              : status === 'geannuleerd' ? 'bg-gray-100 text-gray-600'
              : 'bg-blue-100 text-blue-800'}`}>
            {STATUS_SLEUTEL[status] ? t(STATUS_SLEUTEL[status]) : status}
          </span>
        </div>
        {inspectie.uitgevoerd_op && (
          <p className="text-xs text-ink/40 mt-2">
            {t('uitgevoerdOp').replace('{datum}', formatDatum(inspectie.uitgevoerd_op, taal))}
          </p>
        )}
      </div>

      {laden && <p className="text-sm text-ink/40">{t('laden')}</p>}

      {!laden && bevindingen.length === 0 && (
        <p className="text-sm text-ink/40 bg-white rounded-lg shadow-sm p-4">
          {t('geenPunten')}
        </p>
      )}

      <div className="space-y-3">
        {bevindingen.map((b, i) => {
          // Rubriekkop tonen zodra de rubriek wisselt (snapshot per bevinding).
          const vorige = i > 0 ? bevindingen[i - 1].rubriek_naam_snap : null
          const nieuweRubriek = b.rubriek_naam_snap && b.rubriek_naam_snap !== vorige
          return (
            <div key={b.id} className="space-y-3">
              {nieuweRubriek && (
                <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wider pt-2">
                  {b.rubriek_naam_snap}
                </h3>
              )}
              <BevindingRow
                companyId={companyId}
                nummer={i + 1}
                bevinding={b}
                readOnly={readOnly}
                t={t}
                onPatch={updates => patchBevinding(b.id, updates)}
                onHistorieGewijzigd={herlaad}
              />
            </div>
          )
        })}
      </div>

      {/* Algemene conclusie */}
      {bevindingen.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-1">{t('conclusie')}</p>
          <textarea
            value={conclusie}
            onChange={e => setConclusie(e.target.value)}
            onBlur={bewaarConclusie}
            disabled={readOnly}
            placeholder={t('conclusiePlaceholder')}
            rows={3}
            className="w-full text-sm border border-ink/20 rounded px-3 py-2 resize-none bg-white disabled:bg-surface/50 disabled:text-ink/60"
          />
        </div>
      )}

      {/* Afronden */}
      {!readOnly && bevindingen.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
          {verplichtOpen > 0 && (
            <p className="text-xs text-red-600 font-medium">
              {t(verplichtOpen === 1 ? 'verplichtOpenEnk' : 'verplichtOpenMv').replace('{n}', String(verplichtOpen))}
            </p>
          )}
          <button
            onClick={afronden}
            disabled={verplichtOpen > 0 || afrondBezig}
            className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {afrondBezig ? t('bezig') : t('afronden')}
          </button>
          {fout && <p className="text-xs text-red-600">{fout}</p>}
        </div>
      )}

      {/* Historie */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-2">{t('geschiedenis')}</p>
        {historie.length === 0 ? (
          <p className="text-xs text-ink/40">{t('geenGeschiedenis')}</p>
        ) : (
          <ul className="space-y-2">
            {historie.map(h => (
              <li key={h.id} className="text-xs text-ink/60 border-l-2 border-ink/10 pl-2">
                {/* h.wijziging wordt server-side in het NL geschreven: inhoud, niet vertalen. */}
                {h.wijziging}
                <span className="text-ink/40"> · {formatDatum(h.wanneer, taal)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---- Eén bevinding-regel ----

type RowProps = {
  companyId: string
  nummer: number
  bevinding: InspectieBevinding
  readOnly: boolean
  t: Vertaler
  onPatch: (updates: Partial<InspectieBevinding>) => void
  onHistorieGewijzigd: () => void
}

function BevindingRow({ companyId, nummer, bevinding, readOnly, t, onPatch, onHistorieGewijzigd }: RowProps) {
  const supabase = createClient()
  const [opmerking, setOpmerking] = useState(bevinding.opmerking ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  // Een lopende achtergrond-autosave van de toelichting (blur). Expliciete
  // handelingen wachten deze eerst af, zodat zíj het laatste woord hebben in de DB.
  const autosaveRef = useRef<Promise<boolean> | null>(null)

  const heeftActie = bevinding.afhandeling === 'actie' && !!bevinding.actie_id

  // Kale schrijfactie naar de DB. Zet de knop-busy NIET zelf; de aanroeper bepaalt
  // of dit een blokkerende handeling (knop) of een achtergrond-autosave is.
  async function schrijf(resultaat: BevindingResultaat, afhandeling: InspectieBevinding['afhandeling'], opm: string | null) {
    const { error } = await supabase.rpc('bevinding_opslaan', {
      p_bevinding_id: bevinding.id,
      p_resultaat: resultaat,
      p_afhandeling: afhandeling,
      p_opmerking: opm,
    })
    if (error) {
      setFout(error.message ?? t('foutOpslaan'))
      return false
    }
    onPatch({ resultaat, afhandeling, opmerking: opm })
    return true
  }

  // Blokkerende variant voor de expliciete knoppen: toont 'bezig' en wacht een
  // eventueel lopende toelichting-autosave af, zodat deze handeling als laatste schrijft.
  async function opslaan(resultaat: BevindingResultaat, afhandeling: InspectieBevinding['afhandeling'], opm: string | null) {
    setBezig(true)
    setFout(null)
    if (autosaveRef.current) { try { await autosaveRef.current } catch { /* afgehandeld in schrijf */ } }
    const ok = await schrijf(resultaat, afhandeling, opm)
    setBezig(false)
    return ok
  }

  // Klik op een resultaat-knop.
  async function kiesResultaat(r: BevindingResultaat) {
    if (readOnly || bezig) return
    if (r === 'niet_in_orde') {
      // Resultaat vastleggen; afhandeling kiest de gebruiker daarna.
      await opslaan('niet_in_orde', bevinding.afhandeling === 'actie' ? 'actie' : 'geen',
        bevinding.afhandeling === 'meteen_hersteld' ? (opmerking.trim() || null) : (opmerking.trim() || null))
    } else {
      await opslaan(r, 'geen', opmerking.trim() || null)
    }
  }

  async function kiesMeteenHersteld() {
    if (readOnly || bezig) return
    if (!opmerking.trim()) {
      setFout(t('foutToelichtingVerplicht'))
      return
    }
    await opslaan('niet_in_orde', 'meteen_hersteld', opmerking.trim())
  }

  async function maakActie() {
    if (readOnly || bezig) return
    setBezig(true)
    setFout(null)
    // Laat een eventueel lopende toelichting-autosave eerst afronden, anders kan die
    // ná deze actie alsnog afhandeling='geen' wegschrijven en de actie ongedaan maken.
    if (autosaveRef.current) { try { await autosaveRef.current } catch { /* afgehandeld in schrijf */ } }
    const { data, error } = await supabase.rpc('bevinding_naar_actie', { p_bevinding_id: bevinding.id })
    setBezig(false)
    if (error) {
      setFout(error.message ?? t('foutActie'))
      return
    }
    onPatch({ resultaat: 'niet_in_orde', afhandeling: 'actie', actie_id: (data as string) ?? bevinding.actie_id })
    onHistorieGewijzigd()
  }

  // Opmerking bewaren bij blur (alleen als er al een resultaat is gekozen).
  // Bewust een ACHTERGROND-opslag: zet de knop-busy NIET, zodat een klik op
  // 'Actie aanmaken' of 'Meteen hersteld' direct ná het typen niet stil wordt
  // ingeslikt (de blur vuurt vóór de klik). Slaat niets op als de tekst onveranderd is.
  async function blurOpmerking() {
    if (readOnly || bezig) return
    if (!bevinding.resultaat) return
    const opm = opmerking.trim()
    if (opm === (bevinding.opmerking ?? '')) return // niets gewijzigd
    if (bevinding.afhandeling === 'meteen_hersteld' && !opm) return
    const p = schrijf(bevinding.resultaat, bevinding.afhandeling, opm || null)
    autosaveRef.current = p
    try { await p } finally { if (autosaveRef.current === p) autosaveRef.current = null }
  }

  const RESULTATEN: { key: BevindingResultaat; label: string; actief: string }[] = [
    { key: 'in_orde',      label: t('inOrde'),     actief: 'bg-green-600 text-white border-green-600' },
    { key: 'niet_in_orde', label: t('nietInOrde'), actief: 'bg-red-600 text-white border-red-600' },
    { key: 'nvt',          label: t('nvt'),        actief: 'bg-ink text-white border-ink' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="font-mono text-xs text-ink/40 mt-0.5 shrink-0">{nummer}</span>
        <p className="text-sm text-ink flex-1">
          {/* De checklistvraag zelf komt uit de DB en blijft in de taal van de KAM. */}
          {bevinding.punt_tekst_snap}
          {bevinding.verplicht && <span className="text-accent ml-1" title={t('verplicht')}>*</span>}
        </p>
      </div>

      {/* Resultaatkeuze */}
      <div className="flex flex-wrap gap-2">
        {RESULTATEN.map(r => {
          const gekozen = bevinding.resultaat === r.key
          return (
            <button
              key={r.key}
              onClick={() => kiesResultaat(r.key)}
              disabled={readOnly || bezig}
              className={`text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-50
                ${gekozen ? r.actief : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}
            >
              {gekozen ? '✓ ' : ''}{r.label}
            </button>
          )
        })}
      </div>

      {/* Afhandeling bij 'niet in orde' */}
      {bevinding.resultaat === 'niet_in_orde' && (
        <div className="rounded border border-dashed border-red-200 bg-red-50/40 p-3 space-y-2">
          <p className="text-xs text-ink/50">{t('hoeAfgehandeld')}</p>

          {heeftActie ? (
            <p className="text-xs text-ink/70">
              {t('actiePrefix')}
              <Link href={`/${companyId}/pva`} className="text-accent hover:underline">{t('actielijst')}</Link>
              {t('actieSuffix')}
            </p>
          ) : (
            <>
              <textarea
                value={opmerking}
                onChange={e => setOpmerking(e.target.value)}
                onBlur={blurOpmerking}
                disabled={readOnly || bezig}
                placeholder={t('toelichtingPlaceholder')}
                rows={2}
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 resize-none bg-white disabled:bg-surface/50"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={kiesMeteenHersteld}
                  disabled={readOnly || bezig}
                  className={`text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-50
                    ${bevinding.afhandeling === 'meteen_hersteld'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}
                >
                  {bevinding.afhandeling === 'meteen_hersteld' ? '✓ ' : ''}{t('meteenHersteld')}
                </button>
                <button
                  onClick={maakActie}
                  disabled={readOnly || bezig}
                  className="text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('actieAanmaken')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Optionele opmerking bij in orde / n.v.t. (alleen-lezen weergave bij afgerond) */}
      {bevinding.resultaat && bevinding.resultaat !== 'niet_in_orde' && (
        <input
          value={opmerking}
          onChange={e => setOpmerking(e.target.value)}
          onBlur={blurOpmerking}
          disabled={readOnly || bezig}
          placeholder={t('opmerkingPlaceholder')}
          className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white disabled:bg-surface/50"
        />
      )}

      {/* Alleen-lezen samenvatting voor afgeronde inspecties */}
      {readOnly && bevinding.resultaat === 'niet_in_orde' && bevinding.afhandeling === 'meteen_hersteld' && bevinding.opmerking && (
        <p className="text-xs text-ink/60">{t('directHersteld').replace('{opmerking}', bevinding.opmerking)}</p>
      )}

      {fout && <p className="text-xs text-red-600">{fout}</p>}
    </div>
  )
}
