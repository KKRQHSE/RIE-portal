-- Migratie 0045: foto's bij de werkplekinspectie
-- ----------------------------------------------------------------------------
-- Twee niveaus, één tabel: bevinding_id NULL = foto bij de inspectie als geheel,
-- bevinding_id gezet = foto bij dat inspectiepunt. Meerdere foto's per niveau.
--
-- AVG. Een foto van een werkplek toont vaak een herkenbaar persoon en soms een
-- onveilige situatie die naar een persoon te herleiden is. Zelfde regime als de
-- incident-foto's (0025/0026), en bewust NIET het lichtere bewijs-bucket-regime:
--   * PRIVÉ bucket 'inspectie-foto', nooit publiek leesbaar, geen publieke URL;
--   * padconventie <company_id>/<inspectie_id>/<random>.<ext>, dus het EERSTE
--     padsegment is de company → de storage.objects-RLS schermt de bestanden ook
--     af bij directe Storage-API-toegang, niet alleen via de app;
--   * de app levert een foto uitsluitend via een kortlevende service-role signed
--     URL, ná mag_bedrijf_beheren. Geen enkele anon-toegang.
--
-- SCHRIJVEN KAN ALLEEN VIA DE RPC'S. De tabel heeft uitsluitend een select-policy
-- en de bucket geen insert/update/delete-policy — precies zoals bij incidenten.
-- De uploader is hier wél ingelogd (de KAM/uitvoerder), dus er is geen tokenflow;
-- de guard is mag_bedrijf_beheren op het bedrijf van de INSPECTIE, nooit op een
-- company_id die de client meestuurt.
--
-- Een afgeronde of geannuleerde inspectie is bevroren: dan kan er geen foto meer
-- bij en kan er geen foto meer af. Dat spiegelt het bestaande readOnly-gedrag
-- van het invulscherm.
--
-- Verwijderen: alleen de rij + (door de API-route) het storage-object, en alleen
-- zolang de inspectie loopt. Er wordt nooit historie weggegooid van een afgeronde
-- inspectie.
--
-- Additief: nieuwe bucket, nieuwe tabel, nieuwe functies. Guards null-veilig,
-- anon-EXECUTE eruit (Beslissing 62).

begin;

-- 1. Privé bucket + per-bedrijf leespolicy (eerste padsegment = company).
insert into storage.buckets (id, name, public, file_size_limit)
values ('inspectie-foto', 'inspectie-foto', false, 6291456)   -- 6 MB backstop
on conflict (id) do nothing;

drop policy if exists "inspectie-foto eigen bedrijf leest" on storage.objects;
create policy "inspectie-foto eigen bedrijf leest" on storage.objects
  as permissive for select to public using (
    bucket_id = 'inspectie-foto'
    and ((storage.foldername(name))[1] = my_company_id()::text or is_admin())
  );

