import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import LogoutButton from '@/components/LogoutButton'

export default async function DashboardPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-ink">Beheer</h1>
          <LogoutButton />
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-sm text-ink/50 font-mono">Dashboard komt in fase 2.</p>
          <p className="text-sm text-ink/40 mt-2">Ingelogd als {profile.email}</p>
        </div>
      </div>
    </main>
  )
}
