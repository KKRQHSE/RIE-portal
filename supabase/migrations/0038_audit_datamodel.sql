-- Migratie 0038: auditmodule — datamodel + RPC's
-- ----------------------------------------------------------------------------
-- Twee sjablonen: 'vca' (genummerde conformiteitschecklist H1-H11, per paragraaf
-- status + toelichting) en 'iso' (verslag per audit-moment: kop, besproken
-- onderwerpen, bewijsdocumenten, samenvatting, observaties per thema met
-- ISO-clausule, positieve waarnemingen, verbeterpunten, conclusie).
--
-- Centrale VCA-paragrafencatalogus (herbruikbaar, zoals centrale norm/toolbox);
-- bij het aanmaken van een VCA-audit worden de paragrafen ge-kopieerd naar
-- audit_vca_bevinding zodat een audit zijn eigen momentopname houdt.
--
-- Verbeterpunt/afwijking → "maak hier een actie van" landt in de centrale
-- actielijst (pva_items) met bron_type='audit_bevinding', bron_id=<audit_id>,
-- zodat de herkomst teruglinkt naar de bronaudit.
--
-- Additief; per-bedrijf-isolatie via mag_bedrijf_beheren; RPC's SECURITY
-- DEFINER + null-veilige guard; anon-EXECUTE eruit (Beslissing 62).

begin;

-- 1. Centrale VCA**-catalogus -------------------------------------------------
create table if not exists public.centrale_audit_vca_paragraaf (
  code            text primary key,          -- '1.1'
  hoofdstuk       text not null,             -- 'H1'
  hoofdstuk_titel text not null,             -- 'KAM-beleid en -organisatie'
  titel           text not null,             -- 'KAM-beleid'
  omschrijving    text,                      -- vaste handboek-omschrijving
  volgorde        integer not null
);
alter table public.centrale_audit_vca_paragraaf enable row level security;

drop policy if exists centrale_audit_vca_sel on public.centrale_audit_vca_paragraaf;
create policy centrale_audit_vca_sel on public.centrale_audit_vca_paragraaf
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists centrale_audit_vca_adm on public.centrale_audit_vca_paragraaf;
create policy centrale_audit_vca_adm on public.centrale_audit_vca_paragraaf
  as permissive for all to public using (is_admin()) with check (is_admin());

-- 2. Audit (per bedrijf) ------------------------------------------------------
create table if not exists public.audit (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  sjabloon              text not null check (sjabloon in ('vca', 'iso')),
  titel                 text not null,
  status                text not null default 'gepland' check (status in ('gepland', 'uitgevoerd', 'afgerond')),
  jaar                  integer not null,
  datum                 date,
  gesproken_met         text,
  -- ISO-kopvelden (voor sjabloon 'iso'):
  besproken_onderwerpen text[] not null default '{}',
  bewijsdocumenten      text[] not null default '{}',
  samenvatting          text,
  positieve_waarnemingen text[] not null default '{}',
  conclusie             text,
  aangemaakt_op         timestamptz not null default now(),
  bijgewerkt_op         timestamptz not null default now()
);
create index if not exists audit_company_jaar_idx on public.audit (company_id, jaar);
alter table public.audit enable row level security;

drop policy if exists audit_all on public.audit;
create policy audit_all on public.audit
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

