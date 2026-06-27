-- Migratie 0017: werknemer volgt toolbox via persoonlijke deellink (token)
-- ----------------------------------------------------------------------------
-- De werknemer komt binnen via zijn PERSOONLIJKE token (deellinks), net als de
-- gast-inspectie. De token-RPC's leiden persoon + bedrijf server-side af; een
-- werknemer kan dus ALLEEN zijn eigen deelname afronden, voor een gekoppelde
-- toolbox met toegang='link'. Het afgeronde record is onveranderlijk (trigger 0015).
-- Additief; idempotent.

begin;

-- Wat de werknemer mag zien/doen: persoon, bedrijf, huisstijl, en zijn geldende
-- (gekoppelde, niet-uitgezette, link-toegankelijke) toolboxen met quiz en of hij ze
-- dit kalenderjaar al aantoonbaar deed.
create or replace function public.toolbox_voor_token(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
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
    'huisstijl', public.huisstijl_van_bedrijf(v_company),
    'toolboxen', v_list
  );
end;
$function$;

-- Afronden: maakt het ONVERANDERLIJKE bewijsrecord. Bevestigde naam = de naam uit
-- het token (server-side bevroren, nooit van de client). Telt-mee wordt afgedwongen.
create or replace function public.toolbox_afronden_token(
  p_token text,
  p_toolbox_id uuid,
  p_video_bekeken boolean,
  p_quiz_antwoorden jsonb,        -- array van gekozen optie-indexen, op vraagvolgorde
  p_naam_bevestigd boolean,
  p_handtekening text             -- base64 data-URL van de canvas-handtekening
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

  -- Geen handtekening onder een weersproken naam.
  if not coalesce(p_naam_bevestigd, false) then
    raise exception 'Naam niet bevestigd — er kan geen bewijs worden vastgelegd';
  end if;
  if p_handtekening is null or btrim(p_handtekening) = '' then
    raise exception 'Handtekening ontbreekt';
  end if;

  -- Geldende toolbox (gekoppeld, niet uit, link-toegang, evt. lokaal i.p.v. archief).
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

  -- Quiz server-side nakijken (nooit de client-score vertrouwen) + snapshot opbouwen.
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
    v_resultaat := null;  -- geen quiz
  end if;

  -- Telt-mee afdwingen.
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

grant execute on function public.toolbox_voor_token(text) to anon, authenticated, service_role;
grant execute on function public.toolbox_afronden_token(text, uuid, boolean, jsonb, boolean, text) to anon, authenticated, service_role;

commit;
