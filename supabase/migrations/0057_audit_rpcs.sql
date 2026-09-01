-- Migratie 0057: schrijf-RPC's voor de auditmodule (additief)
-- ----------------------------------------------------------------------------
-- De auditmodule was de laatste plek waar de client rechtstreeks naar de
-- database schrijft, via een generieke `from(table).update(patch)` in
-- components/AuditDetailClient.tsx. Daardoor moesten audit, audit_vca_bevinding,
-- audit_iso_observatie en audit_verbeterpunt een ALL-policy houden, terwijl de
-- rest van het portaal alles via RPC's doet (zie 0055/0056).
--
-- Deze migratie voegt de RPC's toe en verandert verder NIETS: de ALL-policies
-- blijven hier nog staan. Pas migratie 0058 haalt ze weg, zodat er geen moment
-- is waarop de gedeployde app niet meer kan schrijven. Eerst deze migratie plus
-- de nieuwe clientcode uitrollen, dan pas 0058.
--
-- VORM: p_patch als jsonb, met een WITTE LIJST per tabel. Dat houdt de client
-- dicht bij wat hij deed (per veld opslaan bij blur) zonder dat er ooit een
-- willekeurige kolom geschreven kan worden. Een onbekende sleutel is geen stille
-- no-op maar een fout — een typefout in de client hoort op te vallen.
-- Geen dynamische SQL: elke kolom staat expliciet in de update.
--
-- Guards zoals overal: company afgeleid uit de RIJ (nooit uit een parameter),
-- mag_bedrijf_beheren null-veilig, anon-EXECUTE eruit (Beslissing 62).

begin;

-- ---------------------------------------------------------------------------
-- Interne helper: bestaat de audit, en mag deze gebruiker erbij? Geeft company.
-- ---------------------------------------------------------------------------
create or replace function public.audit_bewaak(p_audit_id uuid)
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_company uuid;
begin
  select company_id into v_company from audit where id = p_audit_id;
  if v_company is null then raise exception 'Audit niet gevonden'; end if;
  if not mag_bedrijf_beheren(v_company) then raise exception 'Geen toegang tot dit bedrijf'; end if;
  return v_company;
end;
$function$;

-- Onbekende sleutels in een patch zijn een fout, geen stille no-op.
create or replace function public.audit_patch_controle(p_patch jsonb, p_toegestaan text[])
 returns void language plpgsql immutable set search_path to 'public'
as $function$
declare v_sleutel text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Ongeldige invoer';
  end if;
  for v_sleutel in select jsonb_object_keys(p_patch) loop
    if not (v_sleutel = any(p_toegestaan)) then
      raise exception 'Onbekend veld: %', v_sleutel;
    end if;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- De audit zelf.
