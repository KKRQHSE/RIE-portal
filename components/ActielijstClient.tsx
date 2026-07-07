'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Company, Persoon, PvaItem } from '@/lib/types'
import { BRON_FILTERS, type BronSoort, type Herkomst } from '@/lib/actie-herkomst'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'
import Gauge from './Gauge'

const STATUS_OPTS_BEWERK = ['Open', 'In behandeling', 'Afgerond']

export type ActieRij = { item: PvaItem; herkomst: Herkomst }

type Props = {
  company: Company
  companyId: string
  initialRijen: ActieRij[]
  personen: Persoon[]
  magBeheren: boolean
  huisstijl?: HuisstijlView
}

const STATUS_BADGE: Record<string, string> = {
  'Open':           'bg-gray-100 text-gray-700',
  'In behandeling': 'bg-blue-100 text-blue-800',
  'Afgerond':       'bg-green-100 text-green-800',
}

// Subtiele, semantische tint per bron (zoals de bestaande status-badges).
const BRON_BADGE: Record<BronSoort, string> = {
  rie:       'bg-accent/10 text-accent',
  inspectie: 'bg-blue-100 text-blue-800',
  audit:     'bg-purple-100 text-purple-800',
  incident:  'bg-amber-100 text-amber-800',
  los:       'bg-gray-100 text-gray-600',
}

