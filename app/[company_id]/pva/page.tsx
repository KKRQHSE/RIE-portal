import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PvaClient from '@/components/PvaClient'
import type { Ritme } from '@/components/HerinnerBeheer'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import { haalPersonen } from '@/lib/personen-data'
import type { Persoon } from '@/lib/types'

export default async function PvaPage({
  params,
}: {
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Onafhankelijke leesacties tegelijk i.p.v. na elkaar.
  const [{ data: profile }, { data: company }, { data: items }, huisstijl] =
    await Promise.all([
      supabase.from('users').select('role, company_id, naam').eq('id', user.id).single(),
      supabase
        .from('companies')
        .select('id, name, approved_at, approved_by')
        .eq('id', company_id)
        .single(),
      supabase.from('pva_items').select('*').eq('company_id', company_id),
      haalHuisstijl(company_id),
    ])

  // Klant mag alleen eigen bedrijf zien; admin alles
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  if (!company) notFound()

  // Sorteer op nummer als integer (nr is text, bijv. "1".."20")
  const sorted = (items ?? []).sort((a, b) => parseInt(a.nr) - parseInt(b.nr))

  // Beheer (personen + toewijzen): admin overal, client voor zijn eigen bedrijf.
  const magBeheren =
    profile.role === 'admin' ||
    (profile.role === 'client' && profile.company_id === company_id)

  const heeftNaam = !!profile.naam?.trim()
  // Alleen de client (KAM) is actiehouder; de admin is systeembeheerder en
  // hoort niet in het adresboek/de dropdown — dus geen koppeling/naamvraag.
  const isClient = profile.role === 'client'

  // Beheerdata (personen incl. KAM-koppeling, ritme, module) tegelijk en alleen
  // voor wie mag beheren. haalPersonen koppelt de KAM alleen als hij nog ontbreekt.
  let personen: Persoon[] = []
  let ritme: Ritme = 'uit'
  let toonInspecties = false
  if (magBeheren) {
    const [personenLijst, { data: instelling }, { data: inspectieModule }] =
      await Promise.all([
        haalPersonen(supabase, company_id, isClient && heeftNaam ? user.email ?? null : null),
        supabase
          .from('herinner_instelling')
          .select('ritme')
          .eq('company_id', company_id)
          .maybeSingle(),
        supabase
          .from('bedrijf_modules')
          .select('actief')
          .eq('company_id', company_id)
          .eq('module', 'inspectie')
          .eq('actief', true)
          .maybeSingle(),
      ])
    personen = personenLijst
    ritme = (instelling?.ritme ?? 'uit') as Ritme
    toonInspecties = !!inspectieModule
  }

  return (
    <PvaClient
      company={company}
      initialItems={sorted}
      magBeheren={magBeheren}
      personen={personen}
      huisstijl={huisstijl}
      toonNaamVragen={isClient && !heeftNaam}
      ritme={ritme}
      toonInspecties={toonInspecties}
    />
  )
}
