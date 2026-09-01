import { useCallback, useEffect, useRef } from 'react'

// ============================================================================
// Signed URL's vers houden zonder de afscherming te verzwakken
// ----------------------------------------------------------------------------
// De foto's en bewijsstukken staan in PRIVÉ buckets. De server geeft er per
// aanvraag een kortlevende signed URL voor uit, ná een RLS-gescopete select —
// zo komt alleen het eigen bedrijf erbij. Die URL's zijn een uur geldig
// (DOWNLOAD_GELDIGHEID_SEC in lib/bewijs.ts).
//
// Het probleem dat dit oplost: een tabblad dat langer dan een uur openstaat
// houdt zijn oude URL's vast. Er was geen enkele verversmechaniek, dus de
// thumbnails braken (HTTP 400, "InvalidJWT") en doorklikken gaf een foutpagina.
//
// De oplossing gaat NADRUKKELIJK via dezelfde beveiligde weg: opnieuw ophalen
// betekent simpelweg dezelfde server-route nog eens aanroepen, die opnieuw de
// RLS-select doet en pas daarna nieuwe URL's tekent. Er komt geen endpoint bij,
// de bucket blijft privé, en de per-bedrijf-afscherming verandert niet.
//
// Twee mechanismen, bewust allebei:
//
//   1. TERUG OP HET TABBLAD. Wordt het tabblad weer zichtbaar en zijn de URL's
//      ouder dan de drempel, dan één keer opnieuw ophalen. Dit houdt óók de
//      doorklik-links vers — iets wat een onError op een <img> niet kan, want
//      een link die je aanklikt geeft geen laadfout in de pagina.
//
//   2. VANGNET OP EEN LAADFOUT. Laadt een <img> niet, dan is de URL vrijwel
//      zeker verlopen; dan alsnog verversen.
//
// Wat hier NIET gebeurt: geen timer, geen polling. Een tabblad dat op de
// achtergrond ligt doet niets.
// ============================================================================

// Ruim onder het uur blijven, zodat er nooit een net-verlopen URL op het scherm
// belandt. 45 minuten laat een kwartier speling voor een trage verbinding.
export const URL_VERVERS_DREMPEL_MS = 45 * 60 * 1000

// Een verlopen URL is een tíjdprobleem: één keer opnieuw ophalen lost het op.
// Vaker proberen helpt niet, en bij een bestand dat écht verdwenen is zou het
// een lus worden (nieuwe URL → weer een fout → weer verversen).
const MAX_HERSTELPOGINGEN = 2

/**
 * Houdt de signed URL's van een component vers.
 *
 * @param herlaad De bestaande ophaalfunctie van het component. Die praat al met
 *                de beveiligde server-route; deze hook roept hem alleen op het
 *                juiste moment nog eens aan.
 * @returns `laad` (ophalen + klok zetten) en `herstelBeeld` (voor onError).
 */
export function useVerseUrls(herlaad: () => void | Promise<void>) {
  const opgehaaldOp = useRef(0)
  const bezig = useRef(false)
  const herstelPogingen = useRef(0)

  /**
   * Haalt op én zet de klok. Gebruik deze in plaats van de ophaalfunctie zelf,
   * zodat de hook weet hoe oud de URL's zijn. Twee aanroepen tegelijk worden
   * genegeerd; dat voorkomt dat een focus-event bovenop een lopende fetch valt.
   */
  const laad = useCallback(async () => {
    if (bezig.current) return
    bezig.current = true
    try {
      await herlaad()
      opgehaaldOp.current = Date.now()
      herstelPogingen.current = 0
    } finally {
      bezig.current = false
    }
  }, [herlaad])

  useEffect(() => {
    const opAandacht = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - opgehaaldOp.current < URL_VERVERS_DREMPEL_MS) return
      void laad()
    }
    document.addEventListener('visibilitychange', opAandacht)
    window.addEventListener('focus', opAandacht)
    return () => {
      document.removeEventListener('visibilitychange', opAandacht)
      window.removeEventListener('focus', opAandacht)
    }
  }, [laad])

  /** Hang dit aan onError van een <img> met een signed URL. */
  const herstelBeeld = useCallback(() => {
    if (herstelPogingen.current >= MAX_HERSTELPOGINGEN) return
    herstelPogingen.current += 1
    void laad()
  }, [laad])

  return { laad, herstelBeeld }
}
