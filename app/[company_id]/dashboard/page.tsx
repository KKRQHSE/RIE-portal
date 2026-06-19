import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DashboardClient from '@/components/DashboardClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardOverzicht } from '@/lib/types'

export default async function CompanyDashboardPage({
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

  // Het dashboard is een beheeroverzicht: admin overal, KAM (client) voor eigen bedrijf.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, approved_at, approved_by')
    .eq('id', company_id)
    .single()
  if (!company) notFound()

  // Alle tegelcijfers in één round-trip; autorisatie zit in de RPC zelf.
  const { data: overzicht, error } = await supabase.rpc('dashboard_overzicht', {
    p_company_id: company_id,
  })
  if (error || !overzicht) notFound()

  // Inspectiemodule alleen tonen als die aanstaat (zelfde gating als de PvA-pagina).
  const { data: inspectieModule } = await supabase
    .from('bedrijf_modules')
    .select('actief')
    .eq('company_id', company_id)
    .eq('module', 'inspectie')
    .eq('actief', true)
    .maybeSingle()

  const huisstijl = await haalHuisstijl(company_id)

  return (
    <DashboardClient
      company={company}
      overzicht={overzicht as DashboardOverzicht}
      huisstijl={huisstijl}
      toonInspecties={!!inspectieModule}
    />
  )
}
