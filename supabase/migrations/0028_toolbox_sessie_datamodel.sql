-- Migratie 0028: toolbox-SESSIES — aanwezigheid per gehouden sessie (datamodel)
-- ----------------------------------------------------------------------------
-- TWEEDE telwijze NAAST het bestaande naar-rato doel-per-persoon (0015/0018).
-- Reden: een toolbox is bij deze klant een SESSIE waar wisselend wie aanwezig is.
-- Wie er niet was, mag NIET als "niet gedaan"/achterstand tellen. Het digitale
-- doel-per-persoon-model (werknemer-tokenflow + handtekening) BLIJFT ongewijzigd.
--
-- MODELKEUZE:
--   * Een SESSIE (nieuwe tabel toolbox_sessie) = een gehouden toolbox op een datum
--     met een onderwerp. Dit is metadata, GEEN onveranderlijk bewijsrecord → mag
--     bewerkt worden (datum/onderwerp corrigeren) via RPC.
--   * AANWEZIGHEID landt als rijen in de BESTAANDE toolbox_deelname met
--     bewijssoort 'fysiek_aanwezig' (aanwezigheid geregistreerd door de houder,
--     GEEN eigen digitale handtekening) — zodat de bewijslaag niet vervuilt met
--     valse 'digitaal'-records. Nieuwe kolom sessie_id koppelt de deelname aan de
--     sessie.
--   * BEWUST toolbox_id = NULL op een aanwezigheidsdeelname:
--       a. de per-jaar-uniciteitsindex (0024, partieel op toolbox_id is not null)
--          botst dan niet — je mag dezelfde persoon in meerdere sessies per jaar;
--       b. de naar-rato-telling in toolbox_dashboard (count(distinct toolbox_id))
--          NEGEERT NULL → sessie-aanwezigheid vervuilt het doel-per-persoon NIET.
--     De twee telwijzen blijven zo strikt gescheiden.
--   * Aan/uitvinken = INSERT / DELETE (nooit UPDATE) → botst niet met de
--     onveranderlijkheids-trigger op toolbox_deelname (die weigert UPDATE, staat
--     DELETE toe).
--
-- Registratie uitsluitend door de beheerder/KAM (mag_bedrijf_beheren), NIET via de
-- anonieme werknemer-tokenflow. Uitsluitend additief; idempotent.

begin;

-- ============================================================
-- 1. De sessie zelf: een gehouden toolbox op een datum, met onderwerp.
--    toolbox_id is een VRIJBLIJVENDE referentie (welke centrale toolbox werd
--    behandeld); ON DELETE SET NULL zodat archivering centraal de sessie niet
--    beschadigt. De sessie is muteerbaar (metadata), dus geen immutable-trigger.
-- ============================================================
create table if not exists public.toolbox_sessie (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  datum          date not null,
  onderwerp      text not null,
  notitie        text,
  toolbox_id     uuid references public.centrale_toolbox(id) on delete set null,
  aangemaakt_door uuid,                 -- auth.uid() van de KAM/beheerder (geen FK)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint toolbox_sessie_onderwerp_check check (btrim(onderwerp) <> '')
);
create index if not exists toolbox_sessie_company_idx on public.toolbox_sessie (company_id, datum desc);

alter table public.toolbox_sessie enable row level security;

-- Lezen: het eigen bedrijf (KAM/admin). Muteren uitsluitend via de RPC's (0029);
-- geen insert/update/delete-policy.
drop policy if exists toolbox_sessie_sel on public.toolbox_sessie;
create policy toolbox_sessie_sel on public.toolbox_sessie
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 2. Aanwezigheid koppelen aan de sessie: additieve kolom op toolbox_deelname.
--    ON DELETE CASCADE: een sessie verwijderen ruimt zijn aanwezigheidsrijen op
--    (correctie van een verkeerd ingevoerde presentielijst). De digitale records
--    (sessie_id NULL) blijven onaangeroerd.
-- ============================================================
alter table public.toolbox_deelname
  add column if not exists sessie_id uuid references public.toolbox_sessie(id) on delete cascade;

-- Niemand twee keer in dezelfde sessie. Partieel: geldt alleen voor sessierijen.
create unique index if not exists toolbox_deelname_sessie_persoon_uniek
  on public.toolbox_deelname (sessie_id, persoon_id)
  where sessie_id is not null;

-- Snelle opkomst-telling per sessie.
create index if not exists toolbox_deelname_sessie_idx
  on public.toolbox_deelname (sessie_id)
  where sessie_id is not null;

commit;
