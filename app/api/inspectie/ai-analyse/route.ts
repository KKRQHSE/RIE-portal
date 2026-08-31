import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { INSPECTIE_FOTO_BUCKET } from '@/lib/inspectie-foto'
import { AI_MAX_FOTO_BYTES, AI_NIET_GECONFIGUREERD, type AiLeverancierStatus } from '@/lib/ai-analyse'
import { AiStoring, kiesLeverancier } from '@/lib/ai/leverancier'

export const dynamic = 'force-dynamic'
// Een vision-model doet er seconden over. De adapter kapt zelf af op 45s, dus
// hier ruimte om die afkap nog netjes te kunnen beantwoorden.
export const maxDuration = 60

// ============================================================================
// AI-foto-analyse bij een inspectiepunt — de ENIGE plek waar een foto naar een
// externe AI-dienst gaat.
// ----------------------------------------------------------------------------
// De aanroep loopt uitsluitend hier, server-side. De API-sleutel staat in een
// omgevingsvariabele, wordt alleen in lib/ai/* gelezen en bereikt de browser
// nooit — ook de leveranciersnaam en het model komen via GET terug, niet de
// sleutel.
//
// AVG-volgorde, en die volgorde is met opzet zo:
//   1. ingelogd?                     — anders 401
//   2. toestemming expliciet true?   — anders 400; ZONDER dit gebeurt er niets
//   3. leverancier geconfigureerd?   — anders 503 met code niet_geconfigureerd
//   4. pas DAARNA de foto opzoeken (via de sessie-client, dus onder RLS)
//   5. pas daarna een signed URL minten en de bytes ophalen
//   6. naar de AI, en het antwoord als CONCEPT opslaan via de RPC
// Punt 2 en 3 staan vóór punt 5: zonder toestemming of zonder sleutel verlaat
// er geen enkele byte de privé bucket.
//
// Wat hier NIET gebeurt: de bevinding bijwerken. Het antwoord landt als concept
// in inspectie_ai_suggestie. Alleen de mens kan het via
// inspectie_ai_suggestie_besluit in de bevinding zetten (migratie 0050).
// ============================================================================

function fout(bericht: string, status: number, code?: string) {
  return NextResponse.json(code ? { fout: bericht, code } : { fout: bericht }, { status })
}