-- 2. De tabel.
create table if not exists public.inspectie_foto (
  id             uuid primary key default gen_random_uuid(),
  inspectie_id   uuid not null references public.inspectie(id) on delete cascade,
  -- NULL = foto bij de inspectie als geheel; gezet = foto bij dit punt.
  bevinding_id   uuid references public.inspectie_bevinding(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  storage_pad    text not null,
  bestandsnaam   text,
  type           text,
  grootte        bigint,
  aangemaakt_op  timestamptz not null default now(),
  aangemaakt_door uuid references auth.users(id) on delete set null
);
create index if not exists inspectie_foto_inspectie_idx on public.inspectie_foto (inspectie_id);
create index if not exists inspectie_foto_bevinding_idx on public.inspectie_foto (bevinding_id);
create index if not exists inspectie_foto_company_idx   on public.inspectie_foto (company_id);

alter table public.inspectie_foto enable row level security;

-- Lezen: alleen het eigen bedrijf. Muteren uitsluitend via de RPC's hieronder
-- (geen insert/update/delete-policy).
drop policy if exists inspectie_foto_sel on public.inspectie_foto;
create policy inspectie_foto_sel on public.inspectie_foto
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- 3. Interne helper: valideer de inspectie + optionele bevinding, geef het bedrijf.
--    Bewust géén company_id-parameter: die leiden we af uit de inspectie, zodat de
--    client hem niet kan vervalsen.
create or replace function public.inspectie_foto_context(
  p_inspectie_id uuid, p_bevinding_id uuid, p_moet_lopen boolean
) returns uuid
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_company uuid; v_status text;
begin
  select company_id, status into v_company, v_status
    from inspectie where id = p_inspectie_id;
  if v_company is null then raise exception 'Inspectie niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if p_moet_lopen and v_status in ('afgerond', 'geannuleerd') then
    raise exception 'Deze inspectie is afgerond; foto''s kunnen niet meer wijzigen';
  end if;

  -- Een bevinding moet bij DEZE inspectie horen.
  if p_bevinding_id is not null and not exists (
    select 1 from inspectie_bevinding
     where id = p_bevinding_id and inspectie_id = p_inspectie_id
  ) then
    raise exception 'Bevinding hoort niet bij deze inspectie';
  end if;

  return v_company;
end;
$function$;

-- 4. Pad reserveren. Het pad wordt SERVER-SIDE bepaald, niet door de client.
create or replace function public.inspectie_foto_pad(
  p_inspectie_id uuid, p_bevinding_id uuid, p_bestandsnaam text
) returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_company uuid; v_ext text; v_pad text;
begin
  v_company := inspectie_foto_context(p_inspectie_id, p_bevinding_id, true);

  v_ext := lower(coalesce(nullif(regexp_replace(p_bestandsnaam, '^.*\.', ''), p_bestandsnaam), 'bin'));

  v_pad := v_company || '/' || p_inspectie_id || '/'
           || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;

  return jsonb_build_object('pad', v_pad, 'company_id', v_company);
end;
$function$;

-- 5. Rij registreren, nadat de browser naar het gereserveerde pad heeft geüpload.
create or replace function public.inspectie_foto_registreren(
  p_inspectie_id uuid, p_bevinding_id uuid, p_pad text,
  p_bestandsnaam text, p_type text, p_grootte bigint
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_company uuid; v_id uuid;
begin
  v_company := inspectie_foto_context(p_inspectie_id, p_bevinding_id, true);

  -- Defense-in-depth: het pad moet binnen <company>/<inspectie>/ vallen.
  if p_pad is null or p_pad not like (v_company::text || '/' || p_inspectie_id::text || '/%') then
    raise exception 'Ongeldig opslagpad';
  end if;

  insert into inspectie_foto
    (inspectie_id, bevinding_id, company_id, storage_pad, bestandsnaam, type, grootte, aangemaakt_door)
  values
    (p_inspectie_id, p_bevinding_id, v_company, p_pad, p_bestandsnaam, p_type, p_grootte, auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

-- 6. Foto verwijderen zolang de inspectie loopt. Geeft het storage-pad terug,
--    zodat de API-route het object met de service role kan opruimen.
create or replace function public.inspectie_foto_verwijderen(p_foto_id uuid)
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare v_inspectie uuid; v_pad text;
begin
  select inspectie_id, storage_pad into v_inspectie, v_pad
    from inspectie_foto where id = p_foto_id;
  if v_inspectie is null then raise exception 'Foto niet gevonden'; end if;

  -- Guard + bevroren-check via dezelfde helper.
  perform inspectie_foto_context(v_inspectie, null, true);

  delete from inspectie_foto where id = p_foto_id;
  return v_pad;
end;
$function$;

-- LET OP: `revoke ... from public` alleen is NIET genoeg. Supabase kent via default
-- privileges EXECUTE toe aan anon én authenticated, en die grants overleven een
-- revoke van PUBLIC. Ze moeten expliciet worden ingetrokken — zelfde aanpak als
-- migratie 0003 voor de interne helpers.

-- Interne helper: voor niemand aanroepbaar behalve de owner (via de definer-
-- functies hieronder) en service_role.
revoke execute on function public.inspectie_foto_context(uuid, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.inspectie_foto_context(uuid, uuid, boolean) to service_role;

revoke execute on function public.inspectie_foto_pad(uuid, uuid, text) from public, anon;
grant  execute on function public.inspectie_foto_pad(uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.inspectie_foto_registreren(uuid, uuid, text, text, text, bigint) from public, anon;
grant  execute on function public.inspectie_foto_registreren(uuid, uuid, text, text, text, bigint) to authenticated, service_role;
revoke execute on function public.inspectie_foto_verwijderen(uuid) from public, anon;
grant  execute on function public.inspectie_foto_verwijderen(uuid) to authenticated, service_role;

commit;
