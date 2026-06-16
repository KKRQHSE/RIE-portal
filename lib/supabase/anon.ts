import { createClient } from '@supabase/supabase-js'

// Anonieme Supabase-client zonder sessie, voor server-routes die de GAST-RPC's
// aanroepen. De gast-RPC's zijn SECURITY DEFINER en valideren zelf de deellink-
// token; de anon-sleutel is publiek en bevat geen rechten buiten RLS. (Géén
// service role hier — die hoort uitsluitend in lib/supabase/service.ts.)
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
