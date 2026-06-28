-- Migratie 0024: één afgeronde toolbox-deelname per persoon × toolbox × jaar
-- ----------------------------------------------------------------------------
-- Bug: toolbox_afronden_token blokkeerde een tweede inzending niet → meerdere
-- bewijsstukken voor dezelfde toolbox + dubbele telling. REGEL: één afgeronde
-- deelname per (company, persoon, toolbox, kalenderjaar). Een nieuw kalenderjaar
-- mag wél opnieuw (toolboxen worden jaarlijks herhaald).
--
-- Dubbele laag (zoals de andere bewijsgaranties):
--   a. DB: unieke PARTIËLE index — zelfs een directe/dubbele insert kan geen
--      tweede record maken. Partieel op `toolbox_id is not null`: een record
--      waarvan de centrale toolbox later verdween (ON DELETE SET NULL → null)
--      blokkeert geen nieuwe afronding; de regel geldt voor een bestaande toolbox.
--   b. RPC: toolbox_afronden_token checkt vooraf en weigert met een nette fout.
--
-- Jaar deterministisch via jaar_utc() (IMMUTABLE, nodig voor een index-expressie;
-- de DB-tijdzone is UTC, dus dit komt overeen met de bestaande extract(year ...)).
-- Additief; idempotent. De bestaande dubbelen op Alpha zijn vooraf opgeschoond.

begin;

-- Deterministische jaar-bepaling (UTC is vast → veilig IMMUTABLE).
create or replace function public.jaar_utc(p_ts timestamptz)
 returns integer language sql immutable
as $function$
  select extract(year from (p_ts at time zone 'UTC'))::int
$function$;

-- DB-laag: hooguit één afgeronde, GEKOPPELDE deelname per persoon/toolbox/jaar.
create unique index if not exists toolbox_deelname_uniek_per_jaar
  on public.toolbox_deelname (company_id, persoon_id, toolbox_id, public.jaar_utc(afgerond_op))
  where toolbox_id is not null;

-- RPC-laag: nette weigering vóór de insert (i.p.v. een ruwe constraint-error).
create or replace function public.toolbox_afronden_token(
  p_token text,
  p_toolbox_id uuid,
  p_video_bekeken boolean,
  p_quiz_antwoorden jsonb,
  p_naam_bevestigd boolean,
  p_handtekening text
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_link    public.deellinks;
  v_persoon public.personen;
  v_company uuid;
  v_t       record;
  v_titel   text; v_tekst text; v_video text;
  v_totaal  integer; v_score integer; v_pct integer; v_gehaald boolean;
  v_quiz_snap jsonb; v_resultaat jsonb;
  v_id uuid;
begin
  select * into v_link from public.deellinks where token = p_token;
  if v_link.id is null or v_link.ingetrokken then raise exception 'Ongeldige of ingetrokken link'; end if;
  if v_link.vervalt_op is not null and v_link.vervalt_op < now() then raise exception 'Link is verlopen'; end if;
  select * into v_persoon from public.personen where id = v_link.persoon_id;
  if v_persoon.id is null or v_persoon.archived_at is not null then raise exception 'Persoon niet gevonden'; end if;
  v_company := v_persoon.company_id;

  if not coalesce(p_naam_bevestigd, false) then
    raise exception 'Naam niet bevestigd — er kan geen bewijs worden vastgelegd';
  end if;
  if p_handtekening is null or btrim(p_handtekening) = '' then
    raise exception 'Handtekening ontbreekt';
  end if;

  -- Eén afronding per toolbox per kalenderjaar: weiger een tweede netjes.
  if exists (
    select 1 from public.toolbox_deelname d
    where d.persoon_id = v_persoon.id
      and d.toolbox_id = p_toolbox_id
      and public.jaar_utc(d.afgerond_op) = public.jaar_utc(now())
  ) then
    raise exception 'Deze toolbox is dit jaar al afgerond';
  end if;

  select t.*, a.modus as afw_modus, a.lokale_titel, a.lokale_tekst, a.lokale_video_url
    into v_t
  from public.bedrijf_toolbox bt
  join public.centrale_toolbox t on t.id = bt.toolbox_id
  left join public.bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = v_company
  where bt.company_id = v_company and t.id = p_toolbox_id
    and t.toegang = 'link'
    and coalesce(a.modus,'') <> 'uit'
    and (t.gearchiveerd_op is null or a.modus = 'lokaal');
  if v_t.id is null then raise exception 'Toolbox niet beschikbaar voor jou'; end if;

  v_titel := case when v_t.afw_modus='lokaal' and v_t.lokale_titel is not null then v_t.lokale_titel else v_t.titel end;
  v_tekst := case when v_t.afw_modus='lokaal' then v_t.lokale_tekst else v_t.tekst end;
  v_video := case when v_t.afw_modus='lokaal' and v_t.lokale_video_url is not null then v_t.lokale_video_url else v_t.video_url end;

  with q as (
    select (row_number() over (order by volgorde, id))::int - 1 as idx,
           vraagtekst, opties, juist_antwoord, uitleg
    from public.centrale_toolbox_vraag
    where toolbox_id = p_toolbox_id and gearchiveerd_op is null
  )
  select count(*)::int,
         count(*) filter (where (p_quiz_antwoorden ->> idx)::int = juist_antwoord)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'vraagtekst', vraagtekst, 'opties', opties, 'juist_antwoord', juist_antwoord,
           'uitleg', uitleg, 'gekozen', (p_quiz_antwoorden ->> idx)::int
         ) order by idx), '[]'::jsonb)
    into v_totaal, v_score, v_quiz_snap
  from q;

  if v_totaal > 0 then
    v_pct := round(100.0 * v_score / v_totaal);
    v_gehaald := v_pct >= v_t.quiz_slaaggrens;
    v_resultaat := jsonb_build_object('score', v_score, 'totaal', v_totaal, 'pct', v_pct, 'gehaald', v_gehaald);
  else
    v_resultaat := null;
  end if;

  if v_t.vereist_video and not coalesce(p_video_bekeken, false) then
    raise exception 'De video moet bekeken zijn om af te ronden';
  end if;
  if v_t.vereist_quiz and v_totaal > 0 and not coalesce(v_gehaald, false) then
    raise exception 'De quiz is niet gehaald';
  end if;

  insert into public.toolbox_deelname (
    company_id, persoon_id, toolbox_id, bewijssoort,
    titel_snap, tekst_snap, video_url_snap, quiz_snap,
    afgerond_op, video_bekeken, quiz_resultaat,
    naam_bevestigd, bevestigde_naam, handtekening, handtekening_gezet_op
  ) values (
    v_company, v_persoon.id, p_toolbox_id, 'digitaal',
    v_titel, coalesce(v_tekst,''), v_video, v_quiz_snap,
    now(), coalesce(p_video_bekeken,false), v_resultaat,
    true, v_persoon.naam, p_handtekening, now()
  ) returning id into v_id;

  return v_id;
end;
$function$;

-- Token-RPC blijft bewust anon-toegankelijk (werknemer-flow); guard zit in het token.
grant execute on function public.toolbox_afronden_token(text, uuid, boolean, jsonb, boolean, text) to anon, authenticated, service_role;

commit;
