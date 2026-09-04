'use client'

// ============================================================================
// AI-voorwerk bij één foto van één inspectiepunt (migratie 0050, uitgebreid
// in 0059 met aanvinkbare bevindingen + actiesuggesties).
// ----------------------------------------------------------------------------
// DE MENS BESLIST — dat is hier geen slogan maar de opbouw van het scherm:
//   * het toestemmingsvinkje staat standaard UIT en zonder vinkje is de knop
//     dood; er gaat geen foto weg door een onbedoelde klik;
//   * wat terugkomt is een korte beschrijving plus twee lijsten met AANVINK-
//     BARE voorstellen (bevindingen, acties) — allemaal standaard UIT;
//   * er wordt niets in de bevinding of de actielijst vastgelegd tot iemand
//     op 'Overnemen' klikt, en dan ALLEEN wat is aangevinkt;
//   * 'Weggooien' laat alles ongemoeid.
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
  // Is er al een resultaat gekozen bij dit punt? Zonder resultaat rendert het
  // invulscherm geen toelichtingveld, dus zou een overgenomen tekst onzichtbaar
  // worden opgeslagen. Overnemen van bevindingen is dan uit — de RPC weigert
  // het ook (0051). Acties-alleen raken de toelichting niet en blijven vrij.
  heeftResultaat: boolean
  t: Vertaler
  onOvergenomen: (tekst: string) => void
  onGewijzigd: () => void
}