-- 3. VCA-bevindingen per audit (kopie van de catalogus) -----------------------
create table if not exists public.audit_vca_bevinding (
  id              uuid primary key default gen_random_uuid(),
  audit_id        uuid not null references public.audit(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  code            text not null,
  hoofdstuk       text not null,
  hoofdstuk_titel text not null,
  titel           text not null,
  omschrijving    text,
  volgorde        integer not null,
  status          text not null default 'geen_bemerkingen'
                    check (status in ('geen_bemerkingen', 'verbeterpunt', 'afwijking')),
  toelichting     text,
  actie_id        uuid references public.pva_items(id) on delete set null
);
create index if not exists audit_vca_bevinding_audit_idx on public.audit_vca_bevinding (audit_id);
alter table public.audit_vca_bevinding enable row level security;

drop policy if exists audit_vca_bevinding_all on public.audit_vca_bevinding;
create policy audit_vca_bevinding_all on public.audit_vca_bevinding
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

-- 4. ISO-observaties per audit ------------------------------------------------
create table if not exists public.audit_iso_observatie (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references public.audit(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  thema         text not null,
  iso_clausule  text,
  observatie    text,
  volgorde      integer not null default 0
);
create index if not exists audit_iso_observatie_audit_idx on public.audit_iso_observatie (audit_id);
alter table public.audit_iso_observatie enable row level security;

drop policy if exists audit_iso_observatie_all on public.audit_iso_observatie;
create policy audit_iso_observatie_all on public.audit_iso_observatie
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

-- 5. Verbeterpunten per audit (voor ISO; ook los te gebruiken) ----------------
create table if not exists public.audit_verbeterpunt (
  id           uuid primary key default gen_random_uuid(),
  audit_id     uuid not null references public.audit(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  constatering text not null,
  soort        text not null default 'verbeterpunt' check (soort in ('verbeterpunt', 'afwijking')),
  actie_id     uuid references public.pva_items(id) on delete set null,
  volgorde     integer not null default 0
);
create index if not exists audit_verbeterpunt_audit_idx on public.audit_verbeterpunt (audit_id);
alter table public.audit_verbeterpunt enable row level security;

drop policy if exists audit_verbeterpunt_all on public.audit_verbeterpunt;
create policy audit_verbeterpunt_all on public.audit_verbeterpunt
  as permissive for all to public
  using (mag_bedrijf_beheren(company_id)) with check (mag_bedrijf_beheren(company_id));

-- 6. RPC: audit aanmaken (kopieert bij 'vca' de centrale catalogus) -----------
create or replace function public.audit_aanmaken(
  p_company_id uuid,
  p_sjabloon   text,
  p_titel      text,
  p_jaar       integer,
  p_status     text default 'gepland'
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if p_sjabloon not in ('vca', 'iso') then raise exception 'Onbekend sjabloon'; end if;
  if coalesce(btrim(p_titel), '') = '' then raise exception 'Titel is verplicht'; end if;

  insert into audit (company_id, sjabloon, titel, jaar, status)
  values (p_company_id, p_sjabloon, btrim(p_titel), coalesce(p_jaar, extract(year from current_date)::int),
          case when p_status in ('gepland','uitgevoerd','afgerond') then p_status else 'gepland' end)
  returning id into v_audit;

  if p_sjabloon = 'vca' then
    insert into audit_vca_bevinding
      (audit_id, company_id, code, hoofdstuk, hoofdstuk_titel, titel, omschrijving, volgorde)
    select v_audit, p_company_id, code, hoofdstuk, hoofdstuk_titel, titel, omschrijving, volgorde
      from centrale_audit_vca_paragraaf
     order by volgorde;
  end if;

  return v_audit;
end;
$function$;

revoke execute on function public.audit_aanmaken(uuid, text, text, integer, text) from public;
grant  execute on function public.audit_aanmaken(uuid, text, text, integer, text) to authenticated, service_role;

-- 7. RPC: van een audit-bevinding/verbeterpunt een actie maken -----------------
-- Maakt een pva_items-rij (bron_type='audit_bevinding', bron_id=<audit_id>) en
-- stempelt actie_id op de bron. Idempotent: bestaat er al een actie, hergebruik.
create or replace function public.audit_bevinding_naar_actie(
  p_soort   text,   -- 'vca' | 'verbeterpunt'
  p_bron_id uuid    -- audit_vca_bevinding.id of audit_verbeterpunt.id
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_audit   uuid;
  v_tekst   text;
  v_actie   uuid;
  v_nr      integer;
begin
  if p_soort = 'vca' then
    select b.company_id, b.audit_id, coalesce(nullif(btrim(b.toelichting), ''), b.titel), b.actie_id
      into v_company, v_audit, v_tekst, v_actie
      from audit_vca_bevinding b where b.id = p_bron_id;
  elsif p_soort = 'verbeterpunt' then
    select v.company_id, v.audit_id, v.constatering, v.actie_id
      into v_company, v_audit, v_tekst, v_actie
      from audit_verbeterpunt v where v.id = p_bron_id;
  else
    raise exception 'Onbekend soort';
  end if;

  if v_company is null then raise exception 'Bron niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  -- Al een actie? Hergebruik (idempotent).
  if v_actie is not null then return v_actie; end if;

  select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
    into v_nr from pva_items where company_id = v_company;

  insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
  values (v_company, v_nr::text, coalesce(v_tekst, 'Auditbevinding'), 'Open', 'Middel',
          'audit_bevinding', v_audit, now())
  returning id into v_actie;

  if p_soort = 'vca' then
    update audit_vca_bevinding set actie_id = v_actie where id = p_bron_id;
  else
    update audit_verbeterpunt set actie_id = v_actie where id = p_bron_id;
  end if;

  return v_actie;
end;
$function$;

revoke execute on function public.audit_bevinding_naar_actie(text, uuid) from public;
grant  execute on function public.audit_bevinding_naar_actie(text, uuid) to authenticated, service_role;

commit;
