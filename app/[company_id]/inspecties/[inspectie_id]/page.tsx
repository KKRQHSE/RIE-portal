import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import InspectieRapport from '@/components/InspectieRapport'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { InspectieRapport as InspectieRapportData } from '@/lib/types'

export default async function InspectieRapportPage({
  params,
}: {
  params: Promise<{ company_id: string; inspectie_id: string }>
}) {
  const { company_id, inspectie_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Het rapport in één RPC; autorisatie (mag_bedrijf_beheren) zit in de RPC zelf
  // en leidt het bedrijf server-side af uit de inspectie — cross-company weigert.
  const [
    { data: profile },
    { data: rapport, error },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.rpc('inspectie_rapport', { p_inspectie_id: inspectie_id }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (error || !rapport) notFound()

  const data = rapport as InspectieRapportData
  // De inspectie moet echt bij dit bedrijf in de URL horen (geen vreemde combinatie).
  if (data.company_id !== company_id) notFound()

  return (
    <InspectieRapport companyId={company_id} rapport={data} huisstijl={huisstijl} />
  )
}
