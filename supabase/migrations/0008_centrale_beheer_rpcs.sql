-- Migratie 0008: centraal beheer (admin) — RPC's voor de centrale bibliotheek
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + harde is_admin()-check: alleen de deskundige (role=admin)
-- beheert de centrale norm. Een klant kan deze functies wel aanroepen maar wordt
-- door de is_admin()-guard geweigerd (naast de RLS uit 0007).
--
-- Versiebeleid (voor de "norm gewijzigd sinds afwijken"-signalering): alleen een
-- INHOUDELIJKE wijziging hoogt versie op en zet gewijzigd_op = now():
--   * rubriek: de naam wijzigt;
--   * vraag:   de tekst wijzigt.
-- Herordenen (volgorde) of het admin-dossierveld rie_code wijzigen is GEEN
-- inhoudelijke normwijziging en raakt de versie niet — anders zou een klant een
-- vals "de norm is gewijzigd"-signaal krijgen.
--
-- Additief: alleen nieuwe functies. Idempotent via create or replace.

begin;

-- Rubriek opslaan (nieuw of hernoemen/herordenen/rie_code).
create or replace function public.centrale_rubriek_opslaan(
  p_id uuid,
  p_naam text,
  p_volgorde integer default null,
  p_rie_code text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id       uuid;
  v_oud_naam text;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_id is null then
    insert into centrale_rubriek (naam, volgorde, rie_code)
    values (
      btrim(p_naam),
      coalesce(p_volgorde, (select coalesce(max(volgorde), 0) + 1 from centrale_rubriek)),
      nullif(btrim(coalesce(p_rie_code, '')), '')
    )
    returning id into v_id;
    return v_id;
  end if;

  select naam into v_oud_naam from centrale_rubriek where id = p_id;
  if v_oud_naam is null then
    raise exception 'Rubriek niet gevonden';
  end if;

  update centrale_rubriek
     set naam         = btrim(p_naam),
         rie_code     = nullif(btrim(coalesce(p_rie_code, '')), ''),
         volgorde     = coalesce(p_volgorde, volgorde),
         -- Alleen bij een echte naamswijziging de versie ophogen.
         versie       = versie + (case when btrim(p_naam) <> v_oud_naam then 1 else 0 end),
         gewijzigd_op = (case when btrim(p_naam) <> v_oud_naam then now() else gewijzigd_op end)
   where id = p_id;
  return p_id;
end;
$function$;

-- Rubriek archiveren (soft-delete). De vragen blijven staan; de effectieve set
-- filtert op gearchiveerd_op is null.
create or replace function public.centrale_rubriek_archiveren(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if not exists (select 1 from centrale_rubriek where id = p_id) then
    raise exception 'Rubriek niet gevonden';
  end if;

  update centrale_rubriek
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;

-- Vraag opslaan (nieuw of tekst/volgorde wijzigen).
create or replace function public.centrale_vraag_opslaan(
  p_id uuid,
  p_rubriek_id uuid,
  p_tekst text,
  p_volgorde integer default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id        uuid;
  v_oud_tekst text;
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if coalesce(btrim(p_tekst), '') = '' then
    raise exception 'Tekst is verplicht';
  end if;

  if p_id is null then
    if not exists (select 1 from centrale_rubriek where id = p_rubriek_id) then
      raise exception 'Rubriek niet gevonden';
    end if;
    insert into centrale_vraag (rubriek_id, tekst, volgorde)
    values (
      p_rubriek_id,
      btrim(p_tekst),
      coalesce(p_volgorde, (select coalesce(max(volgorde), 0) + 1 from centrale_vraag where rubriek_id = p_rubriek_id))
    )
    returning id into v_id;
    return v_id;
  end if;

  select tekst into v_oud_tekst from centrale_vraag where id = p_id;
  if v_oud_tekst is null then
    raise exception 'Vraag niet gevonden';
  end if;

  update centrale_vraag
     set tekst        = btrim(p_tekst),
         volgorde     = coalesce(p_volgorde, volgorde),
         -- Alleen bij een echte tekstwijziging de versie ophogen (= normwijziging).
         versie       = versie + (case when btrim(p_tekst) <> v_oud_tekst then 1 else 0 end),
         gewijzigd_op = (case when btrim(p_tekst) <> v_oud_tekst then now() else gewijzigd_op end)
   where id = p_id;
  return p_id;
end;
$function$;

-- Vraag archiveren (soft-delete).
create or replace function public.centrale_vraag_archiveren(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Alleen voor beheerders';
  end if;
  if not exists (select 1 from centrale_vraag where id = p_id) then
    raise exception 'Vraag niet gevonden';
  end if;

  update centrale_vraag
     set gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_id;
end;
$function$;

grant execute on function public.centrale_rubriek_opslaan(uuid, text, integer, text) to anon, authenticated, service_role;
grant execute on function public.centrale_rubriek_archiveren(uuid) to anon, authenticated, service_role;
grant execute on function public.centrale_vraag_opslaan(uuid, uuid, text, integer) to anon, authenticated, service_role;
grant execute on function public.centrale_vraag_archiveren(uuid) to anon, authenticated, service_role;

commit;
