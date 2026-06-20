-- Migratie 0004: module-abonnement + zelfbeheer per bedrijf
-- ----------------------------------------------------------------------------
-- Drie toestanden per module per bedrijf, bovenop de bestaande gebruiks-toggle:
--   GEEN ABONNEMENT (abonnement_status = 'geen')  : nooit geactiveerd, onzichtbaar.
--   ABONNEMENT ACTIEF ('actief')                  : beheerder togglet `actief` vrij
--                                                   (aan/uit = gebruik pauzeren).
--   OPGEZEGD ('opgezegd')                         : bewust beëindigd, niet bruikbaar.
--
-- We hergebruiken de bestaande kolom `actief` als de gebruiks-toggle. Nieuw zijn de
-- abonnementsstatus en de twee momenten (geactiveerd_op / opgezegd_op) waarop een
-- latere facturatie kan leunen. GEEN betaalintegratie hier — alleen status + momenten.
--
-- Veilig/opt-in: uitsluitend additief (nieuwe kolommen, nieuwe tabel, nieuwe index).
-- Geen bestaande kolom wijzigt van betekenis; `actief` blijft exact wat het was. De
-- enige aanraking van bestaande data is de Alpha-backfill onderaan (zie toelichting).
-- Idempotent: alles met `if not exists` / `drop ... if exists`, herhaald draaien is veilig.

begin;

-- 1. Abonnementsstatus + de twee momenten. Default 'geen': elke bestaande rij die we
--    NIET expliciet backfillen geldt als 'nog geen abonnement'.
alter table public.bedrijf_modules
  add column if not exists abonnement_status text not null default 'geen';

alter table public.bedrijf_modules
  add column if not exists geactiveerd_op timestamptz;

alter table public.bedrijf_modules
  add column if not exists opgezegd_op timestamptz;

-- Toegestane waarden vastleggen. Constraint los toevoegen (add column kent geen
-- inline check bij `if not exists`); guard tegen dubbel draaien.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bedrijf_modules_abonnement_status_check'
  ) then
    alter table public.bedrijf_modules
      add constraint bedrijf_modules_abonnement_status_check
      check (abonnement_status in ('geen', 'actief', 'opgezegd'));
  end if;
end $$;

-- 2. Auditspoor van de abonnementsmomenten — zelfde filosofie als inspectie_historie:
--    wie deed wat wanneer. De RPC's hieronder (db/module_abonnement_rpcs.sql) schrijven
--    hierin. Per-bedrijf afgeschermd via mag_bedrijf_beheren, net als bedrijf_modules.
create table if not exists public.module_historie (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module     text not null,
  wie        uuid,
  wanneer    timestamptz not null default now(),
  wijziging  text not null
);

create index if not exists module_historie_company_idx
  on public.module_historie (company_id, wanneer desc);

alter table public.module_historie enable row level security;

drop policy if exists module_historie_sel on public.module_historie;
create policy module_historie_sel on public.module_historie
  as permissive for select to public
  using (mag_bedrijf_beheren(company_id));

drop policy if exists module_historie_wr on public.module_historie;
create policy module_historie_wr on public.module_historie
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id))
  with check (mag_bedrijf_beheren(company_id));

-- 3. Backfill — interpreteer een reeds-aangezette module als een lopend abonnement.
--    Concreet raakt dit precies één rij: Testbedrijf Alpha / module 'inspectie'
--    (de enige bestaande rij, actief=true). Voorwaarde `abonnement_status='geen'`
--    maakt het herhaalbaar en voorkomt dat we een al-gezette of opgezegde rij overschrijven.
--    Het historische activatiemoment is niet bewaard (bedrijf_modules heeft geen
--    created_at); we stempelen geactiveerd_op = now() als best beschikbare benadering.
update public.bedrijf_modules
   set abonnement_status = 'actief',
       geactiveerd_op    = coalesce(geactiveerd_op, now())
 where actief = true
   and abonnement_status = 'geen';

commit;
