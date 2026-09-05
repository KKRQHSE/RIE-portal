'use client'

// AVG-tab (admin-only) — basis-infrastructuur, geen volledig ingerichte module.
// ----------------------------------------------------------------------------
// Vijf secties, drie volwassenheidsniveaus:
//   1. Verwerkingsregister   — ECHT, gevuld vanuit lib/avg-register.ts (bron:
//      audit/2026-09-04/DATA-INVENTARIS.md). Grondslag is bewust NIET ingevuld:
//      dat is een juridische keuze, geen code-feit — zie OPENSTAAND.md.
//   2. Subverwerkers         — ECHT, zelfde bron.
//   3. Persoon (inzage)      — ECHT: leest rechtstreeks uit de bestaande, admin-
//      gebypasste RLS-policies (geen nieuwe rechten, geen nieuwe RPC). De
//      verwijder-/anonimiseeracties eronder zijn WEL alleen een schil: de knoppen
//      zijn zichtbaar uitgeschakeld, er wordt niets aangeroepen.
//   4. Inzage-/actielog      — ECHT: leest audit_log (bestaat al, migratie 0068).
//   5. Bewaartermijnen       — SCHIL: toont de huidige situatie uit de inventaris
//      met een expliciet "concept, nog niet vastgesteld"-label — geen verzonnen
//      termijnen, en leest nog niet uit een BEWAARTERMIJNEN.md (die bestaat nog
//      niet).
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AuditLogRegel, Persoon } from '@/lib/types'
import {
  VERWERKINGSREGISTER, SUBVERWERKERS, BEWAARTERMIJNEN, GRONDSLAG_NIET_VASTGESTELD,
} from '@/lib/avg-register'
import LogoutButton from './LogoutButton'

type Supa = ReturnType<typeof createClient>
type View = 'register' | 'subverwerkers' | 'persoon' | 'log' | 'bewaartermijnen'
type Bedrijf = { id: string; name: string }

// Kleine, herbruikbare badge voor "dit is nog niet vastgesteld/beschikbaar" —
// bewust dezelfde amber-toon overal, zodat in één oogopslag duidelijk is wat
// nog concept/placeholder is.
function ConceptBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
      {children}
    </span>
  )
}

export default function AvgBeheerClient({
  bedrijven, initialLog,
}: {
  bedrijven: Bedrijf[]
  initialLog: AuditLogRegel[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [view, setView] = useState<View>('register')

  const tab = (v: View, label: string, status: 'echt' | 'concept') => (
    <button onClick={() => setView(v)}
      className={`btn text-sm px-4 py-2 min-h-[44px] rounded-full border transition-colors inline-flex items-center gap-2
        ${view === v ? 'bg-accent text-white border-accent' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}>
      {label}
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'echt' ? 'bg-emerald-500' : 'bg-amber-500'} ${view === v ? 'brightness-150' : ''}`} />
    </button>
  )

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-ink/50 hover:text-accent transition-colors">← Beheer</Link>
          <h1 className="text-xl font-semibold text-ink mt-1">AVG</h1>
          <p className="text-sm text-ink/50 mt-0.5">
            Basis-infrastructuur. Admin-only, alles read-only. Zie{' '}
            <span className="font-mono text-xs">audit/2026-09-04/DATA-INVENTARIS.md</span> en{' '}
            <span className="font-mono text-xs">OPENSTAAND.md</span> voor de onderbouwing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tab('register', 'Verwerkingsregister', 'echt')}
          {tab('subverwerkers', 'Subverwerkers', 'echt')}
          {tab('persoon', 'Persoon', 'echt')}
          {tab('log', 'Inzage-/actielog', 'echt')}
          {tab('bewaartermijnen', 'Bewaartermijnen', 'concept')}
        </div>

        {view === 'register' && <RegisterSectie />}
        {view === 'subverwerkers' && <SubverwerkersSectie />}
        {view === 'persoon' && <PersoonSectie supabase={supabase} bedrijven={bedrijven} />}
        {view === 'log' && <LogSectie log={initialLog} bedrijven={bedrijven} />}
        {view === 'bewaartermijnen' && <BewaartermijnenSectie />}
      </div>
    </main>
  )
}

