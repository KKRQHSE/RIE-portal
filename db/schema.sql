-- RI&E-portaal — schemadump (public)
-- Gegenereerd door scripts/dump_schema.mjs op 2026-07-06T15:40:52.392Z
-- Bron van waarheid voor het databaseschema. NIET handmatig bewerken;
-- regenereer met: node scripts/dump_schema.mjs
-- PostgreSQL: PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
--
-- Let op: dit is een review-/migratiedump van de public-schema. De auth-,
-- storage- en realtime-schema's van Supabase worden NIET gedumpt (beheerd door het platform),
-- behalve de expliciete integratie-trigger op auth.users onderaan.

-- Functies verwijzen naar elkaar; net als pg_dump stellen we de body-check uit
-- zodat de dump in willekeurige volgorde herspeelbaar is.
SET check_function_bodies = false;

-- ============================================================
-- Extensies (informatief — meestal door Supabase beheerd)
-- ============================================================

-- extension pg_stat_statements v1.11 (schema extensions)
-- extension pgcrypto v1.3 (schema extensions)
-- extension plpgsql v1.0 (schema pg_catalog)
-- extension supabase_vault v0.3.1 (schema vault)
-- extension uuid-ossp v1.1 (schema extensions)

-- ============================================================
-- Tabellen
-- ============================================================


