// Statische AVG-inhoud voor de admin-only AVG-tab (app/admin/avg).
// ----------------------------------------------------------------------------
// Deze data komt rechtstreeks uit audit/2026-09-04/DATA-INVENTARIS.md — puur uit
// code/schema afgeleid, geen aannames. GEEN grondslag is hier ingevuld: welke
// wettelijke grondslag (art. 6 AVG) bij elke verwerking hoort is een juridische/
// businesskeuze die niet door mij is vastgesteld (zie OPENSTAAND.md). Verzin die
// dus niet zelf in de UI — toon 'm expliciet als vast te stellen.
//
// Wijzigt de onderliggende verwerking (nieuwe tabel, nieuwe subverwerker,
// nieuwe bewaartermijn)? Werk dit bestand bij én DATA-INVENTARIS.md, dat is de
// bron van waarheid.

export const GRONDSLAG_NIET_VASTGESTELD = 'Vast te stellen — juridische beoordeling nodig'

export type VerwerkingsregisterRegel = {
  id: string
  proces: string
  betrokkenen: string
  persoonsgegevens: string[]
  bijzonderPersoonsgegeven: boolean
  bijzonderToelichting?: string
  grondslag: string
  ontvangersIntern: string
  ontvangersExtern: string | null
  doorgifteBuitenEu: boolean
  bewaartermijn: string
  bron: string
}

