-- ============================================================================
-- Module-abonnement — de RPC-laag (zelfbeheer per bedrijf)
-- ----------------------------------------------------------------------------
-- Draai dit bestand in de Supabase SQL Editor (als owner/postgres), NA migratie
-- 0004_module_abonnement.sql.
--
-- Drie bewuste handelingen, elk SECURITY DEFINER met vaste search_path = public en
-- autorisatie via de bestaande helper mag_bedrijf_beheren(company_id):
--   module_abonneren       — eerste activatie (of opnieuw na opzegging) = de
--                            abonnementsstap. Legt geactiveerd_op vast.
--   module_gebruik_zetten  — vrije aan/uit-toggle van het GEBRUIK (kolom `actief`).
--                            Alleen mogelijk bij een actief abonnement; géén opzegging.
--   module_opzeggen        — beëindigt het abonnement. Legt opgezegd_op vast.
--
-- Elke handeling schrijft een regel in module_historie (wie/wanneer/wijziging),
-- conform de loggende RPC-laag elders in het portaal.
--
-- company_id wordt geautoriseerd, nooit blind vertrouwd: mag_bedrijf_beheren()
-- weigert een gebruiker die het bedrijf niet mag beheren (en een anonieme aanroep,
-- want die heeft geen auth.uid()). Geen grant naar anon/public.
--
-- Idempotent: alle functies zijn create or replace.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- module_abonneren: de abonnementsstap. Eerste activatie van een module, of het
-- opnieuw aangaan na een eerdere opzegging (behandeld als nieuw abonnement: verse
-- geactiveerd_op, opgezegd_op gewist). Zet het gebruik meteen op 'aan'.
-- Weigert als er al een ACTIEF abonnement loopt (dan is dit geen abonnementsstap
-- maar hooguit een aan/uit-toggle).
-- ----------------------------------------------------------------------------
create or replace function public.module_abonneren(
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

  select abonnement_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status = 'actief' then
    raise exception 'Module is al geabonneerd';
  end if;

  insert into bedrijf_modules (company_id, module, actief, abonnement_status, geactiveerd_op, opgezegd_op)
  values (p_company_id, v_module, true, 'actief', now(), null)
  on conflict (company_id, module) do update
     set actief            = true,
         abonnement_status = 'actief',
         geactiveerd_op    = now(),
         opgezegd_op       = null;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Geabonneerd op module ' || v_module);
end;
$$;


-- ----------------------------------------------------------------------------
-- module_gebruik_zetten: vrije aan/uit-toggle van het gebruik. Pauzeert of hervat
-- de module zonder het abonnement te raken. Alleen toegestaan bij een actief
-- abonnement; 'geen' of 'opgezegd' moet eerst via module_abonneren.
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

  select abonnement_status, actief into v_status, v_actief
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Geen actief abonnement op deze module';
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
-- module_opzeggen: beëindigt het abonnement bewust. Zet de status op 'opgezegd',
-- legt opgezegd_op vast en zet het gebruik uit. Opnieuw gebruiken kan daarna alleen
-- via een nieuwe abonnementsstap (module_abonneren).
-- ----------------------------------------------------------------------------
create or replace function public.module_opzeggen(
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

  select abonnement_status into v_status
    from bedrijf_modules
   where company_id = p_company_id and module = v_module;

  if v_status is distinct from 'actief' then
    raise exception 'Geen actief abonnement om op te zeggen';
  end if;

  update bedrijf_modules
     set abonnement_status = 'opgezegd',
         opgezegd_op        = now(),
         actief             = false
   where company_id = p_company_id and module = v_module;

  insert into module_historie (company_id, module, wie, wanneer, wijziging)
  values (p_company_id, v_module, auth.uid(), now(), 'Abonnement opgezegd');
end;
$$;


-- ----------------------------------------------------------------------------
-- Rechten: uitsluitend ingelogde gebruikers; de echte autorisatie zit in
-- mag_bedrijf_beheren(). Geen grant naar anon/public.
-- ----------------------------------------------------------------------------
grant execute on function public.module_abonneren(uuid, text)            to authenticated;
grant execute on function public.module_gebruik_zetten(uuid, text, boolean) to authenticated;
grant execute on function public.module_opzeggen(uuid, text)             to authenticated;

commit;
