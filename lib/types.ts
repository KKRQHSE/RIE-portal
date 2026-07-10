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
  termijn_datum: string | null
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
  // Herkomst-velden (optioneel: niet elke query selecteert ze expliciet).
  rie_versie_id?: string | null
  bron_type?: string | null
  bron_id?: string | null
}

// ── Auditmodule ──────────────────────────────────────────────────────────
export type AuditSjabloon = 'vca' | 'iso'
export type AuditStatus = 'gepland' | 'uitgevoerd' | 'afgerond'

export type Audit = {
  id: string
  company_id: string
  sjabloon: AuditSjabloon
  titel: string
  status: AuditStatus
  jaar: number
  datum: string | null
  gesproken_met: string | null
  gericht_aan: string | null
  auditor: string | null
  besproken_onderwerpen: string[]
  bewijsdocumenten: string[]
  samenvatting: string | null
  positieve_waarnemingen: string[]
  conclusie: string | null
  aangemaakt_op: string
  bijgewerkt_op: string
}

export type AuditVcaBevindingStatus = 'geen_bemerkingen' | 'verbeterpunt' | 'afwijking'
export type AuditVcaBevinding = {
  id: string
  audit_id: string
  company_id: string
  code: string
  hoofdstuk: string
  hoofdstuk_titel: string
  titel: string
  omschrijving: string | null
  volgorde: number
  status: AuditVcaBevindingStatus
  toelichting: string | null
  actie_id: string | null
}

export type AuditIsoObservatie = {
  id: string
  audit_id: string
  company_id: string
  thema: string
  iso_clausule: string | null
  observatie: string | null
  volgorde: number
}