// Wie de leverancier is en of hij is ingesteld. Achter de login, want dit is
// bedrijfsconfiguratie; de UI heeft het nodig om het toestemmingsvinkje eerlijk
// te labelen (welke dienst, binnen of buiten de EU).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  const leverancier = kiesLeverancier()
  const status: AiLeverancierStatus = leverancier
    ? {
        geconfigureerd: leverancier.sleutelAanwezig,
        leverancier: leverancier.naam,
        weergavenaam: leverancier.weergavenaam,
        model: leverancier.model,
        regio: leverancier.regio,
      }
    : {
        // Onbekende AI_LEVERANCIER: net zo behandelen als een ontbrekende
        // sleutel. Er is niets kapot, er is alleen nog niets ingesteld.
        geconfigureerd: false,
        leverancier: 'onbekend',
        weergavenaam: 'AI-dienst',
        model: '',
        regio: 'buiten_eu',
      }

  return NextResponse.json(status)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { fotoId, toestemming } = (body ?? {}) as Record<string, unknown>
  if (typeof fotoId !== 'string' || !fotoId) return fout('Ongeldige invoer.', 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // De opt-in moet er letterlijk zijn. Geen 'truthy', geen standaardwaarde: de
  // client stuurt true of de foto blijft waar hij is.
  if (toestemming !== true) {
    return fout('Zonder toestemming gaat deze foto niet naar een AI-dienst.', 400)
  }

  const leverancier = kiesLeverancier()
  if (!leverancier || !leverancier.sleutelAanwezig) {
    return fout('AI-analyse is nog niet geconfigureerd.', 503, AI_NIET_GECONFIGUREERD)
  }

  // De foto via de SESSIE-client: de select-policy op inspectie_foto
  // (mag_bedrijf_beheren) levert alleen rijen van het eigen bedrijf. Een foto
  // van een ander bedrijf bestaat hier simpelweg niet.
  const { data: foto, error: fotoErr } = await supabase
    .from('inspectie_foto')
    .select('id, inspectie_id, bevinding_id, storage_pad, type')
    .eq('id', fotoId)
    .maybeSingle()
  if (fotoErr || !foto) return fout('Geen toegang tot deze foto.', 403)

  if (!foto.bevinding_id) {
    return fout('AI-voorwerk kan alleen bij een foto die aan een inspectiepunt hangt.', 400)
  }
  const mimeType = typeof foto.type === 'string' ? foto.type : ''
  if (!mimeType.startsWith('image/')) {
    return fout('Alleen een foto kan door de AI beschreven worden.', 400)
  }
  if (typeof foto.storage_pad !== 'string' || !foto.storage_pad) {
    return fout('Deze foto is niet beschikbaar.', 404)
  }

  // De checklistvraag als context voor de AI. Normtekst uit de bibliotheek,
  // geen persoonsgegeven. Mislukt dit, dan gaat de analyse gewoon zonder door.
  const { data: bevinding } = await supabase
    .from('inspectie_bevinding')
    .select('punt_tekst_snap')
    .eq('id', foto.bevinding_id)
    .maybeSingle()

  // Kortlevende signed URL (60s — hij wordt hiernaast meteen gebruikt) en de
  // bytes hier op de server ophalen. De URL zelf gaat NIET naar de leverancier:
  // dan zou een derde de foto kunnen herhalen en stond er een werkende link in
  // diens logs.
  const service = createServiceClient()
  const { data: signed, error: signErr } = await service.storage
    .from(INSPECTIE_FOTO_BUCKET)
    .createSignedUrl(foto.storage_pad, 60)
  if (signErr || !signed?.signedUrl) {
    console.error('[ai-analyse] signed URL mislukt:', signErr?.message ?? 'onbekend')
    return fout('Deze foto kon niet worden opgehaald.', 502)
  }

  let bytes: Uint8Array
  try {
    const opgehaald = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(20_000) })
    if (!opgehaald.ok) throw new Error(`storage HTTP ${opgehaald.status}`)
    bytes = new Uint8Array(await opgehaald.arrayBuffer())
  } catch (e) {
    console.error('[ai-analyse] foto ophalen mislukt:', e instanceof Error ? e.message : String(e))
    return fout('Deze foto kon niet worden opgehaald.', 502)
  }

  if (bytes.byteLength === 0) return fout('Deze foto is leeg.', 400)
  if (bytes.byteLength > AI_MAX_FOTO_BYTES) {
    return fout('Deze foto is te groot voor AI-analyse.', 413)
  }

  let uitkomst
  try {
    uitkomst = await leverancier.analyseerFoto({
      afbeelding: bytes,
      mimeType,
      puntTekst: (bevinding?.punt_tekst_snap as string | null) ?? null,
    })
  } catch (e) {
    // AiStoring draagt een bericht dat de gebruiker mag zien; het technische
    // detail blijft in het serverlog. Alle andere fouten worden generiek.
    if (e instanceof AiStoring) {
      console.error('[ai-analyse] leverancier:', e.message)
      return fout(e.gebruikersbericht, 502)
    }
    console.error('[ai-analyse] onverwachte fout:', e instanceof Error ? e.message : String(e))
    return fout('De AI-analyse is niet gelukt.', 502)
  }

  // Opslaan als CONCEPT, via de SESSIE-client zodat de guard in de RPC op de
  // échte gebruiker slaat (en auth.uid() klopt in de vastlegging). Niet via de
  // service role: die zou RLS omzeilen en auth.uid() leeg laten.
  const { data: suggestieId, error: opslaanErr } = await supabase.rpc('inspectie_ai_suggestie_opslaan', {
    p_foto_id: foto.id,
    p_beschrijving: uitkomst.beschrijving,
    p_concept: uitkomst.conceptBevinding,
    p_leverancier: leverancier.naam,
    p_model: leverancier.model,
    p_toestemming: true,
  })
  if (opslaanErr || !suggestieId) {
    console.error('[ai-analyse] opslaan mislukt:', opslaanErr?.message ?? 'geen id terug')
    return fout('Het AI-concept kon niet worden opgeslagen.', 502)
  }

  return NextResponse.json({
    suggestie: {
      id: String(suggestieId),
      bevinding_id: String(foto.bevinding_id),
      foto_id: String(foto.id),
      beschrijving: uitkomst.beschrijving || null,
      concept: uitkomst.conceptBevinding || null,
      leverancier: leverancier.naam,
      model: leverancier.model,
      status: 'concept' as const,
    },
  })
}
