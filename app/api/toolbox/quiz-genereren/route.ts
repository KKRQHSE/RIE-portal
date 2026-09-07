import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AI_NIET_GECONFIGUREERD, AI_QUIZ_AANTAL_VOORSTEL } from '@/lib/ai-analyse'
import { AiStoring, kiesLeverancier, leverancierStatus } from '@/lib/ai/leverancier'
import { rateLimietToegestaan } from '@/lib/rate-limit'
import type { ToolboxOverzichtItem } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ============================================================================
// AI-QUIZ per toolbox (migratie 0079) — de organisator (KAM/admin) laat op
// basis van de toolbox-inhoud + relevante bronnen uit de onderwerpen-
// bibliotheek conceptvragen genereren. Niets wordt hier opgeslagen: dit is
// een ÉÉNMALIG voorstel per aanroep, dat de organisator zelf beoordeelt en
// pas via de RPC toolbox_quiz_opslaan definitief maakt (minimaal 3 vragen).
//
// Zelfde AVG-volgorde als app/api/toolbox/onderwerp-advies:
//   1. ingelogd?                     — anders 401
//   2. toestemming expliciet true?   — anders 400
//   3. organisator (KAM/admin) van dit bedrijf? — mag_bedrijf_beheren, dus
//      strenger dan mag_bedrijf_werken (geen teamleider): dit gaat over
//      toolbox-inhoud beheren, niet over uitvoeren.
//   4. leverancier geconfigureerd?   — anders 503 met code niet_geconfigureerd
//   5. pas dan naar de AI — en dan met de EFFECTIEVE toolbox-tekst die de
//      server zelf ophaalt (bedrijf_toolbox_overzicht), nooit met tekst die
//      de client meestuurt. Puur veiligheidsonderwerp uit standaardbronnen,
//      geen persoonsgegevens.
// ============================================================================

const MAX_BRONNEN_VOOR_PROMPT = 3

