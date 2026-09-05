import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import GoedkeuringenClient from '@/components/GoedkeuringenClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { Goedkeuringsverzoek } from '@/lib/types'

// KAM/admin-only: alleen zij keuren goed/af (zelfde grens als mag_bedrijf_beheren
// in de RPC's zelf).
export default async function GoedkeuringenPage({
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
  const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()

  const { data: verzoeken } = await supabase.rpc('goedkeuringsverzoek_overzicht', { p_company_id: company_id })

  return (
    <GoedkeuringenClient
      company={company}
      initialVerzoeken={(verzoeken ?? []) as Goedkeuringsverzoek[]}
      huisstijl={huisstijl}
    />
  )
}
