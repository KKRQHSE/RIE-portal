-- Migratie 0025: incidenten-/ongevallen-module — datamodel
-- ----------------------------------------------------------------------------
-- Een nieuwe afneembare catalogusmodule 'incidenten'. Twee losse delen, net als
-- het papieren formulier:
--   DEEL 1 (melder): laagdrempelig, GEEN login, via een vaste bedrijfseigen
--     meldlink/QR (token). Minimale velden.
--   DEEL 2 (VGM-coördinator/KAM): ingelogd in het portaal. Oorzaakclassificatie,
--     maatregelen, gevoelige slachtoffer-/letselvelden.
--
-- Beide delen leven op ÉÉN incident-rij. De SELECT-policy is mag_bedrijf_beheren:
-- alleen de KAM/admin van het eigen bedrijf leest de rij (incl. de gevoelige
-- gezondheidsvelden). De melder INSERT via een SECURITY DEFINER token-RPC (fase 2)
-- en leest de rij nooit terug. Muteren gebeurt uitsluitend via RPC's; geen
-- insert/update-policy op de tabel (patroon van toolbox_deelname, 0015).
--
-- AVG: 'letsel', 'medische_dienst_bezocht' en 'functie_slachtoffer' zijn
-- GEZONDHEIDSGEGEVENS (bijzonder persoonsgegeven). Ze staan bewust op de
-- KAM-only-leesbare rij en komen NOOIT in de open Deel-1-flow. Foto's kunnen een
-- herkenbaar persoon tonen: privé-bucket, geen publieke URL (zie fase 2).
--
-- Uitsluitend additief; idempotent (if not exists). Geen bestaande tabel wordt
-- aangeraakt.

begin;

-- ============================================================
-- 1. Vaste referentievocabulaire (uit het papieren formulier, genummerd)
--    Fixed, admin-beheerd, iedereen-ingelogd leest (merken-patroon). De open
--    Deel-1-flow krijgt de gevolg-labels via de SECURITY DEFINER token-context-
--    RPC (fase 2), niet via directe anon-tabeltoegang.
-- ============================================================

-- Gevolg-selectie (meerkeuze op de melding). Tekstcode als stabiele sleutel.
create table if not exists public.incident_gevolg_soort (
  code        text primary key,
  omschrijving text not null,
  volgorde    integer not null default 0
);

-- Directe oorzaken 01-28.
create table if not exists public.incident_directe_oorzaak (
  code         integer primary key,
  omschrijving text not null
);

-- Basis oorzaken 01-16.
create table if not exists public.incident_basis_oorzaak (
  code         integer primary key,
  omschrijving text not null
);

alter table public.incident_gevolg_soort    enable row level security;
alter table public.incident_directe_oorzaak enable row level security;
alter table public.incident_basis_oorzaak   enable row level security;

-- Lezen: iedere ingelogde gebruiker (KAM gebruikt ze in Deel 2 + dashboard).
-- Schrijven: alleen admin (vast vocabulaire). Anon leest deze tabellen NIET
-- rechtstreeks; de melder krijgt gevolg-labels via de token-RPC (fase 2).
drop policy if exists incident_gevolg_soort_sel on public.incident_gevolg_soort;
create policy incident_gevolg_soort_sel on public.incident_gevolg_soort
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists incident_gevolg_soort_adm on public.incident_gevolg_soort;
create policy incident_gevolg_soort_adm on public.incident_gevolg_soort
  as permissive for all to public using (is_admin()) with check (is_admin());

drop policy if exists incident_directe_oorzaak_sel on public.incident_directe_oorzaak;
create policy incident_directe_oorzaak_sel on public.incident_directe_oorzaak
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists incident_directe_oorzaak_adm on public.incident_directe_oorzaak;
create policy incident_directe_oorzaak_adm on public.incident_directe_oorzaak
  as permissive for all to public using (is_admin()) with check (is_admin());

drop policy if exists incident_basis_oorzaak_sel on public.incident_basis_oorzaak;
create policy incident_basis_oorzaak_sel on public.incident_basis_oorzaak
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists incident_basis_oorzaak_adm on public.incident_basis_oorzaak;
create policy incident_basis_oorzaak_adm on public.incident_basis_oorzaak
  as permissive for all to public using (is_admin()) with check (is_admin());

