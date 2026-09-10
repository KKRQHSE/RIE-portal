-- Migratie 0086: beschikbare talen per bedrijf
-- ----------------------------------------------------------------------------
-- De NL/TR-vlaggentoggle op de werknemer-facing schermen (/tb, /melden, de
-- inspectie-invulschermen) stond tot nu toe hardcoded aan voor elk bedrijf.
-- SeysCentra heeft geen Turkse medewerkers en wil de TR-optie niet tonen;
-- Dutch Waste wil hem wel houden. Zelfde patroon als `oefenomgeving`
-- (migratie 0078): één losse, additieve kolom op companies.
--
-- NULL = geen expliciete instelling = huidig gedrag (NL + TR, zoals nu overal
-- het geval is). Alleen een bedrijf met een EXPLICIETE rij wijkt af -- geen
-- regressie voor een bestaand of toekomstig bedrijf zonder rij.
--
-- Attribuut, geen rechtenlaag: de CHECK begrenst de waarden tot de talen die
-- de UI kent (lib/i18n-werknemer.ts TALEN); wie mag wijzigen loopt via de
-- bestaande companies_admin_update RLS-policy (is_admin()), niets nieuws.
-- Geen nieuwe functie in deze migratie -> geen REVOKE-regel nodig (zie
-- AGENTS.md). De twee bestaande token-RPC's hieronder krijgen alleen een
-- CREATE OR REPLACE (zelfde signatuur, zelfde SECURITY DEFINER, zelfde
-- eigenaar) -- Postgres behoudt de bestaande ACL bij REPLACE, dus ook daar
-- is geen REVOKE nodig.
-- ============================================================================

begin;

alter table public.companies
  add column if not exists beschikbare_talen text[];

alter table public.companies
  add constraint companies_beschikbare_talen_check
  check (beschikbare_talen is null or beschikbare_talen <@ array['nl', 'tr']::text[]);

comment on column public.companies.beschikbare_talen is
  'Welke taalopties de NL/TR-vlaggentoggle toont op werknemer-facing schermen. NULL = geen instelling = alle talen (huidig gedrag, geen regressie).';

-- SeysCentra: alleen Nederlands, geen Turkse medewerkers.
update public.companies
  set beschikbare_talen = array['nl']
  where name = 'SeysCentra B.V.';

-- Dutch Waste (echt bedrijf + de oefenomgeving-kloon): Nederlands + Turks,
-- expliciet gezet zodat dit onafhankelijk blijft van een eventuele latere
-- wijziging van de default.
update public.companies
  set beschikbare_talen = array['nl', 'tr']
  where name in ('Dutch Waste Collectors & Cleaning', 'Dutch Waste Inspectie en Toolbox');

-- De twee token-RPC's geven de bedrijfsnaam al terug; ze geven er nu ook
-- beschikbare_talen bij, zodat de gast-pagina's (/tb, /melden) de toggle
-- kunnen filteren vóórdat er ingelogd is. Verder ongewijzigd.
CREATE OR REPLACE FUNCTION public.toolbox_voor_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.deellinks;
  v_persoon public.personen;
  v_company uuid;
  v_jaar    integer;
  v_list    jsonb;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then return null; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then return null; end if;
  select * into v_persoon from public.personen where id = v_link.persoon_id;
  if v_persoon.id is null or v_persoon.archived_at is not null then return null; end if;
  v_company := v_persoon.company_id;
  v_jaar := extract(year from now())::int;

  select coalesce(jsonb_agg(row order by volg, tid), '[]'::jsonb) into v_list
  from (
    select t.volgorde as volg, t.id as tid, jsonb_build_object(
      'toolbox_id', t.id,
      'titel', case when a.modus='lokaal' and a.lokale_titel is not null then a.lokale_titel else t.titel end,
      'tekst', case when a.modus='lokaal' then a.lokale_tekst else t.tekst end,
      'video_url', case when a.modus='lokaal' and a.lokale_video_url is not null then a.lokale_video_url else t.video_url end,
      'vereist_video', t.vereist_video,
      'vereist_quiz', t.vereist_quiz,
      'quiz_slaaggrens', t.quiz_slaaggrens,
      'quiz_uitleg_modus', t.quiz_uitleg_modus,
      'vragen', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'vraagtekst', q.vraagtekst, 'opties', q.opties,
          'juist_antwoord', q.juist_antwoord, 'uitleg', q.uitleg
        ) order by q.volgorde, q.id), '[]'::jsonb)
        from public.centrale_toolbox_vraag q
        where q.toolbox_id = t.id and q.gearchiveerd_op is null
      ),
      'afgerond_dit_jaar', exists (
        select 1 from public.toolbox_deelname d
        where d.persoon_id = v_persoon.id and d.toolbox_id = t.id
          and extract(year from d.afgerond_op)::int = v_jaar
      )
    ) as row
    from public.bedrijf_toolbox bt
    join public.centrale_toolbox t on t.id = bt.toolbox_id
    left join public.bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = v_company
    where bt.company_id = v_company
      and t.toegang = 'link'
      and coalesce(a.modus,'') <> 'uit'
      and (t.gearchiveerd_op is null or a.modus = 'lokaal')
  ) s;

  return jsonb_build_object(
    'persoon',   jsonb_build_object('id', v_persoon.id, 'naam', v_persoon.naam),
    'bedrijf',   (select name from public.companies where id = v_company),
    'beschikbare_talen', (select beschikbare_talen from public.companies where id = v_company),
    'huisstijl', public.huisstijl_van_bedrijf(v_company),
    'toolboxen', v_list
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.incident_meldcontext_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link    public.incident_meldlink;
  v_company uuid;
begin
  select * into v_link from public.incident_meldlink where token = p_token;
  if v_link.company_id is null or v_link.ingetrokken then return null; end if;
  v_company := v_link.company_id;

  return jsonb_build_object(
    'bedrijf',      (select name from public.companies where id = v_company),
    'beschikbare_talen', (select beschikbare_talen from public.companies where id = v_company),
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

commit;
