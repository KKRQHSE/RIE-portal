import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  // Haal rol en bedrijf op uit public.users
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Ingelogd maar geen profiel — dit mag je zien en oplossen via Supabase
    return NextResponse.redirect(`${origin}/login?error=no_profile`)
  }

  if (profile.role === 'admin') {
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  if (profile.company_id) {
    return NextResponse.redirect(`${origin}/${profile.company_id}/pva`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_company`)
}
