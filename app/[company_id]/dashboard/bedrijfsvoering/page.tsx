import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BedrijfsvoeringForm from '@/components/BedrijfsvoeringForm'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardInstelling } from '@/lib/types'

export default async function BedrijfsvoeringPage({
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
    { data: instelling },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name').eq('id', company_id).single(),
    // RLS geeft alleen de eigen-bedrijf-rij; null als er nog niets is ingevuld.
    supabase.from('bedrijf_dashboard_instelling').select('*').eq('company_id', company_id).maybeSingle(),
    haalHuisstijl(company_id),
  ])

  // Alleen KAM (client) van dit bedrijf of admin mag de velden bewerken.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()

  return (
    <BedrijfsvoeringForm
      companyId={company_id}
      companyNaam={company.name}
      huisstijl={huisstijl}
      initial={(instelling as DashboardInstelling | null) ?? null}
    />
  )
}
