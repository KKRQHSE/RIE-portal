-- Migratie 0050: AI-conceptsuggestie bij een inspectiepunt met foto
-- ----------------------------------------------------------------------------
-- De inspecteur kan één foto bij een inspectiepunt door een externe AI laten
-- beschrijven. Wat terugkomt is een CONCEPT: een beschrijving van wat op de foto
-- te zien is + een voorgestelde bevinding. Het is NOOIT de bevinding zelf.
--
-- DE MENS BESLIST. Deze tabel scheidt daarom twee dingen die je nooit door elkaar
-- wilt zien lopen:
--   * ai_beschrijving / ai_concept — letterlijk wat de leverancier teruggaf,
--     onveranderd bewaard als herkomstbewijs;
--   * status + besluit_tekst + besloten_op/_door — wat de mens ermee deed.
-- Zolang status = 'concept' staat er niets in de bevinding zelf. Pas bij het
-- besluit 'overgenomen' schrijft de RPC de (door de mens vastgestelde, mogelijk
-- bewerkte) tekst naar inspectie_bevinding.opmerking, met een historieregel.
--
-- AVG. De foto verlaat de privé bucket en gaat naar een EXTERNE AI-dienst die
-- (voor Groq) buiten de EU draait. Daarom:
--   * uitsluitend op EXPLICIETE opt-in per foto — p_toestemming moet true zijn,
--     de RPC weigert anders; het vinkje staat in de UI standaard uit;
--   * de toestemming wordt vastgelegd op de rij (toestemming_bevestigd), zodat
--     achteraf aantoonbaar is dat er een bewuste handeling aan voorafging;
--   * alleen foto's die aan een INSPECTIEPUNT hangen (bevinding_id not null) —
--     de doorgifte heeft daarmee altijd een aanwijsbaar doel en doelveld;
--   * de aanroep loopt volledig server-side (app/api/inspectie/ai-analyse); de
--     API-sleutel bereikt de browser nooit.
-- Zie het AVG-punt in Projectstand.md.
--
-- foto_id is ON DELETE SET NULL, geen cascade: verwijdert de inspecteur later de
-- foto, dan blijft de vastlegging dat er een foto naar de AI is gegaan bestaan.
-- De foto zelf is dan weg; het verantwoordingsspoor niet.
--
-- Additief: nieuwe tabel, nieuwe functies. Bestaande werking verandert niet.
-- Guards null-veilig via mag_bedrijf_beheren (coalesce aan de bron, migratie
-- 0022), anon-EXECUTE eruit (Beslissing 62).

begin;

-- 1. De tabel.
create table if not exists public.inspectie_ai_suggestie (
  id             uuid primary key default gen_random_uuid(),
  inspectie_id   uuid not null references public.inspectie(id) on delete cascade,
  -- Not null: AI-voorwerk hangt altijd aan één inspectiepunt, nooit los.
  bevinding_id   uuid not null references public.inspectie_bevinding(id) on delete cascade,
  foto_id        uuid references public.inspectie_foto(id) on delete set null,
  company_id     uuid not null references public.companies(id) on delete cascade,

  -- Onveranderd wat de leverancier teruggaf.
  ai_beschrijving text,
  ai_concept      text,
  leverancier     text not null,
  model           text not null,

  -- Bewijs van de bewuste opt-in die aan de doorgifte voorafging.
  toestemming_bevestigd boolean not null default false,

  -- De menselijke beslissing. 'concept' = nog niets vastgelegd in de bevinding.
  status         text not null default 'concept'
                 check (status in ('concept', 'overgenomen', 'verworpen')),
  besluit_tekst  text,
  besloten_op    timestamptz,
  besloten_door  uuid references auth.users(id) on delete set null,

  aangemaakt_op   timestamptz not null default now(),
  aangemaakt_door uuid references auth.users(id) on delete set null
);
create index if not exists inspectie_ai_suggestie_inspectie_idx on public.inspectie_ai_suggestie (inspectie_id);
create index if not exists inspectie_ai_suggestie_bevinding_idx on public.inspectie_ai_suggestie (bevinding_id);
create index if not exists inspectie_ai_suggestie_company_idx   on public.inspectie_ai_suggestie (company_id);

