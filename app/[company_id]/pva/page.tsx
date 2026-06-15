import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PvaClient from '@/components/PvaClient'

export default async function PvaPage({
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
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  // Klant mag alleen eigen bedrijf zien; admin alles
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, approved_at, approved_by')
    .eq('id', company_id)
    .single()

  if (!company) notFound()

  const { data: items } = await supabase
    .from('pva_items')
    .select('*')
    .eq('company_id', company_id)

  // Sorteer op nummer als integer (nr is text, bijv. "1".."20")
  const sorted = (items ?? []).sort((a, b) => parseInt(a.nr) - parseInt(b.nr))

  return <PvaClient company={company} initialItems={sorted} isAdmin={profile.role === 'admin'} />
}
