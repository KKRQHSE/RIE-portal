-- ============================================================================
-- Werkplekinspectie — STAP 1: de RPC-laag
-- ----------------------------------------------------------------------------
-- Draai dit bestand in de Supabase SQL Editor (als owner/postgres).
--
-- Alle functies zijn SECURITY DEFINER met een vaste `search_path = public` en
-- autoriseren de INGELOGDE KAM/admin via de bestaande helper
-- `mag_bedrijf_beheren(company_id)`. Er zijn (bewust) GEEN gast-RPC's in deze
-- stap: de inspectie wordt uitgevoerd door de ingelogde KAM.
--
-- company_id wordt NOOIT van de client vertrouwd. Bij bestaande objecten leiden
-- we het server-side af uit het sjabloon / de inspectie / de bevinding. Alleen
-- bij het AANMAKEN van een nieuw sjabloon komt company_id als argument mee, en
-- dan controleert mag_bedrijf_beheren() of de gebruiker dat bedrijf mag beheren.
--
-- Idempotent: alle functies zijn `create or replace`; de enige schemawijziging
-- (de snapshot-kolom hieronder) is `add column if not exists`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Additieve snapshot-kolom op inspectie_bevinding.
-- Bevriest of het bijbehorende sjabloonpunt 'verplicht' was op het moment dat
-- de inspectie startte. Nodig zodat inspectie_afronden robuust kan controleren
-- of álle verplichte punten een resultaat hebben — óók als het sjabloon daarna
-- wijzigt of een punt verwijderd wordt. Niet-destructief en idempotent
-- (zelfde filosofie als migratie 0001: alleen structuur toevoegen).
-- ----------------------------------------------------------------------------
alter table public.inspectie_bevinding
  add column if not exists verplicht boolean not null default false;

-- Additieve snapshot-kolom: bevriest de volgorde van het sjabloonpunt, zodat de
-- bevindingen bij het uitvoeren/teruglezen altijd in dezelfde (template-)volgorde
-- staan. inspectie_bevinding heeft zelf geen ordening; zonder deze kolom zou de
-- frontend op willekeurige id-volgorde uitkomen. Niet-destructief en idempotent.
alter table public.inspectie_bevinding
  add column if not exists volgorde integer not null default 0;


