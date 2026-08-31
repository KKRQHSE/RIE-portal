-- ============================================================================
-- Fase A — RI&E-vraag: aparte beoordeling "aantoonbaar"
-- ----------------------------------------------------------------------------
-- Naast het antwoord (Ja/Nee/NVT/Gericht uit te vragen) legt de adviseur vast
-- of iets ook aantoonbaar is. Twee kolommen op public.vragen; geen aparte
-- tabel, geen policywijziging. De docx blijft de bron: de kolommen worden —
-- net als de rest van de RI&E-inhoud — bij elke herimport gewist en opnieuw
-- geschreven door import_rie_content.
--
-- Invarianten (bewust in de DB, niet alleen in de parser):
--   * aantoonbaar is 'Ja', 'Nee' of NULL  -> check-constraint.
--   * aantoonbaar is alleen betekenisvol bij antwoord = 'Ja'; bij 'Nee',
--     'NVT' en 'Gericht uit te vragen' blijft hij NULL -> genormaliseerd in
--     import_rie_content, zodat een onverwachte docx-waarde stil NULL wordt
--     in plaats van de hele import te laten crashen.
--
-- Additief en idempotent. Bestaande rijen krijgen NULL; bestaande waarden in
-- vragen/pva_items worden niet aangeraakt. De SELECT-policy op vragen blijft
-- ongewijzigd — nieuwe kolommen vallen automatisch onder `for select using
-- (...)`, dus de RI&E-inzage werkt zonder policywijziging.
-- ============================================================================

alter table public.vragen add column if not exists aantoonbaar             text;
alter table public.vragen add column if not exists aantoonbaar_toelichting text;

comment on column public.vragen.aantoonbaar is
  'Oordeel adviseur: is het bevestigende antwoord ook aantoonbaar? Ja/Nee/NULL. Alleen gevuld bij antwoord = ''Ja''.';
comment on column public.vragen.aantoonbaar_toelichting is
  'Vrije toelichting bij de aantoonbaarheid; NULL zodra aantoonbaar NULL is.';

-- `add constraint if not exists` bestaat niet in Postgres; vandaar de guard.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.vragen'::regclass
       and conname  = 'vragen_aantoonbaar_check'
  ) then
    alter table public.vragen
      add constraint vragen_aantoonbaar_check
      check (aantoonbaar is null or aantoonbaar in ('Ja', 'Nee'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- import_rie_content: ongewijzigd gedrag, plus de twee nieuwe kolommen.
-- Levert de dataset ze niet aan (oudere dataset.json, docx zonder de kolom),
-- dan blijft het resultaat NULL en is de import identiek aan voorheen.
-- ----------------------------------------------------------------------------
create or replace function public.import_rie_content(p_company_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dataset   jsonb;
  v_mod       jsonb;
  v_mod_ord   int;
  v_module_id uuid;
begin
  select dataset into v_dataset from public.companies where id = p_company_id;
  if v_dataset is null then
    raise exception 'Geen dataset voor company %', p_company_id;
  end if;

  -- Schoon herimporteren
  delete from public.vragen  where company_id = p_company_id;
  delete from public.modules where company_id = p_company_id;
  delete from public.fotos   where company_id = p_company_id;

  -- Modules + bijbehorende vragen
  for v_mod, v_mod_ord in
    select value, ordinality
    from jsonb_array_elements(coalesce(v_dataset->'modules','[]'::jsonb)) with ordinality
  loop
    insert into public.modules (company_id, code, titel, intro, volgorde)
    values (p_company_id, v_mod->>'code', v_mod->>'titel', v_mod->>'intro', v_mod_ord)
    returning id into v_module_id;

    insert into public.vragen
      (company_id, module_id, nr, vraag, antwoord, bevinding, brf, klasse, pva, volgorde,
       aantoonbaar, aantoonbaar_toelichting)
    select
      p_company_id, v_module_id,
      q.elem->>'nr', q.elem->>'vraag', q.elem->>'antwoord', q.elem->>'bevinding',
      q.elem->>'brf', nullif(q.elem->>'klasse',''), nullif(q.elem->>'pva',''), q.ord,
      -- Alleen een geldige waarde bij een 'Ja'-antwoord telt; al het andere
      -- (ontbrekend, leeg, onverwacht) wordt stil NULL.
      case when q.elem->>'antwoord' = 'Ja' and q.elem->>'aantoonbaar' in ('Ja','Nee')
           then q.elem->>'aantoonbaar' end,
      case when q.elem->>'antwoord' = 'Ja' and q.elem->>'aantoonbaar' in ('Ja','Nee')
           then nullif(btrim(coalesce(q.elem->>'aantoonbaar_toelichting','')), '') end
    from jsonb_array_elements(coalesce(v_mod->'vragen','[]'::jsonb))
         with ordinality as q(elem, ord);
  end loop;

  -- Foto's
  insert into public.fotos (company_id, nr, bestand, locatie, zie, betekenis, refs)
  select
    p_company_id,
    (f->>'nr')::int, f->>'bestand', f->>'locatie', f->>'zie', f->>'betekenis',
    coalesce(array(select jsonb_array_elements_text(f->'refs')), '{}')
  from jsonb_array_elements(coalesce(v_dataset->'fotos','[]'::jsonb)) as f;
end;
$function$;

-- Rechten ongewijzigd t.o.v. migratie 0003: destructieve interne functie,
-- alleen service_role. CREATE OR REPLACE behoudt de bestaande grants; dit is
-- de expliciete herhaling zodat het bestand op zichzelf klopt.
revoke execute on function public.import_rie_content(uuid) from public, anon, authenticated;
grant  execute on function public.import_rie_content(uuid) to service_role;
