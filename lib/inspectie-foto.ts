// Gedeelde, client-veilige constanten/typen voor foto's bij de werkplekinspectie.
// Bevat GEEN geheimen of service-role.

// Privé Storage-bucket met echte per-bedrijf padscheiding in de storage-RLS
// (eerste padsegment = company_id; zie migratie 0045). Nooit publiek leesbaar.
export const INSPECTIE_FOTO_BUCKET = 'inspectie-foto'

// Eén foto zoals het invulscherm hem toont. downloadUrl is een kortlevende
// signed URL, geen permanente link.
export type InspectieFotoItem = {
  id: string
  bevinding_id: string | null
  bestandsnaam: string | null
  type: string | null
  downloadUrl: string | null
}
