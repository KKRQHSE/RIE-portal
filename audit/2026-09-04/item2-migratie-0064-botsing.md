# Item 2 — Migratie 0064-botsing: al opgelost, geen actie nodig

**Uitgangspunt (Ronde 2-rapport, 4 sept 2026):** er stonden twee migratiebestanden met nummer
`0064` — `0064_heartbeat_service_role_toegang.sql` (deze doorlichting) en
`0064_teamleider_statuskop.sql` (ongerelateerd parallel werk aan een teamleider-rol).

**Bevinding bij aanvang van dit vervolgwerk:** de botsing bestaat niet meer. De teamleider-sessie
heeft haar eigen bestanden hernummerd naar `0065_teamleider_statuskop.sql` en
`0066_teamleider_ui_aanvullingen.sql` (zie memory `teamleider-rol-ontwerp.md`: "0064 was al door een
gelijktijdige sessie geclaimd voor de heartbeat-fix, dus doorgenummerd"). Geverifieerd:

```
$ ls supabase/migrations | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -d
(geen output — geen dubbele nummers)
```

**Zijn beide migraties echt toegepast op de live DB?** Er is geen migratie-tracking-tabel in dit
project (`supabase_migrations`/vergelijkbaar bestaat niet — migraties worden handmatig met
`node scripts/db_run.mjs --file ...` tegen de live DB gedraaid, niet via de Supabase CLI). Dus
"toegepast, ja/nee" is alleen te verifiëren door het EFFECT van elke migratie live te checken:

```
$ node --use-system-ca scripts/db_run.mjs --json --query "
  select proname from pg_proc
  where proname in ('herinner_kandidaten','mag_bedrijf_werken')
  and pronamespace='public'::regnamespace;"
→ [{"proname":"herinner_kandidaten"},{"proname":"mag_bedrijf_werken"}]
```

`herinner_kandidaten` bestaat (effect van 0064, al uitgebreid getest in Deel A/`heartbeat_rpc_test.mjs`).
`mag_bedrijf_werken` bestaat (effect van 0063/0065/0066, bevestigd door
`teamleider_rol_isolatie_test.mjs` 44/44 in de volledige testsuite).

**Conclusie: geen actie nodig.** Beide migratiereeksen staan live, geen dubbele nummers meer, niets
om te hernummeren. Dit item is puur ter documentatie — geen commit met codewijzigingen.
