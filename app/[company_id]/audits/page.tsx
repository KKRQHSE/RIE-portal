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

  const [{ data: profile }, { data: moduleRij }, { data: company }, { data: audits }, huisstijl] =
    await Promise.all([
      supabase.from('users').select('role, company_id').eq('id', user.id).single(),
      // De module moet actief zijn én op 'aan' staan voor dit bedrijf.
      supabase
        .from('bedrijf_modules')
        .select('actief')
        .eq('company_id', company_id)
        .eq('module', 'audit')
        .eq('module_status', 'actief')
        .eq('actief', true)
        .maybeSingle(),
      supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
      supabase.from('audit').select('*').eq('company_id', company_id).order('jaar', { ascending: false }).order('titel'),
      haalHuisstijl(company_id),
    ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  // Audits blijven volledig dicht voor teamleider (ook al is bedrijf_modules
  // inmiddels leesbaar voor hem — dat is alleen voor de navigatie/module-check
  // elders). Zonder deze regel zou hij een lege lijst zien in plaats van geen
  // toegang: de audit-tabel zelf is en blijft dicht (mag_bedrijf_beheren).
  if (profile.role === 'teamleider') notFound()
  // Module uit of gestopt: de audits bestaan nog, maar zijn niet bereikbaar.
  if (!moduleRij) notFound()
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
