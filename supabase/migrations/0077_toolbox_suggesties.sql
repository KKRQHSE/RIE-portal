-- Migratie 0077: toolbox-suggesties -- "aanbevolen toolboxen deze periode"
-- ----------------------------------------------------------------------------
-- Bovenaan de toolboxmodule krijgt de uitvoerder een blok met aanbevolen
-- toolbox-onderwerpen + REDEN, afgeleid uit de eigen data van het bedrijf. Het
-- systeem beslist niets -- dit is een leesfunctie die een voorstel teruggeeft;
-- de uitvoerder kiest zelf of hij een sessie start of een bron opent.
--
-- BASIS (deze migratie, geen AI): koppel op trefwoord tussen een vaste,
-- admin-beheerde onderwerpen-taxonomie (§1) en drie bronnen van eigen data:
--   - RI&E-hoofdrisico's: modules met minstens één 'Nee'-antwoord (§2, RPC).
--   - Recente inspectiebevindingen die niet in orde zijn EN nog niet zijn
--     afgehandeld (resultaat/afhandeling), laatste 6 maanden.
--   - Incidenten met gevolg letsel/ongeval-zonder-verzuim, laatste 12 maanden
--     -- gematcht via de VASTE oorzaak-vocabulaire
--     (incident_directe_oorzaak/incident_basis_oorzaak), NOOIT via
--     incident.omschrijving (vrije tekst, kan gevoelige/herleidbare details
--     bevatten).
-- Elk gevonden onderwerp wordt vervolgens gematcht tegen (a) de toolboxen die
-- dit bedrijf al gekoppeld heeft (bedrijf_toolbox) -- dat kan de uitvoerder
-- ook echt meteen starten -- en, alleen als daar niets bij past, (b) de
-- centrale onderwerpenbibliotheek (toolbox_bron, 0043: Heijmans/BAM/
-- Arboportaal/SSVV e.d.). Geen match op beide (heeft_match = false) is het
-- signaal voor de optionele AI-aanvulling (lib/ai/leverancier.ts,
-- app/api/toolbox/onderwerp-advies) -- die verzint geen toolbox-inhoud, alleen
-- een korte duiding + welke externe bronnen te raadplegen.
--
-- Isolatie: guard mag_bedrijf_werken (KAM/admin/teamleider van het EIGEN
-- bedrijf) -- zelfde poort als toolbox_sessies_overzicht/incident_overzicht:
-- dit is content die de uitvoerder ook mag zien, hij moet immers zelf kunnen
-- kiezen. toolbox_onderwerp/centrale_toolbox/toolbox_bron zijn centraal, geen
-- company_id nodig.
--
-- Additief; idempotent.

begin;

-- ============================================================
-- 1. Onderwerpen-taxonomie -- vast, admin-beheerd vocabulaire, zelfde patroon
--    als incident_gevolg_soort/incident_directe_oorzaak (0025): geseed, geen
--    apart beheerscherm/RPC in deze v1 (kan later toegevoegd worden zonder dat
--    dit iets breekt). trefwoorden zijn losse woorden/zinsdelen, ILIKE
--    '%kw%' -- bewust ruim genoeg gekozen om overlap te vinden, maar niet zo
--    kort dat ze toevallig in onverwante tekst matchen (dus 'vallen', niet
--    'val').
-- ============================================================
create table if not exists public.toolbox_onderwerp (
  code        text primary key,
  naam        text not null,
  trefwoorden text[] not null default '{}',
  volgorde    integer not null default 0
);

alter table public.toolbox_onderwerp enable row level security;

drop policy if exists toolbox_onderwerp_sel on public.toolbox_onderwerp;
create policy toolbox_onderwerp_sel on public.toolbox_onderwerp
  as permissive for select to public using (auth.uid() is not null);
drop policy if exists toolbox_onderwerp_adm on public.toolbox_onderwerp;
create policy toolbox_onderwerp_adm on public.toolbox_onderwerp
  as permissive for all to public using (is_admin()) with check (is_admin());

