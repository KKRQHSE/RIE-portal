import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RieClient from '@/components/RieClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardOverzicht, Locatie, RieToetsing } from '@/lib/types'
import type { PvaRieVoortgang } from '@/components/DashboardClient'

export default async function RiePage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar. dashboard_overzicht/
  // dashboard_pva_rie zijn dezelfde, al beproefde RPC's als het dashboard —
  // de statuskop verzint geen eigen cijfers, hij hergebruikt ze.
  const [
    { data: profile },
    { data: company },
    { data: modules },
    { data: vragen },
    { data: fotos },
    { data: locaties },
    { data: overzicht },
    { data: pvaRie },
    { data: toetsing },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase
      .from('companies')
      .select('id, name, approved_at, approved_by, oefenomgeving')
      .eq('id', company_id)
      .single(),
    supabase
      .from('modules')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('vragen')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('fotos')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('nr', { ascending: true }),
    // Optionele locaties, alleen relevant als filter in de inzage hieronder.
    // Bedrijf zonder locaties: lege array, RieClient toont dan geen filterrij.
    supabase
      .from('locatie')
      .select('id, company_id, naam, volgorde, gearchiveerd_op')
      .eq('company_id', company_id)
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    supabase.rpc('dashboard_overzicht', { p_company_id: company_id }),
    supabase.rpc('dashboard_pva_rie', { p_company_id: company_id }),
    // GETOETST-kenmerk (migratie 0087) — los van dashboard_overzicht, dat deze
    // velden (nog) niet kent. Nieuwste versie op basis van versie-nummer.
    supabase
      .from('rie_versies')
      .select('id, versie, toetser_naam, toetser_certificaatnummer, toetser_namens')
      .eq('company_id', company_id)
      .order('versie', { ascending: false })
      .limit(1)
      .maybeSingle(),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()
  // Oefenomgeving heeft geen RI&E-inzage — die pagina bestaat er niet, ook niet via directe link.
  if (company.oefenomgeving) notFound()

  // Toetsverslag-inhoud (migratie 0087) hangt aan de rie_versie hierboven —
  // pas op te halen als die bekend is. Nog geen rij: leesbaar toetsverslag
  // ontbreekt gewoon, de badge (toetsing) kan al wel bestaan.
  const { data: toetsverslag } = toetsing
    ? await supabase
        .from('rie_toetsverslag')
        .select('id, rie_versie_id, managementsamenvatting, toetsbrief, conclusie_volledigheid, conclusie_brongebruik, conclusie_verplichte_aspecten, conclusie_wettelijk_kader, conclusie_actualiteit, conclusie_betrouwbaarheid, conclusie_plan_van_aanpak, conclusie_systeem_scopetoets, eindoordeel')
        .eq('rie_versie_id', toetsing.id)
        .maybeSingle()
    : { data: null }

  return (
    <RieClient
      company={company}
      modules={modules ?? []}
      vragen={vragen ?? []}
      fotos={fotos ?? []}
      locaties={(locaties ?? []) as Locatie[]}
      rie={(overzicht as DashboardOverzicht | null)?.rie ?? null}
      pvaRie={(pvaRie as PvaRieVoortgang | null) ?? null}
      toetsing={toetsing as RieToetsing | null}
      heeftToetsverslag={!!toetsverslag}
      huisstijl={huisstijl}
    />
  )
}
