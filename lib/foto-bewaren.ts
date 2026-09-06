// "Bewaar op mijn telefoon" — een foto die de uitvoerder al naar het portaal
// heeft geüpload (of nog gaat uploaden) OOK zelf in de eigen fotobibliotheek
// bewaren. Puur client-side, GEEN server-aanroep: de upload naar het
// afgeschermde portaal blijft volledig ongewijzigd, dit komt er los bovenop.
//
// Wat een browser hier daadwerkelijk kan (onderzocht 2026-09-06/07, zie
// NACHT_2026-09-06.md fase 1a voor de volledige toelichting):
// - Web Share API (navigator.share met files) is de ENIGE weg die op iOS
//   Safari betrouwbaar in de echte Fotobibliotheek landt — de gebruiker kiest
//   zelf "Bewaar afbeelding" in het native deelvenster. Sinds iOS 15/Safari
//   goed ondersteund, vereist HTTPS + een user-gesture (dus ALTIJD direct
//   vanuit de klik-handler aanroepen, nooit ná een await/wachttijd).
// - Zonder Share (desktop, of een browser die files niet deelt): een directe
//   download via een <a download>-link. Op Android landt dat meestal alsnog
//   in de Downloads-map die de Galerij-app meescant; op iOS komt het in de
//   Bestanden-app, NIET automatisch de Fotobibliotheek — een browser mag daar
//   niet automatisch naar schrijven, dat is platformbeleid, geen bug hier.
// Kortom: op iOS is er geen stille één-tik-naar-Fotobibliotheek-garantie
// zonder het native deelvenster; dat deelvenster IS de beste haalbare versie.
'use client'

export type BewaarResultaat =
  | { ok: true; via: 'share' | 'download' }
  | { ok: false; fout: 'geannuleerd' | 'ophalen_mislukt' | 'niet_ondersteund' }

async function naarBestand(bron: string | Blob, bestandsnaam: string, mimeType?: string): Promise<File> {
  const blob = typeof bron === 'string'
    ? await fetch(bron).then(r => {
        if (!r.ok) throw new Error(`ophalen mislukt: HTTP ${r.status}`)
        return r.blob()
      })
    : bron
  return new File([blob], bestandsnaam, { type: mimeType || blob.type || 'application/octet-stream' })
}

/**
 * Probeert een foto op de telefoon van de gebruiker te bewaren. `bron` is
 * ofwel een al-geselecteerd/geüpload bestand (Blob/File — geen netwerk nodig)
 * ofwel een (signed) URL waarvan de bytes eerst opgehaald worden.
 *
 * BELANGRIJK: roep dit synchroon aan vanuit een klik-handler (`onClick={() =>
 * bewaarFotoOpTelefoon(...)}`), niet ná een eigen `await` ervoor — de Web
 * Share API weigert zonder verse user-gesture.
 */
export async function bewaarFotoOpTelefoon(
  bron: string | Blob,
  bestandsnaam: string,
  mimeType?: string,
): Promise<BewaarResultaat> {
  let bestand: File
  try {
    bestand = await naarBestand(bron, bestandsnaam, mimeType)
  } catch {
    return { ok: false, fout: 'ophalen_mislukt' }
  }

  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  if (nav?.share && nav.canShare?.({ files: [bestand] })) {
    try {
      await nav.share({ files: [bestand] })
      return { ok: true, via: 'share' }
    } catch (e) {
      // Gebruiker annuleerde het deelvenster (AbortError) — geen mislukking,
      // gewoon niets gedaan; niet terugvallen op de download hieronder.
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, fout: 'geannuleerd' }
      }
      // Andere Share-fout: val terug op een directe download i.p.v. de
      // gebruiker met niets achter te laten.
    }
  }

  try {
    const url = URL.createObjectURL(bestand)
    const a = document.createElement('a')
    a.href = url
    a.download = bestandsnaam
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Ruim op ná de download-trigger; te vroeg intrekken breekt 'm in sommige
    // browsers, dus een korte marge in plaats van meteen.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { ok: true, via: 'download' }
  } catch {
    return { ok: false, fout: 'niet_ondersteund' }
  }
}
