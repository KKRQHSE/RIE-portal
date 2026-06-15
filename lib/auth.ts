import { createClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  role: string
  company_id: string | null
  email: string | null
}

// De enige plek die bepaalt: wie is deze gebruiker, welke rol, welk bedrijf.
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('id, role, company_id, email')
    .eq('id', user.id)
    .single()

  // Ingelogd maar geen profielrij: geef een herkenbare 'none'-rol terug
  // i.p.v. crashen. De /geen-toegang pagina vangt dit netjes op.
  if (!data) {
    return { id: user.id, role: 'none', company_id: null, email: user.email ?? null }
  }
  return data as Profile
}

// De enige plek die bepaalt waar een rol naartoe gaat na inloggen.
export function homePathFor(p: Profile): string {
  if (p.role === 'admin') return '/dashboard'
  if (p.company_id) return `/${p.company_id}/pva`
  return '/geen-toegang'
}
