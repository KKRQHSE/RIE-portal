import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InspectieClient from '@/components/InspectieClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type {
  InspectieSjabloonPunt,
  SjabloonMetPunten,
  BibliotheekRegel,
} from '@/lib/types'

export default async function InspectiesPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar; de punten hangen aan de
  // sjablonen en volgen daarna.
  const [
    { data: profile },
    { data: moduleRij },
    { data: company },
    { data: sjablonen },
    { data: regels },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    // De module moet actief zijn én op 'aan' staan voor dit bedrijf.
    supabase
      .from('bedrijf_modules')
      .select('actief')
      .eq('company_id', company_id)
      .eq('module', 'inspectie')
      .eq('module_status', 'actief')
      .eq('actief', true)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('id, name, approved_at, approved_by')
      .eq('id', company_id)
      .single(),
    // Actieve sjablonen (niet gearchiveerd).
    supabase
      .from('inspectie_sjabloon')
      .select('id, company_id, naam, controlesoort, actief, gearchiveerd_op')
      .eq('company_id', company_id)
      .is('gearchiveerd_op', null)
      .order('naam', { ascending: true }),
    // De rapporten-bibliotheek: één samenvattingsregel per inspectie (alle
    // statussen), nieuwste eerst, met de cijfers en de uitvoerder. Autorisatie
    // zit in de RPC zelf.
    supabase.rpc('inspectie_bibliotheek', { p_company_id: company_id }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  // Klant mag alleen eigen bedrijf; admin alles.
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!moduleRij) notFound()
  if (!company) notFound()

  const sjabloonIds = (sjablonen ?? []).map(s => s.id)
  const { data: punten } = sjabloonIds.length
    ? await supabase
        .from('inspectie_sjabloon_punt')
        .select('id, company_id, sjabloon_id, volgorde, tekst, verplicht')
        .in('sjabloon_id', sjabloonIds)
        .order('volgorde', { ascending: true })
    : { data: [] as InspectieSjabloonPunt[] }

  const sjablonenMetPunten: SjabloonMetPunten[] = (sjablonen ?? []).map(s => ({
    ...s,
    punten: (punten ?? []).filter(p => p.sjabloon_id === s.id),
  }))

  return (
    <InspectieClient
      company={company}
      huisstijl={huisstijl}
      initialSjablonen={sjablonenMetPunten}
      initialRegels={(regels ?? []) as BibliotheekRegel[]}
    />
  )
}
