-- Migratie 0043: onderwerpenbibliotheek voor toolboxsessies
-- ----------------------------------------------------------------------------
-- Een beheerde lijst met links naar externe toolbox-bronnen. De uitvoerder
-- raadpleegt hem voor inspiratie bij het aanmaken van een sessie; het onderwerp
-- typt hij zelf (toolbox_sessie.onderwerp bestond al als vrij tekstveld).
--
-- CENTRAAL, geen company_id — dezelfde vorm als centrale_toolbox: één beheerde
-- lijst die elk bedrijf leest. Merken-patroon voor RLS: lezen mag elke ingelogde
-- gebruiker, schrijven alleen de admin.
--
-- NOOIT HARD VERWIJDEREN: archiveren zet gearchiveerd_op. Er is bewust geen
-- delete-RPC. Een bron die uit de lijst verdwijnt, blijft in de historie bestaan.
--
-- URL-CHECK: de admin beheert deze links en ze worden als <a href> gerenderd.
-- De constraint dwingt https:// af, zodat er nooit een javascript:-URL in kan
-- belanden. De frontend zet daarnaast rel="noopener noreferrer".
--
-- RPC's: SECURITY DEFINER, null-veilige is_admin()-guard, anon-EXECUTE eruit
-- (Beslissing 62). Additief; geen bestaande tabel of functie gewijzigd.

begin;

create table if not exists public.toolbox_bron (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  url             text not null,
  omschrijving    text,
  volgorde        integer not null default 0,
  gearchiveerd_op timestamptz,
  aangemaakt_op   timestamptz not null default now(),
  constraint toolbox_bron_naam_check check (btrim(naam) <> ''),
  constraint toolbox_bron_url_https check (url like 'https://%')
);

create unique index if not exists toolbox_bron_naam_uniek on public.toolbox_bron (naam);
create index if not exists toolbox_bron_volgorde_idx on public.toolbox_bron (volgorde);

alter table public.toolbox_bron enable row level security;

-- Lezen: elke ingelogde gebruiker (de KAM/uitvoerder moet de lijst zien).
drop policy if exists toolbox_bron_sel on public.toolbox_bron;
create policy toolbox_bron_sel on public.toolbox_bron
  as permissive for select to public using (auth.uid() is not null);

-- Schrijven: alleen de admin.
drop policy if exists toolbox_bron_adm on public.toolbox_bron;
create policy toolbox_bron_adm on public.toolbox_bron
  as permissive for all to public using (is_admin()) with check (is_admin());

-- RPC: bron opslaan (nieuw of bijwerken). Alleen admin.
create or replace function public.toolbox_bron_opslaan(
  p_id           uuid,
  p_naam         text,
  p_url          text,
  p_omschrijving text,
  p_volgorde     integer default 0
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_naam), '') = '' then raise exception 'Naam is verplicht'; end if;
  if coalesce(btrim(p_url), '') = '' then raise exception 'URL is verplicht'; end if;
  if btrim(p_url) not like 'https://%' then raise exception 'URL moet met https:// beginnen'; end if;

  if p_id is null then
    insert into toolbox_bron (naam, url, omschrijving, volgorde)
    values (btrim(p_naam), btrim(p_url), nullif(btrim(coalesce(p_omschrijving, '')), ''), coalesce(p_volgorde, 0))
    returning id into v_id;
    return v_id;
  end if;

  update toolbox_bron set
    naam         = btrim(p_naam),
    url          = btrim(p_url),
    omschrijving = nullif(btrim(coalesce(p_omschrijving, '')), ''),
    volgorde     = coalesce(p_volgorde, 0)
  where id = p_id;
  if not found then raise exception 'Bron niet gevonden'; end if;
  return p_id;
end;
$function$;

-- RPC: bron archiveren (soft delete). Alleen admin. Idempotent.
create or replace function public.toolbox_bron_archiveren(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from toolbox_bron where id = p_id) then raise exception 'Bron niet gevonden'; end if;
  update toolbox_bron set gearchiveerd_op = now() where id = p_id and gearchiveerd_op is null;
end;
$function$;

-- RPC: bron terugzetten uit het archief. Alleen admin.
create or replace function public.toolbox_bron_herstellen(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  update toolbox_bron set gearchiveerd_op = null where id = p_id;
  if not found then raise exception 'Bron niet gevonden'; end if;
end;
$function$;

revoke execute on function public.toolbox_bron_opslaan(uuid, text, text, text, integer) from public;
grant  execute on function public.toolbox_bron_opslaan(uuid, text, text, text, integer) to authenticated, service_role;
revoke execute on function public.toolbox_bron_archiveren(uuid) from public;
grant  execute on function public.toolbox_bron_archiveren(uuid) to authenticated, service_role;
revoke execute on function public.toolbox_bron_herstellen(uuid) from public;
grant  execute on function public.toolbox_bron_herstellen(uuid) to authenticated, service_role;

commit;
