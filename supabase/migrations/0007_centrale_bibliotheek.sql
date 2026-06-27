-- Migratie 0007: centrale inspectie-bibliotheek met lokaal afwijken
-- ----------------------------------------------------------------------------
-- CENTRAAL = de leidende norm, beheerd door role=admin (de deskundige), gedeeld
-- over alle klanten. NIET aan een company_id gebonden. Het is gezaghebbende goede
-- praktijk, geen dwingende wet: een klant mag lokaal afwijken, maar alleen op
-- eigen initiatief en zichtbaar.
--
-- "Rubriek" = een groep vragen binnen de checklist (NIET te verwarren met de
-- afgenomen 'modules' op bedrijfsniveau, bedrijf_modules). Centrale dingen krijgen
-- de prefix centrale_ zodat het verschil met lokale/bedrijfsdata glashelder is.
--
-- Vier nieuwe tabellen + één snapshot-kolom. Uitsluitend additief: geen bestaande
-- kolom wijzigt van betekenis, geen bestaande data wordt aangeraakt. Idempotent
-- (if not exists / drop policy if exists); herhaald draaien is veilig.
--
-- Het versie/gewijzigd_op-stempel op centrale rubriek/vraag maakt "de norm is
-- gewijzigd sinds de klant afweek" detecteerbaar: een afwijking onthoudt op welke
-- centrale versie ze is gebaseerd (basis_versie).

begin;

-- ============================================================
-- CENTRAAL (geen company_id) — alleen role=admin schrijft, iedereen leest
-- ============================================================

create table if not exists public.centrale_rubriek (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  volgorde        integer not null default 0,
  rie_code        text,                                    -- dossierveld van de admin; NIET voor de uitvoerder
  versie          integer not null default 1,
  gewijzigd_op    timestamptz not null default now(),
  gearchiveerd_op timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.centrale_vraag (
  id              uuid primary key default gen_random_uuid(),
  rubriek_id      uuid not null references public.centrale_rubriek(id) on delete cascade,
  tekst           text not null,
  volgorde        integer not null default 0,
  versie          integer not null default 1,
  gewijzigd_op    timestamptz not null default now(),
  gearchiveerd_op timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists centrale_vraag_rubriek_idx
  on public.centrale_vraag (rubriek_id, volgorde);

alter table public.centrale_rubriek enable row level security;
alter table public.centrale_vraag   enable row level security;

-- Lezen: elke ingelogde gebruiker (gedeelde norm). Schrijven: alleen admin.
-- Twee permissive policies = OR: select slaagt voor iedereen-ingelogd, maar
-- insert/update/delete slaagt enkel via de admin-FOR ALL-policy (merken-patroon).
drop policy if exists centrale_rubriek_sel on public.centrale_rubriek;
create policy centrale_rubriek_sel on public.centrale_rubriek
  as permissive for select to public
  using (auth.uid() is not null);

drop policy if exists centrale_rubriek_adm on public.centrale_rubriek;
create policy centrale_rubriek_adm on public.centrale_rubriek
  as permissive for all to public
  using (is_admin()) with check (is_admin());

drop policy if exists centrale_vraag_sel on public.centrale_vraag;
create policy centrale_vraag_sel on public.centrale_vraag
  as permissive for select to public
  using (auth.uid() is not null);

drop policy if exists centrale_vraag_adm on public.centrale_vraag;
create policy centrale_vraag_adm on public.centrale_vraag
  as permissive for all to public
  using (is_admin()) with check (is_admin());

-- ============================================================
-- PER BEDRIJF — koppeling (rubriekniveau) + afwijking (vraagniveau)
-- Alleen het eigen bedrijf leest/muteert (functiegroep/bedrijf_modules-patroon).
-- ============================================================

-- Gekoppelde rubrieken: dit bedrijf neemt de centrale set als uitgangspunt over.
-- "Volgt de norm" = rubriek gekoppeld én geen afwijkingsrij voor de vraag.
create table if not exists public.bedrijf_rubriek (
  company_id   uuid not null references public.companies(id) on delete cascade,
  rubriek_id   uuid not null references public.centrale_rubriek(id) on delete cascade,
  gekoppeld_op timestamptz not null default now(),
  primary key (company_id, rubriek_id)
);

-- Alleen de ECHTE afwijkingen (dun): een eigen tekst (lokaal) of uitgezet (uit).
-- basis_versie = centrale_vraag.versie op het moment van afwijken, zodat we kunnen
-- zien of de norm sindsdien is gewijzigd.
create table if not exists public.bedrijf_vraag_afwijking (
  company_id   uuid not null references public.companies(id) on delete cascade,
  vraag_id     uuid not null references public.centrale_vraag(id) on delete cascade,
  modus        text not null,
  lokale_tekst text,
  basis_versie integer not null,
  afgeweken_op timestamptz not null default now(),
  primary key (company_id, vraag_id),
  constraint afwijking_modus_check check (modus in ('lokaal', 'uit')),
  constraint afwijking_lokale_tekst check (
    (modus = 'lokaal' and lokale_tekst is not null and btrim(lokale_tekst) <> '')
    or (modus = 'uit' and lokale_tekst is null)
  )
);

create index if not exists bedrijf_rubriek_company_idx
  on public.bedrijf_rubriek (company_id);
create index if not exists bedrijf_vraag_afwijking_company_idx
  on public.bedrijf_vraag_afwijking (company_id);

alter table public.bedrijf_rubriek          enable row level security;
alter table public.bedrijf_vraag_afwijking  enable row level security;

drop policy if exists bedrijf_rubriek_sel on public.bedrijf_rubriek;
create policy bedrijf_rubriek_sel on public.bedrijf_rubriek
  as permissive for select to public
  using (mag_bedrijf_beheren(company_id));

drop policy if exists bedrijf_rubriek_wr on public.bedrijf_rubriek;
create policy bedrijf_rubriek_wr on public.bedrijf_rubriek
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

drop policy if exists bedrijf_vraag_afwijking_sel on public.bedrijf_vraag_afwijking;
create policy bedrijf_vraag_afwijking_sel on public.bedrijf_vraag_afwijking
  as permissive for select to public
  using (mag_bedrijf_beheren(company_id));

drop policy if exists bedrijf_vraag_afwijking_wr on public.bedrijf_vraag_afwijking;
create policy bedrijf_vraag_afwijking_wr on public.bedrijf_vraag_afwijking
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

-- ============================================================
-- SNAPSHOT-uitbreiding: bevries óók de rubrieknaam bij inspectie_start, zodat een
-- afgerond rapport per rubriek leesbaar blijft als centraal/lokaal later wijzigt.
-- Nullable: bestaande bevindingen (van vrije sjablonen) houden null = geen rubriek.
-- ============================================================
alter table public.inspectie_bevinding
  add column if not exists rubriek_naam_snap text;

commit;