alter table public.inspectie_ai_suggestie enable row level security;

-- Lezen: alleen het eigen bedrijf. Muteren uitsluitend via de RPC's hieronder
-- (bewust geen insert/update/delete-policy).
drop policy if exists inspectie_ai_suggestie_sel on public.inspectie_ai_suggestie;
create policy inspectie_ai_suggestie_sel on public.inspectie_ai_suggestie
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

-- 2. Het AI-antwoord vastleggen als CONCEPT.
--    Bewust geen company_id/inspectie_id-parameter: die leiden we af uit de foto,
--    zodat de client ze niet kan vervalsen. Hergebruikt inspectie_foto_context
--    (migratie 0045) voor de guard + de bevroren-check.
create or replace function public.inspectie_ai_suggestie_opslaan(
  p_foto_id uuid, p_beschrijving text, p_concept text,
  p_leverancier text, p_model text, p_toestemming boolean
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_inspectie uuid; v_bevinding uuid; v_company uuid; v_id uuid;
begin
  -- Zonder bewuste opt-in had de foto de bucket niet mogen verlaten. De route
  -- controleert dit al voor de doorgifte; dit is de tweede slot op dezelfde deur.
  if coalesce(p_toestemming, false) is not true then
    raise exception 'Zonder toestemming mag deze foto niet naar een AI-dienst';
  end if;

  select inspectie_id, bevinding_id into v_inspectie, v_bevinding
    from inspectie_foto where id = p_foto_id;
  if v_inspectie is null then raise exception 'Foto niet gevonden'; end if;
  if v_bevinding is null then
    raise exception 'AI-voorwerk kan alleen bij een foto die aan een inspectiepunt hangt';
  end if;

  -- Guard (mag_bedrijf_beheren) + weigert een afgeronde/geannuleerde inspectie.
  v_company := inspectie_foto_context(v_inspectie, v_bevinding, true);

  insert into inspectie_ai_suggestie
    (inspectie_id, bevinding_id, foto_id, company_id,
     ai_beschrijving, ai_concept, leverancier, model,
     toestemming_bevestigd, status, aangemaakt_door)
  values
    (v_inspectie, v_bevinding, p_foto_id, v_company,
     nullif(btrim(coalesce(p_beschrijving, '')), ''),
     nullif(btrim(coalesce(p_concept, '')), ''),
     coalesce(nullif(btrim(coalesce(p_leverancier, '')), ''), 'onbekend'),
     coalesce(nullif(btrim(coalesce(p_model, '')), ''), 'onbekend'),
     true, 'concept', auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

-- 3. De menselijke beslissing. Dit is het enige punt waarop AI-voorwerk in de
--    bevinding zelf terechtkomt — en alleen met de tekst die de mens vaststelt.
create or replace function public.inspectie_ai_suggestie_besluit(
  p_suggestie_id uuid, p_besluit text, p_tekst text
) returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_inspectie uuid; v_bevinding uuid; v_status text;
  v_company uuid; v_punt text; v_tekst text;
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

    -- Alleen de toelichting; resultaat/afhandeling blijven onaangeroerd, die
    -- kiest de inspecteur zelf via bevinding_opslaan.
    update inspectie_bevinding set opmerking = v_tekst
     where id = v_bevinding;

    select punt_tekst_snap into v_punt from inspectie_bevinding where id = v_bevinding;
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

-- LET OP: `revoke ... from public` alleen is NIET genoeg. Supabase kent via default
-- privileges EXECUTE toe aan anon en authenticated; die grants overleven een revoke
-- van PUBLIC en moeten expliciet worden ingetrokken (Beslissing 62).
revoke execute on function public.inspectie_ai_suggestie_opslaan(uuid, text, text, text, text, boolean) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_opslaan(uuid, text, text, text, text, boolean) to authenticated, service_role;
revoke execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text) from public, anon;
grant  execute on function public.inspectie_ai_suggestie_besluit(uuid, text, text) to authenticated, service_role;

commit;
