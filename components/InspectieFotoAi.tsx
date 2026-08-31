'use client'

// ============================================================================
// AI-voorwerk bij één foto van één inspectiepunt (migratie 0050).
// ----------------------------------------------------------------------------
// DE MENS BESLIST — dat is hier geen slogan maar de opbouw van het scherm:
//   * het toestemmingsvinkje staat standaard UIT en zonder vinkje is de knop
//     dood; er gaat geen foto weg door een onbedoelde klik;
//   * wat terugkomt heet zichtbaar CONCEPT en staat in een bewerkbaar veld;
//   * er wordt niets in de bevinding vastgelegd tot iemand op 'Overnemen' klikt;
//   * 'Weggooien' laat de toelichting ongemoeid.
//
// De aanroep zelf gebeurt server-side (app/api/inspectie/ai-analyse). Deze
// component kent geen sleutel, geen endpoint en geen leverancier — alleen wat
// de server via GET teruggaf: wie het is en of hij binnen of buiten de EU
// draait. Die twee bepalen de waarschuwingstekst bij het vinkje.
// ============================================================================

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AI_NIET_GECONFIGUREERD,
  type AiLeverancierStatus,
  type AiSuggestie,
} from '@/lib/ai-analyse'
import type { InspectieFotoItem } from '@/lib/inspectie-foto'

type Vertaler = (key: string) => string

// Een mededeling onder de knop. 'info' is grijs (er is niets kapot, bv. nog
// geen sleutel ingesteld), 'fout' is rood (er ging echt iets mis).
type Melding = { soort: 'info' | 'fout'; tekst: string } | null

type Props = {
  foto: InspectieFotoItem
  // Null zolang de status nog laadt; de knop wacht daar netjes op.
  aiStatus: AiLeverancierStatus | null
  // Een nog niet beoordeeld concept dat bij deze foto hoort (na herladen).
  openConcept: AiSuggestie | null
  // Staat er al een toelichting? Dan waarschuwen we dat overnemen die vervangt.
  heeftToelichting: boolean
  t: Vertaler
  onOvergenomen: (tekst: string) => void
  onGewijzigd: () => void
}

