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
