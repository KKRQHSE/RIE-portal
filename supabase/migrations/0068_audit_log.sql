-- ============================================================================
-- Audit-logging — append-only, admin-only leesbaar
-- ----------------------------------------------------------------------------
-- Ronde-2-must-punt/should-punt 11: geen enkele centrale, doorzoekbare
-- audit-trail. Dit voegt een minimale, append-only log toe voor de
-- hoogste-waarde events, met vijf bewuste ontwerpkeuzes (afgesproken met
-- de opdrachtgever vóór te bouwen):
--
-- 1. wie/company_id zijn KALE uuid's, GEEN foreign key. Een FK met CASCADE
--    zou logregels laten verdwijnen als de gebruiker/het bedrijf later wordt
--    verwijderd — precies wat een audit-log niet mag doen. Een FK met SET
--    NULL zou de koppeling verliezen. In plaats daarvan wordt de naam/e-mail
--    van de acteur en (waar van toepassing) de bedrijfsnaam gedenormaliseerd
--    in `detail` vastgelegd OP HET MOMENT VAN SCHRIJVEN, zodat de regel
--    leesbaar blijft ook als de bron later verdwijnt.
-- 2. De append-only-trigger blokkeert ook TRUNCATE (een aparte
--    FOR EACH STATEMENT-trigger; rij-triggers vuren niet bij TRUNCATE).
-- 3. audit_log_schrijven() krijgt expliciet `search_path = public, pg_temp`
--    (niet alleen 'public') — een iets strakkere, expliciete conventie dan
--    de rest van het schema, zoals gevraagd.
-- 4. Download-logging (in de route-laag, niet in deze migratie) faalt NIET
--    stil door een lege catch. Gekozen: ZICHTBAAR falen (console.error),
--    de download gaat gewoon door. Reden: audit-logging is hier een
--    compliance-/zichtbaarheidslaag bovenop een werkende, veelgebruikte
--    functie (bewijs/foto's downloaden) — een bug in de logging mag die
--    functie niet blokkeren. Geen enkele download-route mag dus ooit
--    "blokkeren" doen; de keuze is bewust "zichtbaar, niet blokkerend".
-- 5. Download-logging legt de UITGIFTE van de signed URL vast (het moment
--    waarop toegang is verleend), niet het daadwerkelijke ophalen van de
--    bytes door de browser — dat gaat rechtstreeks naar Supabase Storage,
--    buiten het zicht van deze route.
-- ============================================================================

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  wie         uuid,                    -- GEEN FK, zie ontwerpkeuze 1 hierboven
  wanneer     timestamptz not null default now(),
  actie       text not null,
  entiteit    text not null,
  entiteit_id uuid,
  company_id  uuid,                    -- GEEN FK, zie ontwerpkeuze 1 hierboven
  detail      jsonb
);

create index audit_log_company_wanneer_idx on public.audit_log (company_id, wanneer desc);
create index audit_log_wie_wanneer_idx on public.audit_log (wie, wanneer desc);

alter table public.audit_log enable row level security;

-- Alleen admin leest. Geen enkele INSERT/UPDATE/DELETE-policy voor
-- authenticated/anon: schrijven kan uitsluitend via de SECURITY DEFINER-RPC
-- hieronder of via de twee triggers verderop (die zelf ook SECURITY DEFINER
-- zijn en dus niet door RLS worden tegengehouden).
create policy audit_log_admin_read on public.audit_log
  for select using (is_admin());

-- Append-only, ook voor service_role — zelfde patroon als de bestaande
-- bevroren-data-triggers (inspectie_bevroren_bewaken, toolbox_deelname_immutable).
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'audit_log is append-only: wijzigen, verwijderen of legen kan niet, ook niet met service-role';
end;
$function$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- TRUNCATE vuurt geen rij-triggers — aparte statement-trigger nodig (correctie 2).
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Het enige toegestane schrijfpad voor "gewone" events (die al door een
-- bestaande RPC lopen). `wie` komt uit auth.uid() van de AANROEPER, niet uit
-- een client-opgegeven parameter — anders zou iedereen een andere gebruiker
-- kunnen impersoneren in de log.
create or replace function public.audit_log_schrijven(
  p_actie text, p_entiteit text, p_entiteit_id uuid, p_company_id uuid, p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), p_actie, p_entiteit, p_entiteit_id, p_company_id, p_detail);
