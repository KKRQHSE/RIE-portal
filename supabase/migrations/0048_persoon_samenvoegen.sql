-- Migratie 0048: twee persoon-records samenvoegen (admin)
-- ----------------------------------------------------------------------------
-- Typo's zoals "Jeroen" naast "Jeroen Schweig" zijn dezelfde mens, maar tellen
-- dubbel in dashboards en lijsten. Deze migratie geeft de admin één handeling om
-- ze samen te voegen.
--
-- TWEE SOORTEN GEGEVENS, TWEE REGELS:
--   * de LEVENDE koppeling (persoon_id in inspecties, toolbox-deelnames, acties,
--     herinneringen, doelen, deellinks) schuift mee naar de doel-persoon;
--   * de BEVROREN naam op een ondertekend bewijsstuk (toolbox_deelname.
--     bevestigde_naam, handtekening, de *_snap-kolommen) BLIJFT staan zoals de
--     persoon destijds zelf bevestigde. Een bewijsstuk toont wat er is getekend,
--     niet wat we er later van vinden.
--
-- ONVERANDERLIJKHEID VAN toolbox_deelname. De trigger toolbox_deelname_no_update
-- weigerde tot nu toe ELKE update, onvoorwaardelijk. Voor de merge moet precies
-- één kolom kunnen verschuiven. De trigger wordt daarom verfijnd tot:
--     "alles behalve persoon_id is onveranderlijk"
-- via een vergelijking van to_jsonb(new) - 'persoon_id' met to_jsonb(old) -
-- 'persoon_id'. Bewust GEEN kolomlijst: zo is elke kolom die er later bijkomt
-- automatisch beschermd zonder dat iemand deze trigger moet bijwerken.
-- bevestigde_naam, handtekening en de snapshots zitten in die vergelijking, dus
-- de bevroren tekst kán niet meebewegen.
--
-- Dit verzwakt de garantie niet noemenswaardig: toolbox_deelname heeft alleen een
-- SELECT-policy (geen insert/update/delete-policy), dus een client kan via
-- PostgREST sowieso niet updaten. Alleen SECURITY DEFINER-functies schrijven daar.
-- De trigger krijgt bovendien een extra guard: de nieuwe persoon moet bestaan en
-- bij hetzelfde bedrijf horen als het record.
--
-- BOTSINGEN. Drie plekken hebben een unieke sleutel per persoon:
--   * bedrijf_inspectie_doel  PK (company_id, persoon_id)
--   * deellinks               UNIQUE (persoon_id)
--   * toolbox_deelname        UNIQUE (sessie_id, persoon_id)
--                             UNIQUE (company_id, persoon_id, toolbox_id, jaar)
-- Bij de eerste twee wint de doel-persoon: een jaardoel is niet optelbaar per
-- mens, en een deellink is een deelverwijzing, geen bewijsstuk. Bij de derde —
-- beide namen tekenden bij dezelfde sessie of dezelfde toolbox in hetzelfde jaar
-- — WEIGERT de merge. Dat zijn twee getekende bewijsstukken; verschuiven kan niet
-- (unieke index) en op de bron laten staan kan niet (de FK is ON DELETE CASCADE,
-- dus het bewijs zou bij het verwijderen van de bron verdwijnen). Beslissing 30
-- juli 2026: liever een merge die weigert en precies zegt waaróm, dan een merge
-- die stilzwijgend bewijs weggooit.
--
-- HET BRON-RECORD ZELF. personen.voorgesteld_door is een self-FK met ON DELETE
-- SET NULL: had de bron iemand voorgesteld, dan verdwijnt dat spoor bij het
-- verwijderen — dus dat verschuift ook. De gegevens óp het bron-record (e-mail,
-- functiegroep, dienstdata, login-koppeling) vullen na afloop alleen de LEGE
-- velden van de doel-persoon aan; eigen gegevens worden nooit overschreven. Dat
-- aanvullen gebeurt na de delete, want personen heeft UNIQUE (company_id, email).
--
-- VERWIJDEREND. personen_samenvoegen verwijdert de bron-persoon definitief en is
-- niet terug te draaien. Daarom: admin-only (is_admin(), dus ook de KAM van het
-- eigen bedrijf mag dit niet), alles in één transactie, en een merge-logregel met
-- wie/wanneer/welke namen/hoeveel verschoven — een onomkeerbare handeling hoort
-- een spoor achter te laten.
--
-- Guards null-veilig, anon-EXECUTE expliciet eruit (Beslissing 62).