export const VERWERKINGSREGISTER: VerwerkingsregisterRegel[] = [
  {
    id: 'personen',
    proces: 'Personen-administratie',
    betrokkenen: 'Medewerkers van klantbedrijven',
    persoonsgegevens: ['naam', 'e-mailadres', 'functiegroep', 'datum in/uit dienst', 'status'],
    bijzonderPersoonsgegeven: false,
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM (schrijven) — teamleider heeft geen beheertoegang',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel personen',
  },
  {
    id: 'toolbox',
    proces: 'Toolbox-trainingsbewijs',
    betrokkenen: 'Medewerkers die een toolboxtraining volgen',
    persoonsgegevens: ['bevroren naam', 'handtekening', 'quizresultaat', 'video-kijkstatus'],
    bijzonderPersoonsgegeven: true,
    bijzonderToelichting: 'Geen gezondheidsgegeven, wel een handtekening — apart als gevoelig persoonskenmerk benoemd.',
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM, teamleider — handtekening is voor teamleider ongefilterd zichtbaar',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht (bewust: onveranderlijk trainingsbewijs)',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel toolbox_deelname',
  },
  {
    id: 'incidenten',
    proces: 'Incidentregistratie',
    betrokkenen: 'Melders, betrokkenen en slachtoffers van een incident',
    persoonsgegevens: ['naam melder', 'locatie/omschrijving', 'functie slachtoffer', 'medische dienst bezocht', "foto's"],
    bijzonderPersoonsgegeven: true,
    bijzonderToelichting: "'medische_dienst_bezocht' is een gezondheidsgegeven.",
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM — teamleider ziet de rest van het incident wel, de gevoelige velden server-side gemaskeerd (null)',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel incident / incident_foto',
  },
  {
    id: 'inspecties',
    proces: 'Inspecties, incl. AI-fotoanalyse',
    betrokkenen: 'Medewerkers (uitvoerder); mogelijk herkenbare personen op een foto',
    persoonsgegevens: ['uitvoerder (persoon_id)', "foto's", 'AI-gegenereerde beschrijving/bevindingen'],
    bijzonderPersoonsgegeven: false,
    bijzonderToelichting: 'Kan indirect gevoelig worden als een foto toevallig een persoon toont — niet inhoudelijk te beoordelen uit code.',
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM, teamleider',
    ontvangersExtern: 'Groq (AI-fotoanalyse) — alleen na expliciete, per-foto opt-in',
    doorgifteBuitenEu: true,
    bewaartermijn: 'Geen bewaartermijn ingericht',
    bron: 'DATA-INVENTARIS.md — Deel 1/2, inspectie_foto + AI-fotodoorgifte',
  },
  {
    id: 'pva-acties',
    proces: 'Plan van Aanpak / actielijst, incl. actiemail',
    betrokkenen: 'Actiehouders (medewerkers)',
    persoonsgegevens: ['naam', 'e-mailadres', 'actie-inhoud', 'deellink-token'],
    bijzonderPersoonsgegeven: false,
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM (beheer); teamleider mag status/opmerking bijwerken',
    ontvangersExtern: 'Resend (verzending actiemail)',
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht',
    bron: 'DATA-INVENTARIS.md — Deel 1/2, pva_items + deellinks + e-mail (Resend)',
  },
  {
    id: 'herinneringen',
    proces: 'Herinneringsmails bij openstaande acties',
    betrokkenen: 'Actiehouders (medewerkers)',
    persoonsgegevens: ['persoon_id', 'e-mailadres', 'verzonden acties'],
    bijzonderPersoonsgegeven: false,
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Admin, client/KAM',
    ontvangersExtern: 'Resend (verzending herinneringsmail)',
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht — groeit ongelimiteerd (geen opschoning gevonden)',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel herinnering_log',
  },
  {
    id: 'audits-vca-iso',
    proces: 'Audits (VCA-checklist / ISO-verslag)',
    betrokkenen: 'Medewerkers en auditor',
    persoonsgegevens: ['gesproken_met', 'auditor', 'gericht_aan'],
    bijzonderPersoonsgegeven: false,
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Uitsluitend admin en client/KAM — teamleider heeft hier geen enkele toegang',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Geen bewaartermijn ingericht',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel audit (VCA/ISO)',
  },
  {
    id: 'gastflows',
    proces: 'Gastflows zonder account (toolbox-token, meldlink, deellink)',
    betrokkenen: 'Medewerkers of derden zonder eigen account',
    persoonsgegevens: ['naam', 'handtekening', 'incidentmelding', 'actie-reactie (naam/e-mail)'],
    bijzonderPersoonsgegeven: false,
    bijzonderToelichting: 'Belandt in dezelfde tabellen als de gewone flows (toolbox_deelname/incident/deellinks) — zie die regels.',
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'N.v.t. — tokenbeveiligd, geen rolcheck (bezitter van het token)',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Zie de onderliggende tabel (toolbox_deelname / incident / deellinks)',
    bron: 'DATA-INVENTARIS.md — Deel 1, anon-tokenroutes',
  },
  {
    id: 'audit-log',
    proces: 'Audit-log (systeemlog van alle bovenstaande acties)',
    betrokkenen: 'Iedereen wiens actie gelogd wordt; kan naam/e-mail bevatten (bv. bij persoonverwijdering)',
    persoonsgegevens: ['wie (gebruikers-id)', 'vrije detail-jsonb, incl. soms naam/e-mail'],
    bijzonderPersoonsgegeven: false,
    grondslag: GRONDSLAG_NIET_VASTGESTELD,
    ontvangersIntern: 'Uitsluitend admin',
    ontvangersExtern: null,
    doorgifteBuitenEu: false,
    bewaartermijn: 'Onbeperkt — structureel onverwijderbaar door een database-trigger, ook voor service-role',
    bron: 'DATA-INVENTARIS.md — Deel 1, tabel audit_log',
  },
]

export type SubverwerkerRegel = {
  id: string
  naam: string
  functie: string
  watGaatErheen: string
  regio: string
  doorgifteBuitenEu: boolean | 'onbekend'
  optIn: string
  dpaStatus: string
}