export type AuditVerbeterpunt = {
  id: string
  audit_id: string
  company_id: string
  constatering: string
  soort: 'verbeterpunt' | 'afwijking'
  actie_id: string | null
  volgorde: number
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

// ---- Module-zelfbeheer per bedrijf ----

export type ModuleStatus = 'geen' | 'actief' | 'gestopt'

// Eén rij uit bedrijf_modules: de toestand van een bedrijf op één module.
// `actief` is de vrije gebruiks-toggle (aan/uit), losstaand van de module-status.
export type BedrijfModule = {
  company_id: string
  module: string
  actief: boolean
  module_status: ModuleStatus
  geactiveerd_op: string | null
  gestopt_op: string | null
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
  // Rol binnen het bedrijf (los van het systeemrecht mag_bedrijf_beheren).
  functiegroep_id: string | null
  // Dienstverband (voor naar-rato in het toolbox-dashboard); nullable.
  datum_in_dienst: string | null
  datum_uit_dienst: string | null
}

// Een functiegroep is wat iemand in het bedrijf doet (QHSE-er, Uitvoerder, …).
// Per bedrijf beheerd; soft-delete via gearchiveerd_op.
export type Functiegroep = {
  id: string
  company_id: string
  naam: string
  volgorde: number
  gearchiveerd_op: string | null
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
  // Doelrol: voor wie is deze checklist bedoeld. null = voor iedereen.
  doel_functiegroep_id: string | null
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
  rubriek_naam_snap: string | null   // bevroren rubriek (null = vrij sjabloon zonder rubriek)
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

// ---- Rapporten-bibliotheek (stap 2: lezen/presenteren) ----

// Eén samenvattingsregel uit de RPC inspectie_bibliotheek(p_company_id).
// Superset van Inspectie (zodat een lopende inspectie ook voortgezet kan worden)
// plus de cijfers en de uitvoerder voor het archiefoverzicht.
export type BibliotheekRegel = Inspectie & {
  aangemaakt_op: string | null
  uitvoerder_naam: string | null
  aantal_punten: number
  aantal_niet_in_orde: number
  aantal_acties: number
}

// Eén bevinding zoals de rapportpagina hem toont (uit inspectie_rapport).
export type RapportBevinding = {
  id: string
  volgorde: number
  rubriek_naam_snap: string | null
  punt_tekst_snap: string
  verplicht: boolean
  resultaat: BevindingResultaat | null
  afhandeling: BevindingAfhandeling
  opmerking: string | null
  actie_id: string | null
  actie_nr: string | null
}

// Een uit de inspectie voortgekomen PvA-actie (gekoppeld via bron_type/bron_id).
export type RapportActie = {
  id: string
  nr: string
  onderwerp: string | null
  status: string
  prio: string | null
}

// Eén historieregel als tijdlijn-item op het rapport.
export type RapportHistorie = {
  id: string
  wijziging: string
  wanneer: string
  wie_naam: string | null
}

// Payload van de RPC inspectie_rapport(p_inspectie_id): één inspectie volledig.
export type InspectieRapport = {
  id: string
  company_id: string
  company_naam: string
  naam: string | null
  controlesoort: string | null
  status: InspectieStatus
  gepland_op: string | null
  uitgevoerd_op: string | null
  aangemaakt_op: string | null
  conclusie: string | null
  uitvoerder_naam: string | null
  bevindingen: RapportBevinding[]
  acties: RapportActie[]
  historie: RapportHistorie[]
}

// ---- Centrale inspectie-bibliotheek (de norm, beheerd door admin) ----

export type CentraleRubriek = {
  id: string
  naam: string
  volgorde: number
  rie_code: string | null          // intern dossierveld; NIET voor de uitvoerder
  versie: number
  gewijzigd_op: string
  gearchiveerd_op: string | null
}

export type CentraleVraag = {
  id: string
  rubriek_id: string
  tekst: string
  volgorde: number
  versie: number
  gewijzigd_op: string
  gearchiveerd_op: string | null
}

export type CentraleRubriekMetVragen = CentraleRubriek & { vragen: CentraleVraag[] }

// ---- Klantzijde: norm-overzicht (RPC bedrijf_norm_overzicht) ----

export type NormAfwijking = {
  modus: 'lokaal' | 'uit'
  lokale_tekst: string | null
  basis_versie: number
}

export type NormVraag = {
  vraag_id: string
  volgorde: number
  centrale_tekst: string
  centrale_versie: number
  afwijking: NormAfwijking | null
  norm_gewijzigd: boolean        // afgeweken én de centrale norm is sindsdien gewijzigd
  centraal_vervallen: boolean    // centraal gearchiveerd, maar lokaal behouden
  actief: boolean                // false = lokaal uitgezet
  geldende_tekst: string | null  // effectief: lokaal/centraal, of null bij 'uit'
}

export type NormRubriek = {
  rubriek_id: string
  naam: string
  volgorde: number
  gekoppeld: boolean
  vragen: NormVraag[]
}

// ---- Toolbox-module ----

export type CentraleToolboxVraag = {
  id: string
  toolbox_id: string
  vraagtekst: string
  opties: string[]
  juist_antwoord: number
  uitleg: string | null
  volgorde: number
  versie: number
  gearchiveerd_op: string | null
}

export type CentraleToolbox = {
  id: string
  titel: string
  tekst: string
  video_url: string | null
  vereist_video: boolean
  vereist_quiz: boolean
  quiz_slaaggrens: number
  quiz_uitleg_modus: 'per_vraag' | 'aan_eind'
  toegang: 'link' | 'login'
  volgorde: number
  versie: number
  gearchiveerd_op: string | null
}

export type CentraleToolboxMetVragen = CentraleToolbox & { vragen: CentraleToolboxVraag[] }

// Onderwerpenbibliotheek: beheerde links naar externe toolbox-bronnen (0043).
// Centraal, geen company_id — elke ingelogde gebruiker leest, alleen admin schrijft.
export type ToolboxBron = {
  id: string
  naam: string
  url: string
  omschrijving: string | null
  volgorde: number
  gearchiveerd_op: string | null
}

// Eén regel uit bedrijf_toolbox_overzicht (KAM-zijde: koppeling + lokale afwijking).
export type ToolboxOverzichtItem = {
  toolbox_id: string
  volgorde: number
  gekoppeld: boolean
  centrale_titel: string
  centrale_tekst: string
  centrale_video_url: string | null
  centrale_versie: number
  vereist_video: boolean
  vereist_quiz: boolean
  quiz_uitleg_modus: 'per_vraag' | 'aan_eind'
  toegang: 'link' | 'login'
  quiz_aantal: number
  centraal_vervallen: boolean
  afwijking: {
    modus: 'lokaal' | 'uit'
    lokale_titel: string | null
    lokale_tekst: string | null
    lokale_video_url: string | null
    basis_versie: number
  } | null
  norm_gewijzigd: boolean
  actief: boolean
  geldende_titel: string
  geldende_tekst: string
  geldende_video_url: string | null
}

// Wat de werknemer via zijn token ziet (RPC toolbox_voor_token).
export type WerknemerQuizVraag = {
  id: string
  vraagtekst: string
  opties: string[]
  juist_antwoord: number
  uitleg: string | null
}

export type WerknemerToolbox = {
  toolbox_id: string
  titel: string
  tekst: string
  video_url: string | null
  vereist_video: boolean
  vereist_quiz: boolean
  quiz_slaaggrens: number
  quiz_uitleg_modus: 'per_vraag' | 'aan_eind'
  vragen: WerknemerQuizVraag[]
  afgerond_dit_jaar: boolean
}

// Live toolbox-doelstellingen-dashboard (RPC toolbox_dashboard).
export type ToolboxDashboardStatus = 'loopt_achter' | 'op_schema' | 'klaar' | 'geen_doel' | 'uit_dienst'

export type ToolboxDashboardPersoon = {
  persoon_id: string
  naam: string
  functiegroep_naam: string | null
  doel: number
  gedaan: number
  verwacht_nu: number
  status: ToolboxDashboardStatus
  datum_in_dienst: string | null
  datum_uit_dienst: string | null
}

export type ToolboxDashboardGroep = {
  functiegroep_id: string
  naam: string | null
  aantal_personen: number
  doel: number
  gedaan: number
  pct: number | null
}

export type ToolboxDashboard = {
  jaar: number
  bedrijf: { doel: number; gedaan: number; pct: number | null }
  per_functiegroep: ToolboxDashboardGroep[]
  personen: ToolboxDashboardPersoon[]
}

// ---- Toolbox-sessies (aanwezigheid — tweede telwijze naast naar-rato) ----

// Eén gehouden sessie met zijn opkomst (RPC toolbox_sessies_overzicht).
export type ToolboxSessieRegel = {
  sessie_id: string
  datum: string
  onderwerp: string
  notitie: string | null
  toolbox_id: string | null
  opkomst: number
  aanwezigen: string[]   // persoon_ids die aanwezig waren
}

// Per persoon het aantal bijgewoonde sessies. NEUTRAAL: geen doel, geen achterstand.
export type ToolboxSessiePersoon = {
  persoon_id: string
  naam: string
  functiegroep_naam: string | null
  bijgewoond: number
}

export type ToolboxSessiesOverzicht = {
  totaal_sessies: number
  sessie_doel_per_jaar: number
  sessies: ToolboxSessieRegel[]
  personen: ToolboxSessiePersoon[]
}

// ---- Toolbox juridische export (snapshot-only) ----

export type ToolboxBewijssoort = 'digitaal' | 'fysiek_aanwezig'
export type ToolboxQuizResultaat = { score: number; totaal: number; pct: number; gehaald: boolean }

export type ToolboxBewijsQuizVraag = {
  vraagtekst: string
  opties: string[]
  juist_antwoord: number
  uitleg: string | null
  gekozen: number
}

// Eén volledig bewijsstuk (RPC toolbox_bewijs) — alles uit het bevroren snapshot.
export type ToolboxBewijs = {
  id: string
  company_id: string
  bedrijf_naam: string
  bewijssoort: ToolboxBewijssoort
  bevestigde_naam: string
  naam_bevestigd: boolean
  afgerond_op: string
  titel_snap: string
  tekst_snap: string
  video_url_snap: string | null
  video_bekeken: boolean
  quiz_snap: ToolboxBewijsQuizVraag[]
  quiz_resultaat: ToolboxQuizResultaat | null
  handtekening: string | null
  handtekening_gezet_op: string | null
  presentielijst_pad: string | null
}

// Eén regel uit het bedrijfsoverzicht (RPC toolbox_bewijs_overzicht).
export type ToolboxBewijsRegel = {
  id: string
  bevestigde_naam: string
  titel_snap: string
  afgerond_op: string
  getekend: boolean
  bewijssoort: ToolboxBewijssoort
  quiz_resultaat: ToolboxQuizResultaat | null
}

// ---- Managementdashboard ----

// Payload van de RPC dashboard_overzicht(p_company_id): alle tegelcijfers van één bedrijf.
export type DashboardOverzicht = {
  pva: { totaal: number; open: number; in_behandeling: number; afgerond: number; pct: number }
  te_beoordelen: number
  prio_open: { Hoog: number; Middel: number; Laag: number }
  termijn: { over: number; binnenkort: number; zonder_datum: number }
  rie: { versie: number; status: string; toets_datum: string | null; geldig_tot: string | null; verloopt_binnenkort: boolean } | null
  inspecties: { open: number; afgerond: number; open_bevindingen: number }
  // Inspectie-doel per persoon (bedrijf_inspectie_doel) vs afgeronde inspecties dit jaar.
  inspectie_doel: {
    totaal_doel: number
    totaal_gedaan: number
    personen: { naam: string; doel: number; gedaan: number }[]
  }
  // Toolbox-aanwezigheid per sessie (tweede telwijze, los van naar-rato).
  toolbox_sessies: { sessies: number; aanwezig: number }
  incidenten: {
    totaal: number
    per_status: { open: number; in_onderzoek: number; afgehandeld: number }
    per_gevolg: Record<string, number>
  }
  norm_bijgewerkt: number   // afwijkende punten waar de centrale norm is bijgewerkt
  bewijs: { afgerond_met_bewijs: number; afgerond_zonder_bewijs: number }
  // Handmatige bedrijfsvoering-velden (null tot er iets is ingevuld).
  instellingen: DashboardInstelling | null
}

// De handmatige bedrijfsvoering-velden (bedrijf_dashboard_instelling).
export type DashboardInstelling = {
  klachten_aantal: number
  tevredenheid_score: number | null
  tevredenheid_toelichting: string | null
  audit_intern_gedaan: number
  audit_intern_totaal: number
  audit_extern_omschrijving: string | null
  audit_status: string | null
  doelstelling_tekst: string | null
  iso_taken_tekst: string | null
  if_dit_jaar: number | null
  if_vorig_jaar: number | null
  updated_at: string
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
