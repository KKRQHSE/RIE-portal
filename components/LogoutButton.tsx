'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className={className ?? 'text-sm text-ink/50 hover:text-accent transition-colors'}
    >
      Uitloggen
    </button>
  )
}
