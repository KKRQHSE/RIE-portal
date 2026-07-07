-- Migratie 0036: IF-getal (Incident Frequency) op het klant-dashboard
-- ----------------------------------------------------------------------------
-- Twee handmatige velden erbij op bedrijf_dashboard_instelling: het IF-getal
-- voor dit jaar en vorig jaar. Puur invoer (geen berekening). Additief:
--   - twee nullable kolommen;
--   - dashboard_instelling_zetten krijgt twee extra params (achteraan, default
--     null → een nog-niet-gedeployde frontend die 10 args stuurt blijft werken);
--   - dashboard_overzicht.instellingen krijgt de twee sleutels erbij.
-- De signature-wijziging van de zetter vereist drop + create (functie, geen
-- data). anon-EXECUTE blijft eruit (Beslissing 62).

begin;

alter table public.bedrijf_dashboard_instelling
  add column if not exists if_dit_jaar   numeric(6,2),
  add column if not exists if_vorig_jaar numeric(6,2);

drop function if exists public.dashboard_instelling_zetten(
  uuid, integer, numeric, text, integer, integer, text, text, text, text);

create or replace function public.dashboard_instelling_zetten(
  p_company_id                uuid,
  p_klachten_aantal           integer,
  p_tevredenheid_score        numeric,
  p_tevredenheid_toelichting  text,
  p_audit_intern_gedaan       integer,
  p_audit_intern_totaal       integer,
  p_audit_extern_omschrijving text,
  p_audit_status              text,
  p_doelstelling_tekst        text,
  p_iso_taken_tekst           text,
  p_if_dit_jaar               numeric default null,
  p_if_vorig_jaar             numeric default null
)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  if coalesce(p_klachten_aantal, 0) < 0 then raise exception 'Aantal klachten mag niet negatief zijn'; end if;
  if coalesce(p_audit_intern_gedaan, 0) < 0 or coalesce(p_audit_intern_totaal, 0) < 0 then
    raise exception 'Audit-aantallen mogen niet negatief zijn';
  end if;

  insert into bedrijf_dashboard_instelling (
    company_id, klachten_aantal, tevredenheid_score, tevredenheid_toelichting,
    audit_intern_gedaan, audit_intern_totaal, audit_extern_omschrijving, audit_status,
    doelstelling_tekst, iso_taken_tekst, if_dit_jaar, if_vorig_jaar, updated_at
  ) values (
    p_company_id, coalesce(p_klachten_aantal, 0), p_tevredenheid_score, nullif(btrim(coalesce(p_tevredenheid_toelichting, '')), ''),
    coalesce(p_audit_intern_gedaan, 0), coalesce(p_audit_intern_totaal, 0),
    nullif(btrim(coalesce(p_audit_extern_omschrijving, '')), ''), nullif(btrim(coalesce(p_audit_status, '')), ''),
    nullif(btrim(coalesce(p_doelstelling_tekst, '')), ''), nullif(btrim(coalesce(p_iso_taken_tekst, '')), ''),
    p_if_dit_jaar, p_if_vorig_jaar, now()
  )
  on conflict (company_id) do update set
    klachten_aantal           = excluded.klachten_aantal,
    tevredenheid_score        = excluded.tevredenheid_score,
    tevredenheid_toelichting  = excluded.tevredenheid_toelichting,
    audit_intern_gedaan       = excluded.audit_intern_gedaan,
    audit_intern_totaal       = excluded.audit_intern_totaal,
    audit_extern_omschrijving = excluded.audit_extern_omschrijving,
    audit_status              = excluded.audit_status,
    doelstelling_tekst        = excluded.doelstelling_tekst,
    iso_taken_tekst           = excluded.iso_taken_tekst,
    if_dit_jaar               = excluded.if_dit_jaar,
    if_vorig_jaar             = excluded.if_vorig_jaar,
    updated_at                = now();
end;
$function$;

revoke execute on function public.dashboard_instelling_zetten(
  uuid, integer, numeric, text, integer, integer, text, text, text, text, numeric, numeric) from public;
grant execute on function public.dashboard_instelling_zetten(
  uuid, integer, numeric, text, integer, integer, text, text, text, text, numeric, numeric) to authenticated, service_role;

-- Het dashboard leest de twee IF-velden via een kleine directe select op de
-- tabel (RLS: eigen-bedrijf-select); dashboard_overzicht blijft ongewijzigd.

commit;
