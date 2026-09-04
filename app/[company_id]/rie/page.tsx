import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RieClient from '@/components/RieClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardOverzicht } from '@/lib/types'
import type { PvaRieVoortgang } from '@/components/DashboardClient'

export default async function RiePage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar. dashboard_overzicht/
  // dashboard_pva_rie zijn dezelfde, al beproefde RPC's als het dashboard —
  // de statuskop verzint geen eigen cijfers, hij hergebruikt ze.
  const [
    { data: profile },
    { data: company },
    { data: modules },
    { data: vragen },
    { data: fotos },
    { data: overzicht },
    { data: pvaRie },
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
    supabase.rpc('dashboard_overzicht', { p_company_id: company_id }),
    supabase.rpc('dashboard_pva_rie', { p_company_id: company_id }),
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
      rie={(overzicht as DashboardOverzicht | null)?.rie ?? null}
      pvaRie={(pvaRie as PvaRieVoortgang | null) ?? null}
      huisstijl={huisstijl}
    />
  )
}
