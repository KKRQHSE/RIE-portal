export type PvaItem = {
  id: string
  company_id: string
  nr: string
  ref: string | null
  onderwerp: string | null
  maatregel: string | null
  tree: string | null
  prio: string
  termijn: string | null
  verantw: string | null
  status: string
  opm: string | null
  updated_at: string
  updated_by: string | null
  persoon_id: string | null
  concept_status: string | null
  concept_opm: string | null
  concept_at: string | null
  vrijgegeven_op: string | null
  vrijgegeven_door: string | null
  vrijgave_opmerking: string | null
  vrijgave_bewijs: string | null
}

export type HistorieRegel = {
  gebeurtenis: string
  van_status: string | null
  naar_status: string | null
  opmerking: string | null
  actor_naam: string | null
  actor_type: string | null
  created_at: string
}

export type Company = {
  id: string
  name: string
  approved_at: string | null
  approved_by: string | null
}

export type Merk = {
  id: string
  naam: string
  logo_pad: string | null
  accent_kleur: string
  lettertype: string
}

export type BedrijfHuisstijl = {
  id: string
  name: string
  merk_id: string | null
  huisstijl_modus: string
  klant_logo_pad: string | null
  accent_kleur_override: string | null
}

export type Module = {
  id: string
  company_id: string
  code: string
  titel: string | null
  intro: string | null
  volgorde: number | null
}

// ---- Module-abonnement (zelfbeheer per bedrijf) ----

export type AbonnementStatus = 'geen' | 'actief' | 'opgezegd'

// Eén rij uit bedrijf_modules: het abonnement van een bedrijf op één module.
// `actief` is de vrije gebruiks-toggle (aan/uit), losstaand van de abonnementsstatus.
export type BedrijfModule = {
  company_id: string
  module: string
  actief: boolean
  abonnement_status: AbonnementStatus
  geactiveerd_op: string | null
  opgezegd_op: string | null
}

export type Vraag = {
  id: string
  company_id: string
  module_id: string
  nr: string
  vraag: string | null
  antwoord: string | null
  bevinding: string | null
  brf: string | null
  klasse: string | null
  pva: string | null
  volgorde: number | null
}

export type Foto = {
  id: string
  company_id: string
  nr: number
  bestand: string | null
  locatie: string | null
  zie: string | null
  betekenis: string | null
  refs: string[]
}

export type Persoon = {
  id: string
  company_id: string
  naam: string
  email: string | null
  status: string
  voorgesteld_door: string | null
  archived_at: string | null
}

export type Deellink = {
  id: string
  company_id: string
  persoon_id: string
  token: string
  vervalt_op: string | null
  ingetrokken: boolean
}

// ---- Werkplekinspectie (module 'inspectie') ----

export type InspectieSjabloon = {
  id: string
  company_id: string
  naam: string
  controlesoort: string | null
  actief: boolean
  gearchiveerd_op: string | null
}

export type InspectieSjabloonPunt = {
  id: string
  company_id: string
  sjabloon_id: string
  volgorde: number
  tekst: string
  verplicht: boolean
}

// Sjabloon met zijn punten erbij (zoals de beheer-UI het toont).
export type SjabloonMetPunten = InspectieSjabloon & {
  punten: InspectieSjabloonPunt[]
}

export type InspectieStatus = 'concept' | 'ingediend' | 'afgerond' | 'geannuleerd'

export type Inspectie = {
  id: string
  company_id: string
  sjabloon_id: string | null
  persoon_id: string | null
  status: InspectieStatus
  gepland_op: string | null
  uitgevoerd_op: string | null
  conclusie: string | null
  sjabloon_naam_snap: string | null
  controlesoort_snap: string | null
}

export type BevindingResultaat = 'in_orde' | 'niet_in_orde' | 'nvt'
export type BevindingAfhandeling = 'geen' | 'meteen_hersteld' | 'actie'

export type InspectieBevinding = {
  id: string
  company_id: string
  inspectie_id: string
  punt_tekst_snap: string
  verplicht: boolean
  volgorde: number
  resultaat: BevindingResultaat | null
  afhandeling: BevindingAfhandeling
  actie_id: string | null
  opmerking: string | null
}

export type InspectieHistorieRegel = {
  id: string
  inspectie_id: string
  wie: string | null
  wanneer: string
  wijziging: string
}

// ---- Managementdashboard ----

// Payload van de RPC dashboard_overzicht(p_company_id): alle tegelcijfers van één bedrijf.
export type DashboardOverzicht = {
  pva: { totaal: number; open: number; in_behandeling: number; afgerond: number; pct: number }
  te_beoordelen: number
  prio_open: { Hoog: number; Middel: number; Laag: number }
  termijn: { over: number; binnenkort: number; zonder_datum: number }
  rie: { versie: number; status: string; geldig_tot: string | null; verloopt_binnenkort: boolean } | null
  inspecties: { open: number; afgerond: number; open_bevindingen: number }
  bewijs: { afgerond_met_bewijs: number; afgerond_zonder_bewijs: number }
}

// Eén regel van de RPC dashboard_admin_overzicht(): per bedrijf voor de admin-roll-up.
export type DashboardAdminRegel = {
  id: string
  name: string
  pva_totaal: number
  pva_afgerond: number
  pct: number
  te_beoordelen: number
  over_termijn: number
  rie_status: string | null
  rie_geldig_tot: string | null
  laatste_activiteit: string | null
}
