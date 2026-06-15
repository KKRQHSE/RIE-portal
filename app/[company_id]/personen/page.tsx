import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PersonenClient from '@/components/PersonenClient'

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

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, approved_at, approved_by')
    .eq('id', company_id)
    .single()
  if (!company) notFound()

  const heeftNaam = !!profile.naam?.trim()
  // Alleen de client (KAM) is actiehouder; de admin is systeembeheerder en
  // hoort niet in het adresboek/de dropdown — dus geen koppeling/naamvraag.
  const isClient = profile.role === 'client'

  // Client met naam wordt gegarandeerd zelf een persoon in dit bedrijf
  // (idempotent: de RPC matcht op e-mail). Pas daarna de lijst ophalen.
  if (isClient && heeftNaam) {
    await supabase.rpc('koppel_mij_als_persoon', { p_company_id: company_id })
  }

  const { data: personen } = await supabase
    .from('personen')
    .select('id, company_id, naam, email, status, voorgesteld_door, archived_at')
    .eq('company_id', company_id)
    .is('archived_at', null)
    .order('naam', { ascending: true })

  const { data: deellinks } = await supabase
    .from('deellinks')
    .select('id, company_id, persoon_id, token, vervalt_op, ingetrokken')
    .eq('company_id', company_id)

  return (
    <PersonenClient
      company={company}
      initialPersonen={personen ?? []}
      initialDeellinks={deellinks ?? []}
      toonNaamVragen={isClient && !heeftNaam}
    />
  )
}
