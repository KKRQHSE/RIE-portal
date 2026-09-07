import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MeerjarenClient from '@/components/MeerjarenClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { MeerjarenRegel, Locatie } from '@/lib/types'

export default async function MeerjarenPage({
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
    { data: company },
    { data: jaren, error },
    { data: locaties },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name, oefenomgeving').eq('id', company_id).single(),
    supabase.rpc('dashboard_meerjaren', { p_company_id: company_id }),
    // Optionele locaties (migratie 0080); leeg bij een bedrijf zonder locaties.
    supabase
      .from('locatie')
      .select('id, company_id, naam, volgorde, gearchiveerd_op')
      .eq('company_id', company_id)
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    haalHuisstijl(company_id),
  ])

  // Zelfde toegangsniveau als bedrijfsvoering/IF-getal: KAM (client) van dit
  // bedrijf of admin -- geen teamleider, geen ander bedrijf.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()
  // Meerjarenoverzicht is een RI&E/PvA/incidenten/audit-trend — bestaat niet
  // zonder die modules (oefenomgeving).
  if (company.oefenomgeving) notFound()
  if (error) notFound()

  return (
    <MeerjarenClient
      companyId={company_id}
      companyNaam={company.name}
      huisstijl={huisstijl}
      jaren={(jaren ?? []) as MeerjarenRegel[]}
      locaties={(locaties ?? []) as Locatie[]}
    />
  )
}
