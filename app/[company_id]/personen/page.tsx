import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PersonenClient from '@/components/PersonenClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import { haalPersonen } from '@/lib/personen-data'

export default async function PersonenPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id, naam')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  // Beheer: admin mag elk bedrijf; een client uitsluitend zijn eigen bedrijf.
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)
  if (!magBeheren) notFound()

  const heeftNaam = !!profile.naam?.trim()
  // Alleen de client (KAM) is actiehouder; de admin is systeembeheerder en
  // hoort niet in het adresboek/de dropdown — dus geen koppeling/naamvraag.
  const isClient = profile.role === 'client'

  // Onafhankelijke leesacties tegelijk. haalPersonen koppelt de ingelogde KAM
  // alleen als hij nog ontbreekt (geen schrijfactie bij elke lading meer).
  const [{ data: company }, personen, { data: deellinks }, huisstijl] =
    await Promise.all([
      supabase
        .from('companies')
        .select('id, name, approved_at, approved_by')
        .eq('id', company_id)
        .single(),
      haalPersonen(supabase, company_id, isClient && heeftNaam ? user.email ?? null : null),
      supabase
        .from('deellinks')
        .select('id, company_id, persoon_id, token, vervalt_op, ingetrokken')
        .eq('company_id', company_id),
      haalHuisstijl(company_id),
    ])

  if (!company) notFound()

  return (
    <PersonenClient
      company={company}
      initialPersonen={personen}
      initialDeellinks={deellinks ?? []}
      huisstijl={huisstijl}
      toonNaamVragen={isClient && !heeftNaam}
    />
  )
}
