-- Migratie 0023: anon/PUBLIC EXECUTE intrekken op per-bedrijf- en admin-RPC's
-- ----------------------------------------------------------------------------
-- Tweede verdedigingslaag bovenop de bron-fix (0022): ook al zou een guard ooit
-- falen, een anon-caller kan de functie niet eens aanroepen. We trekken EXECUTE
-- in voor PUBLIC + anon op alle SECURITY DEFINER-RPC's die per-bedrijf-toegang
-- bewaken (mag_bedrijf_beheren) of admin-only zijn (is_admin), en behouden
-- EXECUTE voor authenticated (ingelogde KAM/admin) + service_role.
--
-- BEWUST MET RUST GELATEN (moeten anon/token bereikbaar blijven):
--   * gast/actiehouder-token: deellink_data, deellink_actie_doorgeven,
--     deellink_actie_historie, deellink_bewijs_lijst, deellink_bewijs_pad,
--     deellink_bewijs_registreren, deellink_concept_update
--   * werknemer-token: toolbox_voor_token, toolbox_afronden_token
--   * helpers nodig in RLS / self-guarded: is_admin, my_company_id,
--     mag_bedrijf_beheren, mag_herinneren, huisstijl_van_bedrijf, zet_mijn_naam,
--     handle_new_user
--
-- Privilege-only (geen datawijziging). Idempotent: herhaald draaien is veilig.

begin;

do $$
declare
  r record;
  v_namen text[] := array[
    -- per-bedrijf (mag_bedrijf_beheren)
    'actie_doorgeven','actie_historie_ophalen','bedrijf_norm_overzicht','bedrijf_toolbox_overzicht',
    'bevinding_naar_actie','bevinding_opslaan','bewijs_lijst','bewijs_registreren','bewijs_verwijderen',
    'create_deellink','dashboard_overzicht','doelstelling_zetten','functiegroep_archiveren','functiegroep_opslaan',
    'geef_actie_vrij','herinner_kandidaten','herinnering_loggen','inspectie_afronden','inspectie_bibliotheek',
    'inspectie_conclusie_opslaan','inspectie_rapport','inspectie_start','inspectie_start_centraal','intrek_deellink',
    'koppel_mij_als_persoon','module_activeren','module_gebruik_zetten','module_stopzetten','persoon_functiegroep_zetten',
    'punt_opslaan','punt_verwijderen','rubriek_koppelen','rubriek_ontkoppelen','sjabloon_archiveren',
    'sjabloon_doelgroep_zetten','sjabloon_opslaan','stuur_concept_terug','toolbox_dashboard','toolbox_koppelen',
    'toolbox_lokaal_aanpassen','toolbox_ontkoppelen','toolbox_terug_naar_centraal','toolbox_uitzetten',
    'vraag_lokaal_aanpassen','vraag_terug_naar_centraal','vraag_uitzetten','zet_concept_beheerder','zet_herinner_ritme',
    -- admin-only (is_admin)
    'centrale_rubriek_opslaan','centrale_rubriek_archiveren','centrale_vraag_opslaan','centrale_vraag_archiveren',
    'centrale_toolbox_opslaan','centrale_toolbox_archiveren','centrale_toolbox_vraag_opslaan','centrale_toolbox_vraag_archiveren',
    'dashboard_admin_overzicht'
  ];
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (v_namen)
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

commit;
