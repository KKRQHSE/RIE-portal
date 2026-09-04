-- Migratie 0059: AI-foto-analyse geeft aanvinkbare bevindingen + actiesuggesties
-- ----------------------------------------------------------------------------
-- Tot nu toe kwam er van de AI één lange beschrijving en één concept-bevinding
-- als vrije tekst terug: alles-of-niets overnemen. Gebruikersfeedback: de
-- inspecteur wil per mogelijke bevinding EN per voorgestelde maatregel apart
-- kunnen kiezen wat hij overneemt — de mens beslist blijft, maar per item in
-- plaats van per foto.
--
-- Nieuw op de rij: ai_bevindingen text[] en ai_acties text[], onveranderd
-- bewaard zoals de leverancier ze teruggaf (herkomstbewijs, net als
-- ai_beschrijving/ai_concept al deden). ai_concept blijft staan voor oude rijen
-- (additief, niets breekt) maar wordt door de nieuwe opslaan-RPC niet meer
-- gevuld — de vorm is voortaan bevindingen/acties.
--
-- De twee RPC's krijgen een nieuwe signatuur (drop + create, geen
-- create-or-replace: het aantal/type parameters verandert):
--   * inspectie_ai_suggestie_opslaan: p_concept text -> p_bevindingen text[],
--     p_acties text[].
--   * inspectie_ai_suggestie_besluit: p_tekst text -> p_bevindingen_gekozen
--     text[], p_acties_gekozen text[] — de door de inspecteur AANGEVINKTE
--     items, niet de hele lijst. 'overgenomen' doet twee dingen, onafhankelijk
--     van elkaar:
--       - gekozen bevindingen -> samengevoegd (één per regel) in
--         inspectie_bevinding.opmerking, zoals de vorige versie ook deed
--         (vervangt de bestaande toelichting; de UI waarschuwt daarvoor);
--       - gekozen acties -> elk een eigen rij in pva_items
--         (bron_type='inspectie_bevinding', bron_id=bevinding_id), net als
--         actie_los_toevoegen/bevinding_naar_actie dat al doen. Dit tast
--         bevinding.actie_id/afhandeling niet aan — dat blijft het enkelvoudige
--         spoor van de bestaande "Actie aanmaken"-knop; AI-acties zijn een
--         aanvullend spoor, zichtbaar via dezelfde centrale actielijst.
-- Minstens één van de twee lijsten moet iets bevatten om 'overgenomen' te
-- mogen kiezen; 'verworpen' blijft zonder voorwaarde mogelijk.
--
-- De resultaat-eis uit migratie 0051 blijft, maar geldt alleen als er
-- bevindingen gekozen zijn (alleen dan wordt er iets naar opmerking
-- geschreven — acties-alleen raakt opmerking niet en heeft dus geen resultaat
-- nodig).
--
-- Guards null-veilig via mag_bedrijf_beheren / inspectie_foto_context,
-- anon-EXECUTE eruit (Beslissing 62).

begin;

alter table public.inspectie_ai_suggestie
  add column if not exists ai_bevindingen text[] not null default '{}'::text[],
  add column if not exists ai_acties      text[] not null default '{}'::text[];

drop function if exists public.inspectie_ai_suggestie_opslaan(uuid, text, text, text, text, boolean);

create or replace function public.inspectie_ai_suggestie_opslaan(
  p_foto_id uuid, p_beschrijving text, p_bevindingen text[], p_acties text[],
  p_leverancier text, p_model text, p_toestemming boolean
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_inspectie uuid; v_bevinding uuid; v_company uuid; v_id uuid;
begin
  if coalesce(p_toestemming, false) is not true then
    raise exception 'Zonder toestemming mag deze foto niet naar een AI-dienst';
  end if;

  select inspectie_id, bevinding_id into v_inspectie, v_bevinding
    from inspectie_foto where id = p_foto_id;
  if v_inspectie is null then raise exception 'Foto niet gevonden'; end if;
  if v_bevinding is null then
    raise exception 'AI-voorwerk kan alleen bij een foto die aan een inspectiepunt hangt';
  end if;

  v_company := inspectie_foto_context(v_inspectie, v_bevinding, true);

  insert into inspectie_ai_suggestie
    (inspectie_id, bevinding_id, foto_id, company_id,
     ai_beschrijving, ai_bevindingen, ai_acties, leverancier, model,
     toestemming_bevestigd, status, aangemaakt_door)
  values
    (v_inspectie, v_bevinding, p_foto_id, v_company,
     nullif(btrim(coalesce(p_beschrijving, '')), ''),
     -- Lege/blanco items eruit; nooit meer dan wat de leverancier meestuurt.
     coalesce((select array_agg(x) from unnest(coalesce(p_bevindingen, '{}')) as x where btrim(x) <> ''), '{}'),
     coalesce((select array_agg(x) from unnest(coalesce(p_acties, '{}')) as x where btrim(x) <> ''), '{}'),
     coalesce(nullif(btrim(coalesce(p_leverancier, '')), ''), 'onbekend'),
     coalesce(nullif(btrim(coalesce(p_model, '')), ''), 'onbekend'),
     true, 'concept', auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

drop function if exists public.inspectie_ai_suggestie_besluit(uuid, text, text);

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
              'AI-actiesuggestie(s) overgenomen als actie bij: ' || coalesce(v_punt, ''));
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

-- `revoke ... from public` alleen is niet genoeg: default privileges geven
-- anon/authenticated automatisch EXECUTE terug (Beslissing 62).
revoke execute on function public.inspectie_ai_suggestie_opslaan(uuid, text, text[], text[], text, text, boolean) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_opslaan(uuid, text, text[], text[], text, text, boolean) to authenticated, service_role;
revoke execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text[], text[]) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text[], text[]) to authenticated, service_role;

commit;