export default function InspectieFotoAi({
  foto, aiStatus, openConcept, heeftToelichting, heeftResultaat, t, onOvergenomen, onGewijzigd,
}: Props) {
  const supabase = createClient()

  // Standaard UIT. Dit is het hele AVG-scharnier van deze functie: zonder een
  // bewuste klik van de inspecteur verlaat deze foto het portaal niet.
  const [toestemming, setToestemming] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [besluitBezig, setBesluitBezig] = useState(false)
  const [melding, setMelding] = useState<Melding>(null)
  const [suggestie, setSuggestie] = useState<AiSuggestie | null>(openConcept)
  // Index-gebaseerd: welke bevindingen/acties heeft de inspecteur aangevinkt.
  // Standaard leeg — ook aanvinken is een bewuste keuze, geen automatische.
  const [bevGekozen, setBevGekozen] = useState<Set<number>>(new Set())
  const [actGekozen, setActGekozen] = useState<Set<number>>(new Set())
  const [overgenomen, setOvergenomen] = useState(false)
  // Uitleg bij het info-icoon: hover toont hem op desktop (group-hover, CSS-
  // only); dit stukje state is ervoor dat een tik op mobiel (geen hover)
  // hetzelfde doet, en dat een tweede tik hem weer wegklikt.
  const [toonUitleg, setToonUitleg] = useState(false)

  const vinkjeId = `ai-toestemming-${foto.id}`
  const nietGeconfigureerd = aiStatus !== null && !aiStatus.geconfigureerd
  const dienst = aiStatus?.weergavenaam || 'een externe AI-dienst'
  const waarschuwing = t(aiStatus?.regio === 'eu' ? 'aiWaarschuwingEu' : 'aiWaarschuwingBuitenEu')
    .replace('{dienst}', dienst)

  function wissel(set: Set<number>, zet: (s: Set<number>) => void, i: number) {
    const volgende = new Set(set)
    if (volgende.has(i)) volgende.delete(i); else volgende.add(i)
    zet(volgende)
  }

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
      setBevGekozen(new Set())
      setActGekozen(new Set())
      setOvergenomen(false)
    } catch {
      setMelding({ soort: 'fout', tekst: t('foutAi') })
    } finally {
      setBezig(false)
    }
  }

  // Het enige moment waarop AI-voorwerk in de bevinding of de actielijst
  // belandt — en dan nog alleen met wat is aangevinkt.
  async function overnemen() {
    if (!suggestie || besluitBezig) return
    const bevindingen = suggestie.bevindingen.filter((_, i) => bevGekozen.has(i))
    const acties = suggestie.acties.filter((_, i) => actGekozen.has(i))
    if (bevindingen.length === 0 && acties.length === 0) {
      setMelding({ soort: 'fout', tekst: t('aiNietsAangevinkt') })
      return
    }
    if (bevindingen.length > 0 && !heeftResultaat) return

    setBesluitBezig(true)
    setMelding(null)
    const { error } = await supabase.rpc('inspectie_ai_suggestie_besluit', {
      p_suggestie_id: suggestie.id,
      p_besluit: 'overgenomen',
      p_bevindingen_gekozen: bevindingen,
      p_acties_gekozen: acties,
    })
    setBesluitBezig(false)
    if (error) {
      setMelding({ soort: 'fout', tekst: t('foutAiBesluit') })
      return
    }
    setOvergenomen(true)
    setSuggestie(null)
    // Alleen de toelichting bijwerken als er ook echt bevindingen zijn gekozen
    // — acties-alleen raakt de toelichting niet (zie migratie 0059).
    if (bevindingen.length > 0) onOvergenomen(bevindingen.join('\n'))
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
    })
    setBesluitBezig(false)
    if (error) {
      setMelding({ soort: 'fout', tekst: t('foutAiBesluit') })
      return
    }
    setSuggestie(null)
    onGewijzigd()
  }

  const magOvernemen = suggestie !== null
    && (bevGekozen.size > 0 || actGekozen.size > 0)
    && (bevGekozen.size === 0 || heeftResultaat)

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

      {/* Het toestemmingsvinkje staat standaard uit; de uitleg (buiten de EU,
          geen herkenbare personen) staat nog steeds voluit in de tekst, maar
          achter een info-icoon in plaats van een groot waarschuwingsblok —
          hover toont hem op desktop, een tik doet dat op mobiel. */}
      <div className="flex items-center gap-2">
        <input
          id={vinkjeId}
          type="checkbox"
          checked={toestemming}
          onChange={e => setToestemming(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-accent"
        />
        <label htmlFor={vinkjeId} className="text-xs text-ink/70 cursor-pointer">
          {t('aiToestemming')}
        </label>
        <span className="relative group">
          <button
            type="button"
            onClick={() => setToonUitleg(v => !v)}
            aria-expanded={toonUitleg}
            aria-label={t('aiMeerUitleg')}
            className="h-4 w-4 shrink-0 inline-flex items-center justify-center rounded-full border border-ink/30 text-[10px] leading-none text-ink/50 hover:border-accent hover:text-accent transition-colors"
          >
            i
          </button>
          <span
            role="tooltip"
            className={`absolute z-20 left-0 top-full mt-1 w-64 max-w-[80vw] text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 shadow-sm
              ${toonUitleg ? 'block' : 'hidden'} group-hover:block`}
          >
            {waarschuwing}
          </span>
        </span>
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
        <div className="rounded border border-dashed border-accent/40 bg-white p-2 space-y-3">
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

          {suggestie.bevindingen.length > 0 && (
            <fieldset>
              <legend className="text-[11px] font-medium text-ink/40 uppercase tracking-wider mb-1">
                {t('aiBevindingenLabel')}
              </legend>
              <ul className="space-y-1">
                {suggestie.bevindingen.map((bv, i) => {
                  const id = `ai-bev-${foto.id}-${i}`
                  return (
                    <li key={id} className="flex items-start gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={bevGekozen.has(i)}
                        onChange={() => wissel(bevGekozen, setBevGekozen, i)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                      />
                      <label htmlFor={id} className="text-xs text-ink/70 cursor-pointer">{bv}</label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          {suggestie.acties.length > 0 && (
            <fieldset>
              <legend className="text-[11px] font-medium text-ink/40 uppercase tracking-wider mb-1">
                {t('aiActiesLabel')}
              </legend>
              <ul className="space-y-1">
                {suggestie.acties.map((ac, i) => {
                  const id = `ai-act-${foto.id}-${i}`
                  return (
                    <li key={id} className="flex items-start gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={actGekozen.has(i)}
                        onChange={() => wissel(actGekozen, setActGekozen, i)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                      />
                      <label htmlFor={id} className="text-xs text-ink/70 cursor-pointer">{ac}</label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          {suggestie.bevindingen.length === 0 && suggestie.acties.length === 0 && (
            <p className="text-xs text-ink/50">{t('aiGeenVoorstellen')}</p>
          )}

          {bevGekozen.size > 0 && heeftToelichting && heeftResultaat && (
            <p className="text-[11px] text-amber-800">{t('aiVervangtTekst')}</p>
          )}

          {/* Zonder gekozen resultaat is er geen toelichtingveld om in te landen.
              Overnemen van bevindingen zou de tekst dan onzichtbaar opslaan. */}
          {bevGekozen.size > 0 && !heeftResultaat && (
            <p className="text-[11px] text-amber-800">{t('aiEerstResultaat')}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={overnemen}
              disabled={besluitBezig || !magOvernemen}
              title={!magOvernemen ? t('aiNietsAangevinkt') : undefined}
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
