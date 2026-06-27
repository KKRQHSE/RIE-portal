-- Migratie 0015: toolbox-module — datamodel + bewijslaag
-- ----------------------------------------------------------------------------
-- Een TOOLBOX is een onderwerp met tekst + een ingesloten video-LINK + optioneel
-- een quiz. Een TOOLBOX-DEELNAME is een afgerond, ONVERANDERLIJK bewijsrecord per
-- persoon. Een DOELSTELLING is "N toolboxen per jaar" per functiegroep.
--
-- De toolbox-module is zélf een afneembare module (catalogus 'toolbox'); de inhoud
-- heet toolbox/deelname/doelstelling — niet 'module' (dat is bedrijf_modules).
--
-- Centraal = de admin schrijft, iedereen-ingelogd leest (merken-patroon, zoals de
-- centrale bibliotheek 0007-0014). Per bedrijf = mag_bedrijf_beheren, alleen via
-- de SECURITY DEFINER-RPC's muteerbaar. Uitsluitend additief; idempotent.

begin;

-- ============================================================
-- 1. Dienstverband op personen (fundament voor naar-rato in het dashboard)
--    Beide nullable. Leeg datum_in_dienst → geen instroomcorrectie mogelijk →
--    de persoon telt voor het volle jaar (factor 1). Leeg datum_uit_dienst → nog
--    in dienst. Niets wordt geforceerd; de KAM vult ze in voor accuratesse.
-- ============================================================
alter table public.personen add column if not exists datum_in_dienst  date;
alter table public.personen add column if not exists datum_uit_dienst date;

-- ============================================================
-- 2. Centrale toolbox-content (geen company_id)
-- ============================================================
create table if not exists public.centrale_toolbox (
  id                uuid primary key default gen_random_uuid(),
  titel             text not null,
  tekst             text not null default '',
  video_url         text,                         -- YouTube/Vimeo embed-link; GEEN upload
  -- "telt mee"- en gedrag-instellingen op de toolbox zelf:
  vereist_video     boolean not null default true,
  vereist_quiz      boolean not null default false,
  quiz_slaaggrens   integer not null default 70,  -- % nodig om de quiz te halen
  quiz_uitleg_modus text not null default 'aan_eind',
  toegang           text not null default 'link', -- 'link' (persoonlijke deellink) | 'login'
  volgorde          integer not null default 0,
  versie            integer not null default 1,
  gewijzigd_op      timestamptz not null default now(),
  gearchiveerd_op   timestamptz,
  created_at        timestamptz not null default now(),
  constraint toolbox_uitleg_modus_check check (quiz_uitleg_modus in ('per_vraag','aan_eind')),
  constraint toolbox_toegang_check check (toegang in ('link','login')),
  constraint toolbox_slaaggrens_check check (quiz_slaaggrens between 0 and 100)
);

