// SERVER-ONLY. Deze module bouwt een Supabase-client met de SERVICE ROLE-sleutel.
// De service role omzeilt ALLE RLS, dus deze client mag UITSLUITEND in server-code
// (route handlers / server components) gebruikt worden en NOOIT in een client
// component of in code die naar de browser-bundle gaat.
//
// De `server-only` import hieronder is geen decoratie: importeert iets dit bestand
// (direct of indirect) in een client bundle, dan FAALT de build. Zo kan de sleutel
// nooit per ongeluk in de browser belanden.
import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Bouwt een Supabase-client met de service-role-sleutel. Geen sessie, geen
 * auto-refresh — puur server-side gebruik voor o.a. signed Storage-URL's.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    // Bewust generiek: lek geen config-details naar buiten.
    throw new Error('Service-role configuratie ontbreekt op de server.')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
