-- Migratie 0060: een overgenomen AI-actie zet het oordeel automatisch op 'niet in orde'
-- ----------------------------------------------------------------------------
-- Gebruikersfeedback: een actie overnemen uit een AI-suggestie betekent per
-- definitie dat er iets moet gebeuren bij dit inspectiepunt — dan hoort het
-- oordeel niet op 'in orde' of leeg te blijven staan. Drie regels:
--   * ACTIE overnemen (p_acties_gekozen niet leeg) -> resultaat automatisch
--     'niet_in_orde', ONGEACHT wat er al stond (ook een bestaand 'in_orde' is
--     dan inconsistent met "er is een actie nodig" en wordt overschreven).
--   * Alleen een bevinding/beschrijving overnemen ZONDER actie -> resultaat
--     blijft ongemoeid; de inspecteur kiest zelf (ongewijzigd gedrag).
--   * Het is een SLIMME STANDAARD, geen slot: de inspecteur kan het resultaat
--     daarna gewoon weer wijzigen via de bestaande resultaatknoppen
--     (bevinding_opslaan), hier verandert niets aan.
--
-- Volgorde is bewust: het resultaat wordt gezet VOORDAT de bestaande
-- resultaat-eis voor het wegschrijven van bevindingen (migratie 0051) wordt
-- gecontroleerd. Zo werkt ook de combinatie "bevinding + actie in één keer
-- overnemen" op een punt dat nog helemaal geen resultaat had.
--
-- Additief gedrag in een bestaande functie; signatuur ongewijzigd (create or
-- replace volstaat, geen drop nodig). Guards/grants blijven zoals ze waren
-- (inspectie_foto_context, Beslissing 62).

begin;

create or replace function public.inspectie_ai_suggestie_besluit(
  p_suggestie_id uuid, p_besluit text,
  p_bevindingen_gekozen text[] default '{}', p_acties_gekozen text[] default '{}'
) returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_inspectie uuid; v_bevinding uuid; v_status text;
  v_ai_bevindingen text[]; v_ai_acties text[];
  v_company uuid; v_punt text; v_resultaat text;
  v_bevindingen text[]; v_acties text[]; v_opmerking text;
  v_actie text; v_nr integer; v_actie_id uuid;
begin
  if p_besluit is null or p_besluit not in ('overgenomen', 'verworpen') then
    raise exception 'Ongeldig besluit';
  end if;

  select inspectie_id, bevinding_id, status, ai_bevindingen, ai_acties
    into v_inspectie, v_bevinding, v_status, v_ai_bevindingen, v_ai_acties
    from inspectie_ai_suggestie where id = p_suggestie_id;
  if v_inspectie is null then raise exception 'Suggestie niet gevonden'; end if;

  -- Een beslissing per suggestie: een al beoordeeld concept ligt vast.
  if v_status <> 'concept' then
    raise exception 'Deze suggestie is al beoordeeld';
  end if;

  v_company := inspectie_foto_context(v_inspectie, v_bevinding, true);

  if p_besluit = 'overgenomen' then
    -- Alleen niet-lege, getrimde items tellen mee.
    select coalesce(array_agg(btrim(x)), '{}') into v_bevindingen
      from unnest(coalesce(p_bevindingen_gekozen, '{}')) as x where btrim(x) <> '';
    select coalesce(array_agg(btrim(x)), '{}') into v_acties
      from unnest(coalesce(p_acties_gekozen, '{}')) as x where btrim(x) <> '';

    if coalesce(array_length(v_bevindingen, 1), 0) = 0
       and coalesce(array_length(v_acties, 1), 0) = 0 then
      raise exception 'Overnemen kan niet zonder een aangevinkte bevinding of actie';
    end if;

    -- De UI biedt alleen checkboxes, geen vrije tekst: wat wordt overgenomen
    -- moet dus letterlijk uit wat de AI voorstelde komen. Dit is de
    -- server-side vergrendeling van die regel — een gemanipuleerd verzoek kan
    -- geen eigen tekst het rapport in smokkelen via deze route.
    if not (v_bevindingen <@ coalesce(v_ai_bevindingen, '{}')) then
      raise exception 'Een gekozen bevinding komt niet uit de AI-suggestie';
    end if;
    if not (v_acties <@ coalesce(v_ai_acties, '{}')) then
      raise exception 'Een gekozen actie komt niet uit de AI-suggestie';
    end if;

    select punt_tekst_snap into v_punt from inspectie_bevinding where id = v_bevinding;

    -- NIEUW (0060): een actie overnemen impliceert 'niet in orde'. Vóór de
    -- resultaat-eis hieronder, zodat een gecombineerde bevinding+actie op een
    -- nog leeg punt in één keer werkt.
    if array_length(v_acties, 1) > 0 then
      update inspectie_bevinding set resultaat = 'niet_in_orde' where id = v_bevinding;
    end if;

    if array_length(v_bevindingen, 1) > 0 then
      -- Zonder resultaat rendert het invulscherm geen toelichtingveld (0051):
      -- alleen relevant als er echt iets naar opmerking gaat.
      select resultaat into v_resultaat from inspectie_bevinding where id = v_bevinding;
      if v_resultaat is null then
        raise exception 'Kies eerst een resultaat bij dit inspectiepunt';
      end if;

      v_opmerking := array_to_string(v_bevindingen, E'\n');
      update inspectie_bevinding set opmerking = v_opmerking where id = v_bevinding;

      insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
      values (v_company, v_inspectie, auth.uid(), now(),
              'AI-suggestie overgenomen (door mens vastgesteld) bij: ' || coalesce(v_punt, ''));
    end if;

    if array_length(v_acties, 1) > 0 then
      foreach v_actie in array v_acties loop
        select coalesce(max(case when nr ~ '^[0-9]+$' then nr::int end), 0) + 1
          into v_nr from pva_items where company_id = v_company;

        insert into pva_items (company_id, nr, onderwerp, status, prio, bron_type, bron_id, updated_at)
        values (v_company, v_nr::text, v_actie, 'Open', 'Middel', 'inspectie_bevinding', v_bevinding, now())
        returning id into v_actie_id;
      end loop;

      insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
      values (v_company, v_inspectie, auth.uid(), now(),
              'AI-actiesuggestie(s) overgenomen als actie bij: ' || coalesce(v_punt, '')
                || ' (oordeel automatisch op "niet in orde" gezet)');
    end if;
  end if;

  update inspectie_ai_suggestie
     set status        = p_besluit,
         besluit_tekst = case when p_besluit = 'overgenomen'
                              then array_to_string(coalesce(v_bevindingen, '{}') || coalesce(v_acties, '{}'), E'\n')
                              else null end,
         besloten_op   = now(),
         besloten_door = auth.uid()
   where id = p_suggestie_id;
end;
$function$;

-- create or replace behoudt de bestaande grants voor deze signature, maar voor
-- de zekerheid opnieuw zetten zodat anon er zeker niet bij kan (Beslissing 62).
revoke execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text[], text[]) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text[], text[]) to authenticated, service_role;

commit;
