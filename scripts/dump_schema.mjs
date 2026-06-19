// Schema-dumper: genereert een reviewbare DDL-dump van de public-schema naar db/schema.sql.
// Bron van waarheid voor het databaseschema, naast supabase/migrations.
// Alleen-lezen tegen DATABASE_URL; raakt geen data aan.
//   node scripts/dump_schema.mjs            -> schrijft db/schema.sql
//   node scripts/dump_schema.mjs --stdout   -> print naar stdout
import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnv() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch { /* valt terug op process.env */ }
  return { ...env, ...process.env }
}

const env = loadEnv()
const conn = env.DATABASE_URL
if (!conn) { console.error('DATABASE_URL ontbreekt in .env.local'); process.exit(2) }

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
const q = async (sql, params) => (await client.query(sql, params)).rows

function hdr(t) {
  return `\n-- ============================================================\n-- ${t}\n-- ============================================================\n`
}

await client.connect()
const out = []

out.push(`-- RI&E-portaal — schemadump (public)`)
out.push(`-- Gegenereerd door scripts/dump_schema.mjs op ${new Date().toISOString()}`)
out.push(`-- Bron van waarheid voor het databaseschema. NIET handmatig bewerken;`)
out.push(`-- regenereer met: node scripts/dump_schema.mjs`)
out.push(`-- PostgreSQL: ${(await q(`select version()`))[0].version}`)
out.push(`--`)
out.push(`-- Let op: dit is een review-/migratiedump van de public-schema. De auth-,`)
out.push(`-- storage- en realtime-schema's van Supabase worden NIET gedumpt (beheerd door het platform),`)
out.push(`-- behalve de expliciete integratie-trigger op auth.users onderaan.`)
out.push(``)
out.push(`-- Functies verwijzen naar elkaar; net als pg_dump stellen we de body-check uit`)
out.push(`-- zodat de dump in willekeurige volgorde herspeelbaar is.`)
out.push(`SET check_function_bodies = false;`)

// 1. Extensies (informatief)
const exts = await q(`
  select e.extname, n.nspname as schema, e.extversion
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  order by e.extname`)
out.push(hdr('Extensies (informatief — meestal door Supabase beheerd)'))
for (const e of exts) out.push(`-- extension ${e.extname} v${e.extversion} (schema ${e.schema})`)

// 2. Enum-types in public
const enums = await q(`
  select t.typname,
         string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as labels
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname order by t.typname`)
if (enums.length) {
  out.push(hdr('Enum-types'))
  for (const e of enums) out.push(`CREATE TYPE public.${e.typname} AS ENUM (${e.labels});`)
}

// 3. Tabellen + kolommen
const tables = (await q(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by c.relname`)).map(r => r.relname)

out.push(hdr('Tabellen'))
for (const t of tables) {
  const cols = await q(`
    select a.attname,
           format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) as dflt
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ('public.'||$1)::regclass and a.attnum > 0 and not a.attisdropped
    order by a.attnum`, [t])
  const lines = cols.map(c => {
    let l = `  ${c.attname} ${c.type}`
    if (c.dflt) l += ` DEFAULT ${c.dflt}`
    if (c.attnotnull) l += ` NOT NULL`
    return l
  })
  out.push(`\nCREATE TABLE public.${t} (\n${lines.join(',\n')}\n);`)
}

// 4. Constraints (PK -> unique -> check -> FK), als ALTER TABLE zodat FK's resolven
out.push(hdr('Constraints'))
const cons = await q(`
  select c.relname as tbl, con.conname,
         pg_get_constraintdef(con.oid) as def,
         con.contype
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public'
  order by case con.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 when 'f' then 4 else 5 end,
           c.relname, con.conname`)
for (const c of cons) {
  out.push(`ALTER TABLE public.${c.tbl} ADD CONSTRAINT ${c.conname} ${c.def};`)
}

// 5. Indexen (niet-constraint-ondersteunend)
const idx = await q(`
  select c.relname as idxname, pg_get_indexdef(c.oid) as def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index x on x.indexrelid = c.oid
  where n.nspname='public' and c.relkind='i'
    and not exists (select 1 from pg_constraint con where con.conindid = c.oid)
  order by c.relname`)
if (idx.length) {
  out.push(hdr('Indexen (overig)'))
  for (const i of idx) out.push(`${i.def};`)
}

// 6. RLS aanzetten
out.push(hdr('Row Level Security — aanzetten'))
const rls = await q(`
  select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  order by c.relname`)
for (const r of rls) {
  out.push(`ALTER TABLE public.${r.relname} ENABLE ROW LEVEL SECURITY;`)
  if (r.relforcerowsecurity) out.push(`ALTER TABLE public.${r.relname} FORCE ROW LEVEL SECURITY;`)
}

// 7. RLS-policies
out.push(hdr('Row Level Security — policies'))
const pols = await q(`
  select tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies where schemaname='public'
  order by tablename, policyname`)
const rolesToText = (r) => {
  // pg geeft een text[] terug als JS-array of als string "{a,b}"; normaliseer naar "a, b".
  const arr = Array.isArray(r) ? r : String(r).replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  return arr.join(', ')
}
for (const p of pols) {
  const roles = rolesToText(p.roles)
  let s = `CREATE POLICY ${p.policyname} ON public.${p.tablename}`
  s += ` AS ${p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'}`
  s += ` FOR ${p.cmd} TO ${roles}`
  if (p.qual != null) s += `\n  USING (${p.qual})`
  if (p.with_check != null) s += `\n  WITH CHECK (${p.with_check})`
  out.push(s + ';')
}

// 8. Functies (volledige CREATE OR REPLACE)
out.push(hdr('Functies'))
const fns = await q(`
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
  order by p.proname, p.oid`)
for (const f of fns) out.push(f.def.replace(/\r\n/g, '\n').trimEnd() + ';')

// 9. Triggers op public-tabellen (geen interne FK-triggers)
out.push(hdr('Triggers (public)'))
const trgs = await q(`
  select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and not t.tgisinternal
  order by c.relname, t.tgname`)
if (trgs.length) for (const t of trgs) out.push(`${t.def};`)
else out.push(`-- (geen niet-interne triggers op public-tabellen)`)

// 10. Auth-integratie: de trigger op auth.users die public.handle_new_user aanroept
out.push(hdr('Auth-integratie (trigger op auth.users)'))
const authTrg = await q(`
  select pg_get_triggerdef(t.oid) as def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='auth' and c.relname='users' and not t.tgisinternal
  order by t.tgname`)
if (authTrg.length) for (const t of authTrg) out.push(`${t.def};`)
else out.push(`-- (geen niet-interne triggers op auth.users)`)

await client.end()

const sql = out.join('\n') + '\n'
if (process.argv.includes('--stdout')) {
  process.stdout.write(sql)
} else {
  writeFileSync(join(ROOT, 'db', 'schema.sql'), sql, 'utf8')
  console.log(`db/schema.sql geschreven (${sql.length} bytes, ${tables.length} tabellen, ${fns.length} functies, ${pols.length} policies, ${cons.length} constraints).`)
}
