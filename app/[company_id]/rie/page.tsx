import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RieClient from '@/components/RieClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'

export default async function RiePage({
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

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, approved_at, approved_by')
    .eq('id', company_id)
    .single()
  if (!company) notFound()

  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('company_id', company_id)
    .is('archived_at', null)
    .order('volgorde', { ascending: true })

  const { data: vragen } = await supabase
    .from('vragen')
    .select('*')
    .eq('company_id', company_id)
    .is('archived_at', null)
    .order('volgorde', { ascending: true })

  const { data: fotos } = await supabase
    .from('fotos')
    .select('*')
    .eq('company_id', company_id)
    .is('archived_at', null)
    .order('nr', { ascending: true })

  const huisstijl = await haalHuisstijl(company_id)

  return (
    <RieClient
      company={company}
      modules={modules ?? []}
      vragen={vragen ?? []}
      fotos={fotos ?? []}
      huisstijl={huisstijl}
    />
  )
}
