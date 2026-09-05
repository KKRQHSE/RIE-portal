import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MedewerkerToevoegenClient from '@/components/MedewerkerToevoegenClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'

// Alleen de teamleider maakt concept-medewerkers aan (zelfde grens als de
// RPC's zelf: is_teamleider() + mag_bedrijf_werken). KAM/admin beheert
// personen al rechtstreeks via /personen en heeft deze route niet nodig.
export default async function MedewerkerToevoegenPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: company }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  const isTeamleider = profile.role === 'teamleider' && profile.company_id === company_id
  if (!isTeamleider) notFound()
  if (!company) notFound()

  return <MedewerkerToevoegenClient company={company} huisstijl={huisstijl} />
}
