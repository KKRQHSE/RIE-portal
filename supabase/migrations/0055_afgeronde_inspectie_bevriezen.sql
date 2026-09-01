-- Migratie 0055: een afgeronde inspectie echt bevriezen, historie append-only
-- ----------------------------------------------------------------------------
-- Probleem 2 uit de nachttest van 31 augustus 2026. De regel "afgerond =
-- bevroren" bestond alleen ín de RPC's (bevinding_opslaan, inspectie_afronden,
-- inspectie_conclusie_opslaan). Maar inspectie, inspectie_bevinding en
-- inspectie_historie hadden elk een ALL-policy, dus een ingelogde KAM kon de
-- RPC's overslaan en rechtstreeks via PostgREST:
--   * de toelichting en het resultaat van een afgeronde bevinding wijzigen;
--   * de inspectie heropenen (status terug naar 'concept');
--   * de conclusie vervangen en een bevinding verwijderen;
--   * historieregels herschrijven, verwijderen en verzinnen.
-- Alle acht die pogingen slaagden. Geen cross-tenant lek — het blijft binnen het
-- eigen bedrijf — maar wel een integriteitsprobleem in precies de module die als
-- bewijs dient en waarvan het rapport als PDF wordt gedeeld.
--
-- TWEE SLOTEN, zoals bij toolbox_deelname:
--   1. de ALL-policies eruit, zodat PostgREST er helemaal niet meer in schrijft;
--   2. triggers die ook tegen service_role en tegen de RPC's zelf bijten.
-- De SECURITY DEFINER-RPC's draaien als owner en zijn niet aan RLS gebonden, dus
-- de bedoelde weg blijft werken; de triggers zijn de echte garantie.
--
-- LOPEND BLIJFT BEWERKBAAR. De triggers kijken naar OLD.status, niet naar NEW.
-- De overgang náár afgerond is dus gewoon toegestaan (OLD is dan nog 'concept'
-- of 'ingediend'), en zolang een inspectie loopt verandert er niets.
--
-- WAT WEL MAG WIJZIGEN OP EEN BEVROREN RIJ, en waarom. Zonder deze uitzonderingen
-- breekt de rest van het systeem:
--   * inspectie.persoon_id   — persoon_samenvoegen verschuift de koppeling, óók
--                              op afgeronde inspecties; en de FK zet hem op NULL
--                              als een persoon wordt verwijderd;
--   * inspectie.sjabloon_id  — FK ON DELETE SET NULL bij het verwijderen van een
--                              sjabloon;
--   * inspectie_bevinding.actie_id — FK ON DELETE SET NULL bij het verwijderen
--                              van een PvA-actie;
--   * inspectie_historie.wie — FK ON DELETE SET NULL bij het verwijderen van een
--                              account.
-- Alles wat inhoudelijk is (status, conclusie, uitgevoerd_op, resultaat,
-- afhandeling, opmerking, de snapshots, wijziging, wanneer) ligt vast.
--
-- De vergelijking is KOLOMLIJST-VRIJ (to_jsonb(new) - 'kolom' vs to_jsonb(old) -
-- 'kolom'), net als toolbox_deelname_immutable: een kolom die later wordt
-- toegevoegd is automatisch beschermd, zonder dat iemand deze migratie hoeft te
-- onthouden.
--
-- HISTORIE IS APPEND-ONLY, altijd — niet alleen na afronden. Een spoor dat je
-- tijdens het werk nog kunt herschrijven is geen spoor.
--
-- VERWIJDEREN: een losse historieregel kan niet meer weg, ook niet met de service
-- role. Een heel bedrijf of een hele inspectie verwijderen kan nog wél, want dan
-- gaat de regel als CASCADE mee — dat is nodig voor het AVG-verwijderrecht en
-- voor het opruimen van testdata. De trigger onderscheidt die twee door te kijken
-- of de ouder nog bestaat: bij een rechtstreekse delete wel, bij een cascade is
-- de ouder al weg. Empirisch geverifieerd voordat deze migratie is geschreven.
--
-- module_historie krijgt dezelfde behandeling: zelfde vorm, zelfde risico. Daar
-- zijn er géén uitzonderingskolommen ('wie' heeft er geen FK), dus die rijen zijn
-- volledig onveranderlijk.

begin;

-- ---------------------------------------------------------------------------
-- 1. Slot één: geen directe schrijftoegang meer via PostgREST.
--    De bestaande *_sel-policies blijven staan, dus lezen verandert niet. Alle
--    schrijfacties in de app lopen al via RPC's; er is geen enkele plek die
--    rechtstreeks naar deze tabellen schrijft (nagelopen in de codebase).
-- ---------------------------------------------------------------------------
drop policy if exists inspectie_wr           on public.inspectie;
drop policy if exists inspectie_bevinding_wr on public.inspectie_bevinding;
drop policy if exists inspectie_historie_wr  on public.inspectie_historie;
drop policy if exists module_historie_wr     on public.module_historie;

-- ---------------------------------------------------------------------------
-- 2. Slot twee: triggers. Deze gelden voor iedereen, ook service_role.
-- ---------------------------------------------------------------------------

-- Is deze inspectie bevroren?
create or replace function public.inspectie_is_bevroren(p_inspectie_id uuid)
 returns boolean language sql stable set search_path to 'public'
