import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  role: string
  company_id: string | null
  email: string | null
  naam: string | null
}

// De enige plek die bepaalt: wie is deze gebruiker, welke rol, welk bedrijf.
//
// In cache() verpakt: wordt deze binnen één request meer dan eens aangeroepen
// (bv. een layout én de pagina eronder), dan gaat er nog maar één auth.getUser()
// en één users-select naar Supabase. Per request, niet eroverheen — een
// rolwijziging is bij de volgende weergave gewoon zichtbaar. Vandaag roept geen
// enkele route hem twee keer aan; dit is er zodat dat ook niet stiekem duur
// wordt zodra een pagina onder /[company_id] hem wél gaat gebruiken.
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('id, role, company_id, email, naam')
    .eq('id', user.id)
    .single()

  // Ingelogd maar geen profielrij: geef een herkenbare 'none'-rol terug
  // i.p.v. crashen. De /geen-toegang pagina vangt dit netjes op.
  if (!data) {
    return { id: user.id, role: 'none', company_id: null, email: user.email ?? null, naam: null }
  }
  return data as Profile
})

// De enige plek die bepaalt waar een rol naartoe gaat na inloggen.
export function homePathFor(p: Profile): string {
  if (p.role === 'admin') return '/dashboard'
  if (p.company_id) return `/${p.company_id}/pva`
  return '/geen-toegang'
}
