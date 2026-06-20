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

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar.
  const [
    { data: profile },
    { data: company },
    { data: modules },
    { data: vragen },
    { data: fotos },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase
      .from('companies')
      .select('id, name, approved_at, approved_by')
      .eq('id', company_id)
      .single(),
    supabase
      .from('modules')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('vragen')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('fotos')
      .select('*')
      .eq('company_id', company_id)
      .is('archived_at', null)
      .order('nr', { ascending: true }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()

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