end;
$function$;

-- Dit project heeft een default-ACL die élke NIEUWE functie in schema public
-- standaard EXECUTE geeft aan anon (pg_default_acl, defaclrole=postgres,
-- objtype='f') — REVOKE ... FROM PUBLIC trekt dat NIET in, want dat is een
-- aparte, expliciete grant aan de rol 'anon' zelf. Ontdekt tijdens het testen
-- van deze migratie (anon kon de RPC eerst gewoon aanroepen). Voortaan
-- expliciet FROM anon revoken, niet alleen FROM public, voor elke nieuwe
-- functie in dit project.
revoke execute on function public.audit_log_schrijven(text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.audit_log_schrijven(text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.audit_log_schrijven(text, text, uuid, uuid, jsonb) to service_role;

-- De trigger-functies zijn niet zinvol los aanroepbaar (ze verwachten
-- OLD/NEW/TG_*-triggercontext), maar voor consistentie met de rest van dit
-- project ook hier geen onbedoelde anon-EXECUTE laten staan.
revoke execute on function public.audit_log_immutable() from public, anon;
revoke execute on function public.personen_verwijderd_loggen() from public, anon;
revoke execute on function public.rol_gewijzigd_loggen() from public, anon;

-- ----------------------------------------------------------------------------
-- Twee events die NIET gegarandeerd via een RPC lopen, dus alleen een
-- tabel-trigger ze onomzeilbaar kan vastleggen:
-- ----------------------------------------------------------------------------

-- 'persoon_verwijderd': personen heeft een brede client-ALL-policy (bewust,
-- voor gewone personen-CRUD) — een RPC-hook zou omzeilbaar blijven via een
-- directe DELETE. Vuurt ook bij de delete binnen personen_samenvoegen (zie
-- hieronder); dat is bedoeld, geen bug — een merge produceert dan zowel deze
-- generieke regel als de gedetailleerde persoon_merge_log-regel.
create or replace function public.personen_verwijderd_loggen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), 'persoon_verwijderd', 'personen', old.id, old.company_id,
    jsonb_build_object('naam', old.naam, 'email', old.email));
  return old;
end;
$function$;

create trigger personen_verwijderd_audit
  after delete on public.personen
  for each row execute function public.personen_verwijderd_loggen();

-- 'rol_gewijzigd': role/company_id op users worden vandaag uitsluitend gezet
-- via de service-role/admin-API (geen RPC ervoor), dus ook hier is een
-- trigger het enige onomzeilbare vangpunt. Let op: als de wijziging zelf via
-- de service-role gebeurt (het huidige aanmaakpad), is er geen auth.uid() —
-- `wie` is dan null. Dat is een eerlijke beperking, geen bug: er is geen
-- ingelogde "wie" in die context om vast te leggen.
create or replace function public.rol_gewijzigd_loggen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.role is distinct from old.role or new.company_id is distinct from old.company_id then
    insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
    values (auth.uid(), 'rol_gewijzigd', 'users', new.id, new.company_id,
      jsonb_build_object(
        'email', new.email,
        'oude_rol', old.role, 'nieuwe_rol', new.role,
        'oud_bedrijf', old.company_id, 'nieuw_bedrijf', new.company_id
      ));
  end if;
  return new;
end;
$function$;

create trigger users_rol_audit
  after update of role, company_id on public.users
  for each row execute function public.rol_gewijzigd_loggen();

-- ----------------------------------------------------------------------------
-- Wire-ins in bestaande RPC's (RPC-vorm, want deze lopen al gegarandeerd door
-- exact deze functies — geen ander schrijfpad bestaat).
-- ----------------------------------------------------------------------------

