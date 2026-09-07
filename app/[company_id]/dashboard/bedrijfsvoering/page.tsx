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
    { data: jaardoelstelling },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('companies').select('id, name, oefenomgeving').eq('id', company_id).single(),
    // RLS geeft alleen de eigen-bedrijf-rij; null als er nog niets is ingevuld.
    supabase.from('bedrijf_dashboard_instelling').select('*').eq('company_id', company_id).maybeSingle(),
    // Gewerkte uren (urenbasis IF-getal, migratie 0073) — ALLE jaren, niet
    // alleen dit/vorig jaar (migratie 0076: elk jaar los invulbaar/bewerkbaar).
    supabase.from('bedrijf_gewerkte_uren').select('jaar, uren')
      .eq('company_id', company_id).order('jaar', { ascending: false }),
    // Doelstelling van dit jaar (migratie 0076, bedrijf_jaardoelstelling).
    supabase.from('bedrijf_jaardoelstelling').select('tekst')
      .eq('company_id', company_id).eq('jaar', huidigJaar).maybeSingle(),
    haalHuisstijl(company_id),
  ])

  // Alleen KAM (client) van dit bedrijf of admin mag de velden bewerken.
  if (!profile) redirect('/login')
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!company) notFound()
  // Oefenomgeving heeft geen bedrijfsvoering (gewerkte uren/IF-getal/doelstelling
  // horen bij incidenten/RI&E, die hier niet bestaan).
  if (company.oefenomgeving) notFound()

  const uren = (urenRijen ?? []) as { jaar: number; uren: number | null }[]

  // Doelstelling van dit jaar; ontbreekt die nog, val terug op de oude
  // (nooit-per-jaar-opgeslagen) vrije tekst zodat bestaande klanten hun
  // huidige tekst gewoon terugzien en die bij de eerste opslag automatisch
  // onder dit jaar komt te staan.
  const initialDoelstelling =
    (jaardoelstelling as { tekst: string | null } | null)?.tekst
    ?? (instelling as DashboardInstelling | null)?.doelstelling_tekst
    ?? ''

  return (
    <BedrijfsvoeringForm
      companyId={company_id}
      companyNaam={company.name}
      huisstijl={huisstijl}
      initial={(instelling as DashboardInstelling | null) ?? null}
      huidigJaar={huidigJaar}
      initialGewerkteUren={uren}
      initialDoelstelling={initialDoelstelling}
    />
  )
}