-- Seed: gevolg-soorten.
insert into public.incident_gevolg_soort (code, omschrijving, volgorde) values
  ('bijna_incident',         'Geen letsel / bijna-incident', 1),
  ('milieuschade',           'Milieuschade',                 2),
  ('ongeval_zonder_verzuim', 'Ongeval zonder verzuim',       3),
  ('letsel',                 'Letsel',                       4),
  ('brand_explosie',         'Brand / explosie',             5),
  ('schade_eigendom',        'Schade aan eigendommen',       6)
on conflict (code) do nothing;

-- Seed: directe oorzaken 01-28.
insert into public.incident_directe_oorzaak (code, omschrijving) values
  (1,  'Werken zonder bevoegdheid'),
  (2,  'Niet (tijdig) waarschuwen'),
  (3,  'Niet borgen/veilig stellen'),
  (4,  'Werk op onjuiste snelheid'),
  (5,  'Veiligheden buiten werking stellen'),
  (6,  'Gebruik defect gereedschap'),
  (7,  'Niet/onjuist gebruik PBM'),
  (8,  'Onjuist (be)laden'),
  (9,  'Onjuist plaatsen'),
  (10, 'Onjuist tillen'),
  (11, 'Onjuiste houding'),
  (12, 'Werk aan bewegende machines'),
  (13, 'Stoeien/afleiden'),
  (14, 'Invloed alcohol/medicijnen/drugs'),
  (15, 'Onjuist gebruik materieel'),
  (16, 'Ontoereikende afscherming'),
  (17, 'Kwaliteit PBM''s'),
  (18, 'Defecte gereedschappen/materieel'),
  (19, 'Te weinig ruimte voor normale beweging'),
  (20, 'Niet toereikende alarmsystemen'),
  (21, 'Brand-/explosiegevaar'),
  (22, 'Gebrek aan orde en netheid'),
  (23, 'Te veel lawaai'),
  (24, 'Blootstellen aan straling'),
  (25, 'Te hoge/lage temperatuur'),
  (26, 'Te veel/weinig verlichting'),
  (27, 'Onvoldoende ventilatie'),
  (28, 'Gevaarlijke werkomstandigheden')
on conflict (code) do nothing;

-- Seed: basis oorzaken 01-16.
insert into public.incident_basis_oorzaak (code, omschrijving) values
  (1,  'Onvoldoende fysieke geschiktheid voor het werk'),
  (2,  'Onvoldoende mentale geschiktheid voor het werk'),
  (3,  'Vermoeidheid'),
  (4,  'Mentale stress'),
  (5,  'Gebrek aan kennis'),
  (6,  'Gebrek aan vaardigheid'),
  (7,  'Onvoldoende motivatie'),
  (8,  'Onvoldoende leiding/toezicht'),
  (9,  'Ongeschikt onderwerp'),
  (10, 'Onjuiste inkoop'),
  (11, 'Onvoldoende preventief onderhoud'),
  (12, 'Onvoldoende reparatie'),
  (13, 'Onjuist gereedschap/apparatuur'),
  (14, 'Onjuiste werkmethode'),
  (15, 'Slijtage'),
  (16, 'Verkeerd gebruik/misbruik')
on conflict (code) do nothing;

-- ============================================================
-- 2. Bedrijfseigen meldlink (het bedrijfstoken voor de open Deel-1-flow)
--    Eén regel per bedrijf; de KAM kan het token vervangen (roteren) of
--    intrekken. Bewust een EIGEN token — NIET het werknemer- (deellinks) of
--    actiehouder-token hergebruiken. Anon resolvet het token via een SECURITY
--    DEFINER-RPC (fase 2), nooit via directe tabeltoegang.
-- ============================================================
create table if not exists public.incident_meldlink (
  company_id     uuid primary key references public.companies(id) on delete cascade,
  token          text not null unique,
  ingetrokken    boolean not null default false,
  aangemaakt_op  timestamptz not null default now(),
  aangemaakt_door uuid
);

alter table public.incident_meldlink enable row level security;