-- incident_deel2_opslaan: alleen 'status' in detail, GEEN medische velden —
-- het incidenten-/gezondheidsgegevens-toegangsmodel is een AVG-beslissing van
-- de opdrachtgever en wordt hier niet stilzwijgend uitgebreid naar een nieuwe
-- tabel.
create or replace function public.incident_deel2_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date, p_functie_slachtoffer text, p_medische_dienst_bezocht text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_directe integer[];
  v_basis   integer[];
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;
  if not exists (select 1 from public.incident where id = p_incident_id and company_id = p_company_id) then
    raise exception 'Incident niet gevonden';
  end if;
  if coalesce(p_status,'') not in ('open','in_onderzoek','afgehandeld') then
    raise exception 'Ongeldige status';
  end if;
  if p_medische_dienst_bezocht is not null
     and p_medische_dienst_bezocht not in ('ja','nee','onbekend') then
    raise exception 'Ongeldige waarde medische dienst';
  end if;

  select coalesce(array_agg(c order by c), '{}') into v_directe
  from unnest(coalesce(p_directe_oorzaken,'{}')) c
  where exists (select 1 from public.incident_directe_oorzaak d where d.code = c);

  select coalesce(array_agg(c order by c), '{}') into v_basis
  from unnest(coalesce(p_basis_oorzaken,'{}')) c
  where exists (select 1 from public.incident_basis_oorzaak b where b.code = c);

  update public.incident set
    status                          = p_status,
    directe_oorzaken                = v_directe,
    basis_oorzaken                  = v_basis,
    oorzaak_toelichting             = nullif(btrim(coalesce(p_oorzaak_toelichting,'')), ''),
    onderzoeksrapportage_bijgevoegd = coalesce(p_onderzoeksrapportage_bijgevoegd, false),
    telefonische_melding_directie   = coalesce(p_telefonische_melding_directie, false),
    telefonische_melding_aan        = nullif(btrim(coalesce(p_telefonische_melding_aan,'')), ''),
    maatregelen_in_actielijst       = coalesce(p_maatregelen_in_actielijst, false),
    tra_aanpassen                   = coalesce(p_tra_aanpassen, false),
    andere_maatregelen              = nullif(btrim(coalesce(p_andere_maatregelen,'')), ''),
    besproken_in_toolbox_datum      = p_besproken_in_toolbox_datum,
    functie_slachtoffer             = nullif(btrim(coalesce(p_functie_slachtoffer,'')), ''),
    medische_dienst_bezocht         = p_medische_dienst_bezocht,
    afgehandeld_op                  = case
                                        when p_status = 'afgehandeld' then coalesce(afgehandeld_op, now())
                                        else null
                                      end,
    laatst_bijgewerkt_op            = now()
  where id = p_incident_id and company_id = p_company_id;

  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), 'incident_gewijzigd', 'incident', p_incident_id, p_company_id,
    jsonb_build_object('status', p_status));
end;
$function$;

