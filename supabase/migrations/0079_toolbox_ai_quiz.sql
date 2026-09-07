-- ============================================================================
-- AI-gegenereerde, door de organisator bevestigde toolbox-quiz per bedrijf
-- ----------------------------------------------------------------------------
-- Bij een toolbox kan de organisator (KAM/admin) een AI-quiz laten genereren
-- op basis van de toolbox-inhoud + de onderwerpenbibliotheek (app/api/toolbox/
-- quiz-genereren). De AI doet alleen een voorstel -- niet opgeslagen, puur het
-- API-antwoord. Pas als de organisator minstens 3 vragen aanvinkt en op
-- Opslaan drukt, komt de quiz hier te staan (vervangt de vorige set voor dit
-- bedrijf+toolbox atomisch, via toolbox_quiz_opslaan).
--
-- Los van centrale_toolbox_vraag (het globale, admin-beheerde quiz-sjabloon)
-- en bedrijf_vraag_afwijking (tekst-only override van een BESTAANDE centrale
-- vraag, vereist een vraag_id) -- dit zijn nieuwe, volledig door het bedrijf
-- zelf geautoriseerde vragen, met eigen opties/antwoord/uitleg.
--
-- Bewust NIET gekoppeld aan de live toolbox_deelname-quizflow (die leest nog
-- steeds centrale_toolbox_vraag, zie migratie 0017) -- dat is een aparte,
-- latere keuze, geen onderdeel van deze migratie.
-- ============================================================================

begin;

create table if not exists public.bedrijf_toolbox_quiz (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  toolbox_id uuid not null references public.centrale_toolbox(id) on delete cascade,
  vraagtekst text not null,
  opties jsonb not null,
  juist_antwoord integer not null,
  uitleg text,
  volgorde integer not null default 0,
  aangemaakt_door uuid references public.users(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists bedrijf_toolbox_quiz_bedrijf_idx
  on public.bedrijf_toolbox_quiz (company_id, toolbox_id, volgorde);

alter table public.bedrijf_toolbox_quiz enable row level security;

drop policy if exists bedrijf_toolbox_quiz_sel on public.bedrijf_toolbox_quiz;
create policy bedrijf_toolbox_quiz_sel on public.bedrijf_toolbox_quiz
  for select using (mag_bedrijf_werken(company_id) or is_admin());

-- Geen insert/update/delete-policy: elke schrijfactie loopt via
-- toolbox_quiz_opslaan (security definer) hieronder, nooit via een
-- rechtstreekse tabel-write.

-- ----------------------------------------------------------------------------
-- toolbox_quiz_opslaan: vervangt atomisch de volledige quizset voor dit
-- bedrijf+toolbox. Minimaal 3 vragen -- dezelfde grens als de UI, hier
-- serverside afgedwongen (vertrouw de client niet). p_vragen: jsonb-array van
-- objecten { vraagtekst, opties: [...], juist_antwoord: int, uitleg }.
-- ----------------------------------------------------------------------------
create or replace function public.toolbox_quiz_opslaan(
  p_company_id uuid,
  p_toolbox_id uuid,
  p_vragen     jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   jsonb;
  v_opties jsonb;
  v_idx    integer := 0;
begin
  if not mag_bedrijf_beheren(p_company_id) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  if not exists (
    select 1 from bedrijf_toolbox where company_id = p_company_id and toolbox_id = p_toolbox_id
  ) then
    raise exception 'Deze toolbox is niet aan dit bedrijf gekoppeld';
  end if;
  if jsonb_typeof(p_vragen) is distinct from 'array' or jsonb_array_length(p_vragen) < 3 then
    raise exception 'Minimaal 3 vragen vereist';
  end if;
  if jsonb_array_length(p_vragen) > 20 then
    raise exception 'Te veel vragen in één keer';
  end if;

  for v_item in select * from jsonb_array_elements(p_vragen) loop
    if nullif(btrim(v_item ->> 'vraagtekst'), '') is null then
      raise exception 'Vraagtekst ontbreekt';
    end if;
    v_opties := v_item -> 'opties';
    if jsonb_typeof(v_opties) is distinct from 'array' or jsonb_array_length(v_opties) < 2 then
      raise exception 'Elke vraag heeft minstens 2 opties nodig';
    end if;
    if (v_item ->> 'juist_antwoord')::int < 0 or (v_item ->> 'juist_antwoord')::int >= jsonb_array_length(v_opties) then
      raise exception 'Ongeldig juist-antwoord-index';
    end if;
  end loop;

  delete from bedrijf_toolbox_quiz where company_id = p_company_id and toolbox_id = p_toolbox_id;

  for v_item in select * from jsonb_array_elements(p_vragen) loop
    insert into bedrijf_toolbox_quiz (company_id, toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde, aangemaakt_door)
    values (
      p_company_id, p_toolbox_id,
      left(btrim(v_item ->> 'vraagtekst'), 500),
      v_item -> 'opties',
      (v_item ->> 'juist_antwoord')::int,
      nullif(left(coalesce(v_item ->> 'uitleg', ''), 1000), ''),
      v_idx,
      auth.uid()
    );
    v_idx := v_idx + 1;
  end loop;
end;
$$;

revoke execute on function public.toolbox_quiz_opslaan(uuid, uuid, jsonb) from public, anon;
grant execute on function public.toolbox_quiz_opslaan(uuid, uuid, jsonb) to authenticated;

commit;
