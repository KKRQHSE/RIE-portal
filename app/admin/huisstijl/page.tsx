import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import HuisstijlAdmin from '@/components/HuisstijlAdmin'

export default async function HuisstijlAdminPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') notFound()

  const supabase = await createClient()

  // Twee onafhankelijke leesacties: tegelijk i.p.v. na elkaar.
  const [{ data: merken }, { data: bedrijven }] = await Promise.all([
    supabase
      .from('merken')
      .select('id, naam, logo_pad, accent_kleur, lettertype')
      .order('naam', { ascending: true }),
    supabase
      .from('companies')
      .select('id, name, merk_id, huisstijl_modus, klant_logo_pad, accent_kleur_override')
      .order('name', { ascending: true }),
  ])

  return (
    <HuisstijlAdmin
      initialMerken={merken ?? []}
      initialBedrijven={bedrijven ?? []}
    />
  )
}