begin;

-- ----------------------------------------------------------------------------
-- 1. De onveranderlijkheidstrigger verfijnen.
-- ----------------------------------------------------------------------------
create or replace function public.toolbox_deelname_immutable()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_company uuid;
begin
  -- Alles behalve persoon_id moet identiek blijven. Kolomlijst-vrij, dus
  -- toekomstige kolommen zijn automatisch beschermd.
  if to_jsonb(new) - 'persoon_id' is distinct from to_jsonb(old) - 'persoon_id' then
    raise exception 'Een afgerond toolbox-record is onveranderlijk';
  end if;

  -- Alleen de koppeling mag verschuiven, en uitsluitend binnen hetzelfde bedrijf.
  if new.persoon_id is null then
    raise exception 'Een afgerond toolbox-record heeft altijd een persoon';
  end if;
  if new.persoon_id is distinct from old.persoon_id then
    select company_id into v_company from personen where id = new.persoon_id;
    if v_company is null then
      raise exception 'Persoon niet gevonden';
    end if;
    if v_company <> old.company_id then
      raise exception 'Persoon hoort niet bij dit bedrijf';
    end if;
  end if;

  return new;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. Merge-logboek. Bewaart de namen als TEKST: de bron-persoon bestaat na afloop
--    niet meer, dus een verwijzing zou nergens meer heen wijzen.
-- ----------------------------------------------------------------------------
create table if not exists public.persoon_merge_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  doel_id        uuid,
  doel_naam      text not null,
  bron_naam      text not null,
  verschoven     jsonb not null default '{}'::jsonb,
  wie            uuid,
  wanneer        timestamptz not null default now()
);

create index if not exists persoon_merge_log_company_idx
  on public.persoon_merge_log (company_id, wanneer desc);

alter table public.persoon_merge_log enable row level security;

-- Lezen: de admin (systeembeheer) en de beheerder van het eigen bedrijf.
drop policy if exists persoon_merge_log_sel on public.persoon_merge_log;
create policy persoon_merge_log_sel on public.persoon_merge_log
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- Schrijven kan uitsluitend via de RPC hieronder: geen insert/update/delete-policy.


