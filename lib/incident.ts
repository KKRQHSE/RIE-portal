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

// Genummerde oorzaak-optie (uit incident_directe_oorzaak / _basis_oorzaak).
export type OorzaakOptie = {
  code: number
  omschrijving: string
}

// Eén incident-rij zoals de KAM-afhandeling die leest (Deel 1 + Deel 2).
export type Incident = {
  id: string
  company_id: string
  // Deel 1
  datum: string
  tijd: string | null
  locatie: string
  project: string | null
  omschrijving: string
  naam_melder: string | null
  gevolgen: string[]
  aangemaakt_op: string
  // Deel 2
  status: 'open' | 'in_onderzoek' | 'afgehandeld'
  directe_oorzaken: number[]
  basis_oorzaken: number[]
  oorzaak_toelichting: string | null
  onderzoeksrapportage_bijgevoegd: boolean
  telefonische_melding_directie: boolean
  telefonische_melding_aan: string | null
  maatregelen_in_actielijst: boolean
  tra_aanpassen: boolean
  andere_maatregelen: string | null
  besproken_in_toolbox_datum: string | null
  // Gevoelig (alleen KAM)
  functie_slachtoffer: string | null
  medische_dienst_bezocht: 'ja' | 'nee' | 'onbekend' | null
  afgehandeld_op: string | null
  laatst_bijgewerkt_op: string | null
}

// Eén foto zoals de KAM-download-route hem teruggeeft (met signed URL).
export type IncidentFotoItem = {
  id: string
  bestandsnaam: string | null
  type: string | null
  downloadUrl: string | null
}

export const STATUS_LABEL: Record<Incident['status'], string> = {
  open: 'Open',
  in_onderzoek: 'In onderzoek',
  afgehandeld: 'Afgehandeld',
}