insert into public.toolbox_onderwerp (code, naam, trefwoorden, volgorde) values
  ('werken_op_hoogte',        'Werken op hoogte',                  array['hoogte','ladder','steiger','dakwerk','valbeveiliging'], 10),
  ('vallen_struikelen',       'Vallen, struikelen, uitglijden',    array['struikelen','uitglijden','gladheid','orde en netheid'], 20),
  ('tillen_fysieke_belasting','Tillen en fysieke belasting',       array['tillen','optillen','fysieke belasting','lichamelijke belasting'], 30),
  ('pbm',                     'Persoonlijke beschermingsmiddelen', array['pbm','beschermingsmiddel','veiligheidsschoenen','gehoorbescherming'], 40),
  ('machineveiligheid',       'Machineveiligheid',                 array['machineveiligheid','bewegende delen','beknelling','afscherming'], 50),
  ('elektra',                 'Elektrische veiligheid',            array['elektra','elektrisch','kortsluiting'], 60),
  ('gevaarlijke_stoffen',     'Gevaarlijke stoffen',               array['gevaarlijke stof','gevaarlijke stoffen','chemisch','oplosmiddel','asbest'], 70),
  ('brand_explosie',          'Brand- en explosiegevaar',          array['brandgevaar','explosiegevaar','ontploffing'], 80),
  ('transport_verkeer',       'Transport en verkeer',              array['transport','verkeersveiligheid','heftruck','bedrijfsvoertuig'], 90),
  ('hijsen_heffen',           'Hijsen en heffen',                  array['hijsen','hefwerktuig','kraan','takel'], 100),
  ('werkdruk_stress',         'Werkdruk en mentale belasting',     array['werkdruk','mentale belasting','mentale stress','psychosociale arbeidsbelasting'], 110),
  ('lawaai',                  'Lawaai en gehoorschade',            array['lawaai','gehoorschade'], 120),
  ('klimaat_temperatuur',     'Klimaat en temperatuur',            array['temperatuur','hitte op de werkplek','klimaatbeheersing'], 130),
  ('ventilatie',              'Ventilatie en luchtkwaliteit',      array['ventilatie','luchtkwaliteit','stofvorming'], 140),
  ('alleen_werken',           'Alleen werken',                     array['alleen werken'], 150),
  ('bhv_noodsituaties',       'BHV en noodsituaties',              array['bhv','nooduitgang','ontruiming','calamiteit'], 160),
  ('agressie_geweld',         'Agressie en geweld',                array['agressie','geweld op het werk','intimidatie'], 170)
on conflict (code) do nothing;

