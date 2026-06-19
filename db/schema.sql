-- RI&E-portaal — schemadump (public)
-- Gegenereerd door scripts/dump_schema.mjs op 2026-06-19T18:38:42.468Z
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

CREATE TABLE public.bedrijf_modules (
  company_id uuid NOT NULL,
  module text NOT NULL,
  actief boolean DEFAULT true NOT NULL
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
  volgorde integer DEFAULT 0 NOT NULL
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
  aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL
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
  user_id uuid
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
ALTER TABLE public.bedrijf_modules ADD CONSTRAINT bedrijf_modules_pkey PRIMARY KEY (company_id, module);
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_pkey PRIMARY KEY (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_pkey PRIMARY KEY (id);
ALTER TABLE public.fotos ADD CONSTRAINT fotos_pkey PRIMARY KEY (id);
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_pkey PRIMARY KEY (company_id);
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_historie ADD CONSTRAINT inspectie_historie_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_sjabloon ADD CONSTRAINT inspectie_sjabloon_pkey PRIMARY KEY (id);
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_pkey PRIMARY KEY (id);
ALTER TABLE public.merken ADD CONSTRAINT merken_pkey PRIMARY KEY (id);
ALTER TABLE public.modules ADD CONSTRAINT modules_pkey PRIMARY KEY (id);
ALTER TABLE public.personen ADD CONSTRAINT personen_pkey PRIMARY KEY (id);
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_pkey PRIMARY KEY (id);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.vragen ADD CONSTRAINT vragen_pkey PRIMARY KEY (id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_persoon_id_key UNIQUE (persoon_id);
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_token_key UNIQUE (token);
ALTER TABLE public.fotos ADD CONSTRAINT fotos_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.modules ADD CONSTRAINT modules_company_id_code_key UNIQUE (company_id, code);
ALTER TABLE public.personen ADD CONSTRAINT personen_company_id_email_key UNIQUE (company_id, email);
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_company_id_versie_key UNIQUE (company_id, versie);
ALTER TABLE public.vragen ADD CONSTRAINT vragen_company_id_nr_key UNIQUE (company_id, nr);
ALTER TABLE public.companies ADD CONSTRAINT companies_huisstijl_modus_check CHECK ((huisstijl_modus = ANY (ARRAY['default'::text, 'co_branding'::text, 'white_label'::text])));
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_ritme_check CHECK ((ritme = ANY (ARRAY['uit'::text, 'dagelijks'::text, 'wekelijks'::text, 'maandelijks'::text])));
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_bron_check CHECK ((bron = ANY (ARRAY['handmatig'::text, 'automatisch'::text])));
ALTER TABLE public.inspectie ADD CONSTRAINT inspectie_status_check CHECK ((status = ANY (ARRAY['concept'::text, 'ingediend'::text, 'afgerond'::text, 'geannuleerd'::text])));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_actie_id_klopt CHECK ((((afhandeling = 'actie'::text) AND (actie_id IS NOT NULL)) OR ((afhandeling <> 'actie'::text) AND (actie_id IS NULL))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_afhandeling_klopt CHECK ((((resultaat IS NULL) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'in_orde'::text) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'nvt'::text) AND (afhandeling = 'geen'::text)) OR ((resultaat = 'niet_in_orde'::text) AND (afhandeling = ANY (ARRAY['geen'::text, 'meteen_hersteld'::text, 'actie'::text])))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT bevinding_hersteld_bewijs CHECK (((afhandeling <> 'meteen_hersteld'::text) OR ((opmerking IS NOT NULL) AND (btrim(opmerking) <> ''::text))));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_afhandeling_check CHECK ((afhandeling = ANY (ARRAY['geen'::text, 'meteen_hersteld'::text, 'actie'::text])));
ALTER TABLE public.inspectie_bevinding ADD CONSTRAINT inspectie_bevinding_resultaat_check CHECK ((resultaat = ANY (ARRAY['in_orde'::text, 'niet_in_orde'::text, 'nvt'::text])));
ALTER TABLE public.merken ADD CONSTRAINT merken_lettertype_check CHECK ((lettertype = ANY (ARRAY['grotesk'::text, 'modern'::text, 'klassiek'::text, 'zakelijk'::text])));
ALTER TABLE public.personen ADD CONSTRAINT personen_status_check CHECK ((status = ANY (ARRAY['actief'::text, 'voorgesteld'::text])));
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In behandeling'::text, 'Afgerond'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['client'::text, 'admin'::text])));
ALTER TABLE public.actie_historie ADD CONSTRAINT actie_historie_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.actie_historie ADD CONSTRAINT actie_historie_pva_item_id_fkey FOREIGN KEY (pva_item_id) REFERENCES pva_items(id) ON DELETE CASCADE;
ALTER TABLE public.bedrijf_modules ADD CONSTRAINT bedrijf_modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.bewijs ADD CONSTRAINT bewijs_pva_item_id_fkey FOREIGN KEY (pva_item_id) REFERENCES pva_items(id) ON DELETE CASCADE;
ALTER TABLE public.companies ADD CONSTRAINT companies_merk_id_fkey FOREIGN KEY (merk_id) REFERENCES merken(id) ON DELETE SET NULL;
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.deellinks ADD CONSTRAINT deellinks_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
ALTER TABLE public.fotos ADD CONSTRAINT fotos_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.fotos ADD CONSTRAINT fotos_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.herinner_instelling ADD CONSTRAINT herinner_instelling_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_door_fkey FOREIGN KEY (door) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.herinnering_log ADD CONSTRAINT herinnering_log_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE CASCADE;
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
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.inspectie_sjabloon_punt ADD CONSTRAINT inspectie_sjabloon_punt_sjabloon_id_fkey FOREIGN KEY (sjabloon_id) REFERENCES inspectie_sjabloon(id) ON DELETE CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT modules_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.personen ADD CONSTRAINT personen_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.personen ADD CONSTRAINT personen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.personen ADD CONSTRAINT personen_voorgesteld_door_fkey FOREIGN KEY (voorgesteld_door) REFERENCES personen(id) ON DELETE SET NULL;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_persoon_id_fkey FOREIGN KEY (persoon_id) REFERENCES personen(id) ON DELETE SET NULL;
ALTER TABLE public.pva_items ADD CONSTRAINT pva_items_rie_versie_id_fkey FOREIGN KEY (rie_versie_id) REFERENCES rie_versies(id);
ALTER TABLE public.rie_versies ADD CONSTRAINT rie_versies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
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
CREATE INDEX bevinding_inspectie_idx ON public.inspectie_bevinding USING btree (inspectie_id);
CREATE INDEX bewijs_company_idx ON public.bewijs USING btree (company_id);
CREATE INDEX bewijs_item_idx ON public.bewijs USING btree (pva_item_id);
CREATE INDEX deellinks_token_idx ON public.deellinks USING btree (token);
CREATE INDEX fotos_company_idx ON public.fotos USING btree (company_id);
CREATE INDEX herinnering_log_company_idx ON public.herinnering_log USING btree (company_id, verzonden_op DESC);
CREATE INDEX herinnering_log_persoon_idx ON public.herinnering_log USING btree (persoon_id, verzonden_op DESC);
CREATE INDEX idx_fotos_rie_versie ON public.fotos USING btree (rie_versie_id);
CREATE INDEX idx_modules_rie_versie ON public.modules USING btree (rie_versie_id);
CREATE INDEX idx_pva_items_rie_versie ON public.pva_items USING btree (rie_versie_id);
CREATE INDEX idx_pva_items_termijn_datum ON public.pva_items USING btree (termijn_datum);
CREATE INDEX idx_vragen_rie_versie ON public.vragen USING btree (rie_versie_id);
CREATE INDEX inspectie_company_idx ON public.inspectie USING btree (company_id, status);
CREATE INDEX inspectie_historie_idx ON public.inspectie_historie USING btree (inspectie_id, wanneer DESC);
CREATE INDEX isp_punt_sjabloon_idx ON public.inspectie_sjabloon_punt USING btree (sjabloon_id, volgorde);
CREATE INDEX modules_company_idx ON public.modules USING btree (company_id);
CREATE INDEX personen_company_idx ON public.personen USING btree (company_id);
CREATE INDEX pva_items_company_idx ON public.pva_items USING btree (company_id);
CREATE INDEX pva_items_persoon_idx ON public.pva_items USING btree (persoon_id);
CREATE INDEX vragen_company_idx ON public.vragen USING btree (company_id);
CREATE INDEX vragen_module_idx ON public.vragen USING btree (module_id);

-- ============================================================
-- Row Level Security — aanzetten
-- ============================================================

ALTER TABLE public.actie_historie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijf_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewijs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deellinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.herinner_instelling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.herinnering_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_bevinding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_historie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_sjabloon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspectie_sjabloon_punt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pva_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rie_versies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vragen ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row Level Security — policies
-- ============================================================

CREATE POLICY historie_select ON public.actie_historie AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
CREATE POLICY bedrijf_modules_sel ON public.bedrijf_modules AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY bedrijf_modules_wr ON public.bedrijf_modules AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY bewijs_select ON public.bewijs AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = my_company_id()) OR is_admin()));
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
CREATE POLICY herinner_instelling_select ON public.herinner_instelling AS PERMISSIVE FOR SELECT TO public
  USING (mag_bedrijf_beheren(company_id));
CREATE POLICY herinner_instelling_write ON public.herinner_instelling AS PERMISSIVE FOR ALL TO public
  USING (mag_bedrijf_beheren(company_id))
  WITH CHECK (mag_bedrijf_beheren(company_id));
CREATE POLICY herinnering_log_select ON public.herinnering_log AS PERMISSIVE FOR SELECT TO public
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
    -- Voortgang PvA: de kop-donut.
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

    -- Te beoordelen: actiehouder diende een voorstel in, KAM moet vrijgeven/terugsturen.
    'te_beoordelen', (
      select count(*) from pva_items
      where company_id = p_company_id
        and concept_status is not null and btrim(concept_status) <> ''
    ),

    -- Openstaand per prioriteit (alles wat niet afgerond is).
    'prio_open', (
      select jsonb_build_object(
        'Hoog',   count(*) filter (where prio = 'Hoog'),
        'Middel', count(*) filter (where prio = 'Middel'),
        'Laag',   count(*) filter (where prio = 'Laag')
      )
      from pva_items
      where company_id = p_company_id and status <> 'Afgerond'
    ),

    -- Termijn-urgentie (op de machine-leesbare termijn_datum).
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

    -- RI&E-geldigheid: de meest recente versie van dit bedrijf (of null).
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

    -- Inspecties: lopend vs afgerond + onafgehandelde niet_in_orde-bevindingen.
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

    -- Bewijslast: kwaliteit van afhandeling, niet alleen het vinkje.
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
  select public.is_admin() or p_company_id = public.my_company_id()
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
CREATE OR REPLACE FUNCTION public.my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.users where id = auth.uid()
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
GRANT EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actie_doorgeven(p_actie_id uuid, p_naam text, p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actie_historie_ophalen(p_actie_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bevinding_naar_actie(p_bevinding_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) TO anon;
GRANT EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bevinding_opslaan(p_bevinding_id uuid, p_resultaat text, p_afhandeling text, p_opmerking text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_lijst(p_actie_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_registreren(p_actie_id uuid, p_pad text, p_bestandsnaam text, p_type text, p_grootte bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bewijs_verwijderen(p_bewijs_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deellink(p_persoon_id uuid, p_vervalt_op timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_admin_overzicht() TO anon;
GRANT EXECUTE ON FUNCTION public.dashboard_admin_overzicht() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_admin_overzicht() TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_overzicht(p_company_id uuid) TO anon;
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
GRANT EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) TO anon;
GRANT EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geef_actie_vrij(p_actie_id uuid, p_opmerking text, p_bewijs text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO anon;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_deellink_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.herinner_kandidaten(p_company_id uuid, p_alleen_ritme boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.herinnering_loggen(p_persoon_id uuid, p_bron text, p_acties jsonb, p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_company(p_dataset jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_company(p_dataset jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_rie_content(p_company_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_rie_content(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) TO anon;
GRANT EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_afronden(p_inspectie_id uuid, p_conclusie text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) TO anon;
GRANT EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_conclusie_opslaan(p_inspectie_id uuid, p_conclusie text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspectie_start(p_sjabloon_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intrek_deellink(p_persoon_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.koppel_mij_als_persoon(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mag_bedrijf_beheren(p_company_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mag_herinneren(p_persoon_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO anon;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) TO anon;
GRANT EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.punt_opslaan(p_punt_id uuid, p_sjabloon_id uuid, p_tekst text, p_verplicht boolean, p_volgorde integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.punt_verwijderen(p_punt_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sjabloon_archiveren(p_sjabloon_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) TO anon;
GRANT EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sjabloon_opslaan(p_sjabloon_id uuid, p_company_id uuid, p_naam text, p_controlesoort text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) TO anon;
GRANT EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stuur_concept_terug(p_actie_id uuid, p_opmerking text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vind_of_maak_persoon(p_company_id uuid, p_naam text, p_email text, p_voorgesteld_door uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vind_of_maak_persoon(p_company_id uuid, p_naam text, p_email text, p_voorgesteld_door uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) TO anon;
GRANT EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_concept_beheerder(p_actie_id uuid, p_status text, p_opm text) TO service_role;
GRANT EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) TO anon;
GRANT EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_herinner_ritme(p_company_id uuid, p_ritme text) TO service_role;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO anon;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zet_mijn_naam(p_naam text) TO service_role;

-- ============================================================
-- Triggers (public)
-- ============================================================

-- (geen niet-interne triggers op public-tabellen)

-- ============================================================
-- Auth-integratie (trigger op auth.users)
-- ============================================================

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
