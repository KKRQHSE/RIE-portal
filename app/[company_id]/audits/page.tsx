import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AuditsClient from '@/components/AuditsClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { Audit } from '@/lib/types'

export default async function AuditsPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: company }, { data: audits }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
    supabase.from('audit').select('*').eq('company_id', company_id).order('jaar', { ascending: false }).order('titel'),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()

  return (
    <AuditsClient
      company={company}
      companyId={company_id}
      huisstijl={huisstijl}
      initialAudits={(audits ?? []) as Audit[]}
    />
  )
}
