-- Migratie 0002: harde deadline-datum op PvA-acties (termijn_datum)
-- Doel: fundament onder het managementdashboard — pas met een echte datum is
--       "over de termijn" berekenbaar. De bestaande tekstkolom `termijn` blijft
--       leidend voor weergave; `termijn_datum` is de machine-leesbare deadline.
-- Veilig/opt-in: voegt alleen een nullable kolom + index toe. Geen bestaande kolom
--       of rij wijzigt van betekenis; geen RPC of pagina kijkt er nu naar.

-- 1. De nieuwe kolom. Nullable: bestaande rijen blijven NULL tot ze een datum krijgen.
alter table public.pva_items add column if not exists termijn_datum date;

-- 2. Index voor de dashboard-vraag "wat is over de termijn / verloopt binnenkort".
create index if not exists idx_pva_items_termijn_datum on public.pva_items(termijn_datum);

-- 3. Backfill — ALLEEN de eenduidige kwartaalwaarden ("Qn JJJJ" -> einde kwartaal).
--    Dit is deterministisch en raakt nu uitsluitend testdata (Alpha/Bravo).
--    De kwalitatieve horizonnen ("binnen 12 maanden" / "binnen 2 jaar", uitsluitend
--    bij echte klant Geissler) zijn GEEN kalenderdata: die vergen een ankerdatum +
--    horizon (vakoordeel Kees) en worden in een aparte, bewuste stap gevuld.
update public.pva_items
set termijn_datum =
      (make_date(
         substring(termijn from '\d{4}')::int,           -- jaartal
         (substring(termijn from 'Q(\d)')::int) * 3,      -- laatste maand van het kwartaal (3/6/9/12)
         1
       ) + interval '1 month' - interval '1 day')::date   -- laatste dag van die maand
where termijn_datum is null
  and termijn ~* '^\s*Q[1-4]\s+\d{4}\s*$';