as $function$
  select coalesce(
    (select status in ('afgerond', 'geannuleerd') from inspectie where id = p_inspectie_id),
    false)
$function$;

-- --- inspectie ---------------------------------------------------------------
create or replace function public.inspectie_bevroren_bewaken()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  -- OLD, niet NEW: de overgang náár afgerond moet mogelijk blijven.
  if old.status not in ('afgerond', 'geannuleerd') then
    return new;
  end if;

  -- Alleen de twee koppelvelden mogen nog schuiven (persoon_samenvoegen en de
  -- FK's met ON DELETE SET NULL). De rest ligt vast.
  if to_jsonb(new) - 'persoon_id' - 'sjabloon_id'
     is distinct from
     to_jsonb(old) - 'persoon_id' - 'sjabloon_id' then
    raise exception 'Deze inspectie is afgerond of geannuleerd en ligt vast';
  end if;

  return new;
end;
$function$;

drop trigger if exists inspectie_bevroren_no_update on public.inspectie;
create trigger inspectie_bevroren_no_update
  before update on public.inspectie
  for each row execute function public.inspectie_bevroren_bewaken();

-- --- inspectie_bevinding -----------------------------------------------------
create or replace function public.inspectie_bevinding_bevroren_bewaken()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    -- Bij een CASCADE (de inspectie zelf verdwijnt) is de ouder al weg; dan mag
    -- het. Bestaat de ouder nog én is die bevroren, dan is dit een rechtstreekse
    -- verwijdering en gaat hij niet door.
    if exists (select 1 from inspectie where id = old.inspectie_id)
       and inspectie_is_bevroren(old.inspectie_id) then
      raise exception 'Deze inspectie is afgerond of geannuleerd; bevindingen liggen vast';
    end if;
    return old;
  end if;

  if not inspectie_is_bevroren(old.inspectie_id) then
    return new;
  end if;

  -- actie_id mag nog naar NULL door de FK als een PvA-actie wordt verwijderd.
  if to_jsonb(new) - 'actie_id' is distinct from to_jsonb(old) - 'actie_id' then
    raise exception 'Deze inspectie is afgerond of geannuleerd; de bevinding ligt vast';
  end if;

  return new;
end;
$function$;

drop trigger if exists inspectie_bevinding_bevroren_no_update on public.inspectie_bevinding;
create trigger inspectie_bevinding_bevroren_no_update
  before update or delete on public.inspectie_bevinding
  for each row execute function public.inspectie_bevinding_bevroren_bewaken();

-- --- inspectie_historie (append-only) ----------------------------------------
create or replace function public.inspectie_historie_append_only()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from inspectie where id = old.inspectie_id) then
      raise exception 'De inspectiehistorie kan niet worden verwijderd';
    end if;
    return old;   -- cascade: de hele inspectie verdwijnt
  end if;

  -- wie mag nog naar NULL door de FK als een account wordt verwijderd.
  if to_jsonb(new) - 'wie' is distinct from to_jsonb(old) - 'wie' then
    raise exception 'De inspectiehistorie kan niet worden gewijzigd';
  end if;

  return new;
end;
$function$;

drop trigger if exists inspectie_historie_append_only_trg on public.inspectie_historie;
create trigger inspectie_historie_append_only_trg
  before update or delete on public.inspectie_historie
  for each row execute function public.inspectie_historie_append_only();

-- --- module_historie (append-only) -------------------------------------------
create or replace function public.module_historie_append_only()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from companies where id = old.company_id) then
      raise exception 'De modulehistorie kan niet worden verwijderd';
    end if;
    return old;   -- cascade: het hele bedrijf verdwijnt
  end if;

  -- Geen uitzonderingen: module_historie.wie heeft geen FK, dus er is geen
  -- kolom die door referentiële integriteit hoeft te kunnen wijzigen.
  raise exception 'De modulehistorie kan niet worden gewijzigd';
end;
$function$;

drop trigger if exists module_historie_append_only_trg on public.module_historie;
create trigger module_historie_append_only_trg
  before update or delete on public.module_historie
  for each row execute function public.module_historie_append_only();

-- ---------------------------------------------------------------------------
-- 3. Geen anon-EXECUTE op de nieuwe functies (Beslissing 62). Een trigger vuurt
--    ook zonder EXECUTE-recht op de functie; deze grants zijn er alleen om te
--    voorkomen dat scripts/anon_execute_audit_test.mjs terecht gaat piepen.
-- ---------------------------------------------------------------------------
revoke execute on function public.inspectie_is_bevroren(uuid) from public, anon;
grant  execute on function public.inspectie_is_bevroren(uuid) to authenticated, service_role;
revoke execute on function public.inspectie_bevroren_bewaken() from public, anon;
grant  execute on function public.inspectie_bevroren_bewaken() to authenticated, service_role;
revoke execute on function public.inspectie_bevinding_bevroren_bewaken() from public, anon;
grant  execute on function public.inspectie_bevinding_bevroren_bewaken() to authenticated, service_role;
revoke execute on function public.inspectie_historie_append_only() from public, anon;
grant  execute on function public.inspectie_historie_append_only() to authenticated, service_role;
revoke execute on function public.module_historie_append_only() from public, anon;
grant  execute on function public.module_historie_append_only() to authenticated, service_role;

commit;
