-- Migratie 0042: IF-parameters overschrijven niet meer met null
-- ----------------------------------------------------------------------------
-- 0036 gaf p_if_dit_jaar/p_if_vorig_jaar een `default null` zodat een aanroep met
-- de oude 10 argumenten niet zou stukgaan. Gevolg: zo'n aanroep zette de twee
-- kolommen wél op null — hij wiste stil het IF-getal.
--
-- FIX: in de DO UPDATE coalescen de twee IF-kolommen naar de HUIDIGE waarde.
-- Wordt de parameter niet meegegeven (of als null), dan blijft staan wat er stond.
-- Alle andere kolommen houden bewust hun bestaande overschrijf-gedrag: die worden
-- door het formulier altijd volledig meegestuurd.
--
-- BEWUSTE PRIJS (Kees' keuze): de RPC kan "niet meegegeven" en "bewust gewist"
-- niet uit elkaar houden — beide komen als null binnen. Met deze coalesce is een
-- IF-getal daarom niet meer leeg te maken via het bedrijfsvoering-formulier: het
-- veld leegmaken en opslaan laat de oude waarde staan. Wissen kan alleen nog met
-- een directe update op de tabel. Wil je dat later wél in de UI, dan is een
-- expliciete p_if_wissen-vlag de weg (niet: null als signaal).
--
-- De INSERT-tak blijft ongewijzigd: bij een eerste rij is er geen bestaande
-- waarde om naar te coalescen, dus een null hoort daar gewoon een null te worden.
--
-- Signature identiek aan 0036 → create or replace volstaat, geen drop nodig.
-- Guard, security definer, search_path en de EXECUTE-grants blijven zoals ze zijn.

begin;

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
    -- Niet meegegeven (null) = laat staan wat er stond.
    if_dit_jaar               = coalesce(excluded.if_dit_jaar,   bedrijf_dashboard_instelling.if_dit_jaar),
    if_vorig_jaar             = coalesce(excluded.if_vorig_jaar, bedrijf_dashboard_instelling.if_vorig_jaar),
    updated_at                = now();
end;
$function$;

commit;
