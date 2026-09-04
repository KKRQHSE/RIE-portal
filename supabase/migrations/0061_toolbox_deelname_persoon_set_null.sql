-- ============================================================================
-- Toolbox-bewijs overleeft het verwijderen van de gekoppelde persoon
-- ----------------------------------------------------------------------------
-- Gevonden in de systeemdoorlichting van 4 september 2026
-- (SYSTEEMDOORLICHTING_2026-09-04.md, categorie 4.4): toolbox_deelname.persoon_id
-- had ON DELETE CASCADE. Een gewone client-sessie kon dus een bevroren,
-- ondertekend toolbox-bewijsstuk permanent laten verdwijnen door simpelweg de
-- gekoppelde persoon rechtstreeks te verwijderen (personen heeft een brede
-- ALL-policy, geen trigger) — buiten personen_samenvoegen om, dus zonder
-- persoon_merge_log-regel.
--
-- inspectie.persoon_id deed dit al goed (ON DELETE SET NULL, migratie 0055).
-- Deze migratie trekt toolbox_deelname gelijk: de koppeling wordt losgelaten,
-- het bewijsstuk zelf (bevestigde_naam, handtekening, titel_snap, tekst_snap,
-- video/quiz-snapshots — allemaal al bevroren snapshotkolommen, onafhankelijk
-- van de live personen-rij) blijft intact bestaan.
--
-- De app heeft geen hard-delete-knop voor personen (alleen archiveren via
-- archived_at, zie components/PersonenClient.tsx) — dit pad is dus alleen
-- rechtstreeks via de database/REST bereikbaar, nooit via de UI. Geen
-- bestaande rij heeft persoon_id = null nodig gehad tot nu toe.
-- ============================================================================

-- persoon_id moet nullable worden voordat de FK ooit null mag zetten.
alter table public.toolbox_deelname
  alter column persoon_id drop not null;

alter table public.toolbox_deelname
  drop constraint toolbox_deelname_persoon_id_fkey;

alter table public.toolbox_deelname
  add constraint toolbox_deelname_persoon_id_fkey
  foreign key (persoon_id) references public.personen(id) on delete set null;

-- De onveranderlijkheids-trigger eiste tot nu toe altijd een persoon (om per
-- ongeluk "loskoppelen" via een gewone update te voorkomen). Die eis blokkeert
-- nu ook de legitieme FK-actie hierboven. toolbox_deelname heeft nog altijd
-- geen enkele client-schrijf-policy (zie migratie 0046/0056) — de enige twee
-- routes die persoon_id ooit wijzigen zijn de merge-RPC (personen_samenvoegen,
-- altijd een geldige nieuwe persoon in hetzelfde bedrijf) en deze FK-actie
-- (altijd naar null). Alle andere kolommen blijven kolomlijst-vrij bevroren.
create or replace function public.toolbox_deelname_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_company uuid;
begin
  if to_jsonb(new) - 'persoon_id' is distinct from to_jsonb(old) - 'persoon_id' then
    raise exception 'Een afgerond toolbox-record is onveranderlijk';
  end if;

  if new.persoon_id is distinct from old.persoon_id and new.persoon_id is not null then
    select company_id into v_company from personen where id = new.persoon_id;
    if v_company is null then
      raise exception 'Persoon niet gevonden';
    end if;
    if v_company <> old.company_id then
      raise exception 'Persoon hoort niet bij dit bedrijf';
    end if;
  end if;
  -- new.persoon_id is null: toegestaan (de gekoppelde persoon is verwijderd;
  -- het bewijsstuk blijft bevroren bestaan, alleen de koppeling valt weg).

  return new;
end;
$function$;

-- Bijeffect van het bovenstaande: 'aanwezigen' kan na een SET NULL een stille
-- null bevatten voor een sessie waarvan de deelnemer inmiddels is verwijderd.
-- Het bewijsstuk zelf blijft gewoon meetellen in 'opkomst' (dat is een count,
-- geen join); alleen deze array houden we schoon van nulls.
create or replace function public.toolbox_sessies_overzicht(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not mag_bedrijf_beheren(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

  select jsonb_build_object(
    'totaal_sessies', (select count(*) from toolbox_sessie s where s.company_id = p_company_id),
    'sessie_doel_per_jaar', coalesce(
      (select sessie_doel_per_jaar from bedrijf_toolbox_instelling where company_id = p_company_id), 12),
    'sessies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessie_id', s.id,
        'datum',     s.datum,
        'onderwerp', s.onderwerp,
        'notitie',   s.notitie,
        'toolbox_id', s.toolbox_id,
        'opkomst', (select count(*) from toolbox_deelname d where d.sessie_id = s.id),
        'aanwezigen', (
          select coalesce(jsonb_agg(d.persoon_id), '[]'::jsonb)
          from toolbox_deelname d where d.sessie_id = s.id and d.persoon_id is not null
        )
      ) order by s.datum desc, s.created_at desc), '[]'::jsonb)
      from toolbox_sessie s where s.company_id = p_company_id
    ),
    'personen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'persoon_id', p.id,
        'naam', p.naam,
        'functiegroep_naam', fg.naam,
        'bijgewoond', (
          select count(*) from toolbox_deelname d
          join toolbox_sessie s2 on s2.id = d.sessie_id
          where d.persoon_id = p.id and s2.company_id = p_company_id
        )
      ) order by p.naam), '[]'::jsonb)
      from personen p
      left join functiegroep fg on fg.id = p.functiegroep_id and fg.gearchiveerd_op is null
      where p.company_id = p_company_id and p.archived_at is null
    )
  ) into v;
  return v;
end;
$function$;
