-- Migratie 0088: secundaire en vleugje-accentkleur in de huisstijl
-- ----------------------------------------------------------------------------
-- De huisstijl kende tot nu toe precies één accentkleur (companies.accent_kleur_override,
-- erft anders van merken.accent_kleur). SeysCentra vraagt om een rustig
-- bruin/taupe fundament plus een spaarzaam magenta "vleugje" op badges — dat
-- past niet in één kleur. Twee losse, ADDITIEVE en optionele kolommen erbij,
-- zelfde patroon als accent_kleur_override: NULL = geen instelling = huidig
-- gedrag, geen regressie voor een bestaand of toekomstig bedrijf zonder rij.
--
-- accent_kleur_2_override   — secundaire/rustige tint (bv. gaugetrack, knop-
--                              hover-tint). Valt in de UI terug op --color-ink
--                              (de huidige neutrale tint) als hij niet gezet is.
-- accent_kleur_highlight_override — sprekend vleugje voor spaarzame badges
--                              (nu: het ongelezen-belletje). Valt terug op de
--                              gewone accentkleur (huidig gedrag) als hij niet
--                              gezet is.
--
-- Beide worden puur client-side als CSS-variabele met een geneste var()-
-- fallback toegepast (lib/huisstijl.ts, components/Gauge.tsx, app/globals.css,
-- components/NotificatieBel.tsx) — voor elk bedrijf zonder deze kolommen
-- gezet, is het gerenderde resultaat pixel-identiek aan vóór deze migratie.
--
-- huisstijl_van_bedrijf krijgt een CREATE OR REPLACE (zelfde signatuur) om de
-- twee velden mee terug te geven -> expliciete REVOKE nodig (AGENTS.md).
-- ============================================================================

begin;

alter table public.companies
  add column if not exists accent_kleur_2_override text,
  add column if not exists accent_kleur_highlight_override text;

comment on column public.companies.accent_kleur_2_override is
  'Secundaire/rustige accenttint (bv. gaugetrack, knop-hover). NULL = geen instelling = valt terug op de neutrale ink-tint (huidig gedrag).';
comment on column public.companies.accent_kleur_highlight_override is
  'Sprekend vleugje voor spaarzame badges (bv. het ongelezen-belletje). NULL = geen instelling = valt terug op de gewone accentkleur (huidig gedrag).';

CREATE OR REPLACE FUNCTION public.huisstijl_van_bedrijf(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp  public.companies;
  v_merk  public.merken;
begin
  select * into v_comp from public.companies where id = p_company_id;
  if v_comp.id is null then return null; end if;

  select * into v_merk from public.merken where id = v_comp.merk_id;

  return jsonb_build_object(
    'modus',                 v_comp.huisstijl_modus,
    'merk_naam',              coalesce(v_merk.naam, 'QHSE Totaal'),
    'merk_logo',               v_merk.logo_pad,
    'klant_logo',              v_comp.klant_logo_pad,
    'accent_kleur',            coalesce(nullif(v_comp.accent_kleur_override, ''), v_merk.accent_kleur, '#FF5200'),
    'accent_kleur_2',          nullif(v_comp.accent_kleur_2_override, ''),
    'accent_kleur_highlight',  nullif(v_comp.accent_kleur_highlight_override, ''),
    'lettertype',              coalesce(v_merk.lettertype, 'grotesk')
  );
end;
$function$;

revoke execute on function public.huisstijl_van_bedrijf(uuid) from public, anon;
grant execute on function public.huisstijl_van_bedrijf(uuid) to authenticated;
grant execute on function public.huisstijl_van_bedrijf(uuid) to service_role;

commit;