function RegisterSectie() {
  return (
    <section className="space-y-4">
      <p className="text-sm text-ink/50">
        {VERWERKINGSREGISTER.length} verwerkingen. Grondslag is voor elke regel bewust niet
        ingevuld — dat is een juridische beoordeling, geen codefeit.
      </p>
      {VERWERKINGSREGISTER.map(r => (
        <div key={r.id} className="glass-tile rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="font-medium text-ink">{r.proces}</h3>
            {r.bijzonderPersoonsgegeven && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                Bijzonder persoonsgegeven
              </span>
            )}
          </div>
          <p className="text-xs text-ink/50 mt-1">Betrokkenen: {r.betrokkenen}</p>
          {r.bijzonderToelichting && (
            <p className="text-xs text-red-700/80 mt-1">{r.bijzonderToelichting}</p>
          )}

          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
            <div>
              <dt className="text-xs text-ink/40">Persoonsgegevens</dt>
              <dd className="text-ink/80">{r.persoonsgegevens.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/40">Grondslag</dt>
              <dd><ConceptBadge>{r.grondslag === GRONDSLAG_NIET_VASTGESTELD ? r.grondslag : r.grondslag}</ConceptBadge></dd>
            </div>
            <div>
              <dt className="text-xs text-ink/40">Interne ontvangers</dt>
              <dd className="text-ink/80">{r.ontvangersIntern}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/40">Externe ontvangers / subverwerker</dt>
              <dd className="text-ink/80">
                {r.ontvangersExtern ?? '—'}
                {r.doorgifteBuitenEu && (
                  <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                    Doorgifte buiten EU
                  </span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink/40">Bewaartermijn</dt>
              <dd className="text-ink/80">{r.bewaartermijn}</dd>
            </div>
          </dl>
          <p className="text-xs text-ink/30 mt-2">Bron: {r.bron}</p>
        </div>
      ))}
    </section>
  )
}

function SubverwerkersSectie() {
  return (
    <section className="space-y-4">
      <p className="text-sm text-ink/50">
        Externe partijen die persoonsgegevens uit dit portaal verwerken.
      </p>
      {SUBVERWERKERS.map(s => (
        <div key={s.id} className="glass-tile rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="font-medium text-ink">{s.naam}</h3>
            {s.doorgifteBuitenEu === true && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Doorgifte buiten EU
              </span>
            )}
            {s.doorgifteBuitenEu === 'onbekend' && <ConceptBadge>Regio onbekend</ConceptBadge>}
          </div>
          <p className="text-xs text-ink/50 mt-1">{s.functie}</p>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink/40">Wat gaat erheen</dt>
              <dd className="text-ink/80">{s.watGaatErheen}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/40">Regio</dt>
              <dd className="text-ink/80">{s.regio}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/40">Opt-in</dt>
              <dd className="text-ink/80">{s.optIn}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink/40">Verwerkersovereenkomst / DPA</dt>
              <dd><ConceptBadge>{s.dpaStatus}</ConceptBadge></dd>
            </div>
          </dl>
        </div>
      ))}
    </section>
  )
}

// Wat er per persoon opgehaald wordt — puur tellingen via de bestaande,
// admin-gebypasste RLS ('OR is_admin()' op elke betrokken policy). Geen nieuwe
// RPC, geen nieuwe rechten. 'incident' staat er expliciet NIET bij: die tabel
// heeft geen persoon_id-kolom, alleen vrije tekst (naam_melder) — niet
// betrouwbaar automatisch te koppelen.
const PERSOON_TELLINGEN: { key: string; label: string; tabel: string }[] = [
  { key: 'toolbox', label: 'Toolbox-deelnames (incl. handtekening)', tabel: 'toolbox_deelname' },
  { key: 'inspecties', label: 'Inspecties uitgevoerd', tabel: 'inspectie' },
  { key: 'pva', label: 'PvA-acties toegewezen', tabel: 'pva_items' },
  { key: 'herinneringen', label: 'Herinneringen verzonden', tabel: 'herinnering_log' },
  { key: 'deellinks', label: 'Deellinks (actief + ingetrokken)', tabel: 'deellinks' },
  { key: 'inspectiedoelen', label: 'Inspectiedoelen ingesteld', tabel: 'bedrijf_inspectie_doel' },
]

function PersoonSectie({ supabase, bedrijven }: { supabase: Supa; bedrijven: Bedrijf[] }) {
  const [bedrijfId, setBedrijfId] = useState('')
  const [personen, setPersonen] = useState<Persoon[]>([])
  const [persoonId, setPersoonId] = useState('')
  const [ladenPersonen, setLadenPersonen] = useState(false)
  const [ladenTellingen, setLadenTellingen] = useState(false)
  const [tellingen, setTellingen] = useState<Record<string, number | null> | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const geselecteerdePersoon = personen.find(p => p.id === persoonId) ?? null

  async function kiesBedrijf(id: string) {
    setBedrijfId(id)
    setPersoonId('')
    setTellingen(null)
    setFout(null)
    setPersonen([])
    if (!id) return
    setLadenPersonen(true)
    const { data, error } = await supabase
      .from('personen')
      .select('id, company_id, naam, email, status, voorgesteld_door, archived_at, functiegroep_id, datum_in_dienst, datum_uit_dienst')
      .eq('company_id', id)
      .order('naam', { ascending: true })
    setLadenPersonen(false)
    if (error) { setFout(error.message); return }
    setPersonen((data ?? []) as Persoon[])
  }

  async function kiesPersoon(id: string) {
    setPersoonId(id)
    setTellingen(null)
    setFout(null)
    if (!id) return
    setLadenTellingen(true)
    const resultaten = await Promise.all(
      PERSOON_TELLINGEN.map(async t => {
        const { count, error } = await supabase
          .from(t.tabel)
          .select('id', { count: 'exact', head: true })
          .eq('persoon_id', id)
        return [t.key, error ? null : (count ?? 0)] as const
      })
    )
    setLadenTellingen(false)
    setTellingen(Object.fromEntries(resultaten))
  }

  return (
    <section className="space-y-4">
      <div className="glass-tile rounded-2xl p-4">
        <h3 className="font-medium text-ink mb-3">Wat ligt er over deze persoon</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-ink/50 block">
            <span className="block mb-1">Bedrijf</span>
            <select value={bedrijfId} onChange={e => kiesBedrijf(e.target.value)}
              className="w-full text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white">
              <option value="">— kies een bedrijf —</option>
              {bedrijven.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink/50 block">
            <span className="block mb-1">Persoon</span>
            <select value={persoonId} onChange={e => kiesPersoon(e.target.value)} disabled={!bedrijfId || ladenPersonen}
              className="w-full text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white disabled:opacity-40">
              <option value="">{ladenPersonen ? 'Laden…' : '— kies een persoon —'}</option>
              {personen.map(p => <option key={p.id} value={p.id}>{p.naam}{p.archived_at ? ' (gearchiveerd)' : ''}</option>)}
            </select>
          </label>
        </div>

        {fout && <p className="text-sm text-red-600 mt-3">{fout}</p>}

        {geselecteerdePersoon && (
          <div className="mt-4 pt-4 border-t border-ink/10">
            <p className="text-sm text-ink">{geselecteerdePersoon.naam}</p>
            <p className="text-xs text-ink/40 mb-3">
              {geselecteerdePersoon.email ?? 'geen e-mailadres'} · status: {geselecteerdePersoon.status}
            </p>

            {ladenTellingen ? (
              <p className="text-sm text-ink/40">Tellingen ophalen…</p>
            ) : tellingen ? (
              <ul className="text-sm text-ink/80 space-y-1">
                {PERSOON_TELLINGEN.map(t => (
                  <li key={t.key} className="flex justify-between">
                    <span>{t.label}</span>
                    <span className="font-medium">{tellingen[t.key] ?? '—'}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-xs text-ink/30 mt-3">
              Incidenten zijn hier bewust niet meegeteld: die tabel heeft geen persoon_id-kolom,
              alleen vrije tekst (naam_melder) — niet betrouwbaar automatisch te koppelen.
            </p>
          </div>
        )}
      </div>

      <div className="glass-tile rounded-2xl p-4">
        <h3 className="font-medium text-ink mb-1">Acties</h3>
        <p className="text-xs text-ink/40 mb-3">
          Nog niet beschikbaar — het verwijder-/anonimiseerpad bestaat nog niet in de backend.
          Zie OPENSTAAND.md, punt 4c.
        </p>
        <div className="flex flex-wrap gap-3">
          <button disabled title="Nog niet beschikbaar — backend volgt (OPENSTAAND.md #4c)"
            className="text-sm px-4 py-2 min-h-[40px] rounded-full border border-ink/20 bg-ink/5 text-ink/30 cursor-not-allowed">
            Verwijderen
          </button>
          <button disabled title="Nog niet beschikbaar — backend volgt (OPENSTAAND.md #4c)"
            className="text-sm px-4 py-2 min-h-[40px] rounded-full border border-ink/20 bg-ink/5 text-ink/30 cursor-not-allowed">
            Anonimiseren
          </button>
        </div>
      </div>
    </section>
  )
}

function LogSectie({ log, bedrijven }: { log: AuditLogRegel[]; bedrijven: Bedrijf[] }) {
  const [filter, setFilter] = useState('')
  const bedrijfNaam = new Map(bedrijven.map(b => [b.id, b.name]))

  const gefilterd = filter.trim()
    ? log.filter(r =>
        r.actie.toLowerCase().includes(filter.toLowerCase()) ||
        r.entiteit.toLowerCase().includes(filter.toLowerCase()))
    : log

  function datumNL(iso: string): string {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink/50">
          {gefilterd.length} van {log.length} recente regels uit <span className="font-mono text-xs">audit_log</span>.
        </p>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter op actie/entiteit…"
          className="text-sm border border-ink/20 rounded px-3 py-1.5 min-h-[36px] bg-white" />
      </div>

      <div className="glass-tile rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/40 border-b border-ink/10">
              <th className="p-3 font-medium">Wanneer</th>
              <th className="p-3 font-medium">Actie</th>
              <th className="p-3 font-medium">Entiteit</th>
              <th className="p-3 font-medium">Bedrijf</th>
              <th className="p-3 font-medium">Wie</th>
              <th className="p-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {gefilterd.map(r => (
              <tr key={r.id} className="border-b border-ink/5 align-top">
                <td className="p-3 whitespace-nowrap text-ink/70">{datumNL(r.wanneer)}</td>
                <td className="p-3 text-ink">{r.actie}</td>
                <td className="p-3 text-ink/70">{r.entiteit}</td>
                <td className="p-3 text-ink/70">{r.company_id ? (bedrijfNaam.get(r.company_id) ?? r.company_id) : '—'}</td>
                <td className="p-3 text-ink/40 font-mono text-xs">{r.wie ? r.wie.slice(0, 8) : '—'}</td>
                <td className="p-3 text-ink/50 max-w-xs truncate" title={r.detail ? JSON.stringify(r.detail) : ''}>
                  {r.detail ? JSON.stringify(r.detail) : '—'}
                </td>
              </tr>
            ))}
            {gefilterd.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-ink/40">Geen regels gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BewaartermijnenSectie() {
  return (
    <section className="space-y-3">
      <p className="text-sm text-ink/50">
        Schil — leest nu nog geen apart bestand, toont de huidige situatie uit de data-inventaris.
        Geen enkele termijn hieronder is vastgesteld; er is bewust niets ingevuld of geraden.
      </p>
      <div className="glass-tile rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/40 border-b border-ink/10">
              <th className="p-3 font-medium">Datasoort</th>
              <th className="p-3 font-medium">Huidige situatie</th>
              <th className="p-3 font-medium">Concept-bewaartermijn</th>
            </tr>
          </thead>
          <tbody>
            {BEWAARTERMIJNEN.map(b => (
              <tr key={b.id} className="border-b border-ink/5 align-top">
                <td className="p-3 text-ink">{b.datasoort}</td>
                <td className="p-3 text-ink/70">{b.huidigeSituatie}</td>
                <td className="p-3"><ConceptBadge>{b.conceptTermijn}</ConceptBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