export const SUBVERWERKERS: SubverwerkerRegel[] = [
  {
    id: 'groq',
    naam: 'Groq',
    functie: 'AI-fotoanalyse bij inspecties',
    watGaatErheen: 'Foto (als base64) + MIME-type + de inspectiepunt-normtekst. Geen naam, geen bedrijfsnaam, geen metadata.',
    regio: 'Verenigde Staten',
    doorgifteBuitenEu: true,
    optIn: 'Verplicht, expliciet, per foto — geen default, geen "onthoud mijn keuze"',
    dpaStatus: 'Onbekend, uitzoeken — verwerkersovereenkomst/SCC\'s niet gecontroleerd',
  },
  {
    id: 'resend',
    naam: 'Resend',
    functie: 'Verzending van actiemails en herinneringsmails',
    watGaatErheen: 'Naam en e-mailadres van de ontvanger, bedrijfsnaam, actie-inhoud, deellink-URL met token',
    regio: 'Onbekend, uitzoeken',
    doorgifteBuitenEu: 'onbekend',
    optIn: 'Geen — inherent aan de functie (actiehouder moet de mail kunnen ontvangen)',
    dpaStatus: 'Onbekend, uitzoeken — verwerkersovereenkomst/DPA niet gecontroleerd',
  },
  {
    id: 'supabase',
    naam: 'Supabase',
    functie: 'Hosting van database, authenticatie en bestandsopslag (Storage) — de onderliggende platforminfrastructuur',
    watGaatErheen: 'Alle persoonsgegevens die in dit register staan, in de database en/of Storage',
    regio: 'Onbekend, uitzoeken — projectregio niet gecontroleerd in het Supabase-dashboard',
    doorgifteBuitenEu: 'onbekend',
    optIn: 'N.v.t. — fundamentele infrastructuur, geen aparte keuze per actie',
    dpaStatus: 'Onbekend, uitzoeken — verwerkersovereenkomst/DPA niet gecontroleerd',
  },
]

export type BewaartermijnRegel = {
  id: string
  datasoort: string
  huidigeSituatie: string
  conceptTermijn: string
}

const CONCEPT_STATUS = 'Concept, nog niet vastgesteld'

export const BEWAARTERMIJNEN: BewaartermijnRegel[] = [
  { id: 'personen', datasoort: 'Personen', huidigeSituatie: 'Geen bewaartermijn ingericht', conceptTermijn: CONCEPT_STATUS },
  { id: 'toolbox_deelname', datasoort: 'Toolbox-trainingsbewijs (incl. handtekening)', huidigeSituatie: 'Geen bewaartermijn ingericht (bewust: onveranderlijk bewijs)', conceptTermijn: CONCEPT_STATUS },
  { id: 'incident', datasoort: 'Incidenten (incl. foto\'s)', huidigeSituatie: 'Geen bewaartermijn ingericht', conceptTermijn: CONCEPT_STATUS },
  { id: 'inspectie', datasoort: 'Inspecties (incl. foto\'s en AI-suggesties)', huidigeSituatie: 'Geen bewaartermijn ingericht', conceptTermijn: CONCEPT_STATUS },
  { id: 'deellinks', datasoort: 'Deellinks (actie-uitnodigingen)', huidigeSituatie: '"vervalt_op" niet uniform gezet, geen opschoning van verlopen links', conceptTermijn: CONCEPT_STATUS },
  { id: 'herinnering_log', datasoort: 'Herinneringslog', huidigeSituatie: 'Geen bewaartermijn ingericht — groeit ongelimiteerd', conceptTermijn: CONCEPT_STATUS },
  { id: 'rate_limiet_log', datasoort: 'Rate-limietlog', huidigeSituatie: 'Geen bewaartermijn ingericht — groeit ongelimiteerd', conceptTermijn: CONCEPT_STATUS },
  { id: 'bewijs', datasoort: 'Bewijsstukken (PvA)', huidigeSituatie: 'Soft-delete aanwezig; opschoning van het onderliggende bestand onbekend', conceptTermijn: CONCEPT_STATUS },
  { id: 'audit_log', datasoort: 'Audit-log', huidigeSituatie: 'Structureel onverwijderbaar (database-trigger) — geen termijn technisch mogelijk zonder die trigger aan te passen', conceptTermijn: 'N.v.t. — vereist eerst een technische keuze over de trigger, niet alleen een termijn' },
]
