-- Migratie 0011: startset — de zeven centrale rubrieken met vragen.
-- Centrale norm (geen company_id). rie_code blijft leeg; vul ik later in het
-- adminscherm in. Guard: alleen seeden als de bibliotheek nog leeg is, zodat
-- herhaald draaien niets dubbel toevoegt.
begin;
do $$
begin
  if exists (select 1 from public.centrale_rubriek) then
    raise notice 'Centrale bibliotheek is niet leeg — seed overgeslagen.';
    return;
  end if;

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('PBM', 1) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Draagt iedereen de juiste persoonlijke beschermingsmiddelen voor het werk?', 1),
    ('Worden ze ook echt gebruikt en niet afgedaan?', 2),
    ('Zijn ze in goede staat?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Veilig werken en gedrag', 2) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Wordt er rustig en oplettend gewerkt, zonder onnodig risico?', 1),
    ('Worden de juiste werkwijze en materialen gebruikt?', 2),
    ('Worden gevaarlijke situaties herkend en vermeden?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Gereedschap en machines', 3) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Is het gereedschap heel en zonder zichtbare schade?', 1),
    ('Zijn snoeren, stekkers en slangen in orde?', 2),
    ('Staat draaiend materieel veilig opgesteld en zijn beveiligingen aanwezig?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Werken op hoogte', 4) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Wordt de juiste opstap gebruikt (trap, steiger of hoogwerker in plaats van een wankele ladder)?', 1),
    ('Staat de ladder of steiger stevig en goed geplaatst?', 2),
    ('Is er valbeveiliging waar dat nodig is?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Orde en netheid', 5) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Is de werkplek opgeruimd en goed bereikbaar?', 1),
    ('Liggen er geen struikel- of glijrisico''s?', 2),
    ('Is er genoeg ruimte om veilig te werken?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Gevaarlijke stoffen', 6) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Zijn de gebruikte producten bekend en goed geëtiketteerd?', 1),
    ('Worden ze veilig opgeslagen en gebruikt?', 2),
    ('Is er voldoende ventilatie?', 3)
  ) as t(tekst, volgorde);

  with r as (insert into public.centrale_rubriek (naam, volgorde) values ('Nood en hulpverlening', 7) returning id)
  insert into public.centrale_vraag (rubriek_id, tekst, volgorde)
  select id, t.tekst, t.volgorde from r, (values
    ('Zijn blusmiddelen aanwezig, bereikbaar en gekeurd?', 1),
    ('Zijn vluchtwegen vrij en herkenbaar?', 2),
    ('Is een EHBO-voorziening aanwezig en is bekend wie de BHV''er is?', 3)
  ) as t(tekst, volgorde);
end $$;
commit;
