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
}

export type Company = {
  id: string
  name: string
  approved_at: string | null
  approved_by: string | null
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
