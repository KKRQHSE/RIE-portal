-- Migratie 0069: minimale rate limiting op de kostbaarste/meest misbruikbare routes
-- ----------------------------------------------------------------------------
-- Ronde-2-should-punt-9: rate limiting stond nergens. Supabase's eigen
-- auth-endpoints (login/signup/wachtwoord-reset) worden rechtstreeks vanuit
-- de browser aangeroepen (supabase-js) — die lopen NOOIT door een route van
-- deze app, dus zijn vanuit hier niet te rate-limiten (project-instelling,
-- zie SYSTEEMDOORLICHTING_APPLICATIEBEVEILIGING). Wat wél via een eigen route
-- loopt en een reëel misbruik-/kostenrisico heeft:
--   - gast-upload/incident-foto-upload (publiek, tokengebaseerd): opslag-
--     misbruik (al gemeld in Ronde-2-must-4, nu ook qua VOLUME beperkt).
--   - inspectie/ai-analyse: elke aanroep kost geld bij een externe AI-dienst.
-- Dit is dus geen algemeen rate-limit-raamwerk, maar gericht op deze twee
-- risicocategorieën.
--
-- Ontwerp: append-only log (zelfde stijl als herinnering_log/mag_herinneren),
-- geen aparte teller-rij die je zou moeten resetten. sleutel is een vrije
-- tekst (token, of 'user:<uuid>') zodat één RPC voor beide categorieën volstaat.
--
-- Additief; idempotent.

begin;

create table if not exists public.rate_limiet_log (
  id       uuid primary key default gen_random_uuid(),
  sleutel  text not null,
  actie    text not null,
  wanneer  timestamptz not null default now()
);

create index if not exists rate_limiet_log_sleutel_actie_wanneer_idx
  on public.rate_limiet_log (sleutel, actie, wanneer desc);

alter table public.rate_limiet_log enable row level security;

-- Geen enkele directe SELECT/INSERT-policy: uitsluitend te lezen/schrijven
-- via de SECURITY DEFINER-RPC hieronder, niemand anders — ook niet de admin
-- (dit is geen audit-trail om in te kijken, puur een telmechanisme).

create or replace function public.rate_limiet_toegestaan(
  p_sleutel text, p_actie text, p_max integer, p_venster_seconden integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_aantal integer;
begin
  if coalesce(btrim(p_sleutel), '') = '' or coalesce(btrim(p_actie), '') = '' then
    -- Zonder bruikbare sleutel geen zinnige telling — fail-closed (weigeren)
    -- is hier veiliger dan stilzwijgend altijd toestaan.
    return false;
  end if;

  select count(*) into v_aantal
  from public.rate_limiet_log
  where sleutel = p_sleutel and actie = p_actie
    and wanneer > now() - make_interval(secs => greatest(p_venster_seconden, 1));

  if v_aantal >= greatest(p_max, 0) then
    return false;
  end if;

  insert into public.rate_limiet_log (sleutel, actie) values (p_sleutel, p_actie);
  return true;
end;
$function$;

-- Zelfde default-ACL-valkuil als in migratie 0068 (dit project geeft elke
-- nieuwe functie standaard anon-EXECUTE via een project-brede default-ACL) —
-- hier bewust WEL nodig: de gast-upload-routes draaien met de anon-key.
revoke execute on function public.rate_limiet_toegestaan(text, text, integer, integer) from public;
grant execute on function public.rate_limiet_toegestaan(text, text, integer, integer) to anon, authenticated, service_role;

commit;
