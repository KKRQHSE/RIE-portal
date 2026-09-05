import type { PvaItem } from './types'

// De bronnen waaruit een actie in de centrale actielijst kan komen. 'audit' is
// een aparte bron (lijkend op werkplekinspectie); de audit-module zelf volgt in
// fase 2 — de herkomst is nu al herkenbaar zodat die er straks op aansluit.
export type BronSoort = 'rie' | 'inspectie' | 'audit' | 'incident' | 'los' | 'concept_medewerker'

export type Herkomst = {
  soort: BronSoort
  label: string        // getoond op de chip, bv. "uit incident 12 jul 2026"
  href: string | null  // klikdoel naar het bronformulier; null = (nog) geen scherm
}

export const BRON_FILTERS: { code: BronSoort | 'alle'; label: string }[] = [
  { code: 'alle',      label: 'Alle bronnen' },
  { code: 'rie',       label: 'RI&E' },
  { code: 'inspectie', label: 'Werkplekinspectie' },
  { code: 'audit',     label: 'Audit' },
  { code: 'incident',  label: 'Incident' },
  { code: 'los',       label: 'Los' },
  { code: 'concept_medewerker', label: 'Goedkeuring medewerker' },
]

// Is dit een uit de RI&E voortgekomen actie? Zelfde definitie als de 'rie'-tak
// van bepaalHerkomst: geen bron_type én rie_versie/tree/ref gevuld. Gebruikt om
// het Plan van Aanpak RI&E te scopen (los van de centrale actielijst).
export function isRieActie(item: PvaItem): boolean {
  if (item.bron_type) return false
  return !!(item.rie_versie_id || item.tree?.trim() || item.ref?.trim())
}

// Minimale incident-info om incident-herkomst af te leiden én naar te linken.
export type IncidentRef = { id: string; actie_ids: string[]; omschrijving: string; datum: string }

function datumKort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Herkomst PUUR read-side afgeleid uit bestaande velden — geen datawijziging,
// dus de RI&E-inzage blijft intact. Volgorde: expliciete bron_type
// (inspectie/audit) → incident (reverse via actie_ids) → RI&E (rie_versie/tree/
// ref) → anders los.
export function bepaalHerkomst(
  item: PvaItem,
  companyId: string,
  incidentPerActie: Map<string, IncidentRef>,
  // bron_id bij bron_type='inspectie_bevinding' is het bevinding_id, geen
  // inspectie_id — zonder deze kaart (bevinding_id -> inspectie_id) is er geen
  // route naar de specifieke inspectie te bouwen en viel de link terug op de
  // algemene lijst (de doorklik-bug: de herkomstchip kwam nooit bij de bron uit).
  inspectiePerBevinding: Map<string, string> = new Map(),
): Herkomst {
  const bt = item.bron_type ?? null

  if (bt === 'inspectie_bevinding') {
    const inspectieId = item.bron_id ? inspectiePerBevinding.get(item.bron_id) : undefined
    return {
      soort: 'inspectie',
      label: 'uit werkplekinspectie',
      href: inspectieId
        ? `/${companyId}/inspecties/${inspectieId}#bevinding-${item.bron_id}`
        : `/${companyId}/inspecties`,
    }
  }
  if (bt === 'audit_bevinding') {
    // bron_id = het audit-id → klikbare herkomst terug naar de bronaudit.
    return { soort: 'audit', label: 'uit audit', href: item.bron_id ? `/${companyId}/audits/${item.bron_id}` : `/${companyId}/audits` }
  }
  if (bt === 'concept_medewerker') {
    // bron_id = het persoon_id van de concept-/te-koppelen medewerker.
    return { soort: 'concept_medewerker', label: 'goedkeuring medewerker', href: `/${companyId}/goedkeuringen` }
  }

  const inc = incidentPerActie.get(item.id)
  if (inc) {
    const d = datumKort(inc.datum)
    return { soort: 'incident', label: d ? `uit incident ${d}` : 'uit incident', href: `/${companyId}/incidenten` }
  }

  if (item.rie_versie_id || item.tree || item.ref) {
    return { soort: 'rie', label: 'uit RI&E', href: `/${companyId}/rie` }
  }

  return { soort: 'los', label: 'los toegevoegd', href: null }
}