CREATE TABLE public.actie_historie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  pva_item_id uuid NOT NULL,
  gebeurtenis text NOT NULL,
  van_status text,
  naar_status text,
  opmerking text,
  actor_naam text,
  actor_type text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_doelstelling (
  company_id uuid NOT NULL,
  functiegroep_id uuid NOT NULL,
  doel_per_jaar integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_inspectie_doel (
  company_id uuid NOT NULL,
  persoon_id uuid NOT NULL,
  doel_per_jaar integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_modules (
  company_id uuid NOT NULL,
  module text NOT NULL,
  actief boolean DEFAULT true NOT NULL,
  module_status text DEFAULT 'geen'::text NOT NULL,
  geactiveerd_op timestamp with time zone,
  gestopt_op timestamp with time zone
);

CREATE TABLE public.bedrijf_rubriek (
  company_id uuid NOT NULL,
  rubriek_id uuid NOT NULL,
  gekoppeld_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_toolbox (
  company_id uuid NOT NULL,
  toolbox_id uuid NOT NULL,
  gekoppeld_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_toolbox_afwijking (
  company_id uuid NOT NULL,
  toolbox_id uuid NOT NULL,
  modus text NOT NULL,
  lokale_titel text,
  lokale_tekst text,
  lokale_video_url text,
  basis_versie integer NOT NULL,
  afgeweken_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bedrijf_vraag_afwijking (
  company_id uuid NOT NULL,
  vraag_id uuid NOT NULL,
  modus text NOT NULL,
  lokale_tekst text,
  basis_versie integer NOT NULL,
  afgeweken_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bewijs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  pva_item_id uuid NOT NULL,
  pad text NOT NULL,
  bestandsnaam text,
  type text,
  grootte bigint,
  geupload_door text,
  uploader_type text,
  verwijderd_op timestamp with time zone,
  verwijderd_door text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.centrale_rubriek (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  naam text NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  rie_code text,
  versie integer DEFAULT 1 NOT NULL,
  gewijzigd_op timestamp with time zone DEFAULT now() NOT NULL,
  gearchiveerd_op timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.centrale_toolbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titel text NOT NULL,
  tekst text DEFAULT ''::text NOT NULL,
  video_url text,
  vereist_video boolean DEFAULT true NOT NULL,
  vereist_quiz boolean DEFAULT false NOT NULL,
  quiz_slaaggrens integer DEFAULT 70 NOT NULL,
  quiz_uitleg_modus text DEFAULT 'aan_eind'::text NOT NULL,
  toegang text DEFAULT 'link'::text NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  versie integer DEFAULT 1 NOT NULL,
  gewijzigd_op timestamp with time zone DEFAULT now() NOT NULL,
  gearchiveerd_op timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.centrale_toolbox_vraag (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  toolbox_id uuid NOT NULL,
  vraagtekst text NOT NULL,
  opties jsonb DEFAULT '[]'::jsonb NOT NULL,
  juist_antwoord integer DEFAULT 0 NOT NULL,
  uitleg text,
  volgorde integer DEFAULT 0 NOT NULL,
  versie integer DEFAULT 1 NOT NULL,
  gewijzigd_op timestamp with time zone DEFAULT now() NOT NULL,
  gearchiveerd_op timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.centrale_vraag (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rubriek_id uuid NOT NULL,
  tekst text NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  versie integer DEFAULT 1 NOT NULL,
  gewijzigd_op timestamp with time zone DEFAULT now() NOT NULL,
  gearchiveerd_op timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  kvk text,
  dataset jsonb,
  approved_at timestamp with time zone,
  approved_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  merk_id uuid,
  huisstijl_modus text DEFAULT 'default'::text NOT NULL,
  klant_logo_pad text,
  accent_kleur_override text
);

CREATE TABLE public.deellinks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  persoon_id uuid NOT NULL,
  token text NOT NULL,
  vervalt_op timestamp with time zone,
  ingetrokken boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fotos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  nr integer NOT NULL,
  bestand text,
  locatie text,
  zie text,
  betekenis text,
  refs text[] DEFAULT '{}'::text[],
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  rie_versie_id uuid
);

CREATE TABLE public.functiegroep (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  gearchiveerd_op timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.herinner_instelling (
  company_id uuid NOT NULL,
  ritme text DEFAULT 'uit'::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.herinnering_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  persoon_id uuid NOT NULL,
  verzonden_op timestamp with time zone DEFAULT now() NOT NULL,
  bron text NOT NULL,
  aantal_acties integer DEFAULT 0 NOT NULL,
  acties jsonb DEFAULT '[]'::jsonb NOT NULL,
  door uuid,
  email text
);

CREATE TABLE public.incident (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  datum date NOT NULL,
  tijd time without time zone,
  locatie text NOT NULL,
  project text,
  omschrijving text NOT NULL,
  naam_melder text,
  gevolgen text[] DEFAULT '{}'::text[] NOT NULL,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  directe_oorzaken integer[] DEFAULT '{}'::integer[] NOT NULL,
  basis_oorzaken integer[] DEFAULT '{}'::integer[] NOT NULL,
  oorzaak_toelichting text,
  onderzoeksrapportage_bijgevoegd boolean DEFAULT false NOT NULL,
  telefonische_melding_directie boolean DEFAULT false NOT NULL,
  telefonische_melding_aan text,
  maatregelen_in_actielijst boolean DEFAULT false NOT NULL,
  tra_aanpassen boolean DEFAULT false NOT NULL,
  andere_maatregelen text,
  besproken_in_toolbox_datum date,
  functie_slachtoffer text,
  medische_dienst_bezocht text,
  actie_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  toolbox_push_id uuid,
  afgehandeld_op timestamp with time zone,
  laatst_bijgewerkt_op timestamp with time zone
);

CREATE TABLE public.incident_basis_oorzaak (
  code integer NOT NULL,
  omschrijving text NOT NULL
);

CREATE TABLE public.incident_directe_oorzaak (
  code integer NOT NULL,
  omschrijving text NOT NULL
);

CREATE TABLE public.incident_foto (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  incident_id uuid NOT NULL,
  company_id uuid NOT NULL,
  storage_pad text NOT NULL,
  bestandsnaam text,
  type text,
  grootte bigint,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.incident_gevolg_soort (
  code text NOT NULL,
  omschrijving text NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.incident_meldlink (
  company_id uuid NOT NULL,
  token text NOT NULL,
  ingetrokken boolean DEFAULT false NOT NULL,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
  aangemaakt_door uuid
);

CREATE TABLE public.inspectie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  sjabloon_id uuid,
  persoon_id uuid,
  status text DEFAULT 'concept'::text NOT NULL,
  gepland_op date,
  uitgevoerd_op timestamp with time zone,
  conclusie text,
  sjabloon_naam_snap text,
  controlesoort_snap text,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.inspectie_bevinding (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  inspectie_id uuid NOT NULL,
  punt_tekst_snap text NOT NULL,
  resultaat text,
  afhandeling text DEFAULT 'geen'::text NOT NULL,
  actie_id uuid,
  opmerking text,
  verplicht boolean DEFAULT false NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  rubriek_naam_snap text
);

CREATE TABLE public.inspectie_historie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  inspectie_id uuid NOT NULL,
  wie uuid,
  wanneer timestamp with time zone DEFAULT now() NOT NULL,
  wijziging text NOT NULL
);

CREATE TABLE public.inspectie_sjabloon (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  controlesoort text,
  actief boolean DEFAULT true NOT NULL,
  gearchiveerd_op timestamp with time zone,
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
  doel_functiegroep_id uuid
);

CREATE TABLE public.inspectie_sjabloon_punt (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  sjabloon_id uuid NOT NULL,
  volgorde integer DEFAULT 0 NOT NULL,
  tekst text NOT NULL,
  verplicht boolean DEFAULT true NOT NULL
);

CREATE TABLE public.merken (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  naam text NOT NULL,
  logo_pad text,
  accent_kleur text DEFAULT '#FF5200'::text NOT NULL,
  lettertype text DEFAULT 'grotesk'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.module_historie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  module text NOT NULL,
  wie uuid,
  wanneer timestamp with time zone DEFAULT now() NOT NULL,
  wijziging text NOT NULL
);

CREATE TABLE public.modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  code text NOT NULL,
  titel text,
  intro text,
  volgorde integer,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  rie_versie_id uuid
);

CREATE TABLE public.personen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  naam text NOT NULL,
  email text,
  status text DEFAULT 'actief'::text NOT NULL,
  voorgesteld_door uuid,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  functiegroep_id uuid,
  datum_in_dienst date,
  datum_uit_dienst date
);

CREATE TABLE public.pva_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  nr text NOT NULL,
  onderwerp text,
  maatregel text,
  tree text,
  ref text,
  prio text,
  termijn text,
  verantw text,
  status text DEFAULT 'Open'::text NOT NULL,
  opm text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by text,
  persoon_id uuid,
  concept_status text,
  concept_opm text,
  concept_at timestamp with time zone,
  vrijgegeven_op timestamp with time zone,
  vrijgegeven_door text,
  vrijgave_opmerking text,
  vrijgave_bewijs text,
  rie_versie_id uuid,
  bron_type text,
  bron_id uuid,
  termijn_datum date
);

CREATE TABLE public.rie_versies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  versie integer NOT NULL,
  status text DEFAULT 'concept'::text NOT NULL,
  toets_datum timestamp with time zone,
  geldig_tot timestamp with time zone,
  vrijgegeven_door text,
  opmerking text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.toolbox_deelname (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  persoon_id uuid NOT NULL,
  toolbox_id uuid,
  bewijssoort text DEFAULT 'digitaal'::text NOT NULL,
  titel_snap text NOT NULL,
  tekst_snap text NOT NULL,
  video_url_snap text,
  quiz_snap jsonb DEFAULT '[]'::jsonb NOT NULL,
  afgerond_op timestamp with time zone DEFAULT now() NOT NULL,
  video_bekeken boolean DEFAULT false NOT NULL,
  quiz_resultaat jsonb,
  naam_bevestigd boolean DEFAULT false NOT NULL,
  bevestigde_naam text NOT NULL,
  handtekening text,
  handtekening_gezet_op timestamp with time zone,
  presentielijst_pad text,
  planning_toewijzing_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sessie_id uuid
);

CREATE TABLE public.toolbox_sessie (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  datum date NOT NULL,
  onderwerp text NOT NULL,
  notitie text,
  toolbox_id uuid,
  aangemaakt_door uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  company_id uuid,
  role text DEFAULT 'client'::text NOT NULL,
  email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  naam text
);

CREATE TABLE public.vragen (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  module_id uuid NOT NULL,
  nr text NOT NULL,
  vraag text,
  antwoord text,
  bevinding text,
  brf text,
  klasse text,
  pva text,
  volgorde integer,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by text,
  rie_versie_id uuid
);

-- ============================================================
-- Constraints
-- ============================================================

ALTER TABLE public.actie_historie ADD CONSTRAINT actie_historie_pkey PRIMARY KEY (id);
ALTER TABLE public.bedrijf_doelstelling ADD CONSTRAINT bedrijf_doelstelling_pkey PRIMARY KEY (company_id, functiegroep_id);
ALTER TABLE public.bedrijf_inspectie_doel ADD CONSTRAINT bedrijf_inspectie_doel_pkey PRIMARY KEY (company_id, persoon_id);
ALTER TABLE public.bedrijf_modules ADD CONSTRAINT bedrijf_modules_pkey PRIMARY KEY (company_id, module);
ALTER TABLE public.bedrijf_rubriek ADD CONSTRAINT bedrijf_rubriek_pkey PRIMARY KEY (company_id, rubriek_id);
ALTER TABLE public.bedrijf_toolbox ADD CONSTRAINT bedrijf_toolbox_pkey PRIMARY KEY (company_id, toolbox_id);
ALTER TABLE public.bedrijf_toolbox_afwijking ADD CONSTRAINT bedrijf_toolbox_afwijking_pkey PRIMARY KEY (company_id, toolbox_id);
ALTER TABLE public.bedrijf_vraag_afwijking ADD CONSTRAINT bedrijf_vraag_afwijking_pkey PRIMARY KEY (company_id, vraag_id);
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_pkey PRIMARY KEY (id);
ALTER TABLE public.centrale_rubriek ADD CONSTRAINT centrale_rubriek_pkey PRIMARY KEY (id);
ALTER TABLE public.centrale_toolbox ADD CONSTRAINT centrale_toolbox_pkey PRIMARY KEY (id);
ALTER TABLE public.centrale_toolbox_vraag ADD CONSTRAINT centrale_toolbox_vraag_pkey PRIMARY KEY (id);
ALTER TABLE public.centrale_vraag ADD CONSTRAINT centrale_vraag_pkey PRIMARY KEY (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_pkey PRIMARY KEY (id);
ALTER TABLE public.fotos ADD CONSTRAINT fotos_pkey PRIMARY KEY (id);
ALTER TABLE public.functiegroep ADD CONSTRAINT functiegroep_pkey PRIMARY KEY (id);
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_pkey PRIMARY KEY (company_id);
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_pkey PRIMARY KEY (id);
ALTER TABLE public.incident ADD CONSTRAINT incident_pkey PRIMARY KEY (id);
ALTER TABLE public.incident_basis_oorzaak ADD CONSTRAINT incident_basis_oorzaak_pkey PRIMARY KEY (code);
ALTER TABLE public.incident_directe_oorzaak ADD CONSTRAINT incident_directe_oorzaak_pkey PRIMARY KEY (code);
ALTER TABLE public.incident_foto ADD CONSTRAINT incident_foto_pkey PRIMARY KEY (id);
ALTER TABLE public.incident_gevolg_soort ADD CONSTRAINT incident_gevolg_soort_pkey PRIMARY KEY (code);
ALTER TABLE public.incident_meldlink ADD CONSTRAINT incident_meldlink_pkey PRIMARY KEY (company_id);
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_historie ADD CONSTRAINT inspectie_historie_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_sjabloon ADD CONSTRAINT inspectie_sjabloon_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_pkey PRIMARY KEY (id);
ALTER TABLE public.merken ADD CONSTRAINT merken_pkey PRIMARY KEY (id);
ALTER TABLE public.module_historie ADD CONSTRAINT module_historie_pkey PRIMARY KEY (id);
ALTER TABLE public.modules ADD CONSTRAINT modules_pkey PRIMARY KEY (id);
ALTER TABLE public.personen ADD CONSTRAINT personen_pkey PRIMARY KEY (id);
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_pkey PRIMARY KEY (id);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_pkey PRIMARY KEY (id);
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT toolbox_deelname_pkey PRIMARY KEY (id);
ALTER TABLE public.toolbox_sessie ADD CONSTRAINT toolbox_sessie_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.vragen ADD CONSTRAINT vragen_pkey PRIMARY KEY (id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_persoon_id_key UNIQUE (persoon_id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_token_key UNIQUE (token);
ALTER TABLE public.fotos ADD CONSTRAINT fotos_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.incident_meldlink ADD CONSTRAINT incident_meldlink_token_key UNIQUE (token);
ALTER TABLE public.modules ADD CONSTRAINT modules_company_id_code_key UNIQUE (company_id, code);
ALTER TABLE public.personen ADD CONSTRAINT personen_company_id_email_key UNIQUE (company_id, email);
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_company_id_versie_key UNIQUE (company_id, versie);
ALTER TABLE public.vragen ADD CONSTRAINT vragen_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.bedrijf_doelstelling ADD CONSTRAINT doelstelling_niet_negatief CHECK ((doel_per_jaar >= 0));
ALTER TABLE public.bedrijf_inspectie_doel ADD CONSTRAINT inspectie_doel_niet_negatief CHECK ((doel_per_jaar >= 0));
ALTER TABLE public.bedrijf_modules ADD CONSTRAINT bedrijf_modules_module_status_check CHECK ((module_status = ANY (ARRAY['geen'::text, 'actief'::text, 'gestopt'::text])));
ALTER TABLE public.bedrijf_toolbox_afwijking ADD CONSTRAINT toolbox_afw_lokaal_check CHECK ((((modus = 'lokaal'::text) AND (lokale_tekst IS NOT NULL) AND (btrim(lokale_tekst) <> ''::text)) OR ((modus = 'uit'::text) AND (lokale_titel IS NULL) AND (lokale_tekst IS NULL) AND (lokale_video_url IS NULL))));
ALTER TABLE public.bedrijf_toolbox_afwijking ADD CONSTRAINT toolbox_afw_modus_check CHECK ((modus = ANY (ARRAY['lokaal'::text, 'uit'::text])));
ALTER TABLE public.bedrijf_vraag_afwijking ADD CONSTRAINT afwijking_lokale_tekst CHECK ((((modus = 'lokaal'::text) AND (lokale_tekst IS NOT NULL) AND (btrim(lokale_tekst) <> ''::text)) OR ((modus = 'uit'::text) AND (lokale_tekst IS NULL))));
ALTER TABLE public.bedrijf_vraag_afwijking ADD CONSTRAINT afwijking_modus_check CHECK ((modus = ANY (ARRAY['lokaal'::text, 'uit'::text])));
ALTER TABLE public.centrale_toolbox ADD CONSTRAINT toolbox_slaaggrens_check CHECK (((quiz_slaaggrens >= 0) AND (quiz_slaaggrens <= 100)));
ALTER TABLE public.centrale_toolbox ADD CONSTRAINT toolbox_toegang_check CHECK ((toegang = ANY (ARRAY['link'::text, 'login'::text])));
ALTER TABLE public.centrale_toolbox ADD CONSTRAINT toolbox_uitleg_modus_check CHECK ((quiz_uitleg_modus = ANY (ARRAY['per_vraag'::text, 'aan_eind'::text])));
ALTER TABLE public.companies ADD CONSTRAINT companies_huisstijl_modus_check CHECK ((huisstijl_modus = ANY (ARRAY['default'::text, 'co_branding'::text, 'white_label'::text])));
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_ritme_check CHECK ((ritme = ANY (ARRAY['uit'::text, 'dagelijks'::text, 'wekelijks'::text, 'maandelijks'::text])));
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_bron_check CHECK ((bron = ANY (ARRAY['handmatig'::text, 'automatisch'::text])));
ALTER TABLE public.incident ADD CONSTRAINT incident_medische_dienst_check CHECK (((medische_dienst_bezocht IS NULL) OR (medische_dienst_bezocht = ANY (ARRAY['ja'::text, 'nee'::text, 'onbekend'::text]))));
ALTER TABLE public.incident ADD CONSTRAINT incident_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_onderzoek'::text, 'afgehandeld'::text])));
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_status_check CHECK ((status = ANY (ARRAY['concept'::text, 'ingediend'::text, 'afgerond'::text, 'geannuleerd'::text])));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_actie_id_klopt CHECK ((((afhandeling = 'actie'::text) AND (actie_id IS NOT NULL)) OR ((afhandeling <> 'actie'::text) AND (actie_id IS NULL))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_afhandeling_klopt CHECK ((((resultaat IS NULL) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'in_orde'::text) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'nvt'::text) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'niet_in_orde'::text) AND (afhandeling = ANY (ARRAY['geen'::text, 'meteen_hersteld'::text, 'actie'::text])))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_hersteld_bewijs CHECK (((afhandeling <> 'meteen_hersteld'::text) OR ((opmerking IS NOT NULL) AND (btrim(opmerking) <> ''::text))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_afhandeling_check CHECK ((afhandeling = ANY (ARRAY['geen'::text, 'meteen_hersteld'::text, 'actie'::text])));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_resultaat_check CHECK ((resultaat = ANY (ARRAY['in_orde'::text, 'niet_in_orde'::text, 'nvt'::text])));
ALTER TABLE public.merken ADD CONSTRAINT merken_lettertype_check CHECK ((lettertype = ANY (ARRAY['grotesk'::text, 'modern'::text, 'klassiek'::text, 'zakelijk'::text])));
ALTER TABLE public.personen ADD CONSTRAINT personen_status_check CHECK ((status = ANY (ARRAY['actief'::text, 'voorgesteld'::text])));
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In behandeling'::text, 'Afgerond'::text])));
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT deelname_bewijssoort_check CHECK ((bewijssoort = ANY (ARRAY['digitaal'::text, 'fysiek_aanwezig'::text])));
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT deelname_digitaal_bewijs CHECK (((bewijssoort <> 'digitaal'::text) OR ((naam_bevestigd = true) AND (handtekening IS NOT NULL) AND (btrim(handtekening) <> ''::text) AND (handtekening_gezet_op IS NOT NULL))));
ALTER TABLE public.toolbox_sessie ADD CONSTRAINT toolbox_sessie_onderwerp_check CHECK ((btrim(onderwerp) <> ''::text));
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'admin'::text])));
ALTER TABLE public.actie_historie ADD CONSTRAINT actie_historie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.actie_historie ADD CONSTRAINT actie_historie_pva_item_id_fkey FOREIGN KEY (pva_item_id) REFERENCES pva_items(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_doelstelling ADD CONSTRAINT bedrijf_doelstelling_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_doelstelling ADD CONSTRAINT bedrijf_doelstelling_functiegroep_id_fkey FOREIGN KEY (functiegroep_id) REFERENCES functiegroep(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_inspectie_doel ADD CONSTRAINT bedrijf_inspectie_doel_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_inspectie_doel ADD CONSTRAINT bedrijf_inspectie_doel_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_modules ADD CONSTRAINT bedrijf_modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_rubriek ADD CONSTRAINT bedrijf_rubriek_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_rubriek ADD CONSTRAINT bedrijf_rubriek_rubriek_id_fkey FOREIGN KEY (rubriek_id) REFERENCES centrale_rubriek(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_toolbox ADD CONSTRAINT bedrijf_toolbox_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_toolbox ADD CONSTRAINT bedrijf_toolbox_toolbox_id_fkey FOREIGN KEY (toolbox_id) REFERENCES centrale_toolbox(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_toolbox_afwijking ADD CONSTRAINT bedrijf_toolbox_afwijking_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_toolbox_afwijking ADD CONSTRAINT bedrijf_toolbox_afwijking_toolbox_id_fkey FOREIGN KEY (toolbox_id) REFERENCES centrale_toolbox(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_vraag_afwijking ADD CONSTRAINT bedrijf_vraag_afwijking_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_vraag_afwijking ADD CONSTRAINT bedrijf_vraag_afwijking_vraag_id_fkey FOREIGN KEY (vraag_id) REFERENCES centrale_vraag(id) ON DELETE CASCADE;
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_pva_item_id_fkey FOREIGN KEY (pva_item_id) REFERENCES pva_items(id) ON DELETE CASCADE;
ALTER TABLE public.centrale_toolbox_vraag ADD CONSTRAINT centrale_toolbox_vraag_toolbox_id_fkey FOREIGN KEY (toolbox_id) REFERENCES centrale_toolbox(id) ON DELETE CASCADE;
ALTER TABLE public.centrale_vraag ADD CONSTRAINT centrale_vraag_rubriek_id_fkey FOREIGN KEY (rubriek_id) REFERENCES centrale_rubriek(id) ON DELETE CASCADE;
ALTER TABLE public.companies ADD CONSTRAINT companies_merk_id_fkey FOREIGN KEY (merk_id) REFERENCES merken(id) ON DELETE SET NULL;
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
ALTER TABLE public.fotos ADD CONSTRAINT fotos_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.fotos ADD CONSTRAINT fotos_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.functiegroep ADD CONSTRAINT functiegroep_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_door_fkey FOREIGN KEY (door) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
ALTER TABLE public.incident ADD CONSTRAINT incident_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.incident_foto ADD CONSTRAINT incident_foto_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.incident_foto ADD CONSTRAINT incident_foto_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES incident(id) ON DELETE CASCADE;
ALTER TABLE public.incident_meldlink ADD CONSTRAINT incident_meldlink_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE SET NULL;
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_sjabloon_id_fkey FOREIGN KEY (sjabloon_id) REFERENCES inspectie_sjabloon(id) ON DELETE SET NULL;
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_actie_id_fkey FOREIGN KEY (actie_id) REFERENCES pva_items(id) ON DELETE SET NULL;
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_inspectie_id_fkey FOREIGN KEY (inspectie_id) REFERENCES inspectie(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_historie ADD CONSTRAINT inspectie_historie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_historie ADD CONSTRAINT inspectie_historie_inspectie_id_fkey FOREIGN KEY (inspectie_id) REFERENCES inspectie(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_historie ADD CONSTRAINT inspectie_historie_wie_fkey FOREIGN KEY (wie) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.inspectie_sjabloon ADD CONSTRAINT inspectie_sjabloon_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_sjabloon ADD CONSTRAINT inspectie_sjabloon_doel_functiegroep_id_fkey FOREIGN KEY (doel_functiegroep_id) REFERENCES functiegroep(id) ON DELETE SET NULL;
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_sjabloon_id_fkey FOREIGN KEY (sjabloon_id) REFERENCES inspectie_sjabloon(id) ON DELETE CASCADE;
ALTER TABLE public.module_historie ADD CONSTRAINT module_historie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT modules_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.personen ADD CONSTRAINT personen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.personen ADD CONSTRAINT personen_functiegroep_id_fkey FOREIGN KEY (functiegroep_id) REFERENCES functiegroep(id) ON DELETE SET NULL;
ALTER TABLE public.personen ADD CONSTRAINT personen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.personen ADD CONSTRAINT personen_voorgesteld_door_fkey FOREIGN KEY (voorgesteld_door) REFERENCES personen(id) ON DELETE SET NULL;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE SET NULL;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT toolbox_deelname_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT toolbox_deelname_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT toolbox_deelname_sessie_id_fkey FOREIGN KEY (sessie_id) REFERENCES toolbox_sessie(id) ON DELETE CASCADE;
ALTER TABLE public.toolbox_deelname ADD CONSTRAINT toolbox_deelname_toolbox_id_fkey FOREIGN KEY (toolbox_id) REFERENCES centrale_toolbox(id) ON DELETE SET NULL;
ALTER TABLE public.toolbox_sessie ADD CONSTRAINT toolbox_sessie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.toolbox_sessie ADD CONSTRAINT toolbox_sessie_toolbox_id_fkey FOREIGN KEY (toolbox_id) REFERENCES centrale_toolbox(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.vragen ADD CONSTRAINT vragen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.vragen ADD CONSTRAINT vragen_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE;
ALTER TABLE public.vragen ADD CONSTRAINT vragen_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);

-- ============================================================
-- Indexen (overig)
-- ============================================================

CREATE INDEX actie_historie_company_idx ON public.actie_historie USING btree (company_id);
CREATE INDEX actie_historie_item_idx ON public.actie_historie USING btree (pva_item_id);
CREATE INDEX bedrijf_inspectie_doel_company_idx ON public.bedrijf_inspectie_doel USING btree (company_id);
CREATE INDEX bedrijf_rubriek_company_idx ON public.bedrijf_rubriek USING btree (company_id);
CREATE INDEX bedrijf_toolbox_afwijking_company_idx ON public.bedrijf_toolbox_afwijking USING btree (company_id);
CREATE INDEX bedrijf_toolbox_company_idx ON public.bedrijf_toolbox USING btree (company_id);
CREATE INDEX bedrijf_vraag_afwijking_company_idx ON public.bedrijf_vraag_afwijking USING btree (company_id);
CREATE INDEX bevinding_inspectie_idx ON public.inspectie_bevinding USING btree (inspectie_id);
CREATE INDEX bewijs_company_idx ON public.bewijs USING btree (company_id);
CREATE INDEX bewijs_item_idx ON public.bewijs USING btree (pva_item_id);
CREATE INDEX centrale_toolbox_vraag_idx ON public.centrale_toolbox_vraag USING btree (toolbox_id, volgorde);
CREATE INDEX centrale_vraag_rubriek_idx ON public.centrale_vraag USING btree (rubriek_id, volgorde);
CREATE INDEX deellinks_token_idx ON public.deellinks USING btree (token);
CREATE INDEX fotos_company_idx ON public.fotos USING btree (company_id);
CREATE INDEX functiegroep_company_idx ON public.functiegroep USING btree (company_id, volgorde);
CREATE INDEX herinnering_log_company_idx ON public.herinnering_log USING btree (company_id, verzonden_op DESC);
CREATE INDEX herinnering_log_persoon_idx ON public.herinnering_log USING btree (persoon_id, verzonden_op DESC);
CREATE INDEX idx_fotos_rie_versie ON public.fotos USING btree (rie_versie_id);
CREATE INDEX idx_modules_rie_versie ON public.modules USING btree (rie_versie_id);
CREATE INDEX idx_pva_items_rie_versie ON public.pva_items USING btree (rie_versie_id);
CREATE INDEX idx_pva_items_termijn_datum ON public.pva_items USING btree (termijn_datum);
CREATE INDEX idx_vragen_rie_versie ON public.vragen USING btree (rie_versie_id);
CREATE INDEX incident_company_aangemaakt_idx ON public.incident USING btree (company_id, aangemaakt_op);
CREATE INDEX incident_company_datum_idx ON public.incident USING btree (company_id, datum);
CREATE INDEX incident_company_status_idx ON public.incident USING btree (company_id, status);
CREATE INDEX incident_foto_company_idx ON public.incident_foto USING btree (company_id);
CREATE INDEX incident_foto_incident_idx ON public.incident_foto USING btree (incident_id);
CREATE INDEX inspectie_company_idx ON public.inspectie USING btree (company_id, status);
CREATE INDEX inspectie_historie_idx ON public.inspectie_historie USING btree (inspectie_id, wanneer DESC);
CREATE INDEX isp_punt_sjabloon_idx ON public.inspectie_sjabloon_punt USING btree (sjabloon_id, volgorde);
CREATE INDEX module_historie_company_idx ON public.module_historie USING btree (company_id, wanneer DESC);
CREATE INDEX modules_company_idx ON public.modules USING btree (company_id);
CREATE INDEX personen_company_idx ON public.personen USING btree (company_id);
CREATE INDEX pva_items_company_idx ON public.pva_items USING btree (company_id);
CREATE INDEX pva_items_persoon_idx ON public.pva_items USING btree (persoon_id);
CREATE INDEX toolbox_deelname_afgerond_idx ON public.toolbox_deelname USING btree (company_id, afgerond_op);
CREATE INDEX toolbox_deelname_company_idx ON public.toolbox_deelname USING btree (company_id, persoon_id);
CREATE INDEX toolbox_deelname_sessie_idx ON public.toolbox_deelname USING btree (sessie_id) WHERE (sessie_id IS NOT NULL);
CREATE UNIQUE INDEX toolbox_deelname_sessie_persoon_uniek ON public.toolbox_deelname USING btree (sessie_id, persoon_id) WHERE (sessie_id IS NOT NULL);
CREATE UNIQUE INDEX toolbox_deelname_uniek_per_jaar ON public.toolbox_deelname USING btree (company_id, persoon_id, toolbox_id, jaar_utc(afgerond_op)) WHERE (toolbox_id IS NOT NULL);
CREATE INDEX toolbox_sessie_company_idx ON public.toolbox_sessie USING btree (company_id, datum DESC);
CREATE INDEX vragen_company_idx ON public.vragen USING btree (company_id);
CREATE INDEX vragen_module_idx ON public.vragen USING btree (module_id);

-- ============================================================
-- Row Level Security — aanzetten
-- ============================================================

ALTER TABLE public.actie_historie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_doelstelling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_inspectie_doel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_rubriek ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_toolbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_toolbox_afwijking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_vraag_afwijking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewijs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centrale_rubriek ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centrale_toolbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centrale_toolbox_vraag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centrale_vraag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deellinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.functiegroep ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.herinner_instelling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.herinnering_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_basis_oorzaak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_directe_oorzaak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_foto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_gevolg_soort ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_meldlink ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_bevinding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_historie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_sjabloon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_sjabloon_punt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_historie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pva_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rie_versies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_deelname ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_sessie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vragen ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row Level Security — policies
-- ============================================================

CREATE POLICY historie_select ON public.actie_historie AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY bedrijf_doelstelling_sel ON public.bedrijf_doelstelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_inspectie_doel_sel ON public.bedrijf_inspectie_doel AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_modules_sel ON public.bedrijf_modules AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_modules_wr ON public.bedrijf_modules AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_rubriek_sel ON public.bedrijf_rubriek AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_toolbox_sel ON public.bedrijf_toolbox AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_toolbox_afwijking_sel ON public.bedrijf_toolbox_afwijking AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_vraag_afwijking_sel ON public.bedrijf_vraag_afwijking AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bewijs_select ON public.bewijs AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY centrale_rubriek_adm ON public.centrale_rubriek AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY centrale_rubriek_sel ON public.centrale_rubriek AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY centrale_toolbox_adm ON public.centrale_toolbox AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY centrale_toolbox_sel ON public.centrale_toolbox AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY centrale_toolbox_vraag_adm ON public.centrale_toolbox_vraag AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY centrale_toolbox_vraag_sel ON public.centrale_toolbox_vraag AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY centrale_vraag_adm ON public.centrale_vraag AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY centrale_vraag_sel ON public.centrale_vraag AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY companies_admin_update ON public.companies AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY companies_select ON public.companies AS PERMISSIVE FOR SELECT TO public
  USING (((id = my_company_id()) OR is_admin()));
CREATE POLICY deellinks_select ON public.deellinks AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY deellinks_write ON public.deellinks AS PERMISSIVE FOR ALL TO public
  USING (((company_id = my_company_id()) OR is_admin()))
  WITH CHECK (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY fotos_select ON public.fotos AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY functiegroep_sel ON public.functiegroep AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY functiegroep_wr ON public.functiegroep AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY herinner_instelling_select ON public.herinner_instelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY herinner_instelling_write ON public.herinner_instelling AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY herinnering_log_select ON public.herinnering_log AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY incident_sel ON public.incident AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY incident_basis_oorzaak_adm ON public.incident_basis_oorzaak AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY incident_basis_oorzaak_sel ON public.incident_basis_oorzaak AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY incident_directe_oorzaak_adm ON public.incident_directe_oorzaak AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY incident_directe_oorzaak_sel ON public.incident_directe_oorzaak AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY incident_foto_sel ON public.incident_foto AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY incident_gevolg_soort_adm ON public.incident_gevolg_soort AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY incident_gevolg_soort_sel ON public.incident_gevolg_soort AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY incident_meldlink_sel ON public.incident_meldlink AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_sel ON public.inspectie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_wr ON public.inspectie AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_bevinding_sel ON public.inspectie_bevinding AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_bevinding_wr ON public.inspectie_bevinding AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_historie_sel ON public.inspectie_historie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_historie_wr ON public.inspectie_historie AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_sjabloon_sel ON public.inspectie_sjabloon AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_sjabloon_wr ON public.inspectie_sjabloon AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_sjabloon_punt_sel ON public.inspectie_sjabloon_punt AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY inspectie_sjabloon_punt_wr ON public.inspectie_sjabloon_punt AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY merken_admin_all ON public.merken AS PERMISSIVE FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY merken_select ON public.merken AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY module_historie_sel ON public.module_historie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY module_historie_wr ON public.module_historie AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY modules_select ON public.modules AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY personen_select ON public.personen AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY personen_write ON public.personen AS PERMISSIVE FOR ALL TO public
  USING (((company_id = my_company_id()) OR is_admin()))
  WITH CHECK (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY pva_select ON public.pva_items AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY pva_update ON public.pva_items AS PERMISSIVE FOR UPDATE TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY rie_versies_beheer ON public.rie_versies AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY toolbox_deelname_sel ON public.toolbox_deelname AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY toolbox_sessie_sel ON public.toolbox_sessie AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY users_select ON public.users AS PERMISSIVE FOR SELECT TO public
  USING (((id = auth.uid()) OR is_admin()));
CREATE POLICY vragen_select ON public.vragen AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));

-- ============================================================
-- Functies
-- ============================================================

CREATE OR REPLACE FUNCTION public.actie_als_jsonb(p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select to_jsonb(x) from (
    select id, company_id, nr, ref, onderwerp, maatregel, tree, prio, termijn,
           verantw, status, opm, updated_at, updated_by,
           persoon_id, concept_status, concept_opm, concept_at,
           vrijgegeven_op, vrijgegeven_door, vrijgave_opmerking, vrijgave_bewijs
    from public.pva_items where id = p_actie_id
  ) x
$function$;
CREATE OR REPLACE FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item        public.pva_items;
  v_naam        text;
  v_ontvanger_id uuid;
  v_ontvanger   public.personen;
  v_token_ontv  text;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_item.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  v_ontvanger_id := public.vind_of_maak_persoon(v_item.company_id, p_naam, p_email, null);

  update public.pva_items
  set persoon_id = v_ontvanger_id, concept_status = null, concept_opm = null, concept_at = null
  where id = p_actie_id;

  insert into public.deellinks (company_id, persoon_id, token, ingetrokken)
  values (v_item.company_id, v_ontvanger_id,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          false)
  on conflict (persoon_id) do update set ingetrokken = false
  returning token into v_token_ontv;
  if v_token_ontv is null then
    select token into v_token_ontv from public.deellinks where persoon_id = v_ontvanger_id;
  end if;

  select * into v_ontvanger from public.personen where id = v_ontvanger_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'doorgegeven',
     'aan ' || coalesce(v_ontvanger.naam, v_ontvanger.email, 'collega'), v_naam, 'beheerder');

  return jsonb_build_object(
    'ok', true,
    'ontvanger_id', v_ontvanger_id, 'ontvanger_naam', v_ontvanger.naam,
    'ontvanger_email', v_ontvanger.email, 'ontvanger_token', v_token_ontv,
    'bedrijf', (select name from public.companies where id = v_item.company_id),
    'actie_nr', v_item.nr, 'actie_onderwerp', v_item.onderwerp
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.actie_historie_ophalen(p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.pva_items where id = p_actie_id;
  if v_company_id is null then return '[]'::jsonb; end if;
  if not public.mag_bedrijf_beheren(v_company_id) then raise exception 'Geen toegang'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(h) order by h.created_at desc)
    from (
      select gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type, created_at
      from public.actie_historie where pva_item_id = p_actie_id
    ) h
  ), '[]'::jsonb);
end;
$function$;
CREATE OR REPLACE FUNCTION public.bedrijf_norm_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(rub order by rub_volgorde, rub_id), '[]'::jsonb)
  into v
  from (
    select
      r.volgorde as rub_volgorde,
      r.id       as rub_id,
      jsonb_build_object(
        'rubriek_id', r.id,
        'naam',       r.naam,
        'volgorde',   r.volgorde,
        'gekoppeld',  exists (
          select 1 from bedrijf_rubriek br
          where br.company_id = p_company_id and br.rubriek_id = r.id
        ),
        'vragen', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'vraag_id',        q.id,
            'volgorde',        q.volgorde,
            'centrale_tekst',  q.tekst,
            'centrale_versie', q.versie,
            -- Centraal gearchiveerd, maar door dit bedrijf lokaal behouden.
            'centraal_vervallen', (q.gearchiveerd_op is not null),
            'afwijking', case when a.vraag_id is null then null else jsonb_build_object(
              'modus',        a.modus,
              'lokale_tekst', a.lokale_tekst,
              'basis_versie', a.basis_versie
            ) end,
            -- 'norm gewijzigd' alleen bij een nog-actieve centrale vraag; bij een
            -- gearchiveerde vraag geldt 'centraal_vervallen' in plaats daarvan.
            'norm_gewijzigd', (a.vraag_id is not null and q.gearchiveerd_op is null and q.versie > a.basis_versie),
            'actief',         (a.vraag_id is null or a.modus <> 'uit'),
            'geldende_tekst', case
              when a.vraag_id is null    then q.tekst
              when a.modus = 'lokaal'    then a.lokale_tekst
              else null end
          ) order by q.volgorde, q.id), '[]'::jsonb)
          from centrale_vraag q
          left join bedrijf_vraag_afwijking a
            on a.vraag_id = q.id and a.company_id = p_company_id
          where q.rubriek_id = r.id
            -- Actieve vragen, plus gearchiveerde vragen die dit bedrijf lokaal hield.
            and (q.gearchiveerd_op is null or (a.vraag_id is not null and a.modus = 'lokaal'))
        )
      ) as rub
    from centrale_rubriek r
    where
      -- Niet-gearchiveerde rubrieken altijd (ook om te kunnen koppelen);
      -- gearchiveerde rubrieken alleen als dit bedrijf er een lokaal behouden vraag in heeft.
      r.gearchiveerd_op is null
      or exists (
        select 1
        from bedrijf_rubriek br
        join centrale_vraag q2 on q2.rubriek_id = r.id and q2.gearchiveerd_op is not null
        join bedrijf_vraag_afwijking a2 on a2.vraag_id = q2.id
          and a2.company_id = p_company_id and a2.modus = 'lokaal'
        where br.company_id = p_company_id and br.rubriek_id = r.id
      )
  ) s;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bedrijf_toolbox_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select coalesce(jsonb_agg(row order by volg, tid), '[]'::jsonb) into v
  from (
    select t.volgorde as volg, t.id as tid, jsonb_build_object(
      'toolbox_id',        t.id,
      'volgorde',          t.volgorde,
      'gekoppeld',         exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id),
      'centrale_titel',    t.titel,
      'centrale_tekst',    t.tekst,
      'centrale_video_url', t.video_url,
      'centrale_versie',   t.versie,
      'vereist_video',     t.vereist_video,
      'vereist_quiz',      t.vereist_quiz,
      'quiz_uitleg_modus', t.quiz_uitleg_modus,
      'toegang',           t.toegang,
      'quiz_aantal',       (select count(*) from centrale_toolbox_vraag q where q.toolbox_id=t.id and q.gearchiveerd_op is null),
      'centraal_vervallen', (t.gearchiveerd_op is not null),
      'afwijking', case when a.toolbox_id is null then null else jsonb_build_object(
        'modus', a.modus, 'lokale_titel', a.lokale_titel, 'lokale_tekst', a.lokale_tekst,
        'lokale_video_url', a.lokale_video_url, 'basis_versie', a.basis_versie) end,
      'norm_gewijzigd', (a.toolbox_id is not null and t.gearchiveerd_op is null and t.versie > a.basis_versie),
      'actief', (a.toolbox_id is null or a.modus <> 'uit'),
      'geldende_titel', case when a.modus='lokaal' and a.lokale_titel is not null then a.lokale_titel else t.titel end,
      'geldende_tekst', case when a.modus='lokaal' then a.lokale_tekst else t.tekst end,
      'geldende_video_url', case when a.modus='lokaal' and a.lokale_video_url is not null then a.lokale_video_url else t.video_url end
    ) as row
    from centrale_toolbox t
    left join bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = p_company_id
    where t.gearchiveerd_op is null
       or exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id
                    and a.modus = 'lokaal')
  ) s;
  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company   uuid;
  v_inspectie uuid;
  v_status    text;
  v_punt      text;
  v_actie     uuid;
  v_nr        integer;
begin
  select b.company_id, b.inspectie_id, b.punt_tekst_snap, b.actie_id, i.status
    into v_company, v_inspectie, v_punt, v_actie, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  -- Idempotent: hergebruik een eventueel al bestaande actie voor deze bevinding.
  if v_actie is null then
    select id into v_actie
      from pva_items
     where company_id = v_company
       and bron_type  = 'inspectie_bevinding'
       and bron_id    = p_bevinding_id
     limit 1;
  end if;

  if v_actie is null then
    -- Volgend vrij nummer binnen dit bedrijf (nr is tekst, numeriek gebruikt).
    select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
      into v_nr
      from pva_items
     where company_id = v_company;

    insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
    values (v_company, v_nr::text, coalesce(v_punt, 'Inspectiebevinding'),
            'Open', 'Middel', 'inspectie_bevinding', p_bevinding_id, now())
    returning id into v_actie;

    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Actie aangemaakt: ' || coalesce(v_punt, ''));
  end if;

  update inspectie_bevinding
     set afhandeling = 'actie',
         actie_id    = v_actie,
         resultaat   = 'niet_in_orde'
   where id = p_bevinding_id;

  return v_actie;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text DEFAULT 'geen'::text, p_opmerking text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company         uuid;
  v_inspectie       uuid;
  v_status          text;
  v_punt            text;
  v_bestaande_actie uuid;
  v_afh             text;
  v_act             uuid;
  v_opm             text;
begin
  select b.company_id, b.inspectie_id, b.actie_id, b.punt_tekst_snap, i.status
    into v_company, v_inspectie, v_bestaande_actie, v_punt, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;
  if p_resultaat is null or p_resultaat not in ('in_orde', 'niet_in_orde', 'nvt') then
    raise exception 'Ongeldig resultaat';
  end if;

  v_opm := nullif(btrim(coalesce(p_opmerking, '')), '');

  if p_resultaat in ('in_orde', 'nvt') then
    -- Geen afhandeling/actie bij in orde of n.v.t. (ontkoppelt een evt. actie).
    v_afh := 'geen';
    v_act := null;
  else
    -- niet_in_orde
    if p_afhandeling = 'actie' then
      if v_bestaande_actie is null then
        raise exception 'Gebruik bevinding_naar_actie om een actie aan te maken';
      end if;
      v_afh := 'actie';
      v_act := v_bestaande_actie;
    elsif p_afhandeling = 'meteen_hersteld' then
      if v_opm is null then
        raise exception 'Een toelichting is verplicht bij ''meteen hersteld''';
      end if;
      v_afh := 'meteen_hersteld';
      v_act := null;
    else
      v_afh := 'geen';
      v_act := null;
    end if;
  end if;

  update inspectie_bevinding
     set resultaat   = p_resultaat,
         afhandeling = v_afh,
         actie_id    = v_act,
         opmerking   = v_opm
   where id = p_bevinding_id;

  -- Alleen herstel loggen (statuswijziging/herstel/actie), niet elke resultaat-tik.
  if v_afh = 'meteen_hersteld' then
    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Direct hersteld: ' || coalesce(v_punt, ''));
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bewijs_lijst(p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.pva_items where id = p_actie_id;
  if v_company_id is null then return '[]'::jsonb; end if;
  if not public.mag_bedrijf_beheren(v_company_id) then raise exception 'Geen toegang'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(b) order by b.created_at desc)
    from (
      select id, pad, bestandsnaam, type, grootte, geupload_door, uploader_type,
             verwijderd_op, verwijderd_door, created_at
      from public.bewijs
      where pva_item_id = p_actie_id
    ) b
  ), '[]'::jsonb);
end;
$function$;
CREATE OR REPLACE FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pva_items;
  v_naam text;
  v_id   uuid;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_item.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  insert into public.bewijs
    (company_id, pva_item_id, pad, bestandsnaam, type, grootte, geupload_door, uploader_type)
  values
    (v_item.company_id, p_actie_id, p_pad, p_bestandsnaam, p_type, p_grootte, v_naam, 'beheerder')
  returning id into v_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'bewijs_toegevoegd', coalesce(p_bestandsnaam, 'bestand'), v_naam, 'beheerder');

  return public.actie_als_jsonb(p_actie_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bewijs public.bewijs;
  v_naam   text;
begin
  select * into v_bewijs from public.bewijs where id = p_bewijs_id;
  if v_bewijs.id is null then raise exception 'Bewijs bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_bewijs.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  update public.bewijs
  set verwijderd_op = now(), verwijderd_door = v_naam
  where id = p_bewijs_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_bewijs.company_id, v_bewijs.pva_item_id, 'bewijs_verwijderd',
     coalesce(v_bewijs.bestandsnaam, 'bestand'), v_naam, 'beheerder');

  return jsonb_build_object('id', p_bewijs_id, 'verwijderd', true);
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_rubriek_archiveren(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if not exists (select 1 from centrale_rubriek where id = p_id) then
    raise exception 'Rubriek niet gevonden';
  end if;

  update centrale_rubriek
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_rubriek_opslaan(p_id uuid, p_naam text, p_volgorde integer DEFAULT NULL::integer, p_rie_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id       uuid;
  v_oud_naam text;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_id is null then
    insert into centrale_rubriek (naam, volgorde, rie_code)
    values (
      btrim(p_naam),
      coalesce(p_volgorde, (select coalesce(max(volgorde), 0) + 1 from centrale_rubriek)),
      nullif(btrim(coalesce(p_rie_code, '')), '')
    )
    returning id into v_id;
    return v_id;
  end if;

  select naam into v_oud_naam from centrale_rubriek where id = p_id;
  if v_oud_naam is null then
    raise exception 'Rubriek niet gevonden';
  end if;

  update centrale_rubriek
     set naam         = btrim(p_naam),
         rie_code     = nullif(btrim(coalesce(p_rie_code, '')), ''),
         volgorde     = coalesce(p_volgorde, volgorde),
         -- Alleen bij een echte naamswijziging de versie ophogen.
         versie       = versie + (case when btrim(p_naam) <> v_oud_naam then 1 else 0 end),
         gewijzigd_op = (case when btrim(p_naam) <> v_oud_naam then now() else gewijzigd_op end)
   where id = p_id;
  return p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_toolbox_archiveren(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from centrale_toolbox where id = p_id) then raise exception 'Toolbox niet gevonden'; end if;
  update centrale_toolbox set gearchiveerd_op = coalesce(gearchiveerd_op, now()) where id = p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_toolbox_opslaan(p_id uuid, p_titel text, p_tekst text, p_video_url text, p_vereist_video boolean, p_vereist_quiz boolean, p_quiz_slaaggrens integer, p_quiz_uitleg_modus text, p_toegang text, p_volgorde integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_oud record; v_inhoud_wijzigt boolean;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_titel),'') = '' then raise exception 'Titel is verplicht'; end if;

  if p_id is null then
    insert into centrale_toolbox
      (titel, tekst, video_url, vereist_video, vereist_quiz, quiz_slaaggrens,
       quiz_uitleg_modus, toegang, volgorde)
    values
      (btrim(p_titel), coalesce(p_tekst,''), nullif(btrim(coalesce(p_video_url,'')),''),
       coalesce(p_vereist_video,true), coalesce(p_vereist_quiz,false), coalesce(p_quiz_slaaggrens,70),
       coalesce(p_quiz_uitleg_modus,'aan_eind'), coalesce(p_toegang,'link'),
       coalesce(p_volgorde, (select coalesce(max(volgorde),0)+1 from centrale_toolbox)))
    returning id into v_id;
    return v_id;
  end if;

  select titel, tekst, video_url into v_oud from centrale_toolbox where id = p_id;
  if v_oud is null then raise exception 'Toolbox niet gevonden'; end if;
  v_inhoud_wijzigt := (btrim(p_titel) is distinct from v_oud.titel)
                   or (coalesce(p_tekst,'') is distinct from v_oud.tekst)
                   or (nullif(btrim(coalesce(p_video_url,'')),'') is distinct from v_oud.video_url);

  update centrale_toolbox set
    titel = btrim(p_titel), tekst = coalesce(p_tekst,''),
    video_url = nullif(btrim(coalesce(p_video_url,'')),''),
    vereist_video = coalesce(p_vereist_video, vereist_video),
    vereist_quiz = coalesce(p_vereist_quiz, vereist_quiz),
    quiz_slaaggrens = coalesce(p_quiz_slaaggrens, quiz_slaaggrens),
    quiz_uitleg_modus = coalesce(p_quiz_uitleg_modus, quiz_uitleg_modus),
    toegang = coalesce(p_toegang, toegang),
    volgorde = coalesce(p_volgorde, volgorde),
    versie = versie + (case when v_inhoud_wijzigt then 1 else 0 end),
    gewijzigd_op = (case when v_inhoud_wijzigt then now() else gewijzigd_op end)
  where id = p_id;
  return p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_toolbox_vraag_archiveren(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from centrale_toolbox_vraag where id = p_id) then raise exception 'Vraag niet gevonden'; end if;
  update centrale_toolbox_vraag set gearchiveerd_op = coalesce(gearchiveerd_op, now()) where id = p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_toolbox_vraag_opslaan(p_id uuid, p_toolbox_id uuid, p_vraagtekst text, p_opties jsonb, p_juist_antwoord integer, p_uitleg text, p_volgorde integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_oud record; v_wijzigt boolean;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_vraagtekst),'') = '' then raise exception 'Vraagtekst is verplicht'; end if;
  if p_opties is null or jsonb_typeof(p_opties) <> 'array' or jsonb_array_length(p_opties) < 2 then
    raise exception 'Geef minstens twee antwoordopties';
  end if;
  if p_juist_antwoord < 0 or p_juist_antwoord >= jsonb_array_length(p_opties) then
    raise exception 'Het juiste antwoord verwijst naar een niet-bestaande optie';
  end if;

  if p_id is null then
    if not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then raise exception 'Toolbox niet gevonden'; end if;
    insert into centrale_toolbox_vraag (toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde)
    values (p_toolbox_id, btrim(p_vraagtekst), p_opties, p_juist_antwoord, nullif(btrim(coalesce(p_uitleg,'')),''),
            coalesce(p_volgorde, (select coalesce(max(volgorde),0)+1 from centrale_toolbox_vraag where toolbox_id = p_toolbox_id)))
    returning id into v_id;
    return v_id;
  end if;

  select vraagtekst, opties, juist_antwoord, uitleg into v_oud from centrale_toolbox_vraag where id = p_id;
  if v_oud is null then raise exception 'Vraag niet gevonden'; end if;
  v_wijzigt := (btrim(p_vraagtekst) is distinct from v_oud.vraagtekst)
            or (p_opties is distinct from v_oud.opties)
            or (p_juist_antwoord is distinct from v_oud.juist_antwoord)
            or (nullif(btrim(coalesce(p_uitleg,'')),'') is distinct from v_oud.uitleg);

  update centrale_toolbox_vraag set
    vraagtekst = btrim(p_vraagtekst), opties = p_opties, juist_antwoord = p_juist_antwoord,
    uitleg = nullif(btrim(coalesce(p_uitleg,'')),''), volgorde = coalesce(p_volgorde, volgorde),
    versie = versie + (case when v_wijzigt then 1 else 0 end),
    gewijzigd_op = (case when v_wijzigt then now() else gewijzigd_op end)
  where id = p_id;
  return p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_vraag_archiveren(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if not exists (select 1 from centrale_vraag where id = p_id) then
    raise exception 'Vraag niet gevonden';
  end if;

  update centrale_vraag
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.centrale_vraag_opslaan(p_id uuid, p_rubriek_id uuid, p_tekst text, p_volgorde integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id        uuid;
  v_oud_tekst text;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if coalesce(btrim(p_tekst), '') = '' then
    raise exception 'Tekst is verplicht';
  end if;

  if p_id is null then
    if not exists (select 1 from centrale_rubriek where id = p_rubriek_id) then
      raise exception 'Rubriek niet gevonden';
    end if;
    insert into centrale_vraag (rubriek_id, tekst, volgorde)
    values (
      p_rubriek_id,
      btrim(p_tekst),
      coalesce(p_volgorde, (select coalesce(max(volgorde), 0) + 1 from centrale_vraag where rubriek_id = p_rubriek_id))
    )
    returning id into v_id;
    return v_id;
  end if;

  select tekst into v_oud_tekst from centrale_vraag where id = p_id;
  if v_oud_tekst is null then
    raise exception 'Vraag niet gevonden';
  end if;

  update centrale_vraag
     set tekst        = btrim(p_tekst),
         volgorde     = coalesce(p_volgorde, volgorde),
         -- Alleen bij een echte tekstwijziging de versie ophogen (= normwijziging).
         versie       = versie + (case when btrim(p_tekst) <> v_oud_tekst then 1 else 0 end),
         gewijzigd_op = (case when btrim(p_tekst) <> v_oud_tekst then now() else gewijzigd_op end)
   where id = p_id;
  return p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_token      text;
begin
  select company_id into v_company_id from public.personen where id = p_persoon_id;
  if v_company_id is null then raise exception 'Persoon bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_company_id) then raise exception 'Geen toegang'; end if;

  -- Token uit twee uuids, zonder streepjes: lang en niet te raden, geen pgcrypto nodig.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.deellinks (company_id, persoon_id, token, vervalt_op, ingetrokken)
  values (v_company_id, p_persoon_id, v_token, p_vervalt_op, false)
  on conflict (persoon_id) do update
    set token = excluded.token, vervalt_op = excluded.vervalt_op,
        ingetrokken = false, created_at = now();

  return v_token;
end;
$function$;
CREATE OR REPLACE FUNCTION public.dashboard_admin_overzicht()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;

  select coalesce(jsonb_agg(row order by row->>'te_beoordelen' desc, row->>'over_termijn' desc, row->>'name'), '[]'::jsonb)
  into v
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'pva_totaal',    p.totaal,
      'pva_afgerond',  p.afgerond,
      'pct',           p.pct,
      'te_beoordelen', p.te_beoordelen,
      'over_termijn',  p.over_termijn,
      'rie_status',    r.status,
      'rie_geldig_tot', r.geldig_tot,
      'laatste_activiteit', p.laatste_activiteit
    ) as row
    from companies c
    left join lateral (
      select
        count(*)                                          as totaal,
        count(*) filter (where status = 'Afgerond')       as afgerond,
        case when count(*) > 0
             then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
             else 0 end                                   as pct,
        count(*) filter (where concept_status is not null and btrim(concept_status) <> '') as te_beoordelen,
        count(*) filter (where termijn_datum < current_date and status <> 'Afgerond')      as over_termijn,
        max(updated_at)                                   as laatste_activiteit
      from pva_items where company_id = c.id
    ) p on true
    left join lateral (
      select status, geldig_tot
      from rie_versies where company_id = c.id
      order by versie desc limit 1
    ) r on true
  ) s;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.dashboard_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    'pva', (
      select jsonb_build_object(
        'totaal',         count(*),
        'open',           count(*) filter (where status = 'Open'),
        'in_behandeling', count(*) filter (where status = 'In behandeling'),
        'afgerond',       count(*) filter (where status = 'Afgerond'),
        'pct', case when count(*) > 0
                    then round(100.0 * count(*) filter (where status = 'Afgerond') / count(*))
                    else 0 end
      )
      from pva_items where company_id = p_company_id
    ),

    'te_beoordelen', (
      select count(*) from pva_items
      where company_id = p_company_id
        and concept_status is not null and btrim(concept_status) <> ''
    ),

    'prio_open', (
      select jsonb_build_object(
        'Hoog',   count(*) filter (where prio = 'Hoog'),
        'Middel', count(*) filter (where prio = 'Middel'),
        'Laag',   count(*) filter (where prio = 'Laag')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

    'termijn', (
      select jsonb_build_object(
        'over',         count(*) filter (where termijn_datum < current_date),
        'binnenkort',   count(*) filter (where termijn_datum >= current_date
                                           and termijn_datum < current_date + 30),
        'zonder_datum', count(*) filter (where termijn_datum is null
                                           and termijn is not null and btrim(termijn) <> '')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

    'rie', (
      select case when r.id is null then null else jsonb_build_object(
        'versie',               r.versie,
        'status',               r.status,
        'geldig_tot',           r.geldig_tot,
        'verloopt_binnenkort',  r.geldig_tot is not null and r.geldig_tot < now() + interval '60 days'
      ) end
      from (
        select id, versie, status, geldig_tot
        from rie_versies where company_id = p_company_id
        order by versie desc limit 1
      ) r
    ),

    'inspecties', jsonb_build_object(
      'open', (
        select count(*) from inspectie
        where company_id = p_company_id and status in ('concept', 'ingediend')
      ),
      'afgerond', (
        select count(*) from inspectie
        where company_id = p_company_id and status = 'afgerond'
      ),
      'open_bevindingen', (
        select count(*) from inspectie_bevinding
        where company_id = p_company_id
          and resultaat = 'niet_in_orde' and afhandeling = 'geen'
      )
    ),

    -- Aantal afwijkende punten waar de centrale norm is bijgewerkt (onbeantwoord).
    'norm_bijgewerkt', (
      select count(*)
      from bedrijf_rubriek br
      join centrale_vraag q on q.rubriek_id = br.rubriek_id and q.gearchiveerd_op is null
      join bedrijf_vraag_afwijking a on a.vraag_id = q.id and a.company_id = p_company_id
      where br.company_id = p_company_id and q.versie > a.basis_versie
    ),

    'bewijs', (
      select jsonb_build_object(
        'afgerond_met_bewijs', count(*) filter (where heeft_bewijs),
        'afgerond_zonder_bewijs', count(*) filter (where not heeft_bewijs)
      )
      from (
        select exists (
          select 1 from bewijs b
          where b.pva_item_id = i.id and b.verwijderd_op is null
        ) as heeft_bewijs
        from pva_items i
        where i.company_id = p_company_id and i.status = 'Afgerond'
      ) s
    )
  ) into v;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_actie_doorgeven(p_token text, p_actie_id uuid, p_naam text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link        public.deellinks;
  v_item        public.pva_items;
  v_afzender    public.personen;
  v_ontvanger_id uuid;
  v_ontvanger   public.personen;
  v_token_ontv  text;
begin
  -- Token geldig?
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;

  -- Hoort de actie bij de afzender (token)?
  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return null; end if;

  select * into v_afzender from public.personen where id = v_link.persoon_id;

  -- Ontvanger vinden of aanmaken (binnen hetzelfde bedrijf).
  v_ontvanger_id := public.vind_of_maak_persoon(
    v_item.company_id, p_naam, p_email, v_afzender.id
  );

  -- Niet aan jezelf doorgeven.
  if v_ontvanger_id = v_afzender.id then
    return jsonb_build_object('fout', 'Je kunt niet aan jezelf doorgeven.');
  end if;

  -- De actie verhuist; lopend concept van de oude houder wissen.
  update public.pva_items
  set persoon_id     = v_ontvanger_id,
      concept_status = null,
      concept_opm    = null,
      concept_at     = null
  where id = p_actie_id;

  -- Zorg dat de ontvanger een (geldige) deellink heeft. create_deellink is
  -- idempotent: bestaat er al een, dan blijft die; anders nieuw token.
  -- (create_deellink checkt mag_bedrijf_beheren; daarom hier direct upserten
  -- via de interne weg, want de gast is geen beheerder.)
  insert into public.deellinks (company_id, persoon_id, token, ingetrokken)
  values (v_item.company_id, v_ontvanger_id,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          false)
  on conflict (persoon_id) do update set ingetrokken = false
  returning token into v_token_ontv;

  -- Als er al een token was (geen insert), haal het bestaande op.
  if v_token_ontv is null then
    select token into v_token_ontv from public.deellinks where persoon_id = v_ontvanger_id;
  end if;

  select * into v_ontvanger from public.personen where id = v_ontvanger_id;

  -- Historie: doorgegeven van X naar Y (naspeurbaar, ook al krijgt KAM geen seintje).
  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'doorgegeven',
     'aan ' || coalesce(v_ontvanger.naam, v_ontvanger.email, 'collega'),
     coalesce(v_afzender.naam, 'Actiehouder'), 'gast');

  -- Teruggeven: genoeg voor een latere mail-server-route (haak ligt klaar).
  return jsonb_build_object(
    'ok', true,
    'ontvanger_id', v_ontvanger_id,
    'ontvanger_naam', v_ontvanger.naam,
    'ontvanger_email', v_ontvanger.email,
    'ontvanger_token', v_token_ontv,
    'bedrijf', (select name from public.companies where id = v_item.company_id),
    'actie_nr', v_item.nr,
    'actie_onderwerp', v_item.onderwerp
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_actie_historie(p_token text, p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link  public.deellinks;
  v_item  public.pva_items;
begin
  -- Token geldig?
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return '[]'::jsonb; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return '[]'::jsonb; end if;

  -- Hoort deze actie echt bij de persoon van deze token? Zo niet: niets.
  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return '[]'::jsonb; end if;

  -- De historie van alleen deze (eigen) actie, nieuwste eerst, met namen.
  return coalesce((
    select jsonb_agg(to_jsonb(h) order by h.created_at desc)
    from (
      select gebeurtenis, van_status, naar_status, opmerking,
             actor_naam, actor_type, created_at
      from public.actie_historie
      where pva_item_id = p_actie_id
    ) h
  ), '[]'::jsonb);
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_bewijs_lijst(p_token text, p_actie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.deellinks;
  v_item public.pva_items;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return '[]'::jsonb; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return '[]'::jsonb; end if;

  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(b) order by b.created_at desc)
    from (
      select id, pad, bestandsnaam, type, grootte, geupload_door, created_at
      from public.bewijs
      where pva_item_id = p_actie_id and verwijderd_op is null
    ) b
  ), '[]'::jsonb);
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_bewijs_pad(p_token text, p_actie_id uuid, p_bestandsnaam text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link  public.deellinks;
  v_item  public.pva_items;
  v_ext   text;
  v_pad   text;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;

  -- Hoort de actie bij deze persoon?
  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return null; end if;

  -- Extensie uit de bestandsnaam (alleen voor het pad; type checkt de frontend).
  v_ext := lower(coalesce(nullif(regexp_replace(p_bestandsnaam, '^.*\.', ''), p_bestandsnaam), 'bin'));

  -- Uniek pad: bewijs/<company>/<actie>/<random>.<ext>
  v_pad := 'bewijs/' || v_item.company_id || '/' || p_actie_id || '/'
           || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;

  return jsonb_build_object(
    'pad', v_pad,
    'company_id', v_item.company_id
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_bewijs_registreren(p_token text, p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.deellinks;
  v_item    public.pva_items;
  v_persoon public.personen;
  v_id      uuid;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;

  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return null; end if;

  select * into v_persoon from public.personen where id = v_link.persoon_id;

  insert into public.bewijs
    (company_id, pva_item_id, pad, bestandsnaam, type, grootte, geupload_door, uploader_type)
  values
    (v_item.company_id, p_actie_id, p_pad, p_bestandsnaam, p_type, p_grootte,
     coalesce(v_persoon.naam, 'Actiehouder'), 'gast')
  returning id into v_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'bewijs_toegevoegd',
     coalesce(p_bestandsnaam, 'bestand'), coalesce(v_persoon.naam, 'Actiehouder'), 'gast');

  return jsonb_build_object('id', v_id, 'pad', p_pad);
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_concept_update(p_token text, p_actie_id uuid, p_status text, p_opm text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.deellinks;
  v_persoon public.personen;
  v_item    public.pva_items;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return false; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return false; end if;

  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return false; end if;   -- alleen eigen acties

  select * into v_persoon from public.personen where id = v_link.persoon_id;

  update public.pva_items
  set concept_status = p_status, concept_opm = p_opm, concept_at = now()
  where id = p_actie_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, naar_status, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'concept_gewijzigd', p_status, p_opm,
     coalesce(v_persoon.naam, 'Actiehouder'), 'gast');

  return true;
end;
$function$;
CREATE OR REPLACE FUNCTION public.deellink_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link      public.deellinks;
  v_persoon   public.personen;
  v_acties    jsonb;
  v_huisstijl jsonb;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null then return null; end if;
  if v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;

  select * into v_persoon from public.personen where id = v_link.persoon_id;
  if v_persoon.id is null or v_persoon.archived_at is not null then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.nr), '[]'::jsonb)
  into v_acties
  from (
    select id, nr, onderwerp, maatregel, prio, termijn, status,
           concept_status, concept_opm, vrijgegeven_op
    from public.pva_items
    where persoon_id = v_persoon.id
  ) a;

  -- De effectieve huisstijl van het bedrijf waar deze persoon bij hoort.
  v_huisstijl := public.huisstijl_van_bedrijf(v_persoon.company_id);

  return jsonb_build_object(
    'persoon',   jsonb_build_object('id', v_persoon.id, 'naam', v_persoon.naam),
    'bedrijf',   (select name from public.companies where id = v_persoon.company_id),
    'acties',    v_acties,
    'huisstijl', v_huisstijl
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.doelstelling_zetten(p_company_id uuid, p_functiegroep_id uuid, p_doel_per_jaar integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel_per_jaar,0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  -- Cross-company: de functiegroep moet bij dit bedrijf horen.
  if not exists (select 1 from functiegroep where id = p_functiegroep_id and company_id = p_company_id) then
    raise exception 'Functiegroep hoort niet bij dit bedrijf';
  end if;
  insert into bedrijf_doelstelling (company_id, functiegroep_id, doel_per_jaar, updated_at)
  values (p_company_id, p_functiegroep_id, p_doel_per_jaar, now())
  on conflict (company_id, functiegroep_id) do update
    set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.functiegroep_archiveren(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
begin
  select company_id into v_company from functiegroep where id = p_id;
  if v_company is null then
    raise exception 'Functiegroep niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update functiegroep
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.functiegroep_opslaan(p_id uuid, p_company_id uuid, p_naam text, p_volgorde integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_volg    integer;
  v_id      uuid;
begin
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_id is null then
    if not mag_bedrijf_beheren(p_company_id) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;

    v_volg := coalesce(
      p_volgorde,
      (select coalesce(max(volgorde), 0) + 1
         from functiegroep where company_id = p_company_id)
    );

    insert into functiegroep (company_id, naam, volgorde)
    values (p_company_id, btrim(p_naam), v_volg)
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaande functiegroep: company_id afleiden, meegestuurd company_id negeren.
  select company_id into v_company from functiegroep where id = p_id;
  if v_company is null then
    raise exception 'Functiegroep niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update functiegroep
     set naam     = btrim(p_naam),
         volgorde = coalesce(p_volgorde, volgorde)
   where id = p_id;
  return p_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text DEFAULT NULL::text, p_bewijs text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item   public.pva_items;
  v_naam   text;
  v_nieuwe text;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_item.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();
  v_nieuwe := coalesce(nullif(v_item.concept_status, ''), v_item.status);

  update public.pva_items
  set status = v_nieuwe, vrijgegeven_op = now(), vrijgegeven_door = v_naam,
      vrijgave_opmerking = p_opmerking, vrijgave_bewijs = p_bewijs,
      concept_status = null, concept_opm = null, concept_at = null, updated_at = now()
  where id = p_actie_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, van_status, naar_status, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'vrijgegeven', v_item.status, v_nieuwe, p_opmerking, v_naam, 'beheerder');

  return public.actie_als_jsonb(p_actie_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.gen_deellink_token()
 RETURNS text
 LANGUAGE sql
AS $function$
  select encode(gen_random_bytes(18), 'hex')
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role    text;
  v_company uuid;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' in ('client','admin')
      then new.raw_user_meta_data->>'role'
    else 'client'
  end;

  v_company := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;

  insert into public.users (id, email, role, company_id)
  values (new.id, new.email, v_role, v_company)
  on conflict (id) do nothing;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean DEFAULT false)
 RETURNS TABLE(persoon_id uuid, naam text, email text, token text, acties jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ritme text;
  v_interval interval;
begin
  -- Toegang: alleen beheerder van dit bedrijf of admin.
  if not public.mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang';
  end if;

  -- Ritme van dit bedrijf ophalen (default 'uit' als er geen rij is).
  select coalesce(hi.ritme, 'uit') into v_ritme
  from public.herinner_instelling hi
  where hi.company_id = p_company_id;
  if v_ritme is null then v_ritme := 'uit'; end if;

  -- Voor de heartbeat: bij ritme 'uit' geen enkele kandidaat.
  if p_alleen_ritme and v_ritme = 'uit' then
    return;
  end if;

  v_interval := case v_ritme
    when 'dagelijks'   then interval '1 day'
    when 'wekelijks'   then interval '7 days'
    when 'maandelijks' then interval '30 days'
    else interval '1000 years'  -- 'uit': effectief nooit
  end;

  return query
  select
    p.id as persoon_id,
    p.naam,
    p.email,
    d.token,
    coalesce(
      (select jsonb_agg(jsonb_build_object('nr', a.nr, 'onderwerp', a.onderwerp) order by a.nr)
       from public.pva_items a
       where a.persoon_id = p.id
         and a.company_id = p_company_id
         and coalesce(a.status, 'Open') <> 'Afgerond'),
      '[]'::jsonb
    ) as acties
  from public.personen p
  join public.deellinks d
    on d.persoon_id = p.id
   and d.ingetrokken = false
   and (d.vervalt_op is null or d.vervalt_op > now())
  where p.company_id = p_company_id
    and p.archived_at is null
    and p.email is not null
    and btrim(p.email) <> ''
    -- minstens één openstaande actie
    and exists (
      select 1 from public.pva_items a
      where a.persoon_id = p.id
        and a.company_id = p_company_id
        and coalesce(a.status, 'Open') <> 'Afgerond'
    )
    -- de harde rem: max 2 per 7 dagen
    and public.mag_herinneren(p.id)
    -- voor de heartbeat: alleen wie volgens ritme aan de beurt is
    and (
      not p_alleen_ritme
      or not exists (
        select 1 from public.herinnering_log hl
        where hl.persoon_id = p.id
          and hl.verzonden_op > now() - v_interval
      )
    );
end;
$function$;
CREATE OR REPLACE FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_log_id     uuid;
begin
  select company_id into v_company_id from public.personen where id = p_persoon_id;
  if v_company_id is null then raise exception 'Persoon bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_company_id) then raise exception 'Geen toegang'; end if;
  if p_bron not in ('handmatig','automatisch') then raise exception 'Ongeldige bron'; end if;

  insert into public.herinnering_log
    (company_id, persoon_id, bron, aantal_acties, acties, door, email)
  values
    (v_company_id, p_persoon_id, p_bron,
     coalesce(jsonb_array_length(p_acties), 0),
     coalesce(p_acties, '[]'::jsonb),
     auth.uid(), p_email)
  returning id into v_log_id;

  return v_log_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp  public.companies;
  v_merk  public.merken;
begin
  select * into v_comp from public.companies where id = p_company_id;
  if v_comp.id is null then return null; end if;

  select * into v_merk from public.merken where id = v_comp.merk_id;

  return jsonb_build_object(
    'modus',         v_comp.huisstijl_modus,
    'merk_naam',     coalesce(v_merk.naam, 'QHSE Totaal'),
    'merk_logo',     v_merk.logo_pad,
    'klant_logo',    v_comp.klant_logo_pad,
    'accent_kleur',  coalesce(nullif(v_comp.accent_kleur_override, ''), v_merk.accent_kleur, '#FF5200'),
    'lettertype',    coalesce(v_merk.lettertype, 'grotesk')
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.import_company(p_dataset jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  insert into public.companies (name, kvk, dataset)
  values (
    coalesce(p_dataset->'bedrijf'->>'naam', 'Naamloos bedrijf'),
    p_dataset->'bedrijf'->>'kvk',
    p_dataset
  )
  returning id into v_company_id;

  insert into public.pva_items
    (company_id, nr, onderwerp, maatregel, tree, ref, prio, termijn, verantw, status)
  select
    v_company_id, v.nr, v.onderwerp, v.maatregel, v.tree, v.ref, v.prio, v.termijn,
    nullif(v.verantw, ''),
    coalesce(nullif(v.status, ''), 'Open')
  from jsonb_to_recordset(coalesce(p_dataset->'planVanAanpak', '[]'::jsonb))
    as v(nr text, onderwerp text, maatregel text, tree text, ref text,
         prio text, termijn text, verantw text, status text);

  -- ook de volledige RI&E-inhoud vullen
  perform public.import_rie_content(v_company_id);

  return v_company_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.import_rie_content(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dataset   jsonb;
  v_mod       jsonb;
  v_mod_ord   int;
  v_module_id uuid;
begin
  select dataset into v_dataset from public.companies where id = p_company_id;
  if v_dataset is null then
    raise exception 'Geen dataset voor company %', p_company_id;
  end if;

  -- Schoon herimporteren
  delete from public.vragen  where company_id = p_company_id;
  delete from public.modules where company_id = p_company_id;
  delete from public.fotos   where company_id = p_company_id;

  -- Modules + bijbehorende vragen
  for v_mod, v_mod_ord in
    select value, ordinality
    from jsonb_array_elements(coalesce(v_dataset->'modules','[]'::jsonb)) with ordinality
  loop
    insert into public.modules (company_id, code, titel, intro, volgorde)
    values (p_company_id, v_mod->>'code', v_mod->>'titel', v_mod->>'intro', v_mod_ord)
    returning id into v_module_id;

    insert into public.vragen
      (company_id, module_id, nr, vraag, antwoord, bevinding, brf, klasse, pva, volgorde)
    select
      p_company_id, v_module_id,
      q.elem->>'nr', q.elem->>'vraag', q.elem->>'antwoord', q.elem->>'bevinding',
      q.elem->>'brf', nullif(q.elem->>'klasse',''), nullif(q.elem->>'pva',''), q.ord
    from jsonb_array_elements(coalesce(v_mod->'vragen','[]'::jsonb))
         with ordinality as q(elem, ord);
  end loop;

  -- Foto's
  insert into public.fotos (company_id, nr, bestand, locatie, zie, betekenis, refs)
  select
    p_company_id,
    (f->>'nr')::int, f->>'bestand', f->>'locatie', f->>'zie', f->>'betekenis',
    coalesce(array(select jsonb_array_elements_text(f->'refs')), '{}')
  from jsonb_array_elements(coalesce(v_dataset->'fotos','[]'::jsonb)) as f;
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_deel2_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date, p_functie_slachtoffer text, p_medische_dienst_bezocht text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_directe integer[];
  v_basis   integer[];
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;
  if not exists (select 1 from public.incident where id = p_incident_id and company_id = p_company_id) then
    raise exception 'Incident niet gevonden';
  end if;
  if coalesce(p_status,'') not in ('open','in_onderzoek','afgehandeld') then
    raise exception 'Ongeldige status';
  end if;
  if p_medische_dienst_bezocht is not null
     and p_medische_dienst_bezocht not in ('ja','nee','onbekend') then
    raise exception 'Ongeldige waarde medische dienst';
  end if;

  -- Alleen bestaande oorzaakcodes bewaren (onbekende stil negeren).
  select coalesce(array_agg(c order by c), '{}') into v_directe
  from unnest(coalesce(p_directe_oorzaken,'{}')) c
  where exists (select 1 from public.incident_directe_oorzaak d where d.code = c);

  select coalesce(array_agg(c order by c), '{}') into v_basis
  from unnest(coalesce(p_basis_oorzaken,'{}')) c
  where exists (select 1 from public.incident_basis_oorzaak b where b.code = c);

  update public.incident set
    status                          = p_status,
    directe_oorzaken                = v_directe,
    basis_oorzaken                  = v_basis,
    oorzaak_toelichting             = nullif(btrim(coalesce(p_oorzaak_toelichting,'')), ''),
    onderzoeksrapportage_bijgevoegd = coalesce(p_onderzoeksrapportage_bijgevoegd, false),
    telefonische_melding_directie   = coalesce(p_telefonische_melding_directie, false),
    telefonische_melding_aan        = nullif(btrim(coalesce(p_telefonische_melding_aan,'')), ''),
    maatregelen_in_actielijst       = coalesce(p_maatregelen_in_actielijst, false),
    tra_aanpassen                   = coalesce(p_tra_aanpassen, false),
    andere_maatregelen              = nullif(btrim(coalesce(p_andere_maatregelen,'')), ''),
    besproken_in_toolbox_datum      = p_besproken_in_toolbox_datum,
    functie_slachtoffer             = nullif(btrim(coalesce(p_functie_slachtoffer,'')), ''),
    medische_dienst_bezocht         = p_medische_dienst_bezocht,
    afgehandeld_op                  = case
                                        when p_status = 'afgehandeld' then coalesce(afgehandeld_op, now())
                                        else null
                                      end,
    laatst_bijgewerkt_op            = now()
  where id = p_incident_id and company_id = p_company_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_foto_pad_token(p_token text, p_incident_id uuid, p_bestandsnaam text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_incident public.incident;
  v_ext      text;
  v_pad      text;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  select * into v_incident from public.incident
   where id = p_incident_id and company_id = v_company;
  if v_incident.id is null then return null; end if;

  v_ext := lower(coalesce(nullif(regexp_replace(p_bestandsnaam, '^.*\.', ''), p_bestandsnaam), 'bin'));

  -- Bedrijf-geprefixt pad: <company>/<incident>/<random>.<ext>. Eerste segment =
  -- company → de storage-RLS schermt het per bedrijf af.
  v_pad := v_company || '/' || p_incident_id || '/'
           || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;

  return jsonb_build_object('pad', v_pad, 'company_id', v_company);
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_foto_registreren_token(p_token text, p_incident_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_incident public.incident;
  v_id       uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  select * into v_incident from public.incident
   where id = p_incident_id and company_id = v_company;
  if v_incident.id is null then return null; end if;

  -- Defense-in-depth: het pad moet binnen <company>/<incident>/ vallen.
  if p_pad is null or p_pad not like (v_company::text || '/' || p_incident_id::text || '/%') then
    return null;
  end if;

  insert into public.incident_foto
    (incident_id, company_id, storage_pad, bestandsnaam, type, grootte)
  values
    (p_incident_id, v_company, p_pad, p_bestandsnaam, p_type, p_grootte)
  returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_meldcontext_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.incident_meldlink;
  v_company uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  return jsonb_build_object(
    'bedrijf',      (select name from public.companies where id = v_company),
    'huisstijl',    public.huisstijl_van_bedrijf(v_company),
    'gevolg_opties', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', code, 'omschrijving', omschrijving
      ) order by volgorde, code), '[]'::jsonb)
      from public.incident_gevolg_soort
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_melden_token(p_token text, p_datum date, p_tijd time without time zone, p_locatie text, p_project text, p_omschrijving text, p_naam_melder text, p_gevolgen text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_gevolgen text[];
  v_id       uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then
    raise exception 'Ongeldige of ingetrokken meldlink';
  end if;
  v_company := v_link.company_id;

  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  if p_locatie is null or btrim(p_locatie) = '' then raise exception 'Locatie is verplicht'; end if;
  if p_omschrijving is null or btrim(p_omschrijving) = '' then raise exception 'Omschrijving is verplicht'; end if;

  -- Alleen bekende gevolg-codes bewaren (onbekende invoer stil negeren).
  select coalesce(array_agg(g.code order by s.volgorde, s.code), '{}')
    into v_gevolgen
  from unnest(coalesce(p_gevolgen, '{}')) as g(code)
  join public.incident_gevolg_soort s on s.code = g.code;

  insert into public.incident (
    company_id, datum, tijd, locatie, project, omschrijving, naam_melder, gevolgen
  ) values (
    v_company, p_datum, p_tijd,
    btrim(p_locatie),
    nullif(btrim(coalesce(p_project, '')), ''),
    btrim(p_omschrijving),
    nullif(btrim(coalesce(p_naam_melder, '')), ''),
    coalesce(v_gevolgen, '{}')
  ) returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_meldlink_intrekken(p_company_id uuid, p_ingetrokken boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.incident_meldlink;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  update public.incident_meldlink
    set ingetrokken = coalesce(p_ingetrokken, true)
  where company_id = p_company_id
  returning * into v_link;

  if v_link.company_id is null then raise exception 'Geen meldlink'; end if;
  return jsonb_build_object('token', v_link.token, 'ingetrokken', v_link.ingetrokken);
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_meldlink_roteren(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.incident_meldlink (company_id, token, ingetrokken, aangemaakt_op, aangemaakt_door)
  values (p_company_id, v_token, false, now(), auth.uid())
  on conflict (company_id) do update
    set token = excluded.token, ingetrokken = false,
        aangemaakt_op = now(), aangemaakt_door = auth.uid();

  return jsonb_build_object('token', v_token, 'ingetrokken', false);
end;
$function$;
CREATE OR REPLACE FUNCTION public.incident_meldlink_zorg(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.incident_meldlink;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;

  select * into v_link from public.incident_meldlink where company_id = p_company_id;
  if v_link.company_id is null then
    insert into public.incident_meldlink (company_id, token, aangemaakt_door)
    values (
      p_company_id,
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      auth.uid()
    )
    returning * into v_link;
  end if;

  return jsonb_build_object('token', v_link.token, 'ingetrokken', v_link.ingetrokken);
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_status  text;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status = 'afgerond' then
    raise exception 'Inspectie is al afgerond';
  end if;
  if v_status = 'geannuleerd' then
    raise exception 'Inspectie is geannuleerd';
  end if;

  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and verplicht
       and resultaat is null
  ) then
    raise exception 'Niet alle verplichte punten hebben een resultaat';
  end if;

  -- Sinds de constraint de tussenstadia toelaat, borgt afronden de eindstrengheid:
  -- een 'niet in orde'-bevinding moet zijn afgehandeld (meteen hersteld of actie).
  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and resultaat = 'niet_in_orde'
       and afhandeling = 'geen'
  ) then
    raise exception 'Elke ''niet in orde''-bevinding moet zijn afgehandeld (meteen hersteld of actie)';
  end if;

  update inspectie
     set status       = 'afgerond',
         uitgevoerd_op = now(),
         conclusie     = coalesce(nullif(btrim(coalesce(p_conclusie, '')), ''), conclusie)
   where id = p_inspectie_id;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, p_inspectie_id, auth.uid(), now(), 'Inspectie afgerond');
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_bibliotheek(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(row order by sort_datum desc nulls last), '[]'::jsonb)
  into v
  from (
    select
      coalesce(i.uitgevoerd_op, i.aangemaakt_op) as sort_datum,
      jsonb_build_object(
        'id',                 i.id,
        'company_id',         i.company_id,
        'sjabloon_id',        i.sjabloon_id,
        'persoon_id',         i.persoon_id,
        'status',             i.status,
        'gepland_op',         i.gepland_op,
        'uitgevoerd_op',      i.uitgevoerd_op,
        'aangemaakt_op',      i.aangemaakt_op,
        'conclusie',          i.conclusie,
        'sjabloon_naam_snap', i.sjabloon_naam_snap,
        'controlesoort_snap', i.controlesoort_snap,
        -- Uitvoerder = wie de inspectie startte (eerste historieregel met een 'wie');
        -- valt terug op de gekoppelde persoon (voor historisch geïmporteerde inspecties).
        'uitvoerder_naam', coalesce(
          (select u.naam
             from inspectie_historie h
             left join users u on u.id = h.wie
            where h.inspectie_id = i.id and h.wie is not null
            order by h.wanneer asc
            limit 1),
          (select pp.naam from personen pp where pp.id = i.persoon_id)
        ),
        'aantal_punten',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id),
        'aantal_niet_in_orde', (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.resultaat = 'niet_in_orde'),
        'aantal_acties',       (select count(*) from inspectie_bevinding b where b.inspectie_id = i.id and b.actie_id is not null)
      ) as row
    from inspectie i
    where i.company_id = p_company_id
  ) s;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_status  text;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  update inspectie
     set conclusie = nullif(btrim(coalesce(p_conclusie, '')), '')
   where id = p_inspectie_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_doel_zetten(p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_doel_per_jaar,0) < 0 then raise exception 'Doel mag niet negatief zijn'; end if;
  if not exists (select 1 from personen where id = p_persoon_id and company_id = p_company_id and archived_at is null) then
    raise exception 'Persoon hoort niet bij dit bedrijf';
  end if;
  insert into bedrijf_inspectie_doel (company_id, persoon_id, doel_per_jaar, updated_at)
  values (p_company_id, p_persoon_id, coalesce(p_doel_per_jaar,0), now())
  on conflict (company_id, persoon_id) do update
    set doel_per_jaar = excluded.doel_per_jaar, updated_at = now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_rapport(p_inspectie_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select jsonb_build_object(
    'id',             i.id,
    'company_id',     i.company_id,
    'company_naam',   c.name,
    'naam',           i.sjabloon_naam_snap,
    'controlesoort',  i.controlesoort_snap,
    'status',         i.status,
    'gepland_op',     i.gepland_op,
    'uitgevoerd_op',  i.uitgevoerd_op,
    'aangemaakt_op',  i.aangemaakt_op,
    'conclusie',      i.conclusie,
    'uitvoerder_naam', (
      select u.naam
        from inspectie_historie h
        left join users u on u.id = h.wie
       where h.inspectie_id = i.id and h.wie is not null
       order by h.wanneer asc
       limit 1
    ),

    'bevindingen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',               b.id,
        'volgorde',         b.volgorde,
        'rubriek_naam_snap', b.rubriek_naam_snap,
        'punt_tekst_snap',  b.punt_tekst_snap,
        'verplicht',        b.verplicht,
        'resultaat',        b.resultaat,
        'afhandeling',      b.afhandeling,
        'opmerking',        b.opmerking,
        'actie_id',         b.actie_id,
        'actie_nr',         pa.nr
      ) order by b.volgorde, b.id), '[]'::jsonb)
      from inspectie_bevinding b
      left join pva_items pa on pa.id = b.actie_id
      where b.inspectie_id = i.id
    ),

    'acties', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'nr',        p.nr,
        'onderwerp', p.onderwerp,
        'status',    p.status,
        'prio',      p.prio
      ) order by (case when p.nr ~ '^[0-9]+$' then p.nr::int else null end) nulls last, p.nr), '[]'::jsonb)
      from pva_items p
      where p.company_id = i.company_id
        and p.bron_type = 'inspectie_bevinding'
        and p.bron_id in (select b.id from inspectie_bevinding b where b.inspectie_id = i.id)
    ),

    'historie', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',       h.id,
        'wijziging', h.wijziging,
        'wanneer',  h.wanneer,
        'wie_naam', u.naam
      ) order by h.wanneer asc, h.id), '[]'::jsonb)
      from inspectie_historie h
      left join users u on u.id = h.wie
      where h.inspectie_id = i.id
    )
  ) into v
  from inspectie i
  join companies c on c.id = i.company_id
  where i.id = p_inspectie_id;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_start(p_sjabloon_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company   uuid;
  v_naam      text;
  v_soort     text;
  v_actief    boolean;
  v_arch      timestamptz;
  v_inspectie uuid;
begin
  select company_id, naam, controlesoort, actief, gearchiveerd_op
    into v_company, v_naam, v_soort, v_actief, v_arch
    from inspectie_sjabloon
   where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_arch is not null or coalesce(v_actief, false) = false then
    raise exception 'Sjabloon is gearchiveerd of inactief';
  end if;

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (v_company, p_sjabloon_id, 'concept', v_naam, v_soort)
  returning id into v_inspectie;

  -- Eén bevinding per sjabloonpunt, met bevroren tekst + verplicht + volgorde.
  insert into inspectie_bevinding (company_id, inspectie_id, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select v_company, v_inspectie, punt.tekst, coalesce(punt.verplicht, false), coalesce(punt.volgorde, 0), 'geen'
    from inspectie_sjabloon_punt punt
   where punt.sjabloon_id = p_sjabloon_id
   order by punt.volgorde;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, v_inspectie, auth.uid(), now(), 'Inspectie gestart');

  return v_inspectie;
end;
$function$;
CREATE OR REPLACE FUNCTION public.inspectie_start_centraal(p_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspectie uuid;
  v_aantal    integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (p_company_id, null, 'concept', 'Werkplekinspectie (norm)', null)
  returning id into v_inspectie;

  -- Effectieve vragen: gekoppelde rubrieken; de geldende tekst (lokaal/centraal);
  -- zonder uitgezette vragen; archivering laat een LOKAAL behouden vraag staan.
  with eff as (
    select
      r.naam     as rubriek_naam,
      r.volgorde as rub_volg,
      q.volgorde as vraag_volg,
      q.id       as vraag_id,
      case when a.modus = 'lokaal' then a.lokale_tekst else q.tekst end as tekst
    from bedrijf_rubriek br
    join centrale_rubriek r on r.id = br.rubriek_id
    join centrale_vraag   q on q.rubriek_id = r.id
    left join bedrijf_vraag_afwijking a
      on a.vraag_id = q.id and a.company_id = p_company_id
    where br.company_id = p_company_id
      and coalesce(a.modus, '') <> 'uit'
      and (
        (q.gearchiveerd_op is null and r.gearchiveerd_op is null)
        or a.modus = 'lokaal'
      )
  )
  insert into inspectie_bevinding
    (company_id, inspectie_id, rubriek_naam_snap, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select
    p_company_id, v_inspectie, rubriek_naam, tekst, true,
    row_number() over (order by rub_volg, vraag_volg, vraag_id),
    'geen'
  from eff;

  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then
    raise exception 'Koppel eerst rubrieken met vragen voordat je een inspectie start';
  end if;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (p_company_id, v_inspectie, auth.uid(), now(), 'Inspectie gestart vanuit de norm');

  return v_inspectie;
end;
$function$;
CREATE OR REPLACE FUNCTION public.intrek_deellink(p_persoon_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.personen where id = p_persoon_id;
  if v_company_id is null then return false; end if;
  if not public.mag_bedrijf_beheren(v_company_id) then raise exception 'Geen toegang'; end if;

  update public.deellinks set ingetrokken = true where persoon_id = p_persoon_id;
  return found;
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false)
$function$;
CREATE OR REPLACE FUNCTION public.jaar_utc(p_ts timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select extract(year from (p_ts at time zone 'UTC'))::int
$function$;
CREATE OR REPLACE FUNCTION public.koppel_mij_als_persoon(p_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_naam      text;
  v_email     text;
  v_persoon_id uuid;
begin
  if v_uid is null then return null; end if;
  if not public.mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang';
  end if;

  select naam, email into v_naam, v_email from public.users where id = v_uid;

  -- Zonder naam geen net persoon-record; de UI vraagt dan eerst om de naam.
  if v_naam is null or btrim(v_naam) = '' then
    return null;
  end if;

  -- Bestaat al? (match op e-mail binnen dit bedrijf)
  if v_email is not null then
    select id into v_persoon_id
    from public.personen
    where company_id = p_company_id and email = v_email
    limit 1;
    if v_persoon_id is not null then
      return v_persoon_id;
    end if;
  end if;

  insert into public.personen (company_id, naam, email, status)
  values (p_company_id, v_naam, v_email, 'actief')
  on conflict (company_id, email) do update set naam = excluded.naam
  returning id into v_persoon_id;

  return v_persoon_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.mag_bedrijf_beheren(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.is_admin() or p_company_id = public.my_company_id(), false)
$function$;
CREATE OR REPLACE FUNCTION public.mag_herinneren(p_persoon_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    select count(*)
    from public.herinnering_log
    where persoon_id = p_persoon_id
      and verzonden_op > now() - interval '7 days'
  ) < 2
$function$;
CREATE OR REPLACE FUNCTION public.module_activeren(p_company_id uuid, p_module text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module text;
  v_status text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;

  select module_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status = 'actief' then
    raise exception 'Module is al actief';
  end if;

  insert into bedrijf_modules (company_id, module, actief, module_status, geactiveerd_op, gestopt_op)
  values (p_company_id, v_module, true, 'actief', now(), null)
  on conflict (company_id, module) do update
     set actief         = true,
         module_status  = 'actief',
         geactiveerd_op = now(),
         gestopt_op     = null;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Module ' || v_module || ' geactiveerd');
end;
$function$;
CREATE OR REPLACE FUNCTION public.module_gebruik_zetten(p_company_id uuid, p_module text, p_aan boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module text;
  v_status text;
  v_actief boolean;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;
  if p_aan is null then
    raise exception 'Aan/uit is verplicht';
  end if;

  select module_status, actief into v_status, v_actief
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Module is niet actief';
  end if;
  if v_actief = p_aan then
    return;  -- niets te doen; geen ruis in het logboek
  end if;

  update bedrijf_modules
     set actief = p_aan
   where company_id = p_company_id and module = v_module;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(),
          case when p_aan then 'Gebruik aangezet' else 'Gebruik uitgezet' end);
end;
$function$;
CREATE OR REPLACE FUNCTION public.module_stopzetten(p_company_id uuid, p_module text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module text;
  v_status text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;

  select module_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Module is niet actief';
  end if;

  update bedrijf_modules
     set module_status = 'gestopt',
         gestopt_op    = now(),
         actief        = false
   where company_id = p_company_id and module = v_module;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Module gestopt');
end;
$function$;
CREATE OR REPLACE FUNCTION public.my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.users where id = auth.uid()
$function$;
CREATE OR REPLACE FUNCTION public.persoon_functiegroep_zetten(p_persoon_id uuid, p_functiegroep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_persoon_company uuid;
  v_groep_company   uuid;
begin
  select company_id into v_persoon_company from personen where id = p_persoon_id;
  if v_persoon_company is null then
    raise exception 'Persoon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_persoon_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  if p_functiegroep_id is not null then
    select company_id into v_groep_company from functiegroep where id = p_functiegroep_id;
    if v_groep_company is null then
      raise exception 'Functiegroep niet gevonden';
    end if;
    if v_groep_company <> v_persoon_company then
      raise exception 'Functiegroep hoort bij een ander bedrijf';
    end if;
  end if;

  update personen set functiegroep_id = p_functiegroep_id where id = p_persoon_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean DEFAULT false, p_volgorde integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_volg    integer;
  v_id      uuid;
begin
  if coalesce(btrim(p_tekst), '') = '' then
    raise exception 'Tekst is verplicht';
  end if;

  if p_punt_id is null then
    select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
    if v_company is null then
      raise exception 'Sjabloon niet gevonden';
    end if;
    if not mag_bedrijf_beheren(v_company) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;

    v_volg := coalesce(
      p_volgorde,
      (select coalesce(max(volgorde), 0) + 1
         from inspectie_sjabloon_punt where sjabloon_id = p_sjabloon_id)
    );

    insert into inspectie_sjabloon_punt (company_id, sjabloon_id, volgorde, tekst, verplicht)
    values (v_company, p_sjabloon_id, v_volg, btrim(p_tekst), coalesce(p_verplicht, false))
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaand punt: company_id afleiden via het sjabloon.
  select s.company_id into v_company
    from inspectie_sjabloon_punt p
    join inspectie_sjabloon s on s.id = p.sjabloon_id
   where p.id = p_punt_id;
  if v_company is null then
    raise exception 'Punt niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon_punt
     set tekst     = btrim(p_tekst),
         verplicht = coalesce(p_verplicht, false),
         volgorde  = coalesce(p_volgorde, volgorde)
   where id = p_punt_id;
  return p_punt_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.punt_verwijderen(p_punt_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
begin
  select s.company_id into v_company
    from inspectie_sjabloon_punt p
    join inspectie_sjabloon s on s.id = p.sjabloon_id
   where p.id = p_punt_id;
  if v_company is null then
    raise exception 'Punt niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from inspectie_sjabloon_punt where id = p_punt_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rubriek_koppelen(p_company_id uuid, p_rubriek_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if not exists (select 1 from centrale_rubriek where id = p_rubriek_id and gearchiveerd_op is null) then
    raise exception 'Rubriek niet gevonden of gearchiveerd';
  end if;

  insert into bedrijf_rubriek (company_id, rubriek_id)
  values (p_company_id, p_rubriek_id)
  on conflict (company_id, rubriek_id) do nothing;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rubriek_ontkoppelen(p_company_id uuid, p_rubriek_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from bedrijf_rubriek
   where company_id = p_company_id and rubriek_id = p_rubriek_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
begin
  select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon
     set actief         = false,
         gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_sjabloon_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sjabloon_doelgroep_zetten(p_sjabloon_id uuid, p_doel_functiegroep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sjabloon_company uuid;
  v_groep_company    uuid;
begin
  select company_id into v_sjabloon_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_sjabloon_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_sjabloon_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  if p_doel_functiegroep_id is not null then
    select company_id into v_groep_company from functiegroep where id = p_doel_functiegroep_id;
    if v_groep_company is null then
      raise exception 'Functiegroep niet gevonden';
    end if;
    if v_groep_company <> v_sjabloon_company then
      raise exception 'Functiegroep hoort bij een ander bedrijf';
    end if;
  end if;

  update inspectie_sjabloon
     set doel_functiegroep_id = p_doel_functiegroep_id
   where id = p_sjabloon_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_id      uuid;
begin
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_sjabloon_id is null then
    -- Nieuw sjabloon: company_id komt mee maar wordt geautoriseerd.
    if not mag_bedrijf_beheren(p_company_id) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;
    insert into inspectie_sjabloon (company_id, naam, controlesoort, actief)
    values (p_company_id, btrim(p_naam), nullif(btrim(coalesce(p_controlesoort, '')), ''), true)
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaand sjabloon: company_id afleiden, een meegestuurd company_id negeren.
  select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon
     set naam          = btrim(p_naam),
         controlesoort = nullif(btrim(coalesce(p_controlesoort, '')), '')
   where id = p_sjabloon_id;
  return p_sjabloon_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pva_items;
  v_naam text;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_item.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  update public.pva_items
  set concept_status = null, concept_opm = null, concept_at = null, updated_at = now()
  where id = p_actie_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'concept_teruggestuurd', p_opmerking, v_naam, 'beheerder');

  return public.actie_als_jsonb(p_actie_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_afronden_token(p_token text, p_toolbox_id uuid, p_video_bekeken boolean, p_quiz_antwoorden jsonb, p_naam_bevestigd boolean, p_handtekening text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.deellinks;
  v_persoon public.personen;
  v_company uuid;
  v_t       record;
  v_titel   text; v_tekst text; v_video text;
  v_totaal  integer; v_score integer; v_pct integer; v_gehaald boolean;
  v_quiz_snap jsonb; v_resultaat jsonb;
  v_id uuid;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then raise exception 'Ongeldige of ingetrokken link'; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then raise exception 'Link is verlopen'; end if;
  select * into v_persoon from public.personen where id = v_link.persoon_id;
  if v_persoon.id is null or v_persoon.archived_at is not null then raise exception 'Persoon niet gevonden'; end if;
  v_company := v_persoon.company_id;

  if not coalesce(p_naam_bevestigd, false) then
    raise exception 'Naam niet bevestigd — er kan geen bewijs worden vastgelegd';
  end if;
  if p_handtekening is null or btrim(p_handtekening) = '' then
    raise exception 'Handtekening ontbreekt';
  end if;

  -- Eén afronding per toolbox per kalenderjaar: weiger een tweede netjes.
  if exists (
    select 1 from public.toolbox_deelname d
    where d.persoon_id = v_persoon.id
      and d.toolbox_id = p_toolbox_id
      and public.jaar_utc(d.afgerond_op) = public.jaar_utc(now())
  ) then
    raise exception 'Deze toolbox is dit jaar al afgerond';
  end if;

  select t.*, a.modus as afw_modus, a.lokale_titel, a.lokale_tekst, a.lokale_video_url
    into v_t
  from public.bedrijf_toolbox bt
  join public.centrale_toolbox t on t.id = bt.toolbox_id
  left join public.bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = v_company
  where bt.company_id = v_company and t.id = p_toolbox_id
    and t.toegang = 'link'
    and coalesce(a.modus,'') <> 'uit'
    and (t.gearchiveerd_op is null or a.modus = 'lokaal');
  if v_t.id is null then raise exception 'Toolbox niet beschikbaar voor jou'; end if;

  v_titel := case when v_t.afw_modus='lokaal' and v_t.lokale_titel is not null then v_t.lokale_titel else v_t.titel end;
  v_tekst := case when v_t.afw_modus='lokaal' then v_t.lokale_tekst else v_t.tekst end;
  v_video := case when v_t.afw_modus='lokaal' and v_t.lokale_video_url is not null then v_t.lokale_video_url else v_t.video_url end;

  with q as (
    select (row_number() over (order by volgorde, id))::int - 1 as idx,
           vraagtekst, opties, juist_antwoord, uitleg
    from public.centrale_toolbox_vraag
    where toolbox_id = p_toolbox_id and gearchiveerd_op is null
  )
  select count(*)::int,
         count(*) filter (where (p_quiz_antwoorden ->> idx)::int = juist_antwoord)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'vraagtekst', vraagtekst, 'opties', opties, 'juist_antwoord', juist_antwoord,
           'uitleg', uitleg, 'gekozen', (p_quiz_antwoorden ->> idx)::int
         ) order by idx), '[]'::jsonb)
    into v_totaal, v_score, v_quiz_snap
  from q;

  if v_totaal > 0 then
    v_pct := round(100.0 * v_score / v_totaal);
    v_gehaald := v_pct >= v_t.quiz_slaaggrens;
    v_resultaat := jsonb_build_object('score', v_score, 'totaal', v_totaal, 'pct', v_pct, 'gehaald', v_gehaald);
  else
    v_resultaat := null;
  end if;

  if v_t.vereist_video and not coalesce(p_video_bekeken, false) then
    raise exception 'De video moet bekeken zijn om af te ronden';
  end if;
  if v_t.vereist_quiz and v_totaal > 0 and not coalesce(v_gehaald, false) then
    raise exception 'De quiz is niet gehaald';
  end if;

  insert into public.toolbox_deelname (
    company_id, persoon_id, toolbox_id, bewijssoort,
    titel_snap, tekst_snap, video_url_snap, quiz_snap,
    afgerond_op, video_bekeken, quiz_resultaat,
    naam_bevestigd, bevestigde_naam, handtekening, handtekening_gezet_op
  ) values (
    v_company, v_persoon.id, p_toolbox_id, 'digitaal',
    v_titel, coalesce(v_tekst,''), v_video, v_quiz_snap,
    now(), coalesce(p_video_bekeken,false), v_resultaat,
    true, v_persoon.naam, p_handtekening, now()
  ) returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_bewijs(p_deelname_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v jsonb;
begin
  select company_id into v_company from toolbox_deelname where id = p_deelname_id;
  if v_company is null then raise exception 'Deelname niet gevonden'; end if;
  if not coalesce(mag_bedrijf_beheren(v_company), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'id',                    d.id,
    'company_id',            d.company_id,
    'bedrijf_naam',          c.name,
    'bewijssoort',           d.bewijssoort,
    'bevestigde_naam',       d.bevestigde_naam,
    'naam_bevestigd',        d.naam_bevestigd,
    'afgerond_op',           d.afgerond_op,
    'titel_snap',            d.titel_snap,
    'tekst_snap',            d.tekst_snap,
    'video_url_snap',        d.video_url_snap,
    'video_bekeken',         d.video_bekeken,
    'quiz_snap',             d.quiz_snap,
    'quiz_resultaat',        d.quiz_resultaat,
    'handtekening',          d.handtekening,
    'handtekening_gezet_op', d.handtekening_gezet_op,
    'presentielijst_pad',    d.presentielijst_pad
  ) into v
  from toolbox_deelname d
  join companies c on c.id = d.company_id
  where d.id = p_deelname_id;
  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not coalesce(mag_bedrijf_beheren(p_company_id), false) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              d.id,
    'bevestigde_naam', d.bevestigde_naam,
    'titel_snap',      d.titel_snap,
    'afgerond_op',     d.afgerond_op,
    'getekend',        (d.handtekening is not null and btrim(d.handtekening) <> ''),
    'bewijssoort',     d.bewijssoort,
    'quiz_resultaat',  d.quiz_resultaat
  ) order by d.afgerond_op desc, d.id), '[]'::jsonb)
  into v
  from toolbox_deelname d
  where d.company_id = p_company_id
    and d.afgerond_op >= p_van
    and d.afgerond_op < (p_tot + 1);
  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_dashboard(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jaar int  := extract(year from current_date)::int;
  v_ys   date := make_date(v_jaar, 1, 1);
  v_ye   date := make_date(v_jaar, 12, 31);
  v_yd   int  := (v_ye - v_ys) + 1;
  v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  with pers as (
    select p.id, p.naam, p.functiegroep_id, fg.naam as fg_naam,
           p.datum_in_dienst, p.datum_uit_dienst,
           coalesce(d.doel_per_jaar, 0) as n,
           (p.datum_uit_dienst is null or p.datum_uit_dienst >= current_date) as niet_uit_dienst
    from personen p
    left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
    left join bedrijf_doelstelling d on d.company_id = p_company_id and d.functiegroep_id = p.functiegroep_id
    where p.company_id = p_company_id and p.archived_at is null
  ),
  calc as (
    select pers.*,
           greatest(v_ys, coalesce(datum_in_dienst, v_ys)) as eff_start,
           least(v_ye, coalesce(datum_uit_dienst, v_ye))   as eff_end
    from pers
  ),
  m3 as (
    select c.*,
      round(n * (case when eff_end < eff_start then 0 else (eff_end - eff_start) + 1 end)::numeric / v_yd)::int as doel,
      round(n * (greatest(0, (least(current_date, eff_end) - eff_start) + 1))::numeric / v_yd)::int as verwacht,
      (select count(distinct dd.toolbox_id) from toolbox_deelname dd
         where dd.persoon_id = c.id and extract(year from dd.afgerond_op)::int = v_jaar) as gedaan
    from calc c
  ),
  m4 as (
    select m3.*,
      case
        when not niet_uit_dienst then 'uit_dienst'
        when doel <= 0 then 'geen_doel'
        when gedaan >= doel then 'klaar'
        when gedaan >= verwacht then 'op_schema'
        else 'loopt_achter'
      end as status
    from m3
  )
  select jsonb_build_object(
    'jaar', v_jaar,
    'bedrijf', (
      select jsonb_build_object(
        'doel',   coalesce(sum(doel) filter (where niet_uit_dienst), 0),
        'gedaan', coalesce(sum(least(gedaan, doel)) filter (where niet_uit_dienst), 0),
        'pct', case when coalesce(sum(doel) filter (where niet_uit_dienst), 0) > 0
                    then round(100.0 * sum(least(gedaan, doel)) filter (where niet_uit_dienst)
                               / sum(doel) filter (where niet_uit_dienst))
                    else null end
      ) from m4
    ),
    'per_functiegroep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'functiegroep_id', fg_id, 'naam', fg_naam, 'aantal_personen', aantal,
        'doel', doel_t, 'gedaan', gedaan_t,
        'pct', case when doel_t > 0 then round(100.0 * gedaan_t / doel_t) else null end
      ) order by fg_naam nulls last), '[]'::jsonb)
      from (
        select functiegroep_id as fg_id, fg_naam, count(*) as aantal,
               sum(doel) as doel_t, sum(least(gedaan, doel)) as gedaan_t
        from m4 where niet_uit_dienst and functiegroep_id is not null
        group by functiegroep_id, fg_naam
      ) g
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', id, 'naam', naam, 'functiegroep_naam', fg_naam,
        'doel', doel, 'gedaan', gedaan, 'verwacht_nu', verwacht, 'status', status,
        'datum_in_dienst', datum_in_dienst, 'datum_uit_dienst', datum_uit_dienst
      ) order by
        case status when 'loopt_achter' then 0 when 'op_schema' then 1 when 'klaar' then 2
                    when 'geen_doel' then 3 else 4 end, naam), '[]'::jsonb)
      from m4
    )
  ) into v;
  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_deelname_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'Een afgerond toolbox-record is onveranderlijk';
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if not exists (select 1 from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null) then
    raise exception 'Toolbox niet gevonden of gearchiveerd';
  end if;
  insert into bedrijf_toolbox (company_id, toolbox_id) values (p_company_id, p_toolbox_id)
  on conflict (company_id, toolbox_id) do nothing;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_lokaal_aanpassen(p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_versie integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_lokale_tekst),'') = '' then raise exception 'Lokale tekst is verplicht'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_toolbox_afwijking
    (company_id, toolbox_id, modus, lokale_titel, lokale_tekst, lokale_video_url, basis_versie)
  values
    (p_company_id, p_toolbox_id, 'lokaal', nullif(btrim(coalesce(p_lokale_titel,'')),''),
     btrim(p_lokale_tekst), nullif(btrim(coalesce(p_lokale_video_url,'')),''), v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='lokaal', lokale_titel=excluded.lokale_titel, lokale_tekst=excluded.lokale_tekst,
        lokale_video_url=excluded.lokale_video_url, basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_sessie_aanwezigheid_zetten(p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sessie  record;
  v_persoon record;
begin
  select id, company_id, datum, onderwerp, notitie into v_sessie
    from toolbox_sessie where id = p_sessie_id;
  if v_sessie.id is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_sessie.company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  -- Cross-company-guard: de persoon moet bij hetzelfde bedrijf horen en actief zijn.
  select id, naam, company_id into v_persoon
    from personen where id = p_persoon_id and archived_at is null;
  if v_persoon.id is null then raise exception 'Persoon niet gevonden'; end if;
  if v_persoon.company_id <> v_sessie.company_id then raise exception 'Persoon hoort niet bij dit bedrijf'; end if;

  if coalesce(p_aanwezig, false) then
    insert into toolbox_deelname (
      company_id, persoon_id, toolbox_id, sessie_id, bewijssoort,
      titel_snap, tekst_snap, afgerond_op,
      naam_bevestigd, bevestigde_naam
    ) values (
      v_sessie.company_id, v_persoon.id, null, v_sessie.id, 'fysiek_aanwezig',
      v_sessie.onderwerp, coalesce(v_sessie.notitie, ''), v_sessie.datum::timestamptz,
      false, v_persoon.naam
    )
    on conflict (sessie_id, persoon_id) where sessie_id is not null do nothing;
  else
    delete from toolbox_deelname where sessie_id = p_sessie_id and persoon_id = p_persoon_id;
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_sessie_opslaan(p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text, p_notitie text, p_toolbox_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(btrim(p_onderwerp),'') = '' then raise exception 'Onderwerp is verplicht'; end if;
  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  -- Optionele referentie naar een centrale toolbox: als opgegeven, moet hij bestaan.
  if p_toolbox_id is not null and not exists (select 1 from centrale_toolbox where id = p_toolbox_id) then
    raise exception 'Gekozen toolbox bestaat niet';
  end if;

  if p_sessie_id is null then
    insert into toolbox_sessie (company_id, datum, onderwerp, notitie, toolbox_id, aangemaakt_door)
    values (p_company_id, p_datum, btrim(p_onderwerp), nullif(btrim(coalesce(p_notitie,'')),''), p_toolbox_id, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  -- Bijwerken: alleen binnen het eigen bedrijf (cross-company-guard via company_id).
  update toolbox_sessie set
    datum = p_datum, onderwerp = btrim(p_onderwerp),
    notitie = nullif(btrim(coalesce(p_notitie,'')),''), toolbox_id = p_toolbox_id,
    updated_at = now()
  where id = p_sessie_id and company_id = p_company_id;
  if not found then raise exception 'Sessie niet gevonden'; end if;
  return p_sessie_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_sessie_verwijderen(p_sessie_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid;
begin
  select company_id into v_company from toolbox_sessie where id = p_sessie_id;
  if v_company is null then raise exception 'Sessie niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from toolbox_sessie where id = p_sessie_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'totaal_sessies', (select count(*) from toolbox_sessie s where s.company_id = p_company_id),
    'sessies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessie_id', s.id,
        'datum',     s.datum,
        'onderwerp', s.onderwerp,
        'notitie',   s.notitie,
        'toolbox_id', s.toolbox_id,
        'opkomst', (select count(*) from toolbox_deelname d where d.sessie_id = s.id),
        'aanwezigen', (
          select coalesce(jsonb_agg(d.persoon_id), '[]'::jsonb)
          from toolbox_deelname d where d.sessie_id = s.id
        )
      ) order by s.datum desc, s.created_at desc), '[]'::jsonb)
      from toolbox_sessie s where s.company_id = p_company_id
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', p.id,
        'naam', p.naam,
        'functiegroep_naam', fg.naam,
        'bijgewoond', (
          select count(*) from toolbox_deelname d
          join toolbox_sessie s2 on s2.id = d.sessie_id
          where d.persoon_id = p.id and s2.company_id = p_company_id
        )
      ) order by p.naam), '[]'::jsonb)
      from personen p
      left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
      where p.company_id = p_company_id and p.archived_at is null
    )
  ) into v;
  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  delete from bedrijf_toolbox_afwijking where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_versie integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;
  insert into bedrijf_toolbox_afwijking (company_id, toolbox_id, modus, basis_versie)
  values (p_company_id, p_toolbox_id, 'uit', v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='uit', lokale_titel=null, lokale_tekst=null, lokale_video_url=null,
        basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.toolbox_voor_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.deellinks;
  v_persoon public.personen;
  v_company uuid;
  v_jaar    integer;
  v_list    jsonb;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;
  select * into v_persoon from public.personen where id = v_link.persoon_id;
  if v_persoon.id is null or v_persoon.archived_at is not null then return null; end if;
  v_company := v_persoon.company_id;
  v_jaar := extract(year from now())::int;

  select coalesce(jsonb_agg(row order by volg, tid), '[]'::jsonb) into v_list
  from (
    select t.volgorde as volg, t.id as tid, jsonb_build_object(
      'toolbox_id', t.id,
      'titel', case when a.modus='lokaal' and a.lokale_titel is not null then a.lokale_titel else t.titel end,
      'tekst', case when a.modus='lokaal' then a.lokale_tekst else t.tekst end,
      'video_url', case when a.modus='lokaal' and a.lokale_video_url is not null then a.lokale_video_url else t.video_url end,
      'vereist_video', t.vereist_video,
      'vereist_quiz', t.vereist_quiz,
      'quiz_slaaggrens', t.quiz_slaaggrens,
      'quiz_uitleg_modus', t.quiz_uitleg_modus,
      'vragen', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'vraagtekst', q.vraagtekst, 'opties', q.opties,
          'juist_antwoord', q.juist_antwoord, 'uitleg', q.uitleg
        ) order by q.volgorde, q.id), '[]'::jsonb)
        from public.centrale_toolbox_vraag q
        where q.toolbox_id = t.id and q.gearchiveerd_op is null
      ),
      'afgerond_dit_jaar', exists (
        select 1 from public.toolbox_deelname d
        where d.persoon_id = v_persoon.id and d.toolbox_id = t.id
          and extract(year from d.afgerond_op)::int = v_jaar
      )
    ) as row
    from public.bedrijf_toolbox bt
    join public.centrale_toolbox t on t.id = bt.toolbox_id
    left join public.bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = v_company
    where bt.company_id = v_company
      and t.toegang = 'link'
      and coalesce(a.modus,'') <> 'uit'
      and (t.gearchiveerd_op is null or a.modus = 'lokaal')
  ) s;

  return jsonb_build_object(
    'persoon',   jsonb_build_object('id', v_persoon.id, 'naam', v_persoon.naam),
    'bedrijf',   (select name from public.companies where id = v_company),
    'huisstijl', public.huisstijl_van_bedrijf(v_company),
    'toolboxen', v_list
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.vind_of_maak_persoon(p_company_id uuid, p_naam text, p_email text, p_voorgesteld_door uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  -- Bestaat er al een (niet-gearchiveerde) persoon met dit e-mailadres?
  if p_email is not null and p_email <> '' then
    select id into v_id from public.personen
    where company_id = p_company_id and lower(email) = lower(p_email)
      and archived_at is null
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- Anders: nieuwe persoon, status 'voorgesteld' (door een actiehouder gedragen).
  insert into public.personen (company_id, naam, email, status, voorgesteld_door)
  values (p_company_id, coalesce(nullif(p_naam, ''), 'Nieuwe collega'),
          nullif(p_email, ''), 'voorgesteld', p_voorgesteld_door)
  returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vraag_lokaal_aanpassen(p_company_id uuid, p_vraag_id uuid, p_lokale_tekst text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rubriek uuid;
  v_versie  integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if coalesce(btrim(p_lokale_tekst), '') = '' then
    raise exception 'Lokale tekst is verplicht';
  end if;

  select rubriek_id, versie into v_rubriek, v_versie
    from centrale_vraag where id = p_vraag_id and gearchiveerd_op is null;
  if v_rubriek is null then
    raise exception 'Vraag niet gevonden';
  end if;
  if not exists (select 1 from bedrijf_rubriek br where br.company_id = p_company_id and br.rubriek_id = v_rubriek) then
    raise exception 'Koppel eerst de rubriek voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_vraag_afwijking (company_id, vraag_id, modus, lokale_tekst, basis_versie)
  values (p_company_id, p_vraag_id, 'lokaal', btrim(p_lokale_tekst), v_versie)
  on conflict (company_id, vraag_id) do update
    set modus = 'lokaal', lokale_tekst = excluded.lokale_tekst,
        basis_versie = excluded.basis_versie, afgeweken_op = now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.vraag_terug_naar_centraal(p_company_id uuid, p_vraag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from bedrijf_vraag_afwijking
   where company_id = p_company_id and vraag_id = p_vraag_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vraag_uitzetten(p_company_id uuid, p_vraag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rubriek uuid;
  v_versie  integer;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select rubriek_id, versie into v_rubriek, v_versie
    from centrale_vraag where id = p_vraag_id and gearchiveerd_op is null;
  if v_rubriek is null then
    raise exception 'Vraag niet gevonden';
  end if;
  if not exists (select 1 from bedrijf_rubriek br where br.company_id = p_company_id and br.rubriek_id = v_rubriek) then
    raise exception 'Koppel eerst de rubriek voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_vraag_afwijking (company_id, vraag_id, modus, lokale_tekst, basis_versie)
  values (p_company_id, p_vraag_id, 'uit', null, v_versie)
  on conflict (company_id, vraag_id) do update
    set modus = 'uit', lokale_tekst = null,
        basis_versie = excluded.basis_versie, afgeweken_op = now();
end;
$function$;
CREATE OR REPLACE FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pva_items;
  v_naam text;
begin
  select * into v_item from public.pva_items where id = p_actie_id;
  if v_item.id is null then raise exception 'Actie bestaat niet'; end if;
  if not public.mag_bedrijf_beheren(v_item.company_id) then raise exception 'Geen toegang'; end if;

  select coalesce(naam, email) into v_naam from public.users where id = auth.uid();

  update public.pva_items
  set concept_status = p_status, concept_opm = p_opm, concept_at = now()
  where id = p_actie_id;

  insert into public.actie_historie
    (company_id, pva_item_id, gebeurtenis, naar_status, opmerking, actor_naam, actor_type)
  values
    (v_item.company_id, p_actie_id, 'concept_gewijzigd', p_status, p_opm, v_naam, 'beheerder');

  return public.actie_als_jsonb(p_actie_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang'; end if;
  if p_ritme not in ('uit','dagelijks','wekelijks','maandelijks') then
    raise exception 'Ongeldig ritme';
  end if;

  insert into public.herinner_instelling (company_id, ritme, updated_at, updated_by)
  values (p_company_id, p_ritme, now(), auth.uid())
  on conflict (company_id) do update
    set ritme = excluded.ritme, updated_at = now(), updated_by = auth.uid();

  return p_ritme;
end;
$function$;
CREATE OR REPLACE FUNCTION public.zet_mijn_naam(p_naam text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  update public.users set naam = p_naam where id = auth.uid();
end;
$function$;

-- ============================================================
-- Functie-privileges (afwijkend van default — zie migratie 0003)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.actie_als_jsonb(p_actie_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actie_als_jsonb(p_actie_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bedrijf_norm_overzicht(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bedrijf_norm_overzicht(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bedrijf_norm_overzicht(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bedrijf_toolbox_overzicht(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bedrijf_toolbox_overzicht(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bedrijf_toolbox_overzicht(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_rubriek_archiveren(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_rubriek_archiveren(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_rubriek_archiveren(p_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_rubriek_opslaan(p_id uuid, p_naam text, p_volgorde integer, p_rie_code text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_rubriek_opslaan(p_id uuid, p_naam text, p_volgorde integer, p_rie_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_rubriek_opslaan(p_id uuid, p_naam text, p_volgorde integer, p_rie_code text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_toolbox_archiveren(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_archiveren(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_archiveren(p_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_toolbox_opslaan(p_id uuid, p_titel text, p_tekst text, p_video_url text, p_vereist_video boolean, p_vereist_quiz boolean, p_quiz_slaaggrens integer, p_quiz_uitleg_modus text, p_toegang text, p_volgorde integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_opslaan(p_id uuid, p_titel text, p_tekst text, p_video_url text, p_vereist_video boolean, p_vereist_quiz boolean, p_quiz_slaaggrens integer, p_quiz_uitleg_modus text, p_toegang text, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_opslaan(p_id uuid, p_titel text, p_tekst text, p_video_url text, p_vereist_video boolean, p_vereist_quiz boolean, p_quiz_slaaggrens integer, p_quiz_uitleg_modus text, p_toegang text, p_volgorde integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_toolbox_vraag_archiveren(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_vraag_archiveren(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_vraag_archiveren(p_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_toolbox_vraag_opslaan(p_id uuid, p_toolbox_id uuid, p_vraagtekst text, p_opties jsonb, p_juist_antwoord integer, p_uitleg text, p_volgorde integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_vraag_opslaan(p_id uuid, p_toolbox_id uuid, p_vraagtekst text, p_opties jsonb, p_juist_antwoord integer, p_uitleg text, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_toolbox_vraag_opslaan(p_id uuid, p_toolbox_id uuid, p_vraagtekst text, p_opties jsonb, p_juist_antwoord integer, p_uitleg text, p_volgorde integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_vraag_archiveren(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_vraag_archiveren(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_vraag_archiveren(p_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.centrale_vraag_opslaan(p_id uuid, p_rubriek_id uuid, p_tekst text, p_volgorde integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centrale_vraag_opslaan(p_id uuid, p_rubriek_id uuid, p_tekst text, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.centrale_vraag_opslaan(p_id uuid, p_rubriek_id uuid, p_tekst text, p_volgorde integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) TO service_role;
REVOKE EXECUTE ON FUNCTION public.dashboard_admin_overzicht() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_admin_overzicht() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_admin_overzicht() TO service_role;
REVOKE EXECUTE ON FUNCTION public.dashboard_overzicht(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_overzicht(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_overzicht(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_actie_doorgeven(p_token text, p_actie_id uuid, p_naam text, p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_actie_doorgeven(p_token text, p_actie_id uuid, p_naam text, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_actie_doorgeven(p_token text, p_actie_id uuid, p_naam text, p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_actie_historie(p_token text, p_actie_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_actie_historie(p_token text, p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_actie_historie(p_token text, p_actie_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_lijst(p_token text, p_actie_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_lijst(p_token text, p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_lijst(p_token text, p_actie_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_pad(p_token text, p_actie_id uuid, p_bestandsnaam text) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_pad(p_token text, p_actie_id uuid, p_bestandsnaam text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_pad(p_token text, p_actie_id uuid, p_bestandsnaam text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_registreren(p_token text, p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_registreren(p_token text, p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_bewijs_registreren(p_token text, p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_concept_update(p_token text, p_actie_id uuid, p_status text, p_opm text) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_concept_update(p_token text, p_actie_id uuid, p_status text, p_opm text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_concept_update(p_token text, p_actie_id uuid, p_status text, p_opm text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deellink_data(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.deellink_data(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deellink_data(p_token text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.doelstelling_zetten(p_company_id uuid, p_functiegroep_id uuid, p_doel_per_jaar integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doelstelling_zetten(p_company_id uuid, p_functiegroep_id uuid, p_doel_per_jaar integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doelstelling_zetten(p_company_id uuid, p_functiegroep_id uuid, p_doel_per_jaar integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.functiegroep_archiveren(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.functiegroep_archiveren(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.functiegroep_archiveren(p_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.functiegroep_opslaan(p_id uuid, p_company_id uuid, p_naam text, p_volgorde integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.functiegroep_opslaan(p_id uuid, p_company_id uuid, p_naam text, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.functiegroep_opslaan(p_id uuid, p_company_id uuid, p_naam text, p_volgorde integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO anon;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_company(p_dataset jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_company(p_dataset jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_rie_content(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_rie_content(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_deel2_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date, p_functie_slachtoffer text, p_medische_dienst_bezocht text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_deel2_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date, p_functie_slachtoffer text, p_medische_dienst_bezocht text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_deel2_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date, p_functie_slachtoffer text, p_medische_dienst_bezocht text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_foto_pad_token(p_token text, p_incident_id uuid, p_bestandsnaam text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_foto_pad_token(p_token text, p_incident_id uuid, p_bestandsnaam text) TO anon;
GRANT EXECUTE ON FUNCTION public.incident_foto_pad_token(p_token text, p_incident_id uuid, p_bestandsnaam text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_foto_pad_token(p_token text, p_incident_id uuid, p_bestandsnaam text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_foto_registreren_token(p_token text, p_incident_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_foto_registreren_token(p_token text, p_incident_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.incident_foto_registreren_token(p_token text, p_incident_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_foto_registreren_token(p_token text, p_incident_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_meldcontext_token(p_token text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_meldcontext_token(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.incident_meldcontext_token(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_meldcontext_token(p_token text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_melden_token(p_token text, p_datum date, p_tijd time without time zone, p_locatie text, p_project text, p_omschrijving text, p_naam_melder text, p_gevolgen text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_melden_token(p_token text, p_datum date, p_tijd time without time zone, p_locatie text, p_project text, p_omschrijving text, p_naam_melder text, p_gevolgen text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.incident_melden_token(p_token text, p_datum date, p_tijd time without time zone, p_locatie text, p_project text, p_omschrijving text, p_naam_melder text, p_gevolgen text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_melden_token(p_token text, p_datum date, p_tijd time without time zone, p_locatie text, p_project text, p_omschrijving text, p_naam_melder text, p_gevolgen text[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_meldlink_intrekken(p_company_id uuid, p_ingetrokken boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_intrekken(p_company_id uuid, p_ingetrokken boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_intrekken(p_company_id uuid, p_ingetrokken boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_meldlink_roteren(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_roteren(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_roteren(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.incident_meldlink_zorg(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_zorg(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_meldlink_zorg(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_bibliotheek(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_bibliotheek(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_bibliotheek(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspectie_doel_zetten(p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer) TO anon;
GRANT EXECUTE ON FUNCTION public.inspectie_doel_zetten(p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_doel_zetten(p_company_id uuid, p_persoon_id uuid, p_doel_per_jaar integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_rapport(p_inspectie_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_rapport(p_inspectie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_rapport(p_inspectie_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspectie_start_centraal(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspectie_start_centraal(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_start_centraal(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.jaar_utc(p_ts timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.jaar_utc(p_ts timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jaar_utc(p_ts timestamp with time zone) TO service_role;
REVOKE EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.module_activeren(p_company_id uuid, p_module text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.module_activeren(p_company_id uuid, p_module text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.module_activeren(p_company_id uuid, p_module text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.module_gebruik_zetten(p_company_id uuid, p_module text, p_aan boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.module_gebruik_zetten(p_company_id uuid, p_module text, p_aan boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.module_gebruik_zetten(p_company_id uuid, p_module text, p_aan boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.module_stopzetten(p_company_id uuid, p_module text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.module_stopzetten(p_company_id uuid, p_module text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.module_stopzetten(p_company_id uuid, p_module text) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO anon;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO service_role;
REVOKE EXECUTE ON FUNCTION public.persoon_functiegroep_zetten(p_persoon_id uuid, p_functiegroep_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persoon_functiegroep_zetten(p_persoon_id uuid, p_functiegroep_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persoon_functiegroep_zetten(p_persoon_id uuid, p_functiegroep_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rubriek_koppelen(p_company_id uuid, p_rubriek_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rubriek_koppelen(p_company_id uuid, p_rubriek_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rubriek_koppelen(p_company_id uuid, p_rubriek_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rubriek_ontkoppelen(p_company_id uuid, p_rubriek_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rubriek_ontkoppelen(p_company_id uuid, p_rubriek_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rubriek_ontkoppelen(p_company_id uuid, p_rubriek_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sjabloon_doelgroep_zetten(p_sjabloon_id uuid, p_doel_functiegroep_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sjabloon_doelgroep_zetten(p_sjabloon_id uuid, p_doel_functiegroep_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sjabloon_doelgroep_zetten(p_sjabloon_id uuid, p_doel_functiegroep_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_afronden_token(p_token text, p_toolbox_id uuid, p_video_bekeken boolean, p_quiz_antwoorden jsonb, p_naam_bevestigd boolean, p_handtekening text) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_afronden_token(p_token text, p_toolbox_id uuid, p_video_bekeken boolean, p_quiz_antwoorden jsonb, p_naam_bevestigd boolean, p_handtekening text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_afronden_token(p_token text, p_toolbox_id uuid, p_video_bekeken boolean, p_quiz_antwoorden jsonb, p_naam_bevestigd boolean, p_handtekening text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_bewijs(p_deelname_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_bewijs(p_deelname_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_bewijs(p_deelname_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_bewijs_overzicht(p_company_id uuid, p_van date, p_tot date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_dashboard(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_dashboard(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_dashboard(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_deelname_immutable() TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_deelname_immutable() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_deelname_immutable() TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_lokaal_aanpassen(p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_lokaal_aanpassen(p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_lokaal_aanpassen(p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_aanwezigheid_zetten(p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_aanwezigheid_zetten(p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_aanwezigheid_zetten(p_sessie_id uuid, p_persoon_id uuid, p_aanwezig boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_opslaan(p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text, p_notitie text, p_toolbox_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_opslaan(p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text, p_notitie text, p_toolbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_opslaan(p_company_id uuid, p_sessie_id uuid, p_datum date, p_onderwerp text, p_notitie text, p_toolbox_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_verwijderen(p_sessie_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_verwijderen(p_sessie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_sessie_verwijderen(p_sessie_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toolbox_voor_token(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.toolbox_voor_token(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toolbox_voor_token(p_token text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vind_of_maak_persoon(p_company_id uuid, p_naam text, p_email text, p_voorgesteld_door uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vind_of_maak_persoon(p_company_id uuid, p_naam text, p_email text, p_voorgesteld_door uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vraag_lokaal_aanpassen(p_company_id uuid, p_vraag_id uuid, p_lokale_tekst text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vraag_lokaal_aanpassen(p_company_id uuid, p_vraag_id uuid, p_lokale_tekst text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vraag_lokaal_aanpassen(p_company_id uuid, p_vraag_id uuid, p_lokale_tekst text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vraag_terug_naar_centraal(p_company_id uuid, p_vraag_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vraag_terug_naar_centraal(p_company_id uuid, p_vraag_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vraag_terug_naar_centraal(p_company_id uuid, p_vraag_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vraag_uitzetten(p_company_id uuid, p_vraag_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vraag_uitzetten(p_company_id uuid, p_vraag_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vraag_uitzetten(p_company_id uuid, p_vraag_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) TO service_role;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO anon;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO service_role;

-- ============================================================
-- Triggers (public)
-- ============================================================

CREATE TRIGGER toolbox_deelname_no_update BEFORE UPDATE ON public.toolbox_deelname FOR EACH ROW EXECUTE FUNCTION toolbox_deelname_immutable();

-- ============================================================
-- Auth-integratie (trigger op auth.users)
-- ============================================================

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