const STATUS_OPTS = ['Alle', 'Open', 'In behandeling', 'Afgerond']
const PRIO_OPTS = ['Hoog', 'Middel', 'Laag']

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${
        active ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'
      }`}
    >
      {label}
    </button>
  )
}

export default function ActielijstClient({
  company, companyId, initialRijen, personen, magBeheren, huisstijl = VEILIGE_HUISSTIJL,
}: Props) {
  const [rijen, setRijen] = useState<ActieRij[]>(initialRijen)
  const [fStatus, setFStatus] = useState('Alle')
  const [fBron, setFBron] = useState<BronSoort | 'alle'>('alle')
  const [fVerantw, setFVerantw] = useState('alle') // 'alle' | persoon_id | 'niet'

  const [formOpen, setFormOpen] = useState(false)
  const [onderwerp, setOnderwerp] = useState('')
  const [persoonId, setPersoonId] = useState('')
  const [termijn, setTermijn] = useState('')
  const [prio, setPrio] = useState('Middel')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const naamVan = useMemo(() => {
    const m = new Map<string, string>()
    personen.forEach(p => m.set(p.id, p.naam))
    return m
  }, [personen])

  // De verantwoordelijke staat op RI&E/pva-acties als vrije tekst (verantw),
  // op losse acties als persoon_id. Leid één naam af zodat filteren en tonen
  // voor beide vormen klopt; null = écht niet toegewezen.
  function houderNaam(item: PvaItem): string | null {
    if (item.persoon_id && naamVan.has(item.persoon_id)) return naamVan.get(item.persoon_id)!
    const v = item.verantw?.trim()
    return v ? v : null
  }

  // Dropdown-opties uit de werkelijk voorkomende verantwoordelijken (niet uit de
  // personenlijst), anders mist de vrije-tekst-namen.
  const verantwOpties = useMemo(() => {
    const set = new Set<string>()
    rijen.forEach(({ item }) => {
      const n = houderNaam(item)
      if (n) set.add(n)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rijen, naamVan])

  const zichtbaar = rijen.filter(({ item, herkomst }) => {
    if (fStatus !== 'Alle' && item.status !== fStatus) return false
    if (fBron !== 'alle' && herkomst.soort !== fBron) return false
    if (fVerantw !== 'alle') {
      const n = houderNaam(item)
      if (fVerantw === 'niet') { if (n) return false }
      else if (n !== fVerantw) return false
    }
    return true
  })

  async function voegLosToe(e: React.FormEvent) {
    e.preventDefault()
    if (!onderwerp.trim() || bezig) return
    setBezig(true)
    setFout(null)
    const supabase = createClient()
    const { data: nieuwId, error } = await supabase.rpc('actie_los_toevoegen', {
      p_company_id: companyId,
      p_onderwerp: onderwerp.trim(),
      p_persoon_id: persoonId || null,
      p_termijn_datum: termijn || null,
      p_prio: prio,
    })
    if (error) { setFout(error.message); setBezig(false); return }

    // Verse rij ophalen (RLS staat SELECT op eigen bedrijf toe) en bovenaan zetten.
    const { data: rij } = await supabase.from('pva_items').select('*').eq('id', nieuwId as string).single()
    if (rij) {
      setRijen(prev => [
        { item: rij as PvaItem, herkomst: { soort: 'los', label: 'los toegevoegd', href: null } },
        ...prev,
      ])
    }
    setOnderwerp(''); setPersoonId(''); setTermijn(''); setPrio('Middel')
    setFormOpen(false); setBezig(false)
  }

  // Status inline bijwerken (RLS: pva_update staat eigen-bedrijf toe). Optimistisch;
  // bij fout terugdraaien naar de oude status. Hier landen ook de niet-RI&E-acties
  // die niet meer op /pva staan, dus die blijven zo beheerbaar.
  async function zetStatus(id: string, status: string) {
    const oud = rijen.find(r => r.item.id === id)?.item.status
    setRijen(prev => prev.map(r => (r.item.id === id ? { ...r, item: { ...r.item, status } } : r)))
    setFout(null)
    const supabase = createClient()
    const { error } = await supabase.from('pva_items').update({ status }).eq('id', id)
    if (error) {
      setFout(error.message)
      if (oud) setRijen(prev => prev.map(r => (r.item.id === id ? { ...r, item: { ...r.item, status: oud } } : r)))
    }
  }

  const afgerondTotaal = rijen.filter(r => r.item.status === 'Afgerond').length

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Centrale actielijst — alle acties, met herkomst</p>
        </div>

        {/* Voortgang van alle acties (los van het Plan van Aanpak RI&E). */}
        <div className="glass-tile rounded-2xl p-4 mb-4 flex items-center gap-4">
          <Gauge value={afgerondTotaal} total={rijen.length} size={72} />
          <div>
            <p className="text-sm font-medium text-ink">{afgerondTotaal} van {rijen.length} acties afgerond</p>
            <p className="text-xs text-ink/40 mt-0.5">alle bronnen samen</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTS.map(s => (
              <Pill key={s} label={s} active={fStatus === s} onClick={() => setFStatus(s)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {BRON_FILTERS.map(b => (
              <Pill key={b.code} label={b.label} active={fBron === b.code} onClick={() => setFBron(b.code)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="f-verantw" className="text-xs text-ink/40">Verantwoordelijke</label>
            <select
              id="f-verantw"
              value={fVerantw}
              onChange={e => setFVerantw(e.target.value)}
              className="text-sm rounded-full border border-ink/20 bg-white px-3 py-2 min-h-[44px] text-ink/70"
            >
              <option value="alle">Iedereen</option>
              <option value="niet">Niet toegewezen</option>
              {verantwOpties.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Losse actie toevoegen */}
        {magBeheren && (
          <div className="mb-5">
            {!formOpen ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center gap-2 rounded-full bg-accent text-white hover:opacity-90 transition-opacity"
              >
                + Losse actie toevoegen
              </button>
            ) : (
              <form onSubmit={voegLosToe} className="bg-white rounded-2xl shadow-sm p-4 space-y-3 border border-ink/10">
                <p className="text-sm font-medium text-ink">Nieuwe losse actie</p>
                <div>
                  <label htmlFor="a-onderwerp" className="block text-xs text-ink/40 mb-1">Onderwerp *</label>
                  <input
                    id="a-onderwerp"
                    value={onderwerp}
                    onChange={e => setOnderwerp(e.target.value)}
                    required
                    className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                    placeholder="Wat moet er gebeuren?"
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="a-verantw" className="block text-xs text-ink/40 mb-1">Verantwoordelijke</label>
                    <select
                      id="a-verantw"
                      value={persoonId}
                      onChange={e => setPersoonId(e.target.value)}
                      className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— Niet toegewezen —</option>
                      {personen.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="a-termijn" className="block text-xs text-ink/40 mb-1">Termijn</label>
                    <input
                      id="a-termijn"
                      type="date"
                      value={termijn}
                      onChange={e => setTermijn(e.target.value)}
                      className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="a-prio" className="block text-xs text-ink/40 mb-1">Prioriteit</label>
                    <select
                      id="a-prio"
                      value={prio}
                      onChange={e => setPrio(e.target.value)}
                      className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm bg-white"
                    >
                      {PRIO_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {fout && <p className="text-sm text-red-600">{fout}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={bezig || !onderwerp.trim()}
                    className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {bezig ? 'Bezig…' : 'Toevoegen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormOpen(false); setFout(null) }}
                    className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center rounded-full border border-ink/20 text-ink/60 hover:border-ink/40 transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <p className="text-xs text-ink/40 mb-3">{zichtbaar.length} van {rijen.length} acties</p>

        {/* Actierijen */}
        <div className="space-y-3">
          {zichtbaar.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Geen acties die aan de filters voldoen.</p>
          )}
          {zichtbaar.map(({ item, herkomst }) => (
            <div key={item.id} className="glass-tile rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-xs text-ink/40">{item.nr}</span>
                    {/* RI&E-acties: volledige beheer (concept/bewijs) blijft in het
                        Plan van Aanpak RI&E. Overige bronnen beheer je hier inline. */}
                    {herkomst.soort === 'rie' ? (
                      <Link
                        href={`/${companyId}/pva#actie-${item.nr}`}
                        className="font-medium text-ink hover:text-accent transition-colors"
                      >
                        {item.onderwerp || 'Zonder onderwerp'}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{item.onderwerp || 'Zonder onderwerp'}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-ink/50">
                    <select
                      value={item.status}
                      onChange={e => zetStatus(item.id, e.target.value)}
                      aria-label={`Status van actie ${item.nr}`}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer appearance-none ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-700'}`}
                    >
                      {STATUS_OPTS_BEWERK.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="truncate">👤 {houderNaam(item) ?? 'Niet toegewezen'}</span>
                    {item.termijn && <span className="truncate">🗓 {item.termijn}</span>}
                  </div>
                </div>
                {/* Klikbare herkomst → bronformulier (of nette niet-klikbare chip). */}
                {herkomst.href ? (
                  <Link
                    href={herkomst.href}
                    className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full hover:underline ${BRON_BADGE[herkomst.soort]}`}
                    title={`Naar de bron: ${herkomst.label}`}
                  >
                    {herkomst.label} <span aria-hidden="true">↗</span>
                  </Link>
                ) : (
                  <span className={`shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${BRON_BADGE[herkomst.soort]}`}>
                    {herkomst.label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
