import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ActielijstClient from '@/components/ActielijstClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import { haalPersonen } from '@/lib/personen-data'
import { bepaalHerkomst, type IncidentRef } from '@/lib/actie-herkomst'
import type { Persoon, PvaItem } from '@/lib/types'

// Centrale actielijst: ÉÉN overzicht waar alle acties (RI&E, inspectie, incident,
// los) samenkomen, elk met een klikbare herkomst naar het bronformulier. Leest
// dezelfde pva_items als /pva — niets verplaatst, de RI&E-inzage blijft intact.
export default async function ActielijstPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: company }, { data: items }, { data: incidenten }, huisstijl] =
    await Promise.all([
      supabase.from('users').select('role, company_id, naam').eq('id', user.id).single(),
      supabase.from('companies').select('id, name, approved_at, approved_by').eq('id', company_id).single(),
      supabase.from('pva_items').select('*').eq('company_id', company_id),
      supabase.from('incident').select('id, actie_ids, omschrijving, datum').eq('company_id', company_id),
      haalHuisstijl(company_id),
    ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()

  const magBeheren =
    profile.role === 'admin' || (profile.role === 'client' && profile.company_id === company_id)

  // Actie-id → incident, voor het afleiden en linken van incident-herkomst.
  const incidentPerActie = new Map<string, IncidentRef>()
  for (const inc of (incidenten ?? []) as IncidentRef[]) {
    for (const aid of inc.actie_ids ?? []) {
      if (!incidentPerActie.has(aid)) incidentPerActie.set(aid, inc)
    }
  }

  // bevinding_id -> inspectie_id, alleen voor de acties die er echt uit
  // voortkomen. bron_id bij bron_type='inspectie_bevinding' is het
  // bevinding_id; zonder deze opzoeking kan bepaalHerkomst niet naar de
  // specifieke inspectie doorlinken (zie de toelichting daar).
  const inspectiePerBevinding = new Map<string, string>()
  const bevindingIds = ((items ?? []) as PvaItem[])
    .filter(i => i.bron_type === 'inspectie_bevinding' && i.bron_id)
    .map(i => i.bron_id as string)
  if (bevindingIds.length > 0) {
    const { data: bevindingen } = await supabase
      .from('inspectie_bevinding')
      .select('id, inspectie_id')
      .in('id', bevindingIds)
    for (const b of bevindingen ?? []) {
      inspectiePerBevinding.set(b.id as string, b.inspectie_id as string)
    }
  }

  // Sorteer op nummer als integer (nr is text, bijv. "1".."20").
  const sorted = ((items ?? []) as PvaItem[]).sort((a, b) => parseInt(a.nr) - parseInt(b.nr))
  const rijen = sorted.map(item => ({
    item,
    herkomst: bepaalHerkomst(item, company_id, incidentPerActie, inspectiePerBevinding),
  }))

  const personen: Persoon[] = magBeheren ? await haalPersonen(supabase, company_id, null) : []

  return (
    <ActielijstClient
      company={company}
      companyId={company_id}
      initialRijen={rijen}
      personen={personen}
      magBeheren={magBeheren}
      huisstijl={huisstijl}
    />
  )
}
