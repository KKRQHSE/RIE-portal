-- Migratie 0047: auditmodule in het normale module-zelfbeheer
-- ----------------------------------------------------------------------------
-- De auditmodule (0038-0041) was tot nu toe always-on: elk bedrijf zag de
-- audit-tegel en kon /audits openen, ongeacht bedrijf_modules. Vanaf nu is
-- 'audit' een gewone module met dezelfde drie toestanden als toolbox/inspectie/
-- incidenten ('geen' / 'actief' / 'gestopt' + de aan/uit-toggle op gebruik).
--
-- ER IS GEEN SCHEMAWIJZIGING NODIG. bedrijf_modules.module is vrije tekst zonder
-- check-constraint en de RPC's (module_activeren / module_gebruik_zetten /
-- module_stopzetten) zijn modulesleutel-agnostisch. Deze migratie is dus puur
-- DATA: hij zet de module aan waar hij feitelijk al in gebruik was.
--
-- ADDITIEF, NIETS VERDWIJNT. Bedrijven die al audits hebben (Dutch Waste) krijgen
-- de module op 'actief' + gebruik aan, zodat hun bestaande audits bereikbaar
-- blijven zodra de frontend gaat gaten. Bedrijven zonder audits krijgen NIETS —
-- die zien de module vanaf nu netjes als 'Niet actief' op het modulescherm en
-- kunnen hem zelf activeren.
--
-- on conflict do nothing: staat er al een rij voor (company, 'audit') — ook een
-- bewust op 'gestopt' gezette — dan blijft die staan. Deze migratie overschrijft
-- nooit een bestaande keuze. Daarmee is hij ook idempotent: twee keer draaien
-- verandert niets en levert geen dubbele historie op.
--
-- wie = null in module_historie: dit is een systeemactivatie bij migratie, geen
-- handeling van een ingelogde gebruiker. De kolom staat null toe.

begin;

-- 1. Module activeren voor elk bedrijf dat al auditdata heeft.
insert into public.bedrijf_modules (company_id, module, actief, module_status, geactiveerd_op, gestopt_op)
select distinct a.company_id, 'audit', true, 'actief', now(), null
  from public.audit a
on conflict (company_id, module) do nothing;

-- 2. Historieregel, alleen voor de bedrijven die hierboven daadwerkelijk zijn
--    aangezet (status 'actief' én nog geen audit-regel in de historie).
insert into public.module_historie (company_id, module, wie, wanneer, wijziging)
select bm.company_id, 'audit', null, now(),
       'Module audit geactiveerd (bestaande auditdata, migratie 0047)'
  from public.bedrijf_modules bm
 where bm.module = 'audit'
   and bm.module_status = 'actief'
   and exists (select 1 from public.audit a where a.company_id = bm.company_id)
   and not exists (
     select 1 from public.module_historie mh
      where mh.company_id = bm.company_id and mh.module = 'audit'
   );

commit;
