import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import CentraleBibliotheekAdmin from '@/components/CentraleBibliotheekAdmin'
import type { CentraleRubriek, CentraleVraag, CentraleRubriekMetVragen } from '@/lib/types'

export default async function CentraleBibliotheekPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') notFound()

  const supabase = await createClient()

  // Actieve (niet-gearchiveerde) rubrieken + vragen. RLS laat admin alles schrijven;
  // lezen mag iedereen-ingelogd, dus admin sowieso.
  const [{ data: rubrieken }, { data: vragen }] = await Promise.all([
    supabase
      .from('centrale_rubriek')
      .select('id, naam, volgorde, rie_code, versie, gewijzigd_op, gearchiveerd_op')
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('centrale_vraag')
      .select('id, rubriek_id, tekst, volgorde, versie, gewijzigd_op, gearchiveerd_op')
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
  ])

  const metVragen: CentraleRubriekMetVragen[] = ((rubrieken ?? []) as CentraleRubriek[]).map(r => ({
    ...r,
    vragen: ((vragen ?? []) as CentraleVraag[]).filter(v => v.rubriek_id === r.id),
  }))

  return <CentraleBibliotheekAdmin initialRubrieken={metVragen} />
}
