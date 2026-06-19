-- Schema-introspectie (alleen lezen) voor verificatie tegen de RPC-aannames.
-- 1. Bestaan de relevante tabellen + helper?
select 'table' as soort, table_name as naam
from information_schema.tables
where table_schema='public'
  and table_name in ('bedrijf_modules','inspectie_sjabloon','inspectie_sjabloon_punt',
                     'inspectie','inspectie_bevinding','inspectie_historie',
                     'pva_items','personen','companies')
order by table_name;

-- 2. Helper-functie mag_bedrijf_beheren aanwezig?
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname='mag_bedrijf_beheren';

-- 3. Kolommen inspectie_bevinding
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='inspectie_bevinding'
order by ordinal_position;

-- 4. CHECK/constraints op inspectie_bevinding (de kern van de verificatie)
select con.conname, pg_get_constraintdef(con.oid) as definitie
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_namespace n on n.oid=rel.relnamespace
where n.nspname='public' and rel.relname='inspectie_bevinding'
order by con.contype, con.conname;

-- 5. Kolommen + constraints inspectie (status-enum, snap-velden)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='inspectie'
order by ordinal_position;

select con.conname, pg_get_constraintdef(con.oid) as definitie
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_namespace n on n.oid=rel.relnamespace
where n.nspname='public' and rel.relname='inspectie'
order by con.contype, con.conname;

-- 6. Kolommen inspectie_sjabloon / _punt / _historie
select 'inspectie_sjabloon' as tbl, column_name, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name='inspectie_sjabloon'
union all
select 'inspectie_sjabloon_punt', column_name, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name='inspectie_sjabloon_punt'
union all
select 'inspectie_historie', column_name, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name='inspectie_historie'
order by tbl, column_name;

-- 7. pva_items: relevante kolommen voor bevinding_naar_actie
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='pva_items'
  and column_name in ('nr','onderwerp','status','prio','bron_type','bron_id','company_id','updated_at')
order by column_name;

-- 8. bedrijf_modules kolommen + unieke constraint (voor on conflict)
select con.conname, pg_get_constraintdef(con.oid) as definitie
from pg_constraint con
join pg_class rel on rel.oid=con.conrelid
join pg_namespace n on n.oid=rel.relnamespace
where n.nspname='public' and rel.relname='bedrijf_modules'
order by con.contype, con.conname;
