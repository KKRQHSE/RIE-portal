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
