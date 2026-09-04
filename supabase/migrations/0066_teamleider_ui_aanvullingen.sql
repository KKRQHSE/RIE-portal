-- Migratie 0066: teamleider — laatste DB-aanvullingen voor de UI-doorloop
-- ----------------------------------------------------------------------------
-- Drie dingen die pas bij het bouwen van de UI naar boven kwamen:
--
-- 1. bedrijf_toolbox_overzicht (de toolbox-ONDERWERPEN-catalogus, niet te
--    verwarren met bedrijfsvoering) stond nog op mag_bedrijf_beheren, terwijl
--    de hoofd-toolboxpagina hem onvoorwaardelijk gebruikt om te laten zien
--    welke toolbox een sessie kan koppelen — teamleider heeft dit nodig om een
--    sessie te registreren.
--
-- 2. toolbox_sessies_overzicht gaf 'aangemaakt_door' niet mee in de jsonb-
--    respons, terwijl de UI dat nodig heeft om de verwijderknop te beperken
--    tot eigen sessies voor teamleider (DB-laag stond dit al toe/dicht;
--    zonder dit veld kon de UI het verschil niet laten zien).
--
-- 3. bedrijf_norm_overzicht (de norm-koppeling/inhoud voor het opstarten van
--    een norm-gebaseerde inspectie) stond nog op mag_bedrijf_beheren. Bleek
--    bij nader inzien GEEN bedrijfsvoering-config maar de content die een
--    norm-inspectie zelf gaat tonen — teamleider ziet die toch zodra hij de
--    inspectie start, dus lezen mag. Wijzigen (rubriek_koppelen/ontkoppelen,
--    vraag_lokaal_aanpassen, vraag_terug_naar_centraal, vraag_uitzetten)
--    blijft op mag_bedrijf_beheren.
--
-- Additief; idempotent.

begin;

CREATE OR REPLACE FUNCTION public.bedrijf_toolbox_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(row order by volg, tid), '[]'::jsonb)
  into v
  from (
    select t.volgorde as volg, t.id as tid, jsonb_build_object(
      'toolbox_id',        t.id,
      'volgorde',          t.volgorde,
      'gekoppeld',         exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id),
      'centrale_titel',    t.titel,
      'centrale_tekst',    t.tekst,
      'centrale_video_url', t.video_url,
      'centrale_versie',   t.versie,
      'vereist_video',     t.vereist_video,
      'vereist_quiz',      t.vereist_quiz,
      'quiz_uitleg_modus', t.quiz_uitleg_modus,
      'toegang',           t.toegang,
      'quiz_aantal',       (select count(*) from centrale_toolbox_vraag q where q.toolbox_id=t.id and q.gearchiveerd_op is null),
      'centraal_vervallen', (t.gearchiveerd_op is not null),
      'afwijking', case when a.toolbox_id is null then null else jsonb_build_object(
        'modus', a.modus, 'lokale_titel', a.lokale_titel, 'lokale_tekst', a.lokale_tekst,
        'lokale_video_url', a.lokale_video_url, 'basis_versie', a.basis_versie) end,
      'norm_gewijzigd', (a.toolbox_id is not null and t.gearchiveerd_op is null and t.versie > a.basis_versie),
      'actief', (a.toolbox_id is null or a.modus <> 'uit'),
      'geldende_titel', case when a.modus='lokaal' and a.lokale_titel is not null then a.lokale_titel else t.titel end,
      'geldende_tekst', case when a.modus='lokaal' then a.lokale_tekst else t.tekst end,
      'geldende_video_url', case when a.modus='lokaal' and a.lokale_video_url is not null then a.lokale_video_url else t.video_url end
    ) as row
    from centrale_toolbox t
    left join bedrijf_toolbox_afwijking a on a.toolbox_id = t.id and a.company_id = p_company_id
    where t.gearchiveerd_op is null
       or exists (select 1 from bedrijf_toolbox bt where bt.company_id=p_company_id and bt.toolbox_id=t.id
                    and a.modus = 'lokaal')
  ) s;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toolbox_sessies_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then raise exception 'Geen toegang tot dit bedrijf'; end if;

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
        'aangemaakt_door', s.aangemaakt_door,
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

CREATE OR REPLACE FUNCTION public.bedrijf_norm_overzicht(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not mag_bedrijf_werken(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;

  select coalesce(jsonb_agg(rub order by rub_volgorde, rub_id), '[]'::jsonb)
  into v
  from (
    select
      r.volgorde as rub_volgorde,
      r.id       as rub_id,
      jsonb_build_object(
        'rubriek_id', r.id,
        'naam',       r.naam,
        'volgorde',   r.volgorde,
        'gekoppeld',  exists (
          select 1 from bedrijf_rubriek br
          where br.company_id = p_company_id and br.rubriek_id = r.id
        ),
        'vragen', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'vraag_id',        q.id,
            'volgorde',        q.volgorde,
            'centrale_tekst',  q.tekst,
            'centrale_versie', q.versie,
            -- Centraal gearchiveerd, maar door dit bedrijf lokaal behouden.
            'centraal_vervallen', (q.gearchiveerd_op is not null),
            'afwijking', case when a.vraag_id is null then null else jsonb_build_object(
              'modus',        a.modus,
              'lokale_tekst', a.lokale_tekst,
              'basis_versie', a.basis_versie
            ) end,
            -- 'norm gewijzigd' alleen bij een nog-actieve centrale vraag; bij een
            -- gearchiveerde vraag geldt 'centraal_vervallen' in plaats daarvan.
            'norm_gewijzigd', (a.vraag_id is not null and q.gearchiveerd_op is null and q.versie > a.basis_versie),
            'actief',         (a.vraag_id is null or a.modus <> 'uit'),
            'geldende_tekst', case
              when a.vraag_id is null    then q.tekst
              when a.modus = 'lokaal'    then a.lokale_tekst
              else null end
          ) order by q.volgorde, q.id), '[]'::jsonb)
          from centrale_vraag q
          left join bedrijf_vraag_afwijking a
            on a.vraag_id = q.id and a.company_id = p_company_id
          where q.rubriek_id = r.id
            -- Actieve vragen, plus gearchiveerde vragen die dit bedrijf lokaal hield.
            and (q.gearchiveerd_op is null or (a.vraag_id is not null and a.modus = 'lokaal'))
        )
      ) as rub
    from centrale_rubriek r
    where
      -- Niet-gearchiveerde rubrieken altijd (ook om te kunnen koppelen);
      -- gearchiveerde rubrieken alleen als dit bedrijf er een lokaal behouden vraag in heeft.
      r.gearchiveerd_op is null
      or exists (
        select 1
        from bedrijf_rubriek br
        join centrale_vraag q2 on q2.rubriek_id = r.id and q2.gearchiveerd_op is not null
        join bedrijf_vraag_afwijking a2 on a2.vraag_id = q2.id
          and a2.company_id = p_company_id and a2.modus = 'lokaal'
        where br.company_id = p_company_id and br.rubriek_id = r.id
      )
  ) s;

  return v;
end;
$function$;

commit;
