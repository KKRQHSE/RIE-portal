-- ============================================================================
-- De AI-quiz (bedrijf_toolbox_quiz, migratie 0079) ook echt gebruiken in de
-- live toolbox-sessie
-- ----------------------------------------------------------------------------
-- toolbox_afronden_token (0017, laatst herschreven in 0024) las voor de quiz
-- altijd het globale, admin-beheerde centrale_toolbox_vraag-sjabloon. Een
-- door de organisator (KAM/admin) opgeslagen AI-quiz voor dit bedrijf+deze
-- toolbox had dus geen enkel effect op wat een medewerker daadwerkelijk
-- invult -- bewust zo gelaten bij het bouwen van de AI-quiz zelf, nu als
-- expliciete vervolgstap ingehaald.
--
-- Regel: heeft dit bedrijf+toolbox een eigen bedrijf_toolbox_quiz-set, dan
-- geldt UITSLUITEND die (nooit een mix met het globale sjabloon -- anders kan
-- een half-bedrijfsquiz/half-centraal-resultaat ontstaan dat nergens
-- compleet is). Heeft het bedrijf geen eigen set, dan blijft het globale
-- sjabloon gelden zoals voorheen. v_gebruik_bedrijfsquiz kiest dat één keer;
-- de UNION ALL erna laat maar één van de twee takken echt rijen opleveren
-- (de andere is met opzet leeg via de boolean-filter), dus row_number() blijft
-- correct genummerd op de tak die wél telt.
--
-- Verder woordelijk gelijk aan 0024: zelfde signature (dus dezelfde grants
-- blijven staan), zelfde validatie/foutmeldingen, zelfde "eens per jaar"-regel.
-- Bewust anon-aanroepbaar (token-flow, deellink) -- geen REVOKE, zie AGENTS.md.
-- ============================================================================

begin;

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
  v_gebruik_bedrijfsquiz boolean;
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

  -- Eigen AI-quiz (bedrijf_toolbox_quiz) heeft voorrang boven het globale
  -- sjabloon zodra dit bedrijf er één heeft opgeslagen voor deze toolbox.
  select exists (
    select 1 from public.bedrijf_toolbox_quiz
    where company_id = v_company and toolbox_id = p_toolbox_id
  ) into v_gebruik_bedrijfsquiz;

  with q as (
    select (row_number() over (order by volgorde, id))::int - 1 as idx,
           vraagtekst, opties, juist_antwoord, uitleg
    from public.bedrijf_toolbox_quiz
    where company_id = v_company and toolbox_id = p_toolbox_id and v_gebruik_bedrijfsquiz
    union all
    select (row_number() over (order by volgorde, id))::int - 1 as idx,
           vraagtekst, opties, juist_antwoord, uitleg
    from public.centrale_toolbox_vraag
    where toolbox_id = p_toolbox_id and gearchiveerd_op is null and not v_gebruik_bedrijfsquiz
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