create table if not exists public.centrale_toolbox_vraag (
  id              uuid primary key default gen_random_uuid(),
  toolbox_id      uuid not null references public.centrale_toolbox(id) on delete cascade,
  vraagtekst      text not null,
  opties          jsonb not null default '[]'::jsonb,   -- lijst antwoordteksten
  juist_antwoord  integer not null default 0,           -- index in opties
  uitleg          text,                                 -- uitleg per vraag
  volgorde        integer not null default 0,
  versie          integer not null default 1,
  gewijzigd_op    timestamptz not null default now(),
  gearchiveerd_op timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists centrale_toolbox_vraag_idx
  on public.centrale_toolbox_vraag (toolbox_id, volgorde);

alter table public.centrale_toolbox       enable row level security;
alter table public.centrale_toolbox_vraag enable row level security;

drop policy if exists centrale_toolbox_sel on public.centrale_toolbox;
create policy centrale_toolbox_sel on public.centrale_toolbox
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists centrale_toolbox_adm on public.centrale_toolbox;
create policy centrale_toolbox_adm on public.centrale_toolbox
  as permissive for all to public using (is_admin()) with check (is_admin());

drop policy if exists centrale_toolbox_vraag_sel on public.centrale_toolbox_vraag;
create policy centrale_toolbox_vraag_sel on public.centrale_toolbox_vraag
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists centrale_toolbox_vraag_adm on public.centrale_toolbox_vraag;
create policy centrale_toolbox_vraag_adm on public.centrale_toolbox_vraag
  as permissive for all to public using (is_admin()) with check (is_admin());

-- ============================================================
-- 3. Per bedrijf: koppeling + lokale afwijking (toolbox-niveau) + doelstelling
-- ============================================================
create table if not exists public.bedrijf_toolbox (
  company_id   uuid not null references public.companies(id) on delete cascade,
  toolbox_id   uuid not null references public.centrale_toolbox(id) on delete cascade,
  gekoppeld_op timestamptz not null default now(),
  primary key (company_id, toolbox_id)
);

create table if not exists public.bedrijf_toolbox_afwijking (
  company_id       uuid not null references public.companies(id) on delete cascade,
  toolbox_id       uuid not null references public.centrale_toolbox(id) on delete cascade,
  modus            text not null,
  lokale_titel     text,
  lokale_tekst     text,
  lokale_video_url text,
  basis_versie     integer not null,
  afgeweken_op     timestamptz not null default now(),
  primary key (company_id, toolbox_id),
  constraint toolbox_afw_modus_check check (modus in ('lokaal','uit')),
  constraint toolbox_afw_lokaal_check check (
    (modus = 'lokaal' and lokale_tekst is not null and btrim(lokale_tekst) <> '')
    or (modus = 'uit' and lokale_titel is null and lokale_tekst is null and lokale_video_url is null)
  )
);

create table if not exists public.bedrijf_doelstelling (
  company_id      uuid not null references public.companies(id) on delete cascade,
  functiegroep_id uuid not null references public.functiegroep(id) on delete cascade,
  doel_per_jaar   integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (company_id, functiegroep_id),
  constraint doelstelling_niet_negatief check (doel_per_jaar >= 0)
);

create index if not exists bedrijf_toolbox_company_idx on public.bedrijf_toolbox (company_id);
create index if not exists bedrijf_toolbox_afwijking_company_idx on public.bedrijf_toolbox_afwijking (company_id);

alter table public.bedrijf_toolbox           enable row level security;
alter table public.bedrijf_toolbox_afwijking enable row level security;
alter table public.bedrijf_doelstelling      enable row level security;

-- Alleen-lezen voor het eigen bedrijf; muteren uitsluitend via de RPC's (geen write-policy).
drop policy if exists bedrijf_toolbox_sel on public.bedrijf_toolbox;
create policy bedrijf_toolbox_sel on public.bedrijf_toolbox
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

drop policy if exists bedrijf_toolbox_afwijking_sel on public.bedrijf_toolbox_afwijking;
create policy bedrijf_toolbox_afwijking_sel on public.bedrijf_toolbox_afwijking
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

drop policy if exists bedrijf_doelstelling_sel on public.bedrijf_doelstelling;
create policy bedrijf_doelstelling_sel on public.bedrijf_doelstelling
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- ============================================================
-- 4. Toolbox-deelname: het afgeronde, ONVERANDERLIJKE bewijsrecord
-- ============================================================
create table if not exists public.toolbox_deelname (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  persoon_id      uuid not null references public.personen(id) on delete cascade,
  toolbox_id      uuid references public.centrale_toolbox(id) on delete set null,

  -- HOE afgerond: 'digitaal' = eigen handtekening (sterk; nu gebouwd);
  -- 'fysiek_aanwezig' = aanwezigheidsregistratie door beheerder (zwakker; later).
  bewijssoort     text not null default 'digitaal',

  -- Snapshot van de geldende inhoud op het moment van afronden (bevroren bewijs).
  titel_snap      text not null,
  tekst_snap      text not null,
  video_url_snap  text,
  quiz_snap       jsonb not null default '[]'::jsonb,

  afgerond_op     timestamptz not null default now(),   -- onveranderlijk tijdstip
  video_bekeken   boolean not null default false,
  quiz_resultaat  jsonb,                                -- {score,totaal,pct,gehaald}; null = geen quiz

  naam_bevestigd  boolean not null default false,
  bevestigde_naam text not null,                        -- bevroren naam

  -- Persoonlijke handtekening (klein canvas-tekeningetje) als base64 data-URL in de DB,
  -- zodat het bij het onveranderlijke record blijft. Nullable t.b.v. 'fysiek_aanwezig'.
  handtekening          text,
  handtekening_gezet_op timestamptz,

  -- Gereserveerd voor 'fysiek_aanwezig' (NU niet gevuld): Storage-PAD naar het
  -- geüploade, ondertekende presentielijst-bestand (foto/scan/PDF). Upload i.p.v.
  -- link: het bewijsstuk moet over jaren nog exact zo bestaan.
  presentielijst_pad text,

  -- Gereserveerde haak voor de toekomstige planningsmodule (geen FK; bestaat nog niet).
  planning_toewijzing_id uuid,

  created_at      timestamptz not null default now(),

  constraint deelname_bewijssoort_check check (bewijssoort in ('digitaal','fysiek_aanwezig')),
  -- 'digitaal' MOET het sterke bewijs hebben: naam bevestigd + eigen handtekening.
  constraint deelname_digitaal_bewijs check (
    bewijssoort <> 'digitaal'
    or (naam_bevestigd = true
        and handtekening is not null and btrim(handtekening) <> ''
        and handtekening_gezet_op is not null)
  )
);
create index if not exists toolbox_deelname_company_idx on public.toolbox_deelname (company_id, persoon_id);
create index if not exists toolbox_deelname_afgerond_idx on public.toolbox_deelname (company_id, afgerond_op);

alter table public.toolbox_deelname enable row level security;

-- Lezen: het eigen bedrijf (KAM/admin). Geen insert/update/delete-policy: aanmaken
-- gebeurt via de SECURITY DEFINER token-/login-RPC; wijzigen is verboden (trigger).
drop policy if exists toolbox_deelname_sel on public.toolbox_deelname;
create policy toolbox_deelname_sel on public.toolbox_deelname
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- ONVERANDERLIJKHEID: elke UPDATE wordt geweigerd — voor IEDEREEN, ook admin/KAM,
-- een SECURITY DEFINER-RPC en service_role (een trigger vuurt ongeacht de rol).
-- DELETE blijft mogelijk (nodig voor bedrijf/persoon-cascade en AVG-verwijderrecht).
create or replace function public.toolbox_deelname_immutable()
 returns trigger language plpgsql as $function$
begin
  raise exception 'Een afgerond toolbox-record is onveranderlijk';
end;
$function$;

drop trigger if exists toolbox_deelname_no_update on public.toolbox_deelname;
create trigger toolbox_deelname_no_update
  before update on public.toolbox_deelname
  for each row execute function public.toolbox_deelname_immutable();

commit;
