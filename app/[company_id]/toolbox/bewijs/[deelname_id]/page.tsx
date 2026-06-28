import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ToolboxBewijsRapport from '@/components/ToolboxBewijsRapport'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { ToolboxBewijs } from '@/lib/types'

export default async function ToolboxBewijsPage({
  params,
}: {
  params: Promise<{ company_id: string; deelname_id: string }>
}) {
  const { company_id, deelname_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Autorisatie zit in de RPC (mag_bedrijf_beheren, server-side bedrijf afgeleid);
  // we controleren het profiel + de URL-consistentie hier nog defensief.
  const [{ data: profile }, { data: bewijs, error }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.rpc('toolbox_bewijs', { p_deelname_id: deelname_id }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (error || !bewijs) notFound()

  const data = bewijs as ToolboxBewijs
  // De deelname moet echt bij dit bedrijf in de URL horen.
  if (data.company_id !== company_id) notFound()

  return <ToolboxBewijsRapport companyId={company_id} bewijs={data} huisstijl={huisstijl} />
}