function fout(bericht: string, status: number, code?: string) {
  return NextResponse.json(code ? { fout: bericht, code } : { fout: bericht }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)
  return NextResponse.json(leverancierStatus())
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { companyId, toolboxId, aantal, uitsluiten, toestemming } = (body ?? {}) as Record<string, unknown>
  if (typeof companyId !== 'string' || !companyId) return fout('Ongeldige invoer.', 400)
  if (typeof toolboxId !== 'string' || !toolboxId) return fout('Ongeldige invoer.', 400)
  const aantalGevraagd = typeof aantal === 'number' && Number.isInteger(aantal) ? aantal : AI_QUIZ_AANTAL_VOORSTEL
  const aantalVeilig = Math.min(Math.max(aantalGevraagd, 1), AI_QUIZ_AANTAL_VOORSTEL)
  const uitsluitenLijst = Array.isArray(uitsluiten)
    ? uitsluiten.filter((t): t is string => typeof t === 'string').slice(0, 40).map(t => t.slice(0, 300))
    : []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // De opt-in moet er letterlijk zijn. Geen 'truthy', geen standaardwaarde.
  if (toestemming !== true) {
    return fout('Zonder toestemming gaat de toolbox-inhoud niet naar een AI-dienst.', 400)
  }

  // Organisator = KAM/admin, dus mag_bedrijf_beheren (strenger dan de
  // mag_bedrijf_werken die toolbox_suggesties/onderwerp-advies gebruiken —
  // een teamleider voert toolboxen uit, maar beheert de inhoud niet).
  const { data: magBeheren, error: guardErr } = await supabase.rpc('mag_bedrijf_beheren', { p_company_id: companyId })
  if (guardErr || magBeheren !== true) return fout('Geen toegang tot dit bedrijf.', 403)

  const magGenereren = await rateLimietToegestaan(supabase, `user:${user.id}`, 'toolbox_quiz_genereren', 20, 3600)
  if (!magGenereren) return fout('Te veel AI-quizzen binnen een uur, probeer het straks opnieuw.', 429)

  // Effectieve toolbox-inhoud + koppeling verifiëren via dezelfde RPC als de
  // toolboxpagina zelf — nooit tekst vertrouwen die de client meestuurt.
  const { data: overzicht, error: overzichtErr } = await supabase.rpc('bedrijf_toolbox_overzicht', { p_company_id: companyId })
  if (overzichtErr) {
    console.error('[quiz-genereren] bedrijf_toolbox_overzicht:', overzichtErr.message)
    return fout('Kon de toolbox-inhoud niet ophalen.', 500)
  }
  const item = ((overzicht ?? []) as ToolboxOverzichtItem[]).find(t => t.toolbox_id === toolboxId)
  if (!item || !item.gekoppeld) return fout('Deze toolbox is niet aan dit bedrijf gekoppeld.', 404)

  const [{ data: onderwerpen }, { data: bronnenRuw }] = await Promise.all([
    supabase.from('toolbox_onderwerp').select('trefwoorden'),
    supabase.from('toolbox_bron').select('naam, omschrijving').is('gearchiveerd_op', null),
  ])
  const bronnen = vindRelevanteBronnen(
    `${item.geldende_titel} ${item.geldende_tekst}`,
    (onderwerpen ?? []) as { trefwoorden: string[] }[],
    (bronnenRuw ?? []) as { naam: string; omschrijving: string | null }[],
  )

  const leverancier = kiesLeverancier()
  if (!leverancier || !leverancier.sleutelAanwezig) {
    return fout('AI-quiz is nog niet geconfigureerd.', 503, AI_NIET_GECONFIGUREERD)
  }

  let voorstellen
  try {
    voorstellen = await leverancier.genereerToolboxQuiz({
      toolboxTitel: item.geldende_titel.slice(0, 200),
      toolboxTekst: item.geldende_tekst.slice(0, 4000),
      bronnen,
      aantal: aantalVeilig,
      uitsluitenTeksten: uitsluitenLijst,
    })
  } catch (e) {
    if (e instanceof AiStoring) {
      console.error('[quiz-genereren] leverancier:', e.message)
      return fout(e.gebruikersbericht, 502)
    }
    console.error('[quiz-genereren] onverwachte fout:', e instanceof Error ? e.message : String(e))
    return fout('Het genereren van de quiz is niet gelukt.', 502)
  }

  return NextResponse.json({
    vragen: voorstellen.map(v => ({
      vraagtekst: v.vraagtekst, opties: v.opties, juist_antwoord: v.juistAntwoord, uitleg: v.uitleg,
    })),
    leverancier: leverancier.naam,
    model: leverancier.model,
  })
}

// Zelfde trefwoord-matching als toolbox_suggesties (migratie 0077), maar in de
// andere richting: hier is de toolbox al bekend, en zoeken we welke bronnen
// uit de bibliotheek erbij passen — puur als "waar meer te lezen is"-context
// voor de AI, nooit als inhoud die zelf wordt opgehaald.
function vindRelevanteBronnen(
  toolboxTekst: string,
  onderwerpen: { trefwoorden: string[] }[],
  bronnen: { naam: string; omschrijving: string | null }[],
): { naam: string; omschrijving: string | null }[] {
  const t = toolboxTekst.toLowerCase()
  const matchendeTrefwoorden = new Set<string>()
  for (const o of onderwerpen) {
    for (const kw of o.trefwoorden ?? []) {
      const kwl = kw.toLowerCase().trim()
      if (kwl && t.includes(kwl)) matchendeTrefwoorden.add(kwl)
    }
  }
  if (matchendeTrefwoorden.size === 0) return []
  return bronnen
    .filter(b => {
      const naam = b.naam.toLowerCase()
      const oms = (b.omschrijving ?? '').toLowerCase()
      for (const kw of matchendeTrefwoorden) {
        if (naam.includes(kw) || oms.includes(kw)) return true
      }
      return false
    })
    .slice(0, MAX_BRONNEN_VOOR_PROMPT)
}
