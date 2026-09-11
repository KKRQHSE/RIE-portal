import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RieToetsverslagClient from '@/components/RieToetsverslagClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { RieToetsing, RieToetsverslag } from '@/lib/types'

// Leesbare kerninhoud van een toetsverslag (migratie 0087) — een los, diep
// scherm zodat /rie zelf overzichtelijk blijft. Zelfde toegangsregels als /rie.
export default async function RieToetsverslagPage({
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
    { data: company },
    { data: toetsing },
    huisstijl,
  ] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    supabase
      .from('companies')
      .select('id, name, oefenomgeving')
      .eq('id', company_id)
      .single(),
    supabase
      .from('rie_versies')
      .select('id, versie, toetser_naam, toetser_certificaatnummer, toetser_namens')
      .eq('company_id', company_id)
      .order('versie', { ascending: false })
      .limit(1)
      .maybeSingle(),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()
  if (company.oefenomgeving) notFound()
  if (!toetsing) notFound()

  const { data: toetsverslag } = await supabase
    .from('rie_toetsverslag')
    .select('id, rie_versie_id, managementsamenvatting, toetsbrief, conclusie_volledigheid, conclusie_brongebruik, conclusie_verplichte_aspecten, conclusie_wettelijk_kader, conclusie_actualiteit, conclusie_betrouwbaarheid, conclusie_plan_van_aanpak, conclusie_systeem_scopetoets, eindoordeel')
    .eq('rie_versie_id', toetsing.id)
    .maybeSingle()

  // Nog geen inhoud ingevuld: geen kapotte pagina tonen — de link ernaartoe
  // bestaat sowieso alleen als er een rij is (zie RieClient), dit is het
  // defensieve pad bij een directe URL.
  if (!toetsverslag) notFound()

  return (
    <RieToetsverslagClient
      company={company}
      toetsing={toetsing as RieToetsing}
      toetsverslag={toetsverslag as RieToetsverslag}
      huisstijl={huisstijl}
    />
  )
}
