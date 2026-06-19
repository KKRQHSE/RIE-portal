import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InspectieClient from '@/components/InspectieClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type {
  InspectieSjabloonPunt,
  SjabloonMetPunten,
  Inspectie,
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

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  // Klant mag alleen eigen bedrijf; admin alles.
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()

  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()

  // De module moet aanstaan voor dit bedrijf.
  const { data: moduleRij } = await supabase
    .from('bedrijf_modules')
    .select('actief')
    .eq('company_id', company_id)
    .eq('module', 'inspectie')
    .eq('actief', true)
    .maybeSingle()
  if (!moduleRij) notFound()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, approved_at, approved_by')
    .eq('id', company_id)
    .single()
  if (!company) notFound()

  // Actieve sjablonen (niet gearchiveerd) + hun punten, in één keer.
  const { data: sjablonen } = await supabase
    .from('inspectie_sjabloon')
    .select('id, company_id, naam, controlesoort, actief, gearchiveerd_op')
    .eq('company_id', company_id)
    .is('gearchiveerd_op', null)
    .order('naam', { ascending: true })

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

  // Recente inspecties (alle statussen) voor het overzicht.
  const { data: inspecties } = await supabase
    .from('inspectie')
    .select('id, company_id, sjabloon_id, persoon_id, status, gepland_op, uitgevoerd_op, conclusie, sjabloon_naam_snap, controlesoort_snap')
    .eq('company_id', company_id)
    .order('uitgevoerd_op', { ascending: false, nullsFirst: true })
    .limit(50)

  const huisstijl = await haalHuisstijl(company_id)

  return (
    <InspectieClient
      company={company}
      huisstijl={huisstijl}
      initialSjablonen={sjablonenMetPunten}
      initialInspecties={(inspecties ?? []) as Inspectie[]}
    />
  )
}
