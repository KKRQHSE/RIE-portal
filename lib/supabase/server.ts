import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Niet 'true' vast: lokale dev draait over http://localhost, waar een
      // Secure-cookie nooit verzonden wordt (dan kun je niet meer inloggen).
      // Op Vercel (productie) is NODE_ENV altijd 'production' en gaat alles
      // over https — daar hoort de cookie dus wél Secure te zijn.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // In Server Components kan je geen cookies zetten — dat is normaal.
            // De middleware zorgt voor de sessie-refresh.
          }
        },
      },
    }
  )
}