-- ============================================================
-- 2. Suggesties-RPC
-- ============================================================
create or replace function public.toolbox_suggesties(p_company_id uuid)
 returns table (
   onderwerp_code text,
   onderwerp_naam text,
   redenen        text[],
   toolbox_id     uuid,
   toolbox_titel  text,
   bron_id        uuid,
   bron_naam      text,
   bron_url       text,
   heeft_match    boolean
 )
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  return query
  with rie_hits as (
    select distinct o.code as onderwerp_code,
           'uit je RI&E: ' || m.titel as reden
    from modules m
    join vragen v on v.module_id = m.id and v.antwoord = 'Nee' and v.archived_at is null
    cross join toolbox_onderwerp o
    where m.company_id = p_company_id
      and m.archived_at is null
      and m.titel is not null
      and exists (select 1 from unnest(o.trefwoorden) kw where m.titel ilike '%' || kw || '%')
  ),
  inspectie_hits as (
    select distinct o.code as onderwerp_code,
           'recente inspectiebevinding: ' ||
             coalesce(nullif(b.rubriek_naam_snap, ''), left(b.punt_tekst_snap, 60)) as reden
    from inspectie_bevinding b
    join inspectie i on i.id = b.inspectie_id
    cross join toolbox_onderwerp o
    where b.company_id = p_company_id
      and b.resultaat = 'niet_in_orde'
      and b.afhandeling = 'geen'
      and coalesce(i.uitgevoerd_op, i.aangemaakt_op) > now() - interval '6 months'
      and exists (
        select 1 from unnest(o.trefwoorden) kw
        where coalesce(b.rubriek_naam_snap, b.punt_tekst_snap) ilike '%' || kw || '%'
      )
  ),
  incident_direct as (
    select distinct o.code as onderwerp_code, 'incident: ' || do_.omschrijving as reden
    from incident inc
    cross join lateral unnest(inc.directe_oorzaken) as d(oorzaak_code)
    join incident_directe_oorzaak do_ on do_.code = d.oorzaak_code
    cross join toolbox_onderwerp o
    where inc.company_id = p_company_id
      and inc.gevolgen && array['letsel','ongeval_zonder_verzuim']
      and inc.datum > (current_date - interval '12 months')
      and exists (select 1 from unnest(o.trefwoorden) kw where do_.omschrijving ilike '%' || kw || '%')
  ),
  incident_basis as (
    select distinct o.code as onderwerp_code, 'incident: ' || bo_.omschrijving as reden
    from incident inc
    cross join lateral unnest(inc.basis_oorzaken) as b(oorzaak_code)
    join incident_basis_oorzaak bo_ on bo_.code = b.oorzaak_code
    cross join toolbox_onderwerp o
    where inc.company_id = p_company_id
      and inc.gevolgen && array['letsel','ongeval_zonder_verzuim']
      and inc.datum > (current_date - interval '12 months')
      and exists (select 1 from unnest(o.trefwoorden) kw where bo_.omschrijving ilike '%' || kw || '%')
  ),
  alle_hits as (
    select * from rie_hits
    union all select * from inspectie_hits
    union all select * from incident_direct
    union all select * from incident_basis
  ),
  -- Hooguit 4 redenen per onderwerp: genoeg om te overtuigen, geen opsomming.
  -- LET OP: onderwerp_code/redenen zijn ook de RETURNS TABLE-kolomnamen
  -- hieronder -- in plpgsql zijn dat dan tegelijk OUT-parameters, dus binnen
  -- deze functie ALTIJD via een tabel-/CTE-alias verwijzen, nooit kaal, anders
  -- "column reference is ambiguous".
  hits_beperkt as (
    select genummerd.onderwerp_code, genummerd.reden
    from (
      select distinct alle_hits.onderwerp_code, alle_hits.reden,
             row_number() over (partition by alle_hits.onderwerp_code order by alle_hits.reden) as rn
      from alle_hits
    ) genummerd
    where genummerd.rn <= 4
  ),
  samengevat as (
    select hits_beperkt.onderwerp_code, array_agg(hits_beperkt.reden order by hits_beperkt.reden) as redenen
    from hits_beperkt
    group by hits_beperkt.onderwerp_code
  ),
  -- Alleen toolboxen die dit bedrijf al gekoppeld EN niet uitgezet heeft --
  -- daar kan de uitvoerder meteen een sessie voor starten.
  toolbox_match as (
    select distinct on (s.onderwerp_code)
           s.onderwerp_code, ct.id as toolbox_id,
           coalesce(afw.lokale_titel, ct.titel) as toolbox_titel
    from samengevat s
    join toolbox_onderwerp o on o.code = s.onderwerp_code
    join bedrijf_toolbox bt on bt.company_id = p_company_id
    join centrale_toolbox ct on ct.id = bt.toolbox_id and ct.gearchiveerd_op is null
    left join bedrijf_toolbox_afwijking afw
      on afw.company_id = p_company_id and afw.toolbox_id = ct.id and afw.modus = 'lokaal'
    where not exists (
        select 1 from bedrijf_toolbox_afwijking u
        where u.company_id = p_company_id and u.toolbox_id = ct.id and u.modus = 'uit'
      )
      and exists (
        select 1 from unnest(o.trefwoorden) kw
        where coalesce(afw.lokale_titel, ct.titel) ilike '%' || kw || '%'
           or coalesce(afw.lokale_tekst, ct.tekst) ilike '%' || kw || '%'
      )
    order by s.onderwerp_code, ct.volgorde asc
  ),
  -- Externe bron: alleen als er nog geen eigen-toolbox-match is.
  bron_match as (
    select distinct on (s.onderwerp_code)
           s.onderwerp_code, tb.id as bron_id, tb.naam as bron_naam, tb.url as bron_url
    from samengevat s
    join toolbox_onderwerp o on o.code = s.onderwerp_code
    join toolbox_bron tb on tb.gearchiveerd_op is null
    where not exists (select 1 from toolbox_match tm where tm.onderwerp_code = s.onderwerp_code)
      and exists (
        select 1 from unnest(o.trefwoorden) kw
        where tb.naam ilike '%' || kw || '%' or coalesce(tb.omschrijving, '') ilike '%' || kw || '%'
      )
    order by s.onderwerp_code, tb.volgorde asc
  )
  select
    s.onderwerp_code,
    o.naam,
    s.redenen,
    tm.toolbox_id,
    tm.toolbox_titel,
    bm.bron_id,
    bm.bron_naam,
    bm.bron_url,
    (tm.toolbox_id is not null or bm.bron_id is not null)
  from samengevat s
  join toolbox_onderwerp o on o.code = s.onderwerp_code
  left join toolbox_match tm on tm.onderwerp_code = s.onderwerp_code
  left join bron_match bm on bm.onderwerp_code = s.onderwerp_code
  order by array_length(s.redenen, 1) desc, o.volgorde asc
  limit 8;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.toolbox_suggesties(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toolbox_suggesties(uuid) TO authenticated, service_role;

commit;