-- incident_oorzaak_opslaan: zelfde actie-naam, zelfde minimale detail —
-- ongeacht via welke van de twee RPC's (KAM vs. teamleider) het gebeurde.
create or replace function public.incident_oorzaak_opslaan(p_company_id uuid, p_incident_id uuid, p_status text, p_directe_oorzaken integer[], p_basis_oorzaken integer[], p_oorzaak_toelichting text, p_onderzoeksrapportage_bijgevoegd boolean, p_telefonische_melding_directie boolean, p_telefonische_melding_aan text, p_maatregelen_in_actielijst boolean, p_tra_aanpassen boolean, p_andere_maatregelen text, p_besproken_in_toolbox_datum date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_directe integer[];
  v_basis   integer[];
  v_row     public.incident;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen rechten voor dit bedrijf';
  end if;
  if not exists (select 1 from public.incident where id = p_incident_id and company_id = p_company_id) then
    raise exception 'Incident niet gevonden';
  end if;
  if coalesce(p_status,'') not in ('open','in_onderzoek','afgehandeld') then
    raise exception 'Ongeldige status';
  end if;

  select coalesce(array_agg(c order by c), '{}') into v_directe
  from unnest(coalesce(p_directe_oorzaken,'{}')) c
  where exists (select 1 from public.incident_directe_oorzaak d where d.code = c);

  select coalesce(array_agg(c order by c), '{}') into v_basis
  from unnest(coalesce(p_basis_oorzaken,'{}')) c
  where exists (select 1 from public.incident_basis_oorzaak b where b.code = c);

  update public.incident set
    status                          = p_status,
    directe_oorzaken                = v_directe,
    basis_oorzaken                  = v_basis,
    oorzaak_toelichting             = nullif(btrim(coalesce(p_oorzaak_toelichting,'')), ''),
    onderzoeksrapportage_bijgevoegd = coalesce(p_onderzoeksrapportage_bijgevoegd, false),
    telefonische_melding_directie   = coalesce(p_telefonische_melding_directie, false),
    telefonische_melding_aan        = nullif(btrim(coalesce(p_telefonische_melding_aan,'')), ''),
    maatregelen_in_actielijst       = coalesce(p_maatregelen_in_actielijst, false),
    tra_aanpassen                   = coalesce(p_tra_aanpassen, false),
    andere_maatregelen              = nullif(btrim(coalesce(p_andere_maatregelen,'')), ''),
    besproken_in_toolbox_datum      = p_besproken_in_toolbox_datum,
    afgehandeld_op                  = case
                                        when p_status = 'afgehandeld' then coalesce(afgehandeld_op, now())
                                        else null
                                      end,
    laatst_bijgewerkt_op            = now()
  where id = p_incident_id and company_id = p_company_id
  returning * into v_row;

  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), 'incident_gewijzigd', 'incident', p_incident_id, p_company_id,
    jsonb_build_object('status', p_status));

  return jsonb_build_object(
    'id', v_row.id, 'company_id', v_row.company_id, 'status', v_row.status,
    'directe_oorzaken', v_row.directe_oorzaken, 'basis_oorzaken', v_row.basis_oorzaken,
    'oorzaak_toelichting', v_row.oorzaak_toelichting,
    'onderzoeksrapportage_bijgevoegd', v_row.onderzoeksrapportage_bijgevoegd,
    'telefonische_melding_directie', v_row.telefonische_melding_directie,
    'telefonische_melding_aan', v_row.telefonische_melding_aan,
    'maatregelen_in_actielijst', v_row.maatregelen_in_actielijst,
    'tra_aanpassen', v_row.tra_aanpassen,
    'andere_maatregelen', v_row.andere_maatregelen,
    'besproken_in_toolbox_datum', v_row.besproken_in_toolbox_datum,
    'afgehandeld_op', v_row.afgehandeld_op,
    'laatst_bijgewerkt_op', v_row.laatst_bijgewerkt_op,
    'functie_slachtoffer', null,
    'medische_dienst_bezocht', null
  );
end;
$function$;

