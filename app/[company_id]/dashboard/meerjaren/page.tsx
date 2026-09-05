import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MeerjarenClient from '@/components/MeerjarenClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { MeerjarenRegel, DashboardInstelling } from '@/lib/types'

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
    { data: instelling },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name').eq('id', company_id).single(),
    supabase.rpc('dashboard_meerjaren', { p_company_id: company_id }),
    supabase.from('bedrijf_dashboard_instelling').select('doelstelling_tekst').eq('company_id', company_id).maybeSingle(),
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
  if (error) notFound()

  return (
    <MeerjarenClient
      companyId={company_id}
      companyNaam={company.name}
      huisstijl={huisstijl}
      jaren={(jaren ?? []) as MeerjarenRegel[]}
      doelstellingTekst={(instelling as Pick<DashboardInstelling, 'doelstelling_tekst'> | null)?.doelstelling_tekst ?? null}
    />
  )
}
