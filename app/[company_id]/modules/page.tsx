import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ModuleBeheer from '@/components/ModuleBeheer'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { BedrijfModule } from '@/lib/types'

export default async function ModulesPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: company }, { data: modules }, huisstijl] =
    await Promise.all([
      supabase.from('users').select('role, company_id').eq('id', user.id).single(),
      supabase
        .from('companies')
        .select('id, name, approved_at, approved_by')
        .eq('id', company_id)
        .single(),
      // Alle abonnementsrijen van dit bedrijf. RLS (mag_bedrijf_beheren) zorgt dat
      // alleen de beheerder iets terugkrijgt; de UI gate hieronder is de tweede gordel.
      supabase
        .from('bedrijf_modules')
        .select('company_id, module, actief, abonnement_status, geactiveerd_op, opgezegd_op')
        .eq('company_id', company_id),
      haalHuisstijl(company_id),
    ])

  if (!profile) redirect('/login')
  // Alleen wie het bedrijf mag beheren komt op het modulebeheerscherm.
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()

  return (
    <ModuleBeheer
      company={company}
      initialModules={(modules ?? []) as BedrijfModule[]}
      huisstijl={huisstijl}
    />
  )
}
