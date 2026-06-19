import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import AdminDashboardClient from '@/components/AdminDashboardClient'
import type { DashboardAdminRegel } from '@/lib/types'

export default async function DashboardPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_admin_overzicht')
  const bedrijven = (error ? [] : (data ?? [])) as DashboardAdminRegel[]

  return <AdminDashboardClient bedrijven={bedrijven} email={profile.email} />
}
