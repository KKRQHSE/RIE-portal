-- Migratie 0089: SeysCentra RI&E herstructureren naar de volledige FLOP-12-module-indeling
-- ----------------------------------------------------------------------------------------
-- Alleen bedrijf SeysCentra (bd16538b-01e9-41d2-84ad-fe5690917cba) wordt geraakt. Puur
-- databeweging: geen schemawijziging, geen nieuwe kolommen/functies (dus geen REVOKE-regel
-- van AGENTS.md van toepassing). Additief -- geen enkele vragen/pva_items-rij wordt verwijderd,
-- alleen `vragen.module_id` verandert. `locatie_id` en `functiegroep_id` op vragen blijven
-- ONGEWIJZIGD (attributen, geen module meer) -- de bestaande locatie-koppeling (en dus ook de
-- koppeling van pva_items via de tekstuele `pva`/`nr`-match, die geen module_id kent) blijft
-- intact. Zie FLOP_HERSTRUCTURERING_2026-09-24.md voor de volledige inhoudelijke motivatie
-- per vraag en de twijfelgevallen.
--
-- Aanpak: (1) oude functiegroep/locatie-modulecodes tijdelijk hernoemen (ze botsen anders met
-- de FLOP-codes via de unique-constraint modules_company_id_code_key), (2) de 12 FLOP-modules
-- aanmaken, (3) elke vraag naar zijn nieuwe module verhuizen, (4) hardop tellen dat er niets
-- verloren is (DO-block, breekt de transactie af bij een afwijking), (5) pas dan de nu lege
-- oude modules archiveren (archived_at, geen DELETE -- blijven bestaan voor de audit-trail,
-- `modules`-select in app/[company_id]/rie/page.tsx filtert al op `archived_at is null`).

begin;

do $$
declare
  v_company_id uuid := 'bd16538b-01e9-41d2-84ad-fe5690917cba';
  v_aantal_voor int;
  v_aantal_na int;
