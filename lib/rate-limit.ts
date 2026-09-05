import type { SupabaseClient } from '@supabase/supabase-js'

// Dunne wrapper om de rate_limiet_toegestaan-RPC (migratie 0069). Fail-closed
// bij een onverwachte fout: liever een enkele geweigerde legitieme aanvraag
// dan een kapotte teller die per ongeluk altijd 'toegestaan' teruggeeft.
export async function rateLimietToegestaan(
  supabase: SupabaseClient,
  sleutel: string,
  actie: string,
  max: number,
  vensterSeconden: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limiet_toegestaan', {
    p_sleutel: sleutel,
    p_actie: actie,
    p_max: max,
    p_venster_seconden: vensterSeconden,
  })
  if (error) return false
  return data === true
}