-- ---------------------------------------------------------------------------
create or replace function public.audit_opslaan(p_audit_id uuid, p_patch jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform audit_bewaak(p_audit_id);
  perform audit_patch_controle(p_patch, array[
    'titel', 'gericht_aan', 'auditor', 'status', 'datum', 'gesproken_met',
    'besproken_onderwerpen', 'bewijsdocumenten', 'samenvatting',
    'positieve_waarnemingen', 'conclusie'
  ]);

  -- status kent maar drie waarden; liever hier een nette melding dan een
  -- constraint-fout die als technische ruis bij de gebruiker landt.
  if p_patch ? 'status' and (p_patch->>'status') not in ('gepland', 'uitgevoerd', 'afgerond') then
    raise exception 'Ongeldige status';
  end if;

  update audit set
    titel        = case when p_patch ? 'titel'
                        then coalesce(nullif(btrim(p_patch->>'titel'), ''), 'Naamloze audit')
                        else titel end,
    gericht_aan  = case when p_patch ? 'gericht_aan'  then p_patch->>'gericht_aan'  else gericht_aan end,
    auditor      = case when p_patch ? 'auditor'      then p_patch->>'auditor'      else auditor end,
    status       = case when p_patch ? 'status'       then p_patch->>'status'       else status end,
    datum        = case when p_patch ? 'datum'        then nullif(p_patch->>'datum', '')::date else datum end,
    gesproken_met = case when p_patch ? 'gesproken_met' then p_patch->>'gesproken_met' else gesproken_met end,
    samenvatting = case when p_patch ? 'samenvatting' then p_patch->>'samenvatting' else samenvatting end,
    conclusie    = case when p_patch ? 'conclusie'    then p_patch->>'conclusie'    else conclusie end,
    besproken_onderwerpen = case when p_patch ? 'besproken_onderwerpen'
      then array(select jsonb_array_elements_text(p_patch->'besproken_onderwerpen'))
      else besproken_onderwerpen end,
    bewijsdocumenten = case when p_patch ? 'bewijsdocumenten'
      then array(select jsonb_array_elements_text(p_patch->'bewijsdocumenten'))
      else bewijsdocumenten end,
    positieve_waarnemingen = case when p_patch ? 'positieve_waarnemingen'
      then array(select jsonb_array_elements_text(p_patch->'positieve_waarnemingen'))
      else positieve_waarnemingen end,
    -- Server stempelt zelf; de client hoeft geen klok mee te sturen.
    bijgewerkt_op = now()
  where id = p_audit_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- VCA-bevinding (rijen komen uit de centrale catalogus; alleen bijwerken).
-- ---------------------------------------------------------------------------
create or replace function public.audit_vca_bevinding_opslaan(p_id uuid, p_patch jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  select audit_id into v_audit from audit_vca_bevinding where id = p_id;
  if v_audit is null then raise exception 'Bevinding niet gevonden'; end if;
  perform audit_bewaak(v_audit);
  perform audit_patch_controle(p_patch, array['status', 'toelichting']);

  if p_patch ? 'status' and (p_patch->>'status') not in ('geen_bemerkingen', 'verbeterpunt', 'afwijking') then
    raise exception 'Ongeldige bevindingstatus';
  end if;

  update audit_vca_bevinding set
    status      = case when p_patch ? 'status'      then p_patch->>'status'      else status end,
    toelichting = case when p_patch ? 'toelichting' then p_patch->>'toelichting' else toelichting end
  where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- ISO-observaties.
-- ---------------------------------------------------------------------------
create or replace function public.audit_iso_observatie_toevoegen(p_audit_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_company uuid; v_rij audit_iso_observatie;
begin
  v_company := audit_bewaak(p_audit_id);
  insert into audit_iso_observatie (audit_id, company_id, thema, volgorde)
  values (p_audit_id, v_company, '',
          coalesce((select max(volgorde) + 1 from audit_iso_observatie where audit_id = p_audit_id), 0))
  returning * into v_rij;
  return to_jsonb(v_rij);
end;
$function$;

create or replace function public.audit_iso_observatie_opslaan(p_id uuid, p_patch jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  select audit_id into v_audit from audit_iso_observatie where id = p_id;
  if v_audit is null then raise exception 'Observatie niet gevonden'; end if;
  perform audit_bewaak(v_audit);
  perform audit_patch_controle(p_patch, array['thema', 'iso_clausule', 'observatie']);

  update audit_iso_observatie set
    -- thema is NOT NULL; een leeggemaakt veld wordt een lege tekst, geen fout.
    thema        = case when p_patch ? 'thema' then coalesce(p_patch->>'thema', '') else thema end,
    iso_clausule = case when p_patch ? 'iso_clausule' then p_patch->>'iso_clausule' else iso_clausule end,
    observatie   = case when p_patch ? 'observatie'   then p_patch->>'observatie'   else observatie end
  where id = p_id;
end;
$function$;

create or replace function public.audit_iso_observatie_verwijderen(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  select audit_id into v_audit from audit_iso_observatie where id = p_id;
  if v_audit is null then return; end if;   -- al weg; geen fout
  perform audit_bewaak(v_audit);
  delete from audit_iso_observatie where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Verbeterpunten / afwijkingen.
-- ---------------------------------------------------------------------------
create or replace function public.audit_verbeterpunt_toevoegen(p_audit_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_company uuid; v_rij audit_verbeterpunt;
begin
  v_company := audit_bewaak(p_audit_id);
  insert into audit_verbeterpunt (audit_id, company_id, constatering, soort, volgorde)
  values (p_audit_id, v_company, '', 'verbeterpunt',
          coalesce((select max(volgorde) + 1 from audit_verbeterpunt where audit_id = p_audit_id), 0))
  returning * into v_rij;
  return to_jsonb(v_rij);
end;
$function$;

create or replace function public.audit_verbeterpunt_opslaan(p_id uuid, p_patch jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  select audit_id into v_audit from audit_verbeterpunt where id = p_id;
  if v_audit is null then raise exception 'Verbeterpunt niet gevonden'; end if;
  perform audit_bewaak(v_audit);
  perform audit_patch_controle(p_patch, array['constatering', 'soort']);

  if p_patch ? 'soort' and (p_patch->>'soort') not in ('verbeterpunt', 'afwijking') then
    raise exception 'Ongeldig soort';
  end if;

  update audit_verbeterpunt set
    constatering = case when p_patch ? 'constatering' then coalesce(p_patch->>'constatering', '') else constatering end,
    soort        = case when p_patch ? 'soort'        then p_patch->>'soort'        else soort end
  where id = p_id;
end;
$function$;

create or replace function public.audit_verbeterpunt_verwijderen(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_audit uuid;
begin
  select audit_id into v_audit from audit_verbeterpunt where id = p_id;
  if v_audit is null then return; end if;   -- al weg; geen fout
  perform audit_bewaak(v_audit);
  delete from audit_verbeterpunt where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Rechten (Beslissing 62). De twee helpers zijn intern en voor niemand
-- aanroepbaar; de rest alleen voor ingelogde gebruikers.
-- ---------------------------------------------------------------------------
revoke execute on function public.audit_bewaak(uuid) from public, anon, authenticated;
grant  execute on function public.audit_bewaak(uuid) to service_role;
revoke execute on function public.audit_patch_controle(jsonb, text[]) from public, anon, authenticated;
grant  execute on function public.audit_patch_controle(jsonb, text[]) to service_role;

revoke execute on function public.audit_opslaan(uuid, jsonb) from public, anon;
grant  execute on function public.audit_opslaan(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.audit_vca_bevinding_opslaan(uuid, jsonb) from public, anon;
grant  execute on function public.audit_vca_bevinding_opslaan(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.audit_iso_observatie_toevoegen(uuid) from public, anon;
grant  execute on function public.audit_iso_observatie_toevoegen(uuid) to authenticated, service_role;
revoke execute on function public.audit_iso_observatie_opslaan(uuid, jsonb) from public, anon;
grant  execute on function public.audit_iso_observatie_opslaan(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.audit_iso_observatie_verwijderen(uuid) from public, anon;
grant  execute on function public.audit_iso_observatie_verwijderen(uuid) to authenticated, service_role;
revoke execute on function public.audit_verbeterpunt_toevoegen(uuid) from public, anon;
grant  execute on function public.audit_verbeterpunt_toevoegen(uuid) to authenticated, service_role;
revoke execute on function public.audit_verbeterpunt_opslaan(uuid, jsonb) from public, anon;
grant  execute on function public.audit_verbeterpunt_opslaan(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.audit_verbeterpunt_verwijderen(uuid) from public, anon;
grant  execute on function public.audit_verbeterpunt_verwijderen(uuid) to authenticated, service_role;

commit;
