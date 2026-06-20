import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import AdminDashboardClient from '@/components/AdminDashboardClient'
import type { DashboardAdminRegel } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Profiel en roll-up tegelijk. De RPC dwingt admin-only zelf af; voor een
  // niet-admin negeren we de uitkomst en redirecten we hieronder alsnog.
  const [profile, { data, error }] = await Promise.all([
    getSessionProfile(),
    supabase.rpc('dashboard_admin_overzicht'),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const bedrijven = (error ? [] : (data ?? [])) as DashboardAdminRegel[]

  return <AdminDashboardClient bedrijven={bedrijven} email={profile.email} />
}