begin
  select count(*) into v_aantal_voor from public.vragen where company_id = v_company_id;
  if v_aantal_voor <> 63 then
    raise exception 'Onverwacht aantal vragen vooraf voor SeysCentra: % (verwacht 63) -- migratie afgebroken, niets gewijzigd.', v_aantal_voor;
  end if;

  -- Stap 1: oude codes uit de weg, zodat de FLOP-codes vrij zijn voor deze company_id.
  update public.modules
     set code = 'OUD-' || code
   where company_id = v_company_id
     and code in ('F1','F2','F3','F4','L1','L2','L3','L4','O1');

  -- Stap 2: de 12 FLOP-modules aanmaken.
  insert into public.modules (id, company_id, code, titel, intro, volgorde, rie_versie_id)
  values
    (gen_random_uuid(), v_company_id, 'F1', 'F1 Gevaarlijke stoffen', 'Blootstelling aan chemische en biologische agentia, en de bescherming daartegen.', 1, null),
    (gen_random_uuid(), v_company_id, 'F2', 'F2 Fysieke belasting', 'Lichamelijke belasting door houding, tillen en herhaalde bewegingen.', 2, null),
    (gen_random_uuid(), v_company_id, 'F3', 'F3 Schadelijke factoren', 'Fysische omgevingsfactoren zoals geluid, klimaat en verlichting.', 3, null),
    (gen_random_uuid(), v_company_id, 'L1', 'L1 Brandveiligheid en BHV', 'Locatiegebonden brandveiligheid, BHV-organisatie en algemene gebouwveiligheid per vestiging.', 4, null),
    (gen_random_uuid(), v_company_id, 'L2', 'L2 Mobiliteit en transport', 'Locatiegebonden risico''s bij vervoer en verkeer.', 5, null),
    (gen_random_uuid(), v_company_id, 'L3', 'L3 Werken op externe locaties', 'Risico''s bij het werken buiten de eigen vestiging, zoals huisbezoeken.', 6, null),
    (gen_random_uuid(), v_company_id, 'O1', 'O1 Preventiebeleid en arbo-organisatie', 'Organisatiebrede arbo-organisatie, beleid en voorlichting.', 7, null),
    (gen_random_uuid(), v_company_id, 'O2', 'O2 PAGO en gezondheidsbeleid', 'Organisatiebreed gezondheidsbeleid, waaronder vaccinatie en gezondheidsmonitoring.', 8, null),
    (gen_random_uuid(), v_company_id, 'O3', 'O3 Kwetsbare groepen', 'Organisatiebreed beleid voor kwetsbare groepen medewerkers.', 9, null),
    (gen_random_uuid(), v_company_id, 'P1', 'P1 Stress en werkdruk', 'Organisatiebrede psychosociale arbeidsbelasting door werkdruk.', 10, null),
    (gen_random_uuid(), v_company_id, 'P2', 'P2 Intimidatie en ongewenst gedrag', 'Organisatiebrede psychosociale arbeidsbelasting door agressie en ongewenst gedrag.', 11, null),
    (gen_random_uuid(), v_company_id, 'P3', 'P3 Ingrijpende gebeurtenissen en PSA', 'Organisatiebreed beleid voor nazorg na ingrijpende gebeurtenissen.', 12, null);

  -- Stap 3: elke bestaande vraag naar zijn FLOP-module verhuizen. Mapping per `nr`, inhoudelijk
  -- bepaald -- zie FLOP_HERSTRUCTURERING_2026-09-24.md voor de motivatie per vraag/twijfelgeval.
  -- `locatie_id`/`functiegroep_id`/`vraag`/`antwoord`/`bevinding`/`pva`/`nr` blijven ongewijzigd.
  with doel(nr, doel_code) as (
    values
      ('F1-1','F2'), ('F1-2','F2'), ('F1-3','F2'), ('F1-4','F1'), ('F1-5','O2'),
      ('F1-6','F1'), ('F1-7','O2'), ('F1-8','F3'), ('F1-9','L3'), ('F1-10','P3'),
      ('F1-11','P1'), ('F1-12','P2'), ('F1-13','O1'),
      ('F2-1','F2'), ('F2-2','P1'), ('F2-3','L2'), ('F2-4','P1'),
      ('F3-1','F3'), ('F3-2','F3'), ('F3-3','F2'), ('F3-4','P1'), ('F3-5','O1'),
      ('F4-1','F2'), ('F4-2','P1'), ('F4-3','F2'), ('F4-4','O2'), ('F4-5','F1'),
      ('F4-6','F3'), ('F4-7','P1'), ('F4-8','P1'),
      ('L1-1','L1'),
      ('L2-1','L1'), ('L2-2','L1'), ('L2-3','L1'), ('L2-4','L1'), ('L2-5','L1'),
      ('L2-6','L1'), ('L2-7','L1'), ('L2-8','L1'),
      ('L3-1','L1'), ('L3-2','L1'), ('L3-3','L1'), ('L3-4','L1'), ('L3-5','L1'),
      ('L3-6','L1'), ('L3-7','L1'),
      ('L4-1','L1'), ('L4-2','L1'), ('L4-3','L1'), ('L4-4','L1'), ('L4-5','L2'),
      ('O1-1','O1'), ('O1-2','P3'), ('O1-3','P1'), ('O1-4','O1'), ('O1-5','F1'),
      ('O1-6','L1'), ('O1-7','O1'), ('O1-8','O3'), ('O1-9','O2'), ('O1-10','L2'),
      ('O1-11','P2'), ('O1-12','F1')
  )
  update public.vragen v
     set module_id = m.id
    from doel d
    join public.modules m on m.company_id = v_company_id and m.code = d.doel_code
   where v.company_id = v_company_id
     and v.nr = d.nr;

  -- Stap 4: verplicht verificatiemoment -- niets mag verloren zijn.
  select count(*) into v_aantal_na from public.vragen where company_id = v_company_id;
  if v_aantal_na <> v_aantal_voor then
    raise exception 'Aantal vragen na verplaatsing (%) wijkt af van vooraf (%) -- migratie afgebroken.', v_aantal_na, v_aantal_voor;
  end if;

  if exists (
    select 1 from public.vragen v
    join public.modules m on m.id = v.module_id
    where v.company_id = v_company_id and m.code like 'OUD-%'
  ) then
    raise exception 'Er staat nog minstens 1 vraag onder een oude module -- migratie afgebroken, niets opgeruimd.';
  end if;

  -- Stap 5: pas nu de oude, inmiddels lege modules archiveren (geen DELETE).
  update public.modules
     set archived_at = now()
   where company_id = v_company_id
     and code like 'OUD-%';

  raise notice 'SeysCentra FLOP-herstructurering: % vragen verhuisd, telling klopt (% -> %).', v_aantal_na, v_aantal_voor, v_aantal_na;
end $$;

commit;
