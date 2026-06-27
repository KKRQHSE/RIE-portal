// De catalogus van activeerbare modules. Eén plek om een nieuwe module bij te
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
  {
    module: 'toolbox',
    titel: 'Toolboxen',
    omschrijving:
      'Medewerkers aantoonbaar toolboxen laten volgen (tekst + video + optionele quiz, met naam-bevestiging en handtekening), met een live doelstellingen-dashboard per functiegroep.',
    pad: 'toolbox',
  },
]
