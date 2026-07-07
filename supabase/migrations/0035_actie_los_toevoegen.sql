-- ============================================================================
-- Fase 3 — centrale actielijst: losse actie toevoegen
-- ----------------------------------------------------------------------------
-- pva_items heeft geen INSERT-policy voor klanten (alleen SELECT/UPDATE), dus
-- een "los toegevoegde" actie loopt via deze SECURITY DEFINER-RPC — net als
-- bevinding_naar_actie. Additief en niet-destructief: bestaande acties, hun
-- herkomst en de RI&E-inzage blijven ongemoeid. bron_type = 'los' markeert de
-- herkomst; het volgende vrije nr wordt per bedrijf gegenereerd.
-- ============================================================================

create or replace function public.actie_los_toevoegen(
  p_company_id    uuid,
  p_onderwerp     text,
  p_persoon_id    uuid  default null,
  p_termijn_datum date  default null,
  p_prio          text  default 'Middel'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nr   integer;
  v_prio text;
  v_id   uuid;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if coalesce(btrim(p_onderwerp), '') = '' then
    raise exception 'Onderwerp is verplicht';
  end if;

  v_prio := case when p_prio in ('Hoog', 'Middel', 'Laag') then p_prio else 'Middel' end;

  -- Volgend vrij nummer binnen dit bedrijf (nr is tekst, numeriek gebruikt).
  select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
    into v_nr
    from pva_items
   where company_id = p_company_id;

  insert into pva_items
    (company_id, nr, onderwerp, status, prio, persoon_id, termijn, termijn_datum,
     bron_type, updated_at, updated_by)
  values
    (p_company_id, v_nr::text, btrim(p_onderwerp), 'Open', v_prio, p_persoon_id,
     case when p_termijn_datum is not null then to_char(p_termijn_datum, 'DD-MM-YYYY') else null end,
     p_termijn_datum, 'los', now(), auth.email())
  returning id into v_id;

  return v_id;
end;
$$;

-- Alleen ingelogde gebruikers; de bedrijfscheck zit in de functie zelf.
revoke all     on function public.actie_los_toevoegen(uuid, text, uuid, date, text) from public, anon;
grant  execute on function public.actie_los_toevoegen(uuid, text, uuid, date, text) to authenticated;
