// Server-only: haalt de personen van een bedrijf op en zorgt dat de ingelogde
// KAM er zelf bij staat. Belangrijk voor de prestaties: de (idempotente)
// koppel-RPC wordt alléén aangeroepen als de KAM nog ontbreekt, zodat een gewone
// paginalading geen schrijfactie meer doet (voorheen draaide die write bij élke
// lading van de PvA- en Personen-pagina).
import type { createClient } from '@/lib/supabase/server'
import type { Persoon } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

const PERSOON_COLS =
  'id, company_id, naam, email, status, voorgesteld_door, archived_at, functiegroep_id, datum_in_dienst, datum_uit_dienst'

async function selecteerPersonen(
  supabase: ServerClient,
  companyId: string,
): Promise<Persoon[]> {
  const { data } = await supabase
    .from('personen')
    .select(PERSOON_COLS)
    .eq('company_id', companyId)
    .is('archived_at', null)
    .order('naam', { ascending: true })
  return (data ?? []) as Persoon[]
}

// `kamEmail` = het e-mailadres van de ingelogde KAM, of null wanneer koppelen niet
// van toepassing is (admin, of een client die zijn naam nog niet heeft ingevuld).
export async function haalPersonen(
  supabase: ServerClient,
  companyId: string,
  kamEmail: string | null,
): Promise<Persoon[]> {
  const personen = await selecteerPersonen(supabase, companyId)

  const ontbreekt =
    !!kamEmail &&
    !personen.some(p => p.email?.toLowerCase() === kamEmail.toLowerCase())

  if (!ontbreekt) return personen

  // KAM staat er nog niet bij → eenmalig koppelen en opnieuw ophalen.
  await supabase.rpc('koppel_mij_als_persoon', { p_company_id: companyId })
  return selecteerPersonen(supabase, companyId)
}
