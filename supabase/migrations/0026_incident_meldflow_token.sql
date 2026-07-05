-- Migratie 0026: incidenten — open meldflow (Deel 1) via bedrijfstoken
-- ----------------------------------------------------------------------------
-- De melder komt binnen via de VASTE bedrijfseigen meldlink/QR (incident_meldlink.
-- token), GEEN login. De token-RPC's leiden het bedrijf server-side af uit het
-- token (SECURITY DEFINER); de melder kan dus alleen in het juiste bedrijf een
-- melding plaatsen en leest nooit een bestaande incident-rij terug.
--
-- Deze token-RPC's zijn bewust anon-toegankelijk (token-flow, conform Beslissing
-- 62) — net als de deellink-/toolbox-token-RPC's. Alle andere incident-RPC's
-- (KAM, fase 3) worden juist anon-dicht.
--
-- Foto's: PRIVÉ bucket 'incident-foto' met ECHTE per-bedrijf padscheiding in de
-- storage-RLS (eerste padsegment = company_id). Sterker dan de bewijs-bucket, die
-- storage-zijdig alleen 'ingelogd' afdwingt. De melder (anon) uploadt uitsluitend
-- via een kortlevende service-role signed upload-URL (bypasst RLS voor exact één
-- pad); er is bewust GEEN anon/authenticated insert-policy. Lezen (KAM) mag direct
-- alleen binnen het eigen bedrijf; de app levert foto's via service-role signed
-- download-URL ná mag_bedrijf_beheren.
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Privé Storage-bucket + per-bedrijf leespolicy
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('incident-foto', 'incident-foto', false, 6291456)   -- 6 MB backstop
on conflict (id) do nothing;

-- Lezen: alleen binnen het eigen bedrijf (eerste padsegment = company), of admin.
-- Dezelfde semantiek als mag_bedrijf_beheren. Schrijven kan NIET via RLS (geen
-- insert/update/delete-policy) — uitsluitend via service-role signed URLs.
drop policy if exists "incident-foto eigen bedrijf leest" on storage.objects;
create policy "incident-foto eigen bedrijf leest" on storage.objects
  as permissive for select to public using (
    bucket_id = 'incident-foto'
    and ((storage.foldername(name))[1] = my_company_id()::text or is_admin())
  );

-- ============================================================
-- 2. Meldcontext: wat de open meldpagina nodig heeft (bedrijf + huisstijl +
--    gevolg-opties). Anon leest hiermee GEEN incident-data; alleen labels.
-- ============================================================
create or replace function public.incident_meldcontext_token(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_link    public.incident_meldlink;
  v_company uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  return jsonb_build_object(
    'bedrijf',      (select name from public.companies where id = v_company),
    'huisstijl',    public.huisstijl_van_bedrijf(v_company),
    'gevolg_opties', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', code, 'omschrijving', omschrijving
      ) order by volgorde, code), '[]'::jsonb)
      from public.incident_gevolg_soort
    )
  );
end;
$function$;

-- ============================================================
-- 3. Melden: maakt de incident-rij (Deel 1). Bedrijf uit het token; Deel 2 blijft
--    leeg (defaults). Geen gevoelige velden in deze flow.
-- ============================================================
create or replace function public.incident_melden_token(
  p_token        text,
  p_datum        date,
  p_tijd         time,
  p_locatie      text,
  p_project      text,
  p_omschrijving text,
  p_naam_melder  text,
  p_gevolgen     text[]
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_gevolgen text[];
  v_id       uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then
    raise exception 'Ongeldige of ingetrokken meldlink';
  end if;
  v_company := v_link.company_id;

  if p_datum is null then raise exception 'Datum is verplicht'; end if;
  if p_locatie is null or btrim(p_locatie) = '' then raise exception 'Locatie is verplicht'; end if;
  if p_omschrijving is null or btrim(p_omschrijving) = '' then raise exception 'Omschrijving is verplicht'; end if;

  -- Alleen bekende gevolg-codes bewaren (onbekende invoer stil negeren).
  select coalesce(array_agg(g.code order by s.volgorde, s.code), '{}')
    into v_gevolgen
  from unnest(coalesce(p_gevolgen, '{}')) as g(code)
  join public.incident_gevolg_soort s on s.code = g.code;

  insert into public.incident (
    company_id, datum, tijd, locatie, project, omschrijving, naam_melder, gevolgen
  ) values (
    v_company, p_datum, p_tijd,
    btrim(p_locatie),
    nullif(btrim(coalesce(p_project, '')), ''),
    btrim(p_omschrijving),
    nullif(btrim(coalesce(p_naam_melder, '')), ''),
    coalesce(v_gevolgen, '{}')
  ) returning id into v_id;

  return v_id;
end;
$function$;

-- ============================================================
-- 4. Foto-upload (Deel 1): pad reserveren + rij registreren. Beide valideren dat
--    de incident bij het bedrijf van het token hoort. Pad bedrijf-geprefixt.
-- ============================================================
create or replace function public.incident_foto_pad_token(
  p_token text, p_incident_id uuid, p_bestandsnaam text
)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_incident public.incident;
  v_ext      text;
  v_pad      text;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  select * into v_incident from public.incident
   where id = p_incident_id and company_id = v_company;
  if v_incident.id is null then return null; end if;

  v_ext := lower(coalesce(nullif(regexp_replace(p_bestandsnaam, '^.*\.', ''), p_bestandsnaam), 'bin'));

  -- Bedrijf-geprefixt pad: <company>/<incident>/<random>.<ext>. Eerste segment =
  -- company → de storage-RLS schermt het per bedrijf af.
  v_pad := v_company || '/' || p_incident_id || '/'
           || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;

  return jsonb_build_object('pad', v_pad, 'company_id', v_company);
end;
$function$;

create or replace function public.incident_foto_registreren_token(
  p_token text, p_incident_id uuid, p_pad text,
  p_bestandsnaam text, p_type text, p_grootte bigint
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link     public.incident_meldlink;
  v_company  uuid;
  v_incident public.incident;
  v_id       uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  select * into v_incident from public.incident
   where id = p_incident_id and company_id = v_company;
  if v_incident.id is null then return null; end if;

  -- Defense-in-depth: het pad moet binnen <company>/<incident>/ vallen.
  if p_pad is null or p_pad not like (v_company::text || '/' || p_incident_id::text || '/%') then
    return null;
  end if;

  insert into public.incident_foto
    (incident_id, company_id, storage_pad, bestandsnaam, type, grootte)
  values
    (p_incident_id, v_company, p_pad, p_bestandsnaam, p_type, p_grootte)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ============================================================
-- 5. Grants — token-flow: bewust anon-toegankelijk (zoals de deellink-/toolbox-
--    token-RPC's). Geen andere rol krijgt hier iets extra's.
-- ============================================================
revoke execute on function public.incident_meldcontext_token(text) from public;
revoke execute on function public.incident_melden_token(text, date, time, text, text, text, text, text[]) from public;
revoke execute on function public.incident_foto_pad_token(text, uuid, text) from public;
revoke execute on function public.incident_foto_registreren_token(text, uuid, text, text, text, bigint) from public;

grant execute on function public.incident_meldcontext_token(text) to anon, authenticated, service_role;
grant execute on function public.incident_melden_token(text, date, time, text, text, text, text, text[]) to anon, authenticated, service_role;
grant execute on function public.incident_foto_pad_token(text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.incident_foto_registreren_token(text, uuid, text, text, text, bigint) to anon, authenticated, service_role;

commit;
