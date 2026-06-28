import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ToolboxOverzichtPrint from '@/components/ToolboxOverzichtPrint'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { ToolboxBewijsRegel } from '@/lib/types'

function geldigeDatum(v: string | undefined, fallback: string): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback
}

export default async function ToolboxOverzichtPage({
  params,
  searchParams,
}: {
  params: Promise<{ company_id: string }>
  searchParams: Promise<{ van?: string; tot?: string }>
}) {
  const { company_id } = await params
  const { van: vanRaw, tot: totRaw } = await searchParams
  const jaar = new Date().getFullYear()
  const van = geldigeDatum(vanRaw, `${jaar}-01-01`)
  const tot = geldigeDatum(totRaw, `${jaar}-12-31`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: bedrijf }, { data: regels, error }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('name').eq('id', company_id).single(),
    supabase.rpc('toolbox_bewijs_overzicht', { p_company_id: company_id, p_van: van, p_tot: tot }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (error) notFound()

  return (
    <ToolboxOverzichtPrint
      companyId={company_id}
      bedrijfNaam={bedrijf?.name ?? ''}
      van={van}
      tot={tot}
      regels={(regels ?? []) as ToolboxBewijsRegel[]}
      huisstijl={huisstijl}
    />
  )
}