-- personen_samenvoegen: één extra generieke regel naast de bestaande,
-- gedetailleerde persoon_merge_log — die laatste blijft ongewijzigd bestaan.
create or replace function public.personen_samenvoegen(p_doel_id uuid, p_bron_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company     uuid;
  v_doel_naam   text;
  v_bron_naam   text;
  v_bron        record;
  v_voorbeeld   jsonb;
  v_verschoven  jsonb;
  n_inspecties  integer;
  n_acties      integer;
  n_herinner    integer;
  n_toolbox     integer;
  n_doel        integer;
  n_deellink    integer;
begin
  v_company := persoon_merge_context(p_doel_id, p_bron_id);

  v_voorbeeld := personen_merge_voorbeeld(p_doel_id, p_bron_id);
  if jsonb_array_length(v_voorbeeld->'botsingen') > 0 then
    raise exception 'Samenvoegen kan niet: beide personen hebben getekend bij %',
      (select string_agg(b->>'omschrijving', ', ')
         from jsonb_array_elements(v_voorbeeld->'botsingen') b);
  end if;

  select naam into v_doel_naam from personen where id = p_doel_id;
  select naam, email, functiegroep_id, datum_in_dienst, datum_uit_dienst, user_id
    into v_bron from personen where id = p_bron_id;
  v_bron_naam := v_bron.naam;

  update inspectie       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_inspecties = row_count;
  update pva_items       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_acties = row_count;
  update herinnering_log set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_herinner = row_count;

  update toolbox_deelname set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_toolbox = row_count;

  delete from bedrijf_inspectie_doel
   where persoon_id = p_bron_id
     and exists (select 1 from bedrijf_inspectie_doel d
                  where d.company_id = v_company and d.persoon_id = p_doel_id);
  update bedrijf_inspectie_doel set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_doel = row_count;

  delete from deellinks
   where persoon_id = p_bron_id
     and exists (select 1 from deellinks d where d.persoon_id = p_doel_id);
  update deellinks set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_deellink = row_count;

  update personen set voorgesteld_door = p_doel_id where voorgesteld_door = p_bron_id;

  v_verschoven := jsonb_build_object(
    'inspecties', n_inspecties, 'acties', n_acties, 'herinneringen', n_herinner,
    'toolbox', n_toolbox, 'inspectie_doel', n_doel, 'deellink', n_deellink
  );

  insert into public.persoon_merge_log (company_id, doel_id, doel_naam, bron_naam, verschoven, wie)
  values (v_company, p_doel_id, v_doel_naam, v_bron_naam, v_verschoven, auth.uid());

  insert into public.audit_log (wie, actie, entiteit, entiteit_id, company_id, detail)
  values (auth.uid(), 'personen_samengevoegd', 'personen', p_doel_id, v_company,
    jsonb_build_object('doel_naam', v_doel_naam, 'bron_naam', v_bron_naam));

  delete from personen where id = p_bron_id;

  update personen
     set email            = coalesce(email,            v_bron.email),
         functiegroep_id  = coalesce(functiegroep_id,  v_bron.functiegroep_id),
         datum_in_dienst  = coalesce(datum_in_dienst,  v_bron.datum_in_dienst),
         datum_uit_dienst = coalesce(datum_uit_dienst, v_bron.datum_uit_dienst),
         user_id          = coalesce(user_id,          v_bron.user_id)
   where id = p_doel_id;

  return jsonb_build_object(
    'doel_naam', v_doel_naam, 'bron_naam', v_bron_naam, 'verschoven', v_verschoven
  );
end;
$function$;

-- bewijs_lijst / deellink_bewijs_lijst: company_id toevoegen aan elke
-- teruggegeven rij, zodat de download-routes 'm kunnen loggen zonder een
-- extra round-trip. `bewijs` heeft al een eigen company_id-kolom (geen
-- schema-wijziging nodig, alleen de SELECT-lijst).
create or replace function public.bewijs_lijst(p_actie_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.pva_items where id = p_actie_id;
  if v_company_id is null then return '[]'::jsonb; end if;
  if not public.mag_bedrijf_werken(v_company_id) then raise exception 'Geen toegang'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(b) order by b.created_at desc)
    from (
      select id, company_id, pad, bestandsnaam, type, grootte, geupload_door, uploader_type,
             verwijderd_op, verwijderd_door, created_at
      from public.bewijs
      where pva_item_id = p_actie_id
    ) b
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.deellink_bewijs_lijst(p_token text, p_actie_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link public.deellinks;
  v_item public.pva_items;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return '[]'::jsonb; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return '[]'::jsonb; end if;

  select * into v_item from public.pva_items
  where id = p_actie_id and persoon_id = v_link.persoon_id;
  if v_item.id is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(b) order by b.created_at desc)
    from (
      select id, company_id, pad, bestandsnaam, type, grootte, geupload_door, created_at
      from public.bewijs
      where pva_item_id = p_actie_id and verwijderd_op is null
    ) b
  ), '[]'::jsonb);
end;
$function$;
