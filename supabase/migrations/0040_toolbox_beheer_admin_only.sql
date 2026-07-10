-- Migratie 0040: toolbox koppelen/beheren wordt admin-only
-- ----------------------------------------------------------------------------
-- De UI toont de tabs "Toolboxen" (koppelen/lokaal afwijken) en "Bewijs & export"
-- alleen aan de admin (ToolboxClient.tsx); de KAM ziet enkel het maandoverzicht.
-- Server-side stond de guard op de vijf schrijf-RPC's echter nog op
-- mag_bedrijf_beheren(...), waardoor een KAM ze via een directe RPC-aanroep alsnog
-- kon uitvoeren. Deze migratie laat de server de UI volgen.
--
-- WAAROM DIT DE ADMIN NIET RAAKT:
--   mag_bedrijf_beheren(c) = coalesce(is_admin() or c = my_company_id(), false)
-- De admin komt daar binnen via de is_admin()-tak, nooit via de company_id-match
-- (een admin heeft geen company_id). is_admin() is dus een strikte deelverzameling:
-- de guard aanscherpen snijdt alleen de KAM-tak weg.
--
-- WAAROM ER GEEN ACHTERDEUR OVERBLIJFT:
-- bedrijf_toolbox en bedrijf_toolbox_afwijking hebben RLS aan met UITSLUITEND een
-- select-policy (0015, regel 125-132). Er is geen insert/update/delete-policy, dus
-- muteren kan alleen via deze security-definer-RPC's. De guard hier is het enige slot.
--
-- WAT BEWUST ONGEMOEID BLIJFT:
--   * bedrijf_toolbox_overzicht  → lees-RPC; het maandoverzicht van de KAM voedt zich
--                                  hiermee (ToolboxClient.tsx:71). Blijft mag_bedrijf_beheren.
--   * de select-policies         → de KAM moet zijn eigen koppelingen kunnen lezen.
--   * doelstelling_zetten        → hoort bij de doelstellingen, niet bij koppelen/beheren.
--   * toolbox_bewijs(_overzicht) → een KAM mag het bewijs van zijn eigen bedrijf inzien;
--                                  dat is zijn eigen data. Alleen de UI verbergt het.
--
-- Additief: alleen create or replace van vijf functiebodies. Idempotent. De
-- signatures, returns en de rest van de logica blijven exact gelijk; alleen de
-- eerste guard-regel wijzigt.

begin;

create or replace function public.toolbox_koppelen(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if not exists (select 1 from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null) then
    raise exception 'Toolbox niet gevonden of gearchiveerd';
  end if;
  insert into bedrijf_toolbox (company_id, toolbox_id) values (p_company_id, p_toolbox_id)
  on conflict (company_id, toolbox_id) do nothing;
end;
$function$;

create or replace function public.toolbox_ontkoppelen(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  delete from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;

create or replace function public.toolbox_lokaal_aanpassen(
  p_company_id uuid, p_toolbox_id uuid, p_lokale_titel text, p_lokale_tekst text, p_lokale_video_url text
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_versie integer;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  if coalesce(btrim(p_lokale_tekst),'') = '' then raise exception 'Lokale tekst is verplicht'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;

  insert into bedrijf_toolbox_afwijking
    (company_id, toolbox_id, modus, lokale_titel, lokale_tekst, lokale_video_url, basis_versie)
  values
    (p_company_id, p_toolbox_id, 'lokaal', nullif(btrim(coalesce(p_lokale_titel,'')),''),
     btrim(p_lokale_tekst), nullif(btrim(coalesce(p_lokale_video_url,'')),''), v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='lokaal', lokale_titel=excluded.lokale_titel, lokale_tekst=excluded.lokale_tekst,
        lokale_video_url=excluded.lokale_video_url, basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;

create or replace function public.toolbox_uitzetten(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_versie integer;
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  select versie into v_versie from centrale_toolbox where id = p_toolbox_id and gearchiveerd_op is null;
  if v_versie is null then raise exception 'Toolbox niet gevonden'; end if;
  if not exists (select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id) then
    raise exception 'Koppel eerst de toolbox voordat je lokaal afwijkt';
  end if;
  insert into bedrijf_toolbox_afwijking (company_id, toolbox_id, modus, basis_versie)
  values (p_company_id, p_toolbox_id, 'uit', v_versie)
  on conflict (company_id, toolbox_id) do update
    set modus='uit', lokale_titel=null, lokale_tekst=null, lokale_video_url=null,
        basis_versie=excluded.basis_versie, afgeweken_op=now();
end;
$function$;

create or replace function public.toolbox_terug_naar_centraal(p_company_id uuid, p_toolbox_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Alleen voor beheerders'; end if;
  delete from bedrijf_toolbox_afwijking where company_id = p_company_id and toolbox_id = p_toolbox_id;
end;
$function$;

commit;
