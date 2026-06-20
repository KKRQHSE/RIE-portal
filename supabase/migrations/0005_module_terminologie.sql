-- Migratie 0005: terminologie — "abonnement" eruit, neutraal "module-status"
-- ----------------------------------------------------------------------------
-- Beslissing: het woord 'abonnement' (abonneren/opzeggen) verdwijnt overal, ook
-- in de database en de RPC-namen. Het drie-toestanden-model zelf blijft exact
-- gelijk; alleen de namen wijzigen:
--   kolom  abonnement_status      -> module_status
--   kolom  opgezegd_op            -> gestopt_op
--   waarde 'opgezegd'             -> 'gestopt'
--   RPC    module_abonneren(...)  -> module_activeren(...)
--   RPC    module_opzeggen(...)   -> module_stopzetten(...)
--   (module_gebruik_zetten en geactiveerd_op blijven; bevatten het woord niet.)
--
-- NIET-ADDITIEF: dit hernoemt bestaande kolommen, wijzigt een check-waarde en
-- dropt/hermaakt functies. Daarom vooraf getoond en pas na akkoord gedraaid.
-- Bestaande data: alleen de Alpha-rij bestaat (module_status='actief'); er is
-- geen 'opgezegd'-rij, dus de waarde-update raakt nu 0 rijen maar staat er voor
-- de volledigheid/herhaalbaarheid. Idempotent: guards op information_schema /
-- pg_constraint, zodat herhaald draaien veilig is.

begin;

-- 1. Kolommen hernoemen (alleen als de oude naam nog bestaat).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bedrijf_modules'
       and column_name = 'abonnement_status'
  ) then
    alter table public.bedrijf_modules rename column abonnement_status to module_status;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bedrijf_modules'
       and column_name = 'opgezegd_op'
  ) then
    alter table public.bedrijf_modules rename column opgezegd_op to gestopt_op;
  end if;
end $$;

-- 2. Oude check-constraint weg, data ombuigen, nieuwe check erop.
alter table public.bedrijf_modules
  drop constraint if exists bedrijf_modules_abonnement_status_check;

update public.bedrijf_modules
   set module_status = 'gestopt'
 where module_status = 'opgezegd';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bedrijf_modules_module_status_check'
  ) then
    alter table public.bedrijf_modules
      add constraint bedrijf_modules_module_status_check
      check (module_status in ('geen', 'actief', 'gestopt'));
  end if;
end $$;

-- 3. Oude functienamen droppen. De nieuwe namen (module_activeren /
--    module_stopzetten) en de bijgewerkte module_gebruik_zetten worden hierna
--    aangemaakt door db/module_zelfbeheer_rpcs.sql (create or replace).
drop function if exists public.module_abonneren(uuid, text);
drop function if exists public.module_opzeggen(uuid, text);

commit;