export default function InspectieFotoAi({
  foto, aiStatus, openConcept, heeftToelichting, t, onOvergenomen, onGewijzigd,
}: Props) {
  const supabase = createClient()

  // Standaard UIT. Dit is het hele AVG-scharnier van deze functie: zonder een
  // bewuste klik van de inspecteur verlaat deze foto het portaal niet.
  const [toestemming, setToestemming] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [besluitBezig, setBesluitBezig] = useState(false)
  const [melding, setMelding] = useState<Melding>(null)
  const [suggestie, setSuggestie] = useState<AiSuggestie | null>(openConcept)
  const [conceptTekst, setConceptTekst] = useState(openConcept?.concept ?? '')
  const [overgenomen, setOvergenomen] = useState(false)

  const vinkjeId = `ai-toestemming-${foto.id}`
  const nietGeconfigureerd = aiStatus !== null && !aiStatus.geconfigureerd
  const dienst = aiStatus?.weergavenaam || 'een externe AI-dienst'
  const waarschuwing = t(aiStatus?.regio === 'eu' ? 'aiWaarschuwingEu' : 'aiWaarschuwingBuitenEu')
    .replace('{dienst}', dienst)

  async function analyseer() {
    if (!toestemming || bezig) return
    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch('/api/inspectie/ai-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // De toestemming gaat expliciet mee; de server weigert zonder true.
        body: JSON.stringify({ fotoId: foto.id, toestemming: true }),
      })
      const uitkomst = (await res.json().catch(() => ({}))) as {
        suggestie?: AiSuggestie
        fout?: string
        code?: string
      }

      if (!res.ok) {
        // Nog geen sleutel ingesteld is geen storing: grijze mededeling, geen
        // rode fout. De servertekst is al Nederlands en lekt geen details.
        const isConfig = uitkomst.code === AI_NIET_GECONFIGUREERD
        setMelding({
          soort: isConfig ? 'info' : 'fout',
          tekst: uitkomst.fout || t(isConfig ? 'aiNietGeconfigureerd' : 'foutAi'),
        })
        return
      }
      if (!uitkomst.suggestie) {
        setMelding({ soort: 'fout', tekst: t('foutAi') })
        return
      }

      setSuggestie(uitkomst.suggestie)
      setConceptTekst(uitkomst.suggestie.concept ?? '')
      setOvergenomen(false)
    } catch {
      setMelding({ soort: 'fout', tekst: t('foutAi') })
    } finally {
      setBezig(false)
    }
  }

  // Het enige moment waarop AI-voorwerk in de bevinding belandt — en dan nog
  // met de tekst zoals die nú in het bewerkbare veld staat, niet met de
  // oorspronkelijke AI-tekst.
  async function overnemen() {
    if (!suggestie || besluitBezig) return
    const tekst = conceptTekst.trim()
    if (!tekst) {
      setMelding({ soort: 'fout', tekst: t('aiLeegOvernemen') })
      return
    }
    setBesluitBezig(true)
    setMelding(null)
    const { error } = await supabase.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestie.id,
      p_besluit: 'overgenomen',
      p_tekst: tekst,
    })
    setBesluitBezig(false)
    if (error) {
      setMelding({ soort: 'fout', tekst: t('foutAiBesluit') })
      return
    }
    setOvergenomen(true)
    setSuggestie(null)
    onOvergenomen(tekst)
    onGewijzigd()
  }

  // Weggooien is bewust zonder tussenvraag: er ligt niets vast, dus er gaat
  // niets verloren. (En een native confirm() gebruiken we hier nergens.)
  async function weggooien() {
    if (!suggestie || besluitBezig) return
    setBesluitBezig(true)
    setMelding(null)
    const { error } = await supabase.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestie.id,
      p_besluit: 'verworpen',
      p_tekst: null,
    })
    setBesluitBezig(false)
    if (error) {
      setMelding({ soort: 'fout', tekst: t('foutAiBesluit') })
      return
    }
    setSuggestie(null)
    setConceptTekst('')
    onGewijzigd()
  }

  return (
    <div className="mt-2 rounded border border-ink/10 bg-surface/40 p-2 space-y-2">
      {/* Miniatuur erbij, want bij meerdere foto's op één punt moet zonder
          twijfel duidelijk zijn wélke foto je zo naar buiten stuurt. */}
      <div className="flex items-center gap-2">
        {foto.downloadUrl && (
          /* Signed URL van een privé-bucket: geen next/image-optimalisatie. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={foto.downloadUrl} alt="" aria-hidden
            className="h-7 w-7 object-cover rounded border border-ink/10 shrink-0" />
        )}
        <p className="text-[11px] font-medium text-ink/40 uppercase tracking-wider">{t('aiKop')}</p>
        {foto.bestandsnaam && (
          <span className="text-[11px] text-ink/40 truncate">{foto.bestandsnaam}</span>
        )}
      </div>

      {/* Het toestemmingsvinkje met de waarschuwing er direct onder, niet
          verstopt achter een tooltip: de inspecteur moet kunnen lezen waar hij
          ja tegen zegt vóórdat hij klikt. */}
      <div className="flex items-start gap-2">
        <input
          id={vinkjeId}
          type="checkbox"
          checked={toestemming}
          onChange={e => setToestemming(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <label htmlFor={vinkjeId} className="text-xs text-ink/70 cursor-pointer">
          {t('aiToestemming')}
          <span className="block text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
            {waarschuwing}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={analyseer}
          disabled={!toestemming || bezig || aiStatus === null}
          title={!toestemming ? t('aiZetVinkjeAan') : undefined}
          className="text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:hover:border-ink/20 disabled:hover:text-ink/60"
        >
          {bezig ? t('aiBezig') : `✦ ${t('aiKnop')}`}
        </button>
        {overgenomen && (
          <span className="text-[11px] text-green-800 bg-green-50 border border-green-200 rounded-full px-2 py-1">
            ✓ {t('aiOvergenomen')}
          </span>
        )}
      </div>

      {/* Nog geen sleutel ingesteld: dat meteen zeggen, niet pas na een klik. */}
      {nietGeconfigureerd && !melding && (
        <p className="text-[11px] text-ink/50">{t('aiNietGeconfigureerd')}</p>
      )}

      {melding && (
        <p className={`text-[11px] ${melding.soort === 'fout' ? 'text-red-600' : 'text-ink/50'}`}>
          {melding.tekst}
        </p>
      )}

      {suggestie && (
        <div className="rounded border border-dashed border-accent/40 bg-white p-2 space-y-2">
          {/* Het labeltje. Wie dit scherm later terugziet moet zonder uitleg
              zien dat dit voorwerk van een machine is, niet van een collega. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-accent bg-accent/10 rounded-full px-2 py-0.5">
              ✦ {t('aiSuggestieLabel')}
            </span>
            <span className="text-[11px] text-ink/40">
              {suggestie.leverancier}
              {suggestie.model ? ` · ${suggestie.model}` : ''}
            </span>
          </div>
          <p className="text-[11px] text-ink/50">{t('aiDoetVoorstel')}</p>

          {suggestie.beschrijving && (
            <div>
              <p className="text-[11px] font-medium text-ink/40 uppercase tracking-wider">{t('aiWatAiZiet')}</p>
              <p className="text-xs text-ink/70 mt-0.5">{suggestie.beschrijving}</p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-ink/40 uppercase tracking-wider" htmlFor={`ai-concept-${foto.id}`}>
              {t('aiConceptLabel')}
            </label>
            <textarea
              id={`ai-concept-${foto.id}`}
              value={conceptTekst}
              onChange={e => setConceptTekst(e.target.value)}
              rows={3}
              className="w-full text-sm border border-ink/20 rounded px-3 py-2 mt-1 resize-none bg-white"
            />
          </div>

          {heeftToelichting && (
            <p className="text-[11px] text-amber-800">{t('aiVervangtTekst')}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={overnemen}
              disabled={besluitBezig}
              className="text-xs px-4 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {t('aiOvernemen')}
            </button>
            <button
              type="button"
              onClick={weggooien}
              disabled={besluitBezig}
              className="text-xs px-4 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              {t('aiWeggooien')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
