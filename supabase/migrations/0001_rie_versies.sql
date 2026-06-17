-- Migratie 0001: RI&E-versie-entiteit (toetsmoment)
-- Doel: een getoetste RI&E als herhaalbaar object, fundament onder doorlopende compliance.
-- Veilig/opt-in: voegt alleen structuur toe. Geen bestaande kolom of rij verandert.
-- Niets verwijst verplicht naar de nieuwe tabel; alle bestaande werking blijft draaien.

-- 1. De nieuwe entiteit: één rij = één getoetste RI&E-versie van één bedrijf.
create table if not exists public.rie_versies (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  versie          integer not null,                 -- 1, 2, 3 ... per bedrijf oplopend
  status          text not null default 'concept',  -- concept / vrijgegeven / vervallen
  toets_datum     timestamptz,                       -- wanneer getoetst/vrijgegeven
  geldig_tot      timestamptz,                       -- hertoets-trigger (datum)
  vrijgegeven_door text,
  opmerking       text,
  created_at      timestamptz not null default now(),
  unique (company_id, versie)
);

-- 2. Opt-in koppeling op de bestaande tabellen. Nullable: bestaande rijen blijven NULL,
--    geen enkele RPC of pagina kijkt er (nog) naar, dus niets breekt.
alter table public.pva_items add column if not exists rie_versie_id uuid references public.rie_versies(id);
alter table public.modules   add column if not exists rie_versie_id uuid references public.rie_versies(id);
alter table public.vragen    add column if not exists rie_versie_id uuid references public.rie_versies(id);
alter table public.fotos     add column if not exists rie_versie_id uuid references public.rie_versies(id);

-- 3. Index voor straks (filteren op RI&E-versie). Doet nu geen kwaad.
create index if not exists idx_pva_items_rie_versie on public.pva_items(rie_versie_id);
create index if not exists idx_modules_rie_versie   on public.modules(rie_versie_id);
create index if not exists idx_vragen_rie_versie    on public.vragen(rie_versie_id);
create index if not exists idx_fotos_rie_versie     on public.fotos(rie_versie_id);