-- ----------------------------------------------------------------------------
-- 3. Interne helper: haalt beide personen op, controleert ze en levert het
--    bedrijf terug. Eén plek voor de guards, zodat voorbeeld en uitvoering
--    onmogelijk uit elkaar kunnen lopen.
-- ----------------------------------------------------------------------------
create or replace function public.persoon_merge_context(
  p_doel_id uuid,
  p_bron_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_doel record;
  v_bron record;
begin
  -- Admin-only: samenvoegen is onomkeerbaar en raakt bewijsstukken, dus dit is
  -- systeembeheer. Een KAM van het eigen bedrijf mag het bewust niet.
  if not is_admin() then
    raise exception 'Alleen een beheerder mag personen samenvoegen';
  end if;
  if p_doel_id is null or p_bron_id is null then
    raise exception 'Doel- en bron-persoon zijn verplicht';
  end if;
  if p_doel_id = p_bron_id then
    raise exception 'Doel- en bron-persoon zijn dezelfde';
  end if;

  select id, company_id, naam into v_doel from personen where id = p_doel_id;
  select id, company_id, naam into v_bron from personen where id = p_bron_id;
  if v_doel.id is null then raise exception 'Doel-persoon niet gevonden'; end if;
  if v_bron.id is null then raise exception 'Bron-persoon niet gevonden'; end if;

  -- Cross-company-guard: samenvoegen kan alleen binnen één bedrijf.
  if v_doel.company_id <> v_bron.company_id then
    raise exception 'Personen horen niet bij hetzelfde bedrijf';
  end if;

  return v_doel.company_id;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 4. Voorbeeld: wat zou er gebeuren? Read-only, voedt het bevestigingsscherm.
--    Levert per soort de aantallen die verschuiven, hoeveel bewijsstukken hun
--    bevroren naam houden, en de botsingen die de merge zouden blokkeren.
-- ----------------------------------------------------------------------------
create or replace function public.personen_merge_voorbeeld(
  p_doel_id uuid,
  p_bron_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company    uuid;
  v_botsingen  jsonb;
begin
  v_company := persoon_merge_context(p_doel_id, p_bron_id);

  -- Botsende bewijsstukken: dezelfde sessie, of dezelfde toolbox in hetzelfde
  -- jaar. Beide records zijn getekend; die kunnen niet samen op één persoon.
  select coalesce(jsonb_agg(x order by x->>'omschrijving'), '[]'::jsonb) into v_botsingen
    from (
      select jsonb_build_object(
               'soort', 'sessie',
               'omschrijving', coalesce(s.onderwerp, 'toolbox-sessie') ||
                               coalesce(' (' || to_char(s.datum, 'DD-MM-YYYY') || ')', '')
             ) as x
        from toolbox_deelname bron
        join toolbox_deelname doel
          on doel.persoon_id = p_doel_id and doel.sessie_id = bron.sessie_id
        left join toolbox_sessie s on s.id = bron.sessie_id
       where bron.persoon_id = p_bron_id and bron.sessie_id is not null

      union all

      select jsonb_build_object(
               'soort', 'toolbox',
               'omschrijving', bron.titel_snap || ' (' || jaar_utc(bron.afgerond_op)::text || ')'
             )
        from toolbox_deelname bron
        join toolbox_deelname doel
          on doel.persoon_id = p_doel_id
         and doel.company_id = bron.company_id
         and doel.toolbox_id = bron.toolbox_id
         and jaar_utc(doel.afgerond_op) = jaar_utc(bron.afgerond_op)
       where bron.persoon_id = p_bron_id and bron.toolbox_id is not null
    ) botsing;

  return jsonb_build_object(
    'company_id',      v_company,
    'doel_naam',       (select naam from personen where id = p_doel_id),
    'bron_naam',       (select naam from personen where id = p_bron_id),
    'inspecties',      (select count(*) from inspectie        where persoon_id = p_bron_id),
    'acties',          (select count(*) from pva_items        where persoon_id = p_bron_id),
    'herinneringen',   (select count(*) from herinnering_log  where persoon_id = p_bron_id),
    'toolbox',         (select count(*) from toolbox_deelname where persoon_id = p_bron_id),
    -- Elk toolbox-record is een bewijsstuk dat zijn bevroren naam houdt.
    'bewijsstukken',   (select count(*) from toolbox_deelname where persoon_id = p_bron_id),
    'inspectie_doel',  (select count(*) from bedrijf_inspectie_doel where persoon_id = p_bron_id),
    'deellink',        (select count(*) from deellinks        where persoon_id = p_bron_id),
    -- Botst het doel/de deellink? Dan vervalt die van de bron i.p.v. te verschuiven.
    'doel_botst',      exists (select 1 from bedrijf_inspectie_doel where persoon_id = p_doel_id)
                       and exists (select 1 from bedrijf_inspectie_doel where persoon_id = p_bron_id),
    'deellink_botst',  exists (select 1 from deellinks where persoon_id = p_doel_id)
                       and exists (select 1 from deellinks where persoon_id = p_bron_id),
    'botsingen',       v_botsingen
  );
end;
$function$;


-- ----------------------------------------------------------------------------
-- 5. De merge zelf. Verschuift alle levende koppelingen, verwijdert de bron en
--    logt wat er gebeurd is. Eén transactie: of alles, of niets.
-- ----------------------------------------------------------------------------
create or replace function public.personen_samenvoegen(
  p_doel_id uuid,
  p_bron_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- Zelfde controle als het bevestigingsscherm zag. Een merge die daar mocht,
  -- kan hier alsnog weigeren als er intussen iets is bijgekomen.
  v_voorbeeld := personen_merge_voorbeeld(p_doel_id, p_bron_id);
  if jsonb_array_length(v_voorbeeld->'botsingen') > 0 then
    raise exception 'Samenvoegen kan niet: beide personen hebben getekend bij %',
      (select string_agg(b->>'omschrijving', ', ')
         from jsonb_array_elements(v_voorbeeld->'botsingen') b);
  end if;

  select naam into v_doel_naam from personen where id = p_doel_id;
  -- De gegevens op het bron-record zelf (e-mail, functiegroep, dienstdata,
  -- logins) alvast bewaren: na de delete zijn ze niet meer op te halen.
  select naam, email, functiegroep_id, datum_in_dienst, datum_uit_dienst, user_id
    into v_bron from personen where id = p_bron_id;
  v_bron_naam := v_bron.naam;

  -- Levende koppelingen zonder unieke sleutel: gewoon verschuiven.
  update inspectie       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_inspecties = row_count;
  update pva_items       set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_acties = row_count;
  update herinnering_log set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_herinner = row_count;

  -- Bewijsstukken: alleen de koppeling schuift op. bevestigde_naam, handtekening
  -- en de snapshots blijven ongemoeid — de trigger bewaakt dat.
  update toolbox_deelname set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_toolbox = row_count;

  -- Inspectiedoel: PK (company_id, persoon_id). Heeft de doel-persoon er al een,
  -- dan houdt hij die; anders schuift het doel van de bron mee.
  delete from bedrijf_inspectie_doel
   where persoon_id = p_bron_id
     and exists (select 1 from bedrijf_inspectie_doel d
                  where d.company_id = v_company and d.persoon_id = p_doel_id);
  update bedrijf_inspectie_doel set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_doel = row_count;

  -- Deellink: UNIQUE (persoon_id). Zelfde regel; een deellink is een
  -- deelverwijzing, geen bewijsstuk, dus die van de bron mag vervallen.
  delete from deellinks
   where persoon_id = p_bron_id
     and exists (select 1 from deellinks d where d.persoon_id = p_doel_id);
  update deellinks set persoon_id = p_doel_id where persoon_id = p_bron_id;
  get diagnostics n_deellink = row_count;

  -- personen.voorgesteld_door is een self-FK met ON DELETE SET NULL: had de bron
  -- iemand voorgesteld, dan zou dat spoor bij het verwijderen verdwijnen.
  update personen set voorgesteld_door = p_doel_id where voorgesteld_door = p_bron_id;

  v_verschoven := jsonb_build_object(
    'inspecties', n_inspecties, 'acties', n_acties, 'herinneringen', n_herinner,
    'toolbox', n_toolbox, 'inspectie_doel', n_doel, 'deellink', n_deellink
  );

  -- Logregel vóór het verwijderen: na de delete is de bron-naam nergens meer te
  -- halen. doel_id blijft bestaan, dus die mag als verwijzing mee.
  insert into public.persoon_merge_log (company_id, doel_id, doel_naam, bron_naam, verschoven, wie)
  values (v_company, p_doel_id, v_doel_naam, v_bron_naam, v_verschoven, auth.uid());

  -- De bron verdwijnt. Alles wat nog naar hem wees is hierboven verschoven; wat
  -- resteert (niets) zou casceren, en dat willen we juist weten als het misgaat.
  delete from personen where id = p_bron_id;

  -- Pas NA de delete de lege velden van de doel-persoon aanvullen uit de bron:
  -- personen heeft UNIQUE (company_id, email), dus het e-mailadres overnemen kan
  -- niet zolang de bron nog bestaat. coalesce, dus eigen gegevens van de
  -- doel-persoon worden nooit overschreven — alleen gaten gevuld.
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


-- ----------------------------------------------------------------------------
-- 6. Rechten. `revoke from public` alleen is niet genoeg: Supabase kent via
--    default privileges EXECUTE toe aan anon én authenticated, en die grants
--    overleven een revoke van PUBLIC. Expliciet intrekken dus (Beslissing 62).
-- ----------------------------------------------------------------------------

-- Interne helper: voor niemand aanroepbaar behalve de owner via de functies
-- hierboven, plus service_role.
revoke execute on function public.persoon_merge_context(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.persoon_merge_context(uuid, uuid) to service_role;

revoke execute on function public.personen_merge_voorbeeld(uuid, uuid) from public, anon;
grant  execute on function public.personen_merge_voorbeeld(uuid, uuid) to authenticated, service_role;
revoke execute on function public.personen_samenvoegen(uuid, uuid) from public, anon;
grant  execute on function public.personen_samenvoegen(uuid, uuid) to authenticated, service_role;

commit;
