import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import IncidentBeheer from '@/components/IncidentBeheer'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { Incident, OorzaakOptie, GevolgOptie } from '@/lib/incident'

export default async function IncidentenPage({
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
    { data: incidenten },
    { data: meldlink },
    { data: directe },
    { data: basis },
    { data: gevolg },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase.from('bedrijf_modules').select('actief')
      .eq('company_id', company_id).eq('module', 'incidenten')
      .eq('module_status', 'actief').eq('actief', true).maybeSingle(),
    supabase.from('companies').select('id, name').eq('id', company_id).single(),
    supabase.from('incident').select('*').eq('company_id', company_id)
      .order('aangemaakt_op', { ascending: false }),
    supabase.from('incident_meldlink').select('token, ingetrokken')
      .eq('company_id', company_id).maybeSingle(),
    supabase.from('incident_directe_oorzaak').select('code, omschrijving').order('code', { ascending: true }),
    supabase.from('incident_basis_oorzaak').select('code, omschrijving').order('code', { ascending: true }),
    supabase.from('incident_gevolg_soort').select('code, omschrijving').order('volgorde', { ascending: true }),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  const magBeheren = profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()
  if (!moduleRij) notFound()
  if (!company) notFound()

  return (
    <IncidentBeheer
      company={company}
      huisstijl={huisstijl}
      initialIncidenten={(incidenten ?? []) as Incident[]}
      initialMeldlink={(meldlink as { token: string; ingetrokken: boolean } | null) ?? null}
      directeOorzaken={(directe ?? []) as OorzaakOptie[]}
      basisOorzaken={(basis ?? []) as OorzaakOptie[]}
      gevolgOpties={(gevolg ?? []) as GevolgOptie[]}
    />
  )
}