-- Alleen het eigen bedrijf (KAM/admin) leest zijn meldlink; muteren (aanmaken/
-- roteren/intrekken) uitsluitend via de SECURITY DEFINER-RPC (fase 3). Geen
-- write-policy. Anon leest hier niets: de open flow gaat via de token-RPC.
drop policy if exists incident_meldlink_sel on public.incident_meldlink;
create policy incident_meldlink_sel on public.incident_meldlink
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 3. Incident — één rij draagt Deel 1 (melder) én Deel 2 (KAM)
-- ============================================================
create table if not exists public.incident (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,

  -- ---- DEEL 1 (melder, open flow) ----
  datum          date not null,
  tijd           time,                                   -- vooringevuld op nu, mag leeg
  locatie        text not null,                          -- vrije tekst
  project        text,                                   -- vrije tekst, optioneel
  omschrijving   text not null,                          -- vrije tekst
  naam_melder    text,                                   -- optioneel (lage drempel)
  gevolgen       text[] not null default '{}',           -- codes uit incident_gevolg_soort
  aangemaakt_op  timestamptz not null default now(),

  -- ---- DEEL 2 (KAM, ingelogd) ----
  status                            text not null default 'open',
  directe_oorzaken                  integer[] not null default '{}',  -- codes 1-28
  basis_oorzaken                    integer[] not null default '{}',  -- codes 1-16
  oorzaak_toelichting               text,
  onderzoeksrapportage_bijgevoegd   boolean not null default false,
  telefonische_melding_directie     boolean not null default false,
  telefonische_melding_aan          text,                 -- aan wie (vrije tekst)
  maatregelen_in_actielijst         boolean not null default false,
  tra_aanpassen                     boolean not null default false,
  andere_maatregelen                text,
  besproken_in_toolbox_datum        date,

  -- ---- GEVOELIG (Deel 2, alleen KAM) — GEZONDHEIDSGEGEVENS ----
  functie_slachtoffer     text,                           -- optioneel
  medische_dienst_bezocht text,                           -- 'ja' | 'nee' | 'onbekend'

  -- ---- GERESERVEERD (kolommen nu aanmaken, nog niet bouwen) ----
  actie_ids       uuid[] not null default '{}',           -- haak naar de QHSE-actielijst
  toolbox_push_id uuid,                                    -- haak naar verplichte-toolbox-na-ongeval

  -- ---- Administratie Deel 2 ----
  afgehandeld_op       timestamptz,
  laatst_bijgewerkt_op timestamptz,

  constraint incident_status_check
    check (status in ('open','in_onderzoek','afgehandeld')),
  constraint incident_medische_dienst_check
    check (medische_dienst_bezocht is null
           or medische_dienst_bezocht in ('ja','nee','onbekend'))
);

create index if not exists incident_company_datum_idx
  on public.incident (company_id, datum);
create index if not exists incident_company_status_idx
  on public.incident (company_id, status);
create index if not exists incident_company_aangemaakt_idx
  on public.incident (company_id, aangemaakt_op);

alter table public.incident enable row level security;

-- Lezen: alleen de KAM/admin van het eigen bedrijf. Cross-company dicht. Anon
-- heeft GEEN select — inclusief de gevoelige gezondheidsvelden. Muteren gebeurt
-- via SECURITY DEFINER-RPC's (melden-token-RPC voor Deel 1; KAM-RPC's voor
-- Deel 2); geen insert/update-policy.
drop policy if exists incident_sel on public.incident;
create policy incident_sel on public.incident
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 4. Incident-foto's (Deel 1: melder uploadt; Deel 2: KAM bekijkt)
--    Bestanden staan in een PRIVÉ Supabase Storage-bucket (geen publieke URL).
--    Padconventie bedrijf-geprefixt: <company_id>/incident/<incident_id>/<uuid>.<ext>
--    zodat de bestaande per-bedrijf storage.objects-RLS (eerste padsegment =
--    company) de bestanden ook bij directe Storage-API-toegang afschermt. De app
--    levert een foto uitsluitend via een kortlevende service-role signed URL,
--    ná mag_bedrijf_beheren (KAM) of ná token-validatie (melder bij uploaden).
--    Details van de signed-URL/afscherming: fase 2.
-- ============================================================
create table if not exists public.incident_foto (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incident(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  storage_pad   text not null,
  bestandsnaam  text,
  type          text,
  grootte       bigint,
  aangemaakt_op timestamptz not null default now()
);
create index if not exists incident_foto_incident_idx on public.incident_foto (incident_id);
create index if not exists incident_foto_company_idx  on public.incident_foto (company_id);

alter table public.incident_foto enable row level security;

-- Lezen: alleen de KAM/admin van het eigen bedrijf. Aanmaken via de melden-
-- token-RPC (fase 2); geen insert-policy. Anon leest hier niets.
drop policy if exists incident_foto_sel on public.incident_foto;
create policy incident_foto_sel on public.incident_foto
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

commit;