-- ----------------------------------------------------------------------------
-- sjabloon_opslaan: nieuw sjabloon (p_sjabloon_id = null) of bestaand bijwerken.
-- ----------------------------------------------------------------------------
create or replace function public.sjabloon_opslaan(
  p_sjabloon_id   uuid,
  p_company_id    uuid,
  p_naam          text,
  p_controlesoort text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if coalesce(btrim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  if p_sjabloon_id is null then
    -- Nieuw sjabloon: company_id komt mee maar wordt geautoriseerd.
    if not mag_bedrijf_beheren(p_company_id) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;
    insert into inspectie_sjabloon (company_id, naam, controlesoort, actief)
    values (p_company_id, btrim(p_naam), nullif(btrim(coalesce(p_controlesoort, '')), ''), true)
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaand sjabloon: company_id afleiden, een meegestuurd company_id negeren.
  select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon
     set naam          = btrim(p_naam),
         controlesoort = nullif(btrim(coalesce(p_controlesoort, '')), '')
   where id = p_sjabloon_id;
  return p_sjabloon_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- punt_opslaan: nieuw punt (p_punt_id = null, p_sjabloon_id vereist) of bewerken.
-- p_volgorde null => achteraan toevoegen (nieuw) of huidige volgorde behouden.
-- ----------------------------------------------------------------------------
create or replace function public.punt_opslaan(
  p_punt_id     uuid,
  p_sjabloon_id uuid,
  p_tekst       text,
  p_verplicht   boolean default false,
  p_volgorde    integer default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_volg    integer;
  v_id      uuid;
begin
  if coalesce(btrim(p_tekst), '') = '' then
    raise exception 'Tekst is verplicht';
  end if;

  if p_punt_id is null then
    select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
    if v_company is null then
      raise exception 'Sjabloon niet gevonden';
    end if;
    if not mag_bedrijf_beheren(v_company) then
      raise exception 'Geen toegang tot dit bedrijf';
    end if;

    v_volg := coalesce(
      p_volgorde,
      (select coalesce(max(volgorde), 0) + 1
         from inspectie_sjabloon_punt where sjabloon_id = p_sjabloon_id)
    );

    insert into inspectie_sjabloon_punt (company_id, sjabloon_id, volgorde, tekst, verplicht)
    values (v_company, p_sjabloon_id, v_volg, btrim(p_tekst), coalesce(p_verplicht, false))
    returning id into v_id;
    return v_id;
  end if;

  -- Bestaand punt: company_id afleiden via het sjabloon.
  select s.company_id into v_company
    from inspectie_sjabloon_punt p
    join inspectie_sjabloon s on s.id = p.sjabloon_id
   where p.id = p_punt_id;
  if v_company is null then
    raise exception 'Punt niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon_punt
     set tekst     = btrim(p_tekst),
         verplicht = coalesce(p_verplicht, false),
         volgorde  = coalesce(p_volgorde, volgorde)
   where id = p_punt_id;
  return p_punt_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- punt_verwijderen: een sjabloonpunt is template-definitie en mag hard weg.
-- Reeds gestarte inspecties hebben de tekst in punt_tekst_snap bevroren, dus
-- dit raakt bestaande inspecties niet.
-- ----------------------------------------------------------------------------
create or replace function public.punt_verwijderen(p_punt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select s.company_id into v_company
    from inspectie_sjabloon_punt p
    join inspectie_sjabloon s on s.id = p.sjabloon_id
   where p.id = p_punt_id;
  if v_company is null then
    raise exception 'Punt niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  delete from inspectie_sjabloon_punt where id = p_punt_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- sjabloon_archiveren: ALTIJD soft-delete (gearchiveerd_op + actief=false),
-- nooit hard verwijderen — er kunnen inspecties aan hangen.
-- ----------------------------------------------------------------------------
create or replace function public.sjabloon_archiveren(p_sjabloon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from inspectie_sjabloon where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  update inspectie_sjabloon
     set actief         = false,
         gearchiveerd_op = coalesce(gearchiveerd_op, now())
   where id = p_sjabloon_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- inspectie_start: maakt een inspectie (status 'concept'), snapshot van naam +
-- controlesoort, en per sjabloonpunt een bevinding met bevroren tekst + verplicht.
-- Geeft het inspectie_id terug.
-- ----------------------------------------------------------------------------
create or replace function public.inspectie_start(p_sjabloon_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   uuid;
  v_naam      text;
  v_soort     text;
  v_actief    boolean;
  v_arch      timestamptz;
  v_inspectie uuid;
begin
  select company_id, naam, controlesoort, actief, gearchiveerd_op
    into v_company, v_naam, v_soort, v_actief, v_arch
    from inspectie_sjabloon
   where id = p_sjabloon_id;
  if v_company is null then
    raise exception 'Sjabloon niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_arch is not null or coalesce(v_actief, false) = false then
    raise exception 'Sjabloon is gearchiveerd of inactief';
  end if;

  insert into inspectie (company_id, sjabloon_id, status, sjabloon_naam_snap, controlesoort_snap)
  values (v_company, p_sjabloon_id, 'concept', v_naam, v_soort)
  returning id into v_inspectie;

  -- Eén bevinding per sjabloonpunt, met bevroren tekst + verplicht + volgorde.
  insert into inspectie_bevinding (company_id, inspectie_id, punt_tekst_snap, verplicht, volgorde, afhandeling)
  select v_company, v_inspectie, punt.tekst, coalesce(punt.verplicht, false), coalesce(punt.volgorde, 0), 'geen'
    from inspectie_sjabloon_punt punt
   where punt.sjabloon_id = p_sjabloon_id
   order by punt.volgorde;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, v_inspectie, auth.uid(), now(), 'Inspectie gestart');

  return v_inspectie;
end;
$$;


-- ----------------------------------------------------------------------------
-- bevinding_opslaan: zet resultaat + afhandeling + opmerking, conform de
-- kruisveld-constraints. Maakt hier GEEN actie aan (zie bevinding_naar_actie).
--   - in_orde / nvt        => afhandeling 'geen', geen actie.
--   - niet_in_orde + 'meteen_hersteld' => toelichting verplicht.
--   - niet_in_orde + 'actie' => alleen toegestaan als er al een actie hangt
--     (bewerken); anders verwijst de fout naar bevinding_naar_actie.
-- Een afgeronde/geannuleerde inspectie is niet meer bewerkbaar.
-- ----------------------------------------------------------------------------
create or replace function public.bevinding_opslaan(
  p_bevinding_id uuid,
  p_resultaat    text,
  p_afhandeling  text default 'geen',
  p_opmerking    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company         uuid;
  v_inspectie       uuid;
  v_status          text;
  v_punt            text;
  v_bestaande_actie uuid;
  v_afh             text;
  v_act             uuid;
  v_opm             text;
begin
  select b.company_id, b.inspectie_id, b.actie_id, b.punt_tekst_snap, i.status
    into v_company, v_inspectie, v_bestaande_actie, v_punt, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;
  if p_resultaat is null or p_resultaat not in ('in_orde', 'niet_in_orde', 'nvt') then
    raise exception 'Ongeldig resultaat';
  end if;

  v_opm := nullif(btrim(coalesce(p_opmerking, '')), '');

  if p_resultaat in ('in_orde', 'nvt') then
    -- Geen afhandeling/actie bij in orde of n.v.t. (ontkoppelt een evt. actie).
    v_afh := 'geen';
    v_act := null;
  else
    -- niet_in_orde
    if p_afhandeling = 'actie' then
      if v_bestaande_actie is null then
        raise exception 'Gebruik bevinding_naar_actie om een actie aan te maken';
      end if;
      v_afh := 'actie';
      v_act := v_bestaande_actie;
    elsif p_afhandeling = 'meteen_hersteld' then
      if v_opm is null then
        raise exception 'Een toelichting is verplicht bij ''meteen hersteld''';
      end if;
      v_afh := 'meteen_hersteld';
      v_act := null;
    else
      v_afh := 'geen';
      v_act := null;
    end if;
  end if;

  update inspectie_bevinding
     set resultaat   = p_resultaat,
         afhandeling = v_afh,
         actie_id    = v_act,
         opmerking   = v_opm
   where id = p_bevinding_id;

  -- Alleen herstel loggen (statuswijziging/herstel/actie), niet elke resultaat-tik.
  if v_afh = 'meteen_hersteld' then
    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Direct hersteld: ' || coalesce(v_punt, ''));
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- bevinding_naar_actie: maakt (idempotent) een PvA-actie voor een bevinding.
--   onderwerp = punt_tekst_snap, status 'Open', company_id van de inspectie,
--   bron_type = 'inspectie_bevinding', bron_id = bevinding.id.
-- Zet de bevinding op afhandeling='actie' + actie_id. Bestaat er al een actie
-- voor deze bevinding, dan wordt die hergebruikt (geen dubbele rij).
-- Geeft het actie_id (pva_items.id) terug.
-- ----------------------------------------------------------------------------
create or replace function public.bevinding_naar_actie(p_bevinding_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   uuid;
  v_inspectie uuid;
  v_status    text;
  v_punt      text;
  v_actie     uuid;
  v_nr        integer;
begin
  select b.company_id, b.inspectie_id, b.punt_tekst_snap, b.actie_id, i.status
    into v_company, v_inspectie, v_punt, v_actie, v_status
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
   where b.id = p_bevinding_id;
  if v_company is null then
    raise exception 'Bevinding niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  -- Idempotent: hergebruik een eventueel al bestaande actie voor deze bevinding.
  if v_actie is null then
    select id into v_actie
      from pva_items
     where company_id = v_company
       and bron_type  = 'inspectie_bevinding'
       and bron_id    = p_bevinding_id
     limit 1;
  end if;

  if v_actie is null then
    -- Volgend vrij nummer binnen dit bedrijf (nr is tekst, numeriek gebruikt).
    select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
      into v_nr
      from pva_items
     where company_id = v_company;

    insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
    values (v_company, v_nr::text, coalesce(v_punt, 'Inspectiebevinding'),
            'Open', 'Middel', 'inspectie_bevinding', p_bevinding_id, now())
    returning id into v_actie;

    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(), 'Actie aangemaakt: ' || coalesce(v_punt, ''));
  end if;

  update inspectie_bevinding
     set afhandeling = 'actie',
         actie_id    = v_actie,
         resultaat   = 'niet_in_orde'
   where id = p_bevinding_id;

  return v_actie;
end;
$$;


-- ----------------------------------------------------------------------------
-- inspectie_conclusie_opslaan: bewaart de algemene conclusie/opmerking.
-- Alleen op een nog-bewerkbare inspectie.
-- ----------------------------------------------------------------------------
create or replace function public.inspectie_conclusie_opslaan(
  p_inspectie_id uuid,
  p_conclusie    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status  text;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status not in ('concept', 'ingediend') then
    raise exception 'Inspectie is afgerond of geannuleerd en kan niet meer worden gewijzigd';
  end if;

  update inspectie
     set conclusie = nullif(btrim(coalesce(p_conclusie, '')), '')
   where id = p_inspectie_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- inspectie_afronden: status 'afgerond' + uitgevoerd_op = now(), mits álle
-- verplichte punten een resultaat hebben. Optioneel meteen de conclusie zetten.
-- Daarna is de inspectie niet meer bewerkbaar (zie de checks hierboven).
-- ----------------------------------------------------------------------------
create or replace function public.inspectie_afronden(
  p_inspectie_id uuid,
  p_conclusie    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status  text;
begin
  select company_id, status into v_company, v_status from inspectie where id = p_inspectie_id;
  if v_company is null then
    raise exception 'Inspectie niet gevonden';
  end if;
  if not mag_bedrijf_beheren(v_company) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if v_status = 'afgerond' then
    raise exception 'Inspectie is al afgerond';
  end if;
  if v_status = 'geannuleerd' then
    raise exception 'Inspectie is geannuleerd';
  end if;

  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and verplicht
       and resultaat is null
  ) then
    raise exception 'Niet alle verplichte punten hebben een resultaat';
  end if;

  -- Sinds de constraint de tussenstadia toelaat, borgt afronden de eindstrengheid:
  -- een 'niet in orde'-bevinding moet zijn afgehandeld (meteen hersteld of actie).
  if exists (
    select 1 from inspectie_bevinding
     where inspectie_id = p_inspectie_id
       and resultaat = 'niet_in_orde'
       and afhandeling = 'geen'
  ) then
    raise exception 'Elke ''niet in orde''-bevinding moet zijn afgehandeld (meteen hersteld of actie)';
  end if;

  update inspectie
     set status       = 'afgerond',
         uitgevoerd_op = now(),
         conclusie     = coalesce(nullif(btrim(coalesce(p_conclusie, '')), ''), conclusie)
   where id = p_inspectie_id;

  insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
  values (v_company, p_inspectie_id, auth.uid(), now(), 'Inspectie afgerond');
end;
$$;


-- ----------------------------------------------------------------------------
-- Rechten: uitsluitend voor ingelogde gebruikers (authenticated). De feitelijke
-- autorisatie zit in mag_bedrijf_beheren(); een anonieme aanroep heeft geen
-- auth.uid() en wordt daar geweigerd. Geen grant naar anon/public.
-- ----------------------------------------------------------------------------
grant execute on function public.sjabloon_opslaan(uuid, uuid, text, text)            to authenticated;
grant execute on function public.punt_opslaan(uuid, uuid, text, boolean, integer)    to authenticated;
grant execute on function public.punt_verwijderen(uuid)                              to authenticated;
grant execute on function public.sjabloon_archiveren(uuid)                           to authenticated;
grant execute on function public.inspectie_start(uuid)                               to authenticated;
grant execute on function public.bevinding_opslaan(uuid, text, text, text)           to authenticated;
grant execute on function public.bevinding_naar_actie(uuid)                          to authenticated;
grant execute on function public.inspectie_conclusie_opslaan(uuid, text)             to authenticated;
grant execute on function public.inspectie_afronden(uuid, text)                      to authenticated;

commit;
