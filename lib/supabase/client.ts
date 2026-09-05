import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Zie lib/supabase/server.ts voor waarom dit niet vast 'true' is
      // (lokale dev over http://localhost zou anders nooit meer inloggen).
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    }
  )
}
