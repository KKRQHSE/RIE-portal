import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DashboardClient, { type ToolboxNaarRato } from '@/components/DashboardClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { DashboardOverzicht } from '@/lib/types'

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar: scheelt round-trips naar
  // Supabase. De RPC's dwingen hun eigen autorisatie af; we controleren daarna.
  // Module-gating: alleen tonen bij actieve module én 'aan' (zelfde gating als de PvA-pagina).
  const moduleActief = (module: string) =>
    supabase
      .from('bedrijf_modules')
      .select('actief')
      .eq('company_id', company_id)
      .eq('module', module)
      .eq('module_status', 'actief')
      .eq('actief', true)
      .maybeSingle()

  const [
    { data: profile },
    { data: company },
    { data: overzicht, error },
    { data: inspectieModule },
    { data: toolboxModule },
    { data: incidentenModule },
    { data: toolboxDash },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase
      .from('companies')
      .select('id, name, approved_at, approved_by')
      .eq('id', company_id)
      .single(),
    // Alle tegelcijfers in één RPC; autorisatie zit in de RPC zelf.
    supabase.rpc('dashboard_overzicht', { p_company_id: company_id }),
    moduleActief('inspectie'),
    moduleActief('toolbox'),
    moduleActief('incidenten'),
    // Toolbox naar-rato (doel-per-persoon) hergebruikt de al-geteste toolbox_dashboard-RPC.
    supabase.rpc('toolbox_dashboard', { p_company_id: company_id }),
    haalHuisstijl(company_id),
  ])

  // Het dashboard is een beheeroverzicht: admin overal, KAM (client) voor eigen bedrijf.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()
  if (error || !overzicht) notFound()

  // Toolbox naar-rato: alleen het bedrijfstotaal uit toolbox_dashboard().bedrijf.
  const toolboxBedrijf =
    (toolboxDash as { bedrijf?: ToolboxNaarRato } | null)?.bedrijf ?? null

  return (
    <DashboardClient
      company={company}
      overzicht={overzicht as DashboardOverzicht}
      huisstijl={huisstijl}
      toonInspecties={!!inspectieModule}
      toonToolbox={!!toolboxModule}
      toonIncidenten={!!incidentenModule}
      toolbox={toolboxBedrijf}
      magBewerken={magBeheren}
    />
  )
}
