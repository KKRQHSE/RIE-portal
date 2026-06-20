-- ============================================================================
-- Module-zelfbeheer — de RPC-laag (drie toestanden per module per bedrijf)
-- ----------------------------------------------------------------------------
-- Draai dit bestand in de Supabase SQL Editor (als owner/postgres), NA migratie
-- 0005_module_terminologie.sql (die hernoemt kolommen en dropt de oude functies).
--
-- Neutrale terminologie (geen 'abonnement'): een module heeft per bedrijf drie
-- toestanden in bedrijf_modules.module_status — 'geen' / 'actief' / 'gestopt' —
-- bovenop de vrije gebruiks-toggle bedrijf_modules.actief (aan/uit = gebruik
-- pauzeren). Drie bewuste handelingen, elk SECURITY DEFINER met vaste
-- search_path = public en autorisatie via mag_bedrijf_beheren(company_id):
--   module_activeren       — eerste activatie (of opnieuw na stopzetten).
--                            Legt geactiveerd_op vast.
--   module_gebruik_zetten  — vrije aan/uit-toggle van het GEBRUIK (kolom actief).
--                            Alleen bij een actieve module; verandert de status niet.
--   module_stopzetten      — beëindigt de module bewust. Legt gestopt_op vast.
--
-- Elke handeling schrijft een regel in module_historie (wie/wanneer/wijziging),
-- conform de loggende RPC-laag elders in het portaal.
--
-- company_id wordt geautoriseerd, nooit blind vertrouwd. Geen grant naar anon/public.
-- Idempotent: alle functies zijn create or replace.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- module_activeren: eerste activatie van een module, of het opnieuw activeren na
-- een eerdere stop (behandeld als nieuwe activatie: verse geactiveerd_op,
-- gestopt_op gewist). Zet het gebruik meteen op 'aan'. Weigert als de module al
-- actief is (dan is dit hooguit een aan/uit-toggle).
-- ----------------------------------------------------------------------------
create or replace function public.module_activeren(
  p_company_id uuid,
  p_module     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text;
  v_status text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;

  select module_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status = 'actief' then
    raise exception 'Module is al actief';
  end if;

  insert into bedrijf_modules (company_id, module, actief, module_status, geactiveerd_op, gestopt_op)
  values (p_company_id, v_module, true, 'actief', now(), null)
  on conflict (company_id, module) do update
     set actief         = true,
         module_status  = 'actief',
         geactiveerd_op = now(),
         gestopt_op     = null;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Module ' || v_module || ' geactiveerd');
end;
$$;


-- ----------------------------------------------------------------------------
-- module_gebruik_zetten: vrije aan/uit-toggle van het gebruik. Pauzeert of hervat
-- de module zonder de status te raken. Alleen toegestaan bij een actieve module;
-- 'geen' of 'gestopt' moet eerst via module_activeren.
-- ----------------------------------------------------------------------------
create or replace function public.module_gebruik_zetten(
  p_company_id uuid,
  p_module     text,
  p_aan        boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text;
  v_status text;
  v_actief boolean;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;
  if p_aan is null then
    raise exception 'Aan/uit is verplicht';
  end if;

  select module_status, actief into v_status, v_actief
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Module is niet actief';
  end if;
  if v_actief = p_aan then
    return;  -- niets te doen; geen ruis in het logboek
  end if;

  update bedrijf_modules
     set actief = p_aan
   where company_id = p_company_id and module = v_module;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(),
          case when p_aan then 'Gebruik aangezet' else 'Gebruik uitgezet' end);
end;
$$;


-- ----------------------------------------------------------------------------
-- module_stopzetten: beëindigt de module bewust. Zet de status op 'gestopt',
-- legt gestopt_op vast en zet het gebruik uit. Opnieuw gebruiken kan daarna
-- alleen via module_activeren (nieuwe activatie).
-- ----------------------------------------------------------------------------
create or replace function public.module_stopzetten(
  p_company_id uuid,
  p_module     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text;
  v_status text;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  v_module := nullif(btrim(coalesce(p_module, '')), '');
  if v_module is null then
    raise exception 'Module is verplicht';
  end if;

  select module_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Module is niet actief';
  end if;

  update bedrijf_modules
     set module_status = 'gestopt',
         gestopt_op    = now(),
         actief        = false
   where company_id = p_company_id and module = v_module;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Module gestopt');
end;
$$;


-- ----------------------------------------------------------------------------
-- Rechten: uitsluitend ingelogde gebruikers; de echte autorisatie zit in
-- mag_bedrijf_beheren(). Geen grant naar anon/public.
-- ----------------------------------------------------------------------------
grant execute on function public.module_activeren(uuid, text)               to authenticated;
grant execute on function public.module_gebruik_zetten(uuid, text, boolean) to authenticated;
grant execute on function public.module_stopzetten(uuid, text)              to authenticated;

commit;
