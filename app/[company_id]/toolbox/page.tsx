import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ToolboxClient from '@/components/ToolboxClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { ToolboxOverzichtItem, ToolboxSessiesOverzicht, ToolboxBron, ToolboxSuggestie, BedrijfToolboxQuizVraag, Locatie } from '@/lib/types'

export default async function ToolboxPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: moduleRij },
    { data: company },
    { data: overzicht },
    { data: sessies },
    { data: bronnen },
    { data: suggesties },
    { data: quizzes },
    { data: locaties },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('bedrijf_modules').select('actief')
      .eq('company_id', company_id).eq('module', 'toolbox')
      .eq('module_status', 'actief').eq('actief', true).maybeSingle(),
    supabase.from('companies').select('id, name, approved_at, approved_by, oefenomgeving').eq('id', company_id).single(),
    supabase.rpc('bedrijf_toolbox_overzicht', { p_company_id: company_id }),
    supabase.rpc('toolbox_sessies_overzicht', { p_company_id: company_id }),
    // Onderwerpenbibliotheek: centraal, alleen de niet-gearchiveerde bronnen.
    supabase.from('toolbox_bron')
      .select('id, naam, url, omschrijving, volgorde, gearchiveerd_op')
      .is('gearchiveerd_op', null).order('volgorde', { ascending: true }),
    // "Aanbevolen deze periode" (0077): trefwoord-matching uit RI&E/inspectie/
    // incident, alleen een voorstel — de RPC beslist niets, de pagina toont
    // het bovenaan het maandoverzicht.
    supabase.rpc('toolbox_suggesties', { p_company_id: company_id }),
    // Al opgeslagen AI-quizvragen per toolbox (0079) — alleen relevant voor de
    // organisator-tab, RLS geeft toch alleen iets terug bij mag_bedrijf_werken.
    supabase.from('bedrijf_toolbox_quiz')
      .select('id, company_id, toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde, aangemaakt_op')
      .eq('company_id', company_id),
    // Optionele locaties (migratie 0080); leeg bij een bedrijf zonder locaties.
    supabase
      .from('locatie')
      .select('id, company_id, naam, volgorde, gearchiveerd_op')
      .eq('company_id', company_id)
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
  const magWerken = magBeheren || (profile.role === 'teamleider' && profile.company_id === company_id)
  if (!magWerken) notFound()
  if (!moduleRij) notFound()
  if (!company) notFound()

  // Bug: er stond geen expliciete terug-link in deze module zelf -- alleen de
  // sticky CompanyTopBar bood een weg terug, en die kan op een lang scherm
  // (12 maanden aan sessies) buiten beeld scrollen. Zelfde bestemming als de
  // company-naam in CompanyTopBar (homeHref daar): dashboard voor wie mag
  // beheren, anders /pva (teamleider heeft geen dashboard-toegang, dus geen
  // "dashboard" in het label voor die rol) -- of /actielijst in een
  // oefenomgeving, waar /pva niet bestaat (zie migratie 0078).
  const terugHref = magBeheren
    ? `/${company_id}/dashboard`
    : `/${company_id}/${company.oefenomgeving ? 'actielijst' : 'pva'}`
  const terugLabel = magBeheren ? 'Terug naar dashboard' : 'Terug naar overzicht'

  return (
    <ToolboxClient
      company={company}
      huisstijl={huisstijl}
      initialOverzicht={(overzicht ?? []) as ToolboxOverzichtItem[]}
      sessies={sessies as ToolboxSessiesOverzicht | null}
      isAdmin={profile.role === 'admin'}
      magSessiesBeheren={magBeheren}
      huidigeGebruikerId={user.id}
      bronnen={(bronnen ?? []) as ToolboxBron[]}
      suggesties={(suggesties ?? []) as ToolboxSuggestie[]}
      initialQuizzes={(quizzes ?? []) as BedrijfToolboxQuizVraag[]}
      terugHref={terugHref}
      terugLabel={terugLabel}
      locaties={(locaties ?? []) as Locatie[]}
    />
  )
}
