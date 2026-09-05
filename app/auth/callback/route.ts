import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { veiligRedirectPad } from '@/lib/auth-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  // Wachtwoord-reset of uitnodiging: ga naar de opgegeven vervolgpagina — maar
  // alleen als 'next' een echt eigen, relatief pad is (zie lib/auth-redirect.ts
  // voor waarom en de regressietest scripts/auth_redirect_test.ts).
  const veiligeNext = veiligRedirectPad(next)
  if (veiligeNext) {
    return NextResponse.redirect(`${origin}${veiligeNext}`)
  }

  // Anders: rol-gebaseerde bestemming, met dezelfde client (cookies al gezet).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const { data: prof } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  const path =
    prof?.role === 'admin' ? '/dashboard'
    : prof?.company_id ? `/${prof.company_id}/pva`
    : '/geen-toegang'

  return NextResponse.redirect(`${origin}${path}`)
}
