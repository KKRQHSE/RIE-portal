import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AI_NIET_GECONFIGUREERD } from '@/lib/ai-analyse'
import { AiStoring, kiesLeverancier, leverancierStatus } from '@/lib/ai/leverancier'
import { rateLimietToegestaan } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ============================================================================
// AI-AANVULLING op de toolbox-suggesties (migratie 0077) — uitsluitend voor
// een onderwerp waar de trefwoord-matching (toolbox_suggesties) GEEN eigen
// toolbox en GEEN bibliotheekbron voor vond. Geen foto, geen bevinding: puur
// een korte duiding + naar welke externe bronnen te kijken. De AI verzint hier
// NOOIT toolbox-inhoud — dat wordt in de prompt zelf afgedwongen
// (lib/ai/prompt.ts).
//
// Zelfde AVG-volgorde als app/api/inspectie/ai-analyse, en dezelfde reden
// waarom die volgorde zo is: zonder toestemming of zonder sleutel gaat er
// niets naar de leverancier.
//   1. ingelogd?                     — anders 401
//   2. toestemming expliciet true?   — anders 400
//   3. toegang tot dit bedrijf?      — via dezelfde guard-RPC als de
//      suggesties zelf (mag_bedrijf_werken), zodat er geen aparte
//      autorisatielogica in TypeScript hoeft te staan die uit de pas kan lopen
//      met de RPC.
//   4. leverancier geconfigureerd?   — anders 503 met code niet_geconfigureerd
//   5. pas dan naar de AI — alleen onderwerp + redenen (geen bedrijfsnaam,
//      geen personen).
// Niets wordt opgeslagen: dit is een ÉÉNMALIG voorstel, ephemeer, dat de
// uitvoerder zelf beoordeelt. Geen RPC nodig om het weg te schrijven.
// ============================================================================

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

  const { companyId, onderwerp, redenen, toestemming } = (body ?? {}) as Record<string, unknown>
  if (typeof companyId !== 'string' || !companyId) return fout('Ongeldige invoer.', 400)
  if (typeof onderwerp !== 'string' || !onderwerp.trim()) return fout('Ongeldige invoer.', 400)
  const redenenLijst = Array.isArray(redenen)
    ? redenen.filter((r): r is string => typeof r === 'string').slice(0, 10).map(r => r.slice(0, 300))
    : []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  // De opt-in moet er letterlijk zijn. Geen 'truthy', geen standaardwaarde.
  if (toestemming !== true) {
    return fout('Zonder toestemming gaat dit onderwerp niet naar een AI-dienst.', 400)
  }

  // Zelfde guard als toolbox_suggesties: alleen wie in dit bedrijf mag werken
  // (KAM/admin/teamleider van het EIGEN bedrijf) mag hier een advies opvragen.
  const { data: magWerken, error: guardErr } = await supabase.rpc('mag_bedrijf_werken', { p_company_id: companyId })
  if (guardErr || magWerken !== true) return fout('Geen toegang tot dit bedrijf.', 403)

  // Elke aanroep kost geld bij een externe AI-dienst — rate limit per
  // gebruiker vóórdat er iets naar de leverancier gaat. 20 per uur is ruim
  // voor de handvol "geen match"-onderwerpen die één sessie kan opleveren.
  const magAdviseren = await rateLimietToegestaan(supabase, `user:${user.id}`, 'toolbox_onderwerp_advies', 20, 3600)
  if (!magAdviseren) return fout('Te veel AI-adviezen binnen een uur, probeer het straks opnieuw.', 429)

  const leverancier = kiesLeverancier()
  if (!leverancier || !leverancier.sleutelAanwezig) {
    return fout('AI-advies is nog niet geconfigureerd.', 503, AI_NIET_GECONFIGUREERD)
  }

  let uitkomst
  try {
    uitkomst = await leverancier.adviseerOnderwerp({
      onderwerpNaam: onderwerp.trim().slice(0, 200),
      redenen: redenenLijst,
    })
  } catch (e) {
    if (e instanceof AiStoring) {
      console.error('[onderwerp-advies] leverancier:', e.message)
      return fout(e.gebruikersbericht, 502)
    }
    console.error('[onderwerp-advies] onverwachte fout:', e instanceof Error ? e.message : String(e))
    return fout('Het AI-advies is niet gelukt.', 502)
  }

  return NextResponse.json({
    advies: uitkomst.advies || null,
    bronnen_suggestie: uitkomst.bronnenSuggestie,
    leverancier: leverancier.naam,
    model: leverancier.model,
  })
}
