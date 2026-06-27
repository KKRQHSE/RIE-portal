-- Migratie 0019: startset — voorbeeld-toolboxen + Alpha-demo
-- ----------------------------------------------------------------------------
-- VOORBEELDEN, geen vaststaande vakinhoud: titel + korte tekst + een PLACEHOLDER
-- video-link + 1-2 quizvragen met uitleg. Kees vervangt/toetst dit later. De
-- video-links zijn placeholders en moeten worden vervangen door echte video's.
--
-- Voor Testbedrijf Alpha: de toolbox-module activeren, de drie toolboxen koppelen
-- en voorbeeld-doelstellingen per functiegroep zetten, zodat er iets te zien is.
-- Guard: alleen seeden als er nog geen centrale toolboxen zijn (idempotent).

begin;
do $$
declare
  v_alpha uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
begin
  if exists (select 1 from public.centrale_toolbox) then
    raise notice 'Er zijn al centrale toolboxen — seed overgeslagen.';
    return;
  end if;

  -- Toolbox 1: veilig tillen (video vereist, geen quiz-eis).
  insert into public.centrale_toolbox (titel, tekst, video_url, vereist_video, vereist_quiz, quiz_uitleg_modus, volgorde)
  values ('Veilig tillen',
          'Til met je benen, niet met je rug. Houd de last dicht tegen je lichaam, draai niet met een belaste rug, en vraag hulp of gebruik een hulpmiddel bij zware of onhandige lasten.',
          'https://www.youtube.com/watch?v=PLACEHOLDER1', true, false, 'per_vraag', 1)
  returning id into v_t1;
  insert into public.centrale_toolbox_vraag (toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde) values
    (v_t1, 'Waarmee til je een zware last bij voorkeur?', '["Met je rug","Met je benen"]'::jsonb, 1,
     'Je benen zijn sterker en sparen je rug; til vanuit je knieën.', 1),
    (v_t1, 'Wat doe je bij een te zware of onhandige last?', '["Toch alleen tillen","Hulp of een hulpmiddel gebruiken"]'::jsonb, 1,
     'Vraag hulp of pak een steekwagen/heffer — geforceerd tillen leidt tot rugletsel.', 2);

  -- Toolbox 2: werken op hoogte (video + quiz vereist).
  insert into public.centrale_toolbox (titel, tekst, video_url, vereist_video, vereist_quiz, quiz_uitleg_modus, volgorde)
  values ('Werken op hoogte',
          'Gebruik de juiste opstap: een trap, steiger of hoogwerker in plaats van een wankele ladder. Zorg dat de ondergrond stabiel is en gebruik valbeveiliging waar dat nodig is.',
          'https://www.youtube.com/watch?v=PLACEHOLDER2', true, true, 'aan_eind', 2)
  returning id into v_t2;
  insert into public.centrale_toolbox_vraag (toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde) values
    (v_t2, 'Wat gebruik je liever dan een wankele ladder?', '["Een stoel","Een trap, steiger of hoogwerker"]'::jsonb, 1,
     'Een stabiele opstap voorkomt valpartijen; een wankele ladder is een veelvoorkomende oorzaak van ongevallen.', 1),
    (v_t2, 'Wanneer gebruik je valbeveiliging?', '["Alleen als het moet kan het weg","Waar valgevaar bestaat"]'::jsonb, 1,
     'Bij valgevaar is beveiliging nodig — ook voor korte klussen.', 2);

  -- Toolbox 3: gevaarlijke stoffen (geen video-eis, quiz aanwezig maar niet vereist).
  insert into public.centrale_toolbox (titel, tekst, video_url, vereist_video, vereist_quiz, quiz_uitleg_modus, volgorde)
  values ('Gevaarlijke stoffen herkennen',
          'Lees de etiketten en let op de gevaarsymbolen. Sla producten veilig en gesloten op, gebruik ze met voldoende ventilatie en draag de juiste persoonlijke beschermingsmiddelen.',
          'https://www.youtube.com/watch?v=PLACEHOLDER3', false, false, 'per_vraag', 3)
  returning id into v_t3;
  insert into public.centrale_toolbox_vraag (toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde) values
    (v_t3, 'Waar lees je af hoe je een product veilig gebruikt?', '["Op het etiket","Dat hoef je niet te weten"]'::jsonb, 0,
     'Het etiket en het veiligheidsinformatieblad vertellen je de gevaren en de juiste omgang.', 1);

  -- Alpha-demo: module aanzetten, toolboxen koppelen, doelstellingen zetten.
  insert into public.bedrijf_modules (company_id, module, actief, module_status, geactiveerd_op)
  values (v_alpha, 'toolbox', true, 'actief', now())
  on conflict (company_id, module) do update
    set actief = true, module_status = 'actief', geactiveerd_op = coalesce(public.bedrijf_modules.geactiveerd_op, now());

  insert into public.bedrijf_toolbox (company_id, toolbox_id)
  values (v_alpha, v_t1), (v_alpha, v_t2), (v_alpha, v_t3)
  on conflict do nothing;

  -- Voorbeeld-doelen per (bestaande) functiegroep van Alpha.
  insert into public.bedrijf_doelstelling (company_id, functiegroep_id, doel_per_jaar)
  select v_alpha, fg.id,
         case fg.naam when 'Uitvoerder' then 12 when 'Projectleider' then 10
                      when 'QHSE-er' then 6 when 'Directie' then 4 else 6 end
  from public.functiegroep fg
  where fg.company_id = v_alpha and fg.gearchiveerd_op is null
  on conflict (company_id, functiegroep_id) do nothing;
end $$;
commit;
