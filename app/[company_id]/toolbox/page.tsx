import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ToolboxClient from '@/components/ToolboxClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { ToolboxOverzichtItem, ToolboxSessiesOverzicht, ToolboxBron } from '@/lib/types'

export default async function ToolboxPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: moduleRij },
    { data: company },
    { data: overzicht },
    { data: sessies },
    { data: bronnen },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('bedrijf_modules').select('actief')
      .eq('company_id', company_id).eq('module', 'toolbox')
      .eq('module_status', 'actief').eq('actief', true).maybeSingle(),
    supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
    supabase.rpc('bedrijf_toolbox_overzicht', { p_company_id: company_id }),
    supabase.rpc('toolbox_sessies_overzicht', { p_company_id: company_id }),
    // Onderwerpenbibliotheek: centraal, alleen de niet-gearchiveerde bronnen.
    supabase.from('toolbox_bron')
      .select('id, naam, url, omschrijving, volgorde, gearchiveerd_op')
      .is('gearchiveerd_op', null).order('volgorde', { ascending: true }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!moduleRij) notFound()
  if (!company) notFound()

  return (
    <ToolboxClient
      company={company}
      huisstijl={huisstijl}
      initialOverzicht={(overzicht ?? []) as ToolboxOverzichtItem[]}
      sessies={sessies as ToolboxSessiesOverzicht | null}
      isAdmin={profile.role === 'admin'}
      bronnen={(bronnen ?? []) as ToolboxBron[]}
    />
  )
}
