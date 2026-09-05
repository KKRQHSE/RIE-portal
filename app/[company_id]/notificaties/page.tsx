import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import NotificatiesClient from '@/components/NotificatiesClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { Notificatie, NotificatieVoorkeur } from '@/lib/types'

// Iedereen die in dit bedrijf werkt (KAM/admin/teamleider) beheert hier zijn
// eigen voorkeuren en ziet zijn eigen meldingen -- de RPC's filteren zelf al
// op auth.uid() + mag_bedrijf_werken.
export default async function NotificatiesPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: company }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
  const magWerken = magBeheren || (profile.role === 'teamleider' && profile.company_id === company_id)
  if (!magWerken) notFound()
  if (!company) notFound()

  const [{ data: meldingen }, { data: voorkeuren }] = await Promise.all([
    supabase.rpc('notificaties_ophalen', { p_company_id: company_id }),
    supabase.rpc('notificatie_voorkeuren_ophalen'),
  ])

  return (
    <NotificatiesClient
      company={company}
      initialMeldingen={(meldingen ?? []) as Notificatie[]}
      initialVoorkeuren={(voorkeuren ?? []) as NotificatieVoorkeur[]}
      huisstijl={huisstijl}
    />
  )
}
