-- Migratie 0051: AI-concept overnemen kan alleen bij een punt met een resultaat
-- ----------------------------------------------------------------------------
-- Gevonden in de browsertest van migratie 0050. Bij een inspectiepunt waar de
-- inspecteur nog GEEN resultaat had gekozen (in orde / niet in orde / n.v.t.)
-- schreef 'overnemen' de tekst netjes naar inspectie_bevinding.opmerking — maar
-- het invulscherm rendert het toelichtingveld uitsluitend NAAST een resultaat.
-- Gevolg: de inspecteur klikte Overnemen, het conceptblok verdween, en er
-- gebeurde zichtbaar niets. De tekst stond er wel; hij kon hem alleen nergens
-- zien of bewerken. Een stille opslag is precies wat je bij een module met
-- juridische waarde niet wilt.
--
-- De onderliggende reden is dat een opmerking zonder resultaat een toestand is
-- die de rest van de applicatie nooit maakt: bevinding_opslaan WEIGERT al een
-- null resultaat. Migratie 0050 kon die toestand als enige wél veroorzaken.
-- Deze migratie trekt dat recht: overnemen vereist een resultaat, net als elke
-- andere schrijfroute naar opmerking.
--
-- De volgorde die dit afdwingt is ook de juiste: eerst oordeelt de mens over het
-- punt, daarna gebruikt hij de AI-tekst als toelichting bij dat oordeel. Niet
-- andersom.
--
-- Alleen 'overgenomen' raakt dit. 'verworpen' blijft altijd mogelijk — een
-- concept weggooien mag je op elk moment, ook zonder oordeel.
--
-- Additief: alleen een extra controle in een bestaande functie. Guards
-- null-veilig, anon-EXECUTE blijft ingetrokken (Beslissing 62).

begin;

create or replace function public.inspectie_ai_suggestie_besluit(
  p_suggestie_id uuid, p_besluit text, p_tekst text
) returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_inspectie uuid; v_bevinding uuid; v_status text;
  v_company uuid; v_punt text; v_tekst text; v_resultaat text;
begin
  if p_besluit is null or p_besluit not in ('overgenomen', 'verworpen') then
    raise exception 'Ongeldig besluit';
  end if;

  select inspectie_id, bevinding_id, status
    into v_inspectie, v_bevinding, v_status
    from inspectie_ai_suggestie where id = p_suggestie_id;
  if v_inspectie is null then raise exception 'Suggestie niet gevonden'; end if;

  -- Een beslissing per suggestie: een al beoordeeld concept ligt vast.
  if v_status <> 'concept' then
    raise exception 'Deze suggestie is al beoordeeld';
  end if;

  v_company := inspectie_foto_context(v_inspectie, v_bevinding, true);

  if p_besluit = 'overgenomen' then
    v_tekst := nullif(btrim(coalesce(p_tekst, '')), '');
    if v_tekst is null then
      raise exception 'Overnemen kan niet met een lege tekst';
    end if;

    -- NIEUW (0051): zonder resultaat heeft de toelichting geen plek op het
    -- scherm, en zou de tekst onzichtbaar worden opgeslagen.
    select resultaat, punt_tekst_snap into v_resultaat, v_punt
      from inspectie_bevinding where id = v_bevinding;
    if v_resultaat is null then
      raise exception 'Kies eerst een resultaat bij dit inspectiepunt';
    end if;

    -- Alleen de toelichting; resultaat/afhandeling blijven onaangeroerd, die
    -- kiest de inspecteur zelf via bevinding_opslaan.
    update inspectie_bevinding set opmerking = v_tekst
     where id = v_bevinding;

    insert into inspectie_historie (company_id, inspectie_id, wie, wanneer, wijziging)
    values (v_company, v_inspectie, auth.uid(), now(),
            'AI-suggestie overgenomen (door mens vastgesteld) bij: ' || coalesce(v_punt, ''));
  end if;

  update inspectie_ai_suggestie
     set status        = p_besluit,
         besluit_tekst = case when p_besluit = 'overgenomen' then v_tekst else null end,
         besloten_op   = now(),
         besloten_door = auth.uid()
   where id = p_suggestie_id;
end;
$function$;

-- create or replace behoudt de bestaande grants niet vanzelf voor nieuwe rollen,
-- maar wél voor deze functie-signature; voor de zekerheid opnieuw zetten zodat
-- anon er zeker niet bij kan (Beslissing 62).
revoke execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text) to authenticated, service_role;

commit;
