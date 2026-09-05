import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BedrijfsvoeringForm from '@/components/BedrijfsvoeringForm'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardInstelling } from '@/lib/types'

export default async function BedrijfsvoeringPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const huidigJaar = new Date().getFullYear()

  const [
    { data: profile },
    { data: company },
    { data: instelling },
    { data: urenRijen },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name').eq('id', company_id).single(),
    // RLS geeft alleen de eigen-bedrijf-rij; null als er nog niets is ingevuld.
    supabase.from('bedrijf_dashboard_instelling').select('*').eq('company_id', company_id).maybeSingle(),
    // Gewerkte uren (urenbasis IF-getal, migratie 0073) — dit jaar + vorig jaar.
    supabase.from('bedrijf_gewerkte_uren').select('jaar, uren')
      .eq('company_id', company_id).in('jaar', [huidigJaar, huidigJaar - 1]),
    haalHuisstijl(company_id),
  ])

  // Alleen KAM (client) van dit bedrijf of admin mag de velden bewerken.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()

  const uren = (urenRijen ?? []) as { jaar: number; uren: number | null }[]
  const urenVoorJaar = (jaar: number) => uren.find(u => u.jaar === jaar)?.uren ?? null

  return (
    <BedrijfsvoeringForm
      companyId={company_id}
      companyNaam={company.name}
      huisstijl={huisstijl}
      initial={(instelling as DashboardInstelling | null) ?? null}
      huidigJaar={huidigJaar}
      initialUrenDitJaar={urenVoorJaar(huidigJaar)}
      initialUrenVorigJaar={urenVoorJaar(huidigJaar - 1)}
    />
  )
}
