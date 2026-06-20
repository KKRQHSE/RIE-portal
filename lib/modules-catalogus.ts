// De catalogus van abonneerbare modules. Eén plek om een nieuwe module bij te
// zetten: zodra een module hier staat, verschijnt hij op het modulebeheerscherm.
// De sleutel `module` is de waarde in bedrijf_modules.module.

export type ModuleCatalogusItem = {
  module: string
  titel: string
  omschrijving: string
  // Pad (onder /[company_id]) waar de module zelf leeft, voor een snelle link.
  pad?: string
}

export const MODULE_CATALOGUS: ModuleCatalogusItem[] = [
  {
    module: 'inspectie',
    titel: 'Werkplekinspectie',
    omschrijving:
      'Sjabloonbeheer en werkplekinspecties uitvoeren; niet-in-orde-bevindingen worden automatisch acties in het Plan van Aanpak.',
    pad: 'inspecties',
  },
]
