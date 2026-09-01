-- Migratie 0058: directe schrijftoegang op de audittabellen dicht
-- ----------------------------------------------------------------------------
-- Sluitstuk van 0055/0056/0057. De auditmodule was de laatste plek waar de
-- client rechtstreeks in de database schreef; daarom hielden audit,
-- audit_vca_bevinding, audit_iso_observatie en audit_verbeterpunt een
-- ALL-policy, terwijl de rest van het portaal alles via RPC's doet.
--
-- Migratie 0057 heeft de RPC's toegevoegd en AuditDetailClient.tsx gebruikt ze.
-- Nu kan de directe weg dicht. De RPC's zijn SECURITY DEFINER en draaien als
-- owner, dus die merken niets van RLS.
--
-- LET OP: deze vier tabellen hebben GEEN aparte select-policy — de ALL-policy
-- regelde ook het lezen. Botweg droppen zou de hele auditmodule onleesbaar
-- maken. Daarom hier ALL vervangen door SELECT met exact dezelfde voorwaarde,
-- zoals eerder bij rie_versies in migratie 0056.
--
-- VOLGORDE BIJ UITROL. Deze migratie hoort ná de nieuwe clientcode. Draait er nog
-- een oude build die rechtstreeks schrijft, dan mislukken daar de auditvelden
-- (stil op het scherm: de foutmelding komt in de balk bovenaan). Rol dus eerst
-- de code uit en pas daarna deze migratie — of accepteer een korte periode
-- waarin de auditmodule niet opslaat.
--
-- Hierna is de lijst van tabellen die buiten de RPC's om schrijfbaar zijn nog:
--   personen, pva_items          — de client schrijft daar bewust rechtstreeks
--   companies, merken, centrale_*, incident_*, toolbox_bron
--                                — admin-only referentietabellen (is_admin())
-- scripts/onveranderlijkheid_test.mjs DEEL 6 bewaakt die lijst.

begin;

drop policy if exists audit_all                on public.audit;
drop policy if exists audit_sel                on public.audit;
create policy audit_sel on public.audit
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

drop policy if exists audit_vca_bevinding_all  on public.audit_vca_bevinding;
drop policy if exists audit_vca_bevinding_sel  on public.audit_vca_bevinding;
create policy audit_vca_bevinding_sel on public.audit_vca_bevinding
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

drop policy if exists audit_iso_observatie_all on public.audit_iso_observatie;
drop policy if exists audit_iso_observatie_sel on public.audit_iso_observatie;
create policy audit_iso_observatie_sel on public.audit_iso_observatie
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

drop policy if exists audit_verbeterpunt_all   on public.audit_verbeterpunt;
drop policy if exists audit_verbeterpunt_sel   on public.audit_verbeterpunt;
create policy audit_verbeterpunt_sel on public.audit_verbeterpunt
  as permissive for select to public using (mag_bedrijf_beheren(company_id));

commit;
