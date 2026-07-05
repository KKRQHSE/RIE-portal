// Gedeelde, client-veilige constanten/typen voor de incidenten-module.
// Bevat GEEN geheimen of service-role.

// Privé Storage-bucket voor incident-foto's (echte per-bedrijf padscheiding in de
// storage-RLS; zie migratie 0026). Nooit publiek leesbaar.
export const INCIDENT_FOTO_BUCKET = 'incident-foto'

// Eén gevolg-optie zoals de meldpagina die toont (uit incident_gevolg_soort).
export type GevolgOptie = {
  code: string
  omschrijving: string
}

// Wat de open meldpagina van de context-RPC nodig heeft.
export type Meldcontext = {
  bedrijf: string | null
  gevolg_opties: GevolgOptie[]
}
