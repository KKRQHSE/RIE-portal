'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PvaItem, Company, Persoon } from '@/lib/types'
import PvaCard from './PvaCard'
import ProgressRing from './ProgressRing'
import FilterBar from './FilterBar'
import LogoutButton from './LogoutButton'
import NaamVragen from './NaamVragen'

type Props = {
  company: Company
  initialItems: PvaItem[]
  magBeheren?: boolean
  personen?: Persoon[]
  toonNaamVragen?: boolean
}

export default function PvaClient({ company, initialItems, magBeheren = false, personen = [], toonNaamVragen = false }: Props) {
  const [items, setItems] = useState<PvaItem[]>(initialItems)
  const [filterStatus, setFilterStatus] = useState('Alle')
  const [filterPrio, setFilterPrio] = useState('Alle')

  // Toewijs-modus: checkboxes verschijnen alleen hierin (anders blijft de lijst rustig).
  const [toewijsModus, setToewijsModus] = useState(false)
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [doelPersoon, setDoelPersoon] = useState('')
  const [toewijsBezig, setToewijsBezig] = useState(false)

  function handleUpdate(id: string, updates: Partial<PvaItem>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  function toggleSelect(id: string) {
    setSelectie(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function sluitToewijzen() {
    setToewijsModus(false)
    setSelectie(new Set())
    setDoelPersoon('')
  }

  async function wijsToe() {
    if (!doelPersoon || selectie.size === 0 || toewijsBezig) return
    setToewijsBezig(true)
    const ids = [...selectie]
    const supabase = createClient()
    const { error } = await supabase
      .from('pva_items')
      .update({ persoon_id: doelPersoon })
      .in('id', ids)
    setToewijsBezig(false)
    if (error) return
    setItems(prev => prev.map(item => ids.includes(item.id) ? { ...item, persoon_id: doelPersoon } : item))
    sluitToewijzen()
  }

  // Scroll+highlight PAS nadat de acties gerenderd zijn (afhankelijk van items).
  // Eénmalig: niet opnieuw scrollen wanneer items muteren door een edit.
  const didScroll = useRef(false)
  useEffect(() => {
    if (didScroll.current || items.length === 0) return
    const m = window.location.hash.match(/^#actie-(.+)$/)
    if (!m) return
    const nr = decodeURIComponent(m[1])
    didScroll.current = true
    const el = document.getElementById(`actie-${nr}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('rie-flash')
    const t = setTimeout(() => el.classList.remove('rie-flash'), 2000)
    return () => clearTimeout(t)
  }, [items])

  const filtered = items.filter(item => {
    const statusOk = filterStatus === 'Alle' || item.status === filterStatus
    const prioOk = filterPrio === 'Alle' || item.prio === filterPrio
    return statusOk && prioOk
  })

  const afgerond = items.filter(i => i.status === 'Afgerond').length
  const hoogOpen = items.filter(i => i.prio === 'Hoog' && i.status !== 'Afgerond').length
  const pct = items.length > 0 ? Math.round((afgerond / items.length) * 100) : 0

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        {toonNaamVragen && <NaamVragen />}

        <div className="flex items-start justify-between mb-6">
          <div>
            <Image src="/logo.jpg" alt="QHSE Totaal" width={140} height={46} className="object-contain mb-2" />
            <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
            <p className="text-sm text-ink/50 mt-0.5">Plan van Aanpak</p>
          </div>
          {company.approved_at && (
            <div className="text-right">
              <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
                RI&amp;E goedgekeurd
              </span>
              {company.approved_by && (
                <p className="text-xs text-ink/40 mt-1">{company.approved_by}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          <span className="text-sm px-4 py-2 rounded-full bg-ink text-white">
            Plan van Aanpak
          </span>
          <Link
            href={`/${company.id}/rie`}
            className="text-sm px-4 py-2 rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
          >
            Volledige RI&amp;E
          </Link>
          {magBeheren && (
            <Link
              href={`/${company.id}/personen`}
              className="text-sm px-4 py-2 rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
            >
              Personen
            </Link>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-center gap-5">
          <ProgressRing value={afgerond} total={items.length} />
          <div>
            <p className="text-2xl font-semibold text-ink">{pct}%</p>
            <p className="text-sm text-ink/50">{afgerond} van {items.length} acties afgerond</p>
            {hoogOpen > 0 && (
              <p className="text-xs text-red-600 mt-1 font-medium">{hoogOpen} hoge prioriteit nog open</p>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <FilterBar
            filterStatus={filterStatus}
            filterPrio={filterPrio}
            onStatusChange={setFilterStatus}
            onPrioChange={setFilterPrio}
          />
          {magBeheren && (
            toewijsModus ? (
              <button
                onClick={sluitToewijzen}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors"
              >
                Klaar met toewijzen
              </button>
            ) : (
              <button
                onClick={() => setToewijsModus(true)}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-accent hover:text-accent transition-colors"
              >
                Acties toewijzen
              </button>
            )
          )}
        </div>

        {/* Toewijs-balk */}
        {magBeheren && toewijsModus && (
          <div className="bg-white rounded-lg shadow-sm p-3 mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink/60">{selectie.size} geselecteerd</span>
            <select
              value={doelPersoon}
              onChange={e => setDoelPersoon(e.target.value)}
              className="text-sm border border-ink/20 rounded px-2 py-1.5 bg-white"
            >
              <option value="">Kies persoon…</option>
              {personen.map(p => (
                <option key={p.id} value={p.id}>{p.naam}</option>
              ))}
            </select>
            <button
              onClick={wijsToe}
              disabled={!doelPersoon || selectie.size === 0 || toewijsBezig}
              className="text-sm px-4 py-1.5 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {toewijsBezig ? 'Bezig…' : `Wijs toe${selectie.size > 0 ? ` (${selectie.size})` : ''}`}
            </button>
            {personen.length === 0 && (
              <span className="text-xs text-ink/40">Nog geen personen — voeg ze toe bij Personen.</span>
            )}
          </div>
        )}

        <div className="space-y-3 mt-4">
          {filtered.map(item => (
            <PvaCard
              key={item.id}
              companyId={company.id}
              item={item}
              onUpdate={handleUpdate}
              personen={personen}
              magBeheren={magBeheren}
              toewijsModus={magBeheren && toewijsModus}
              geselecteerd={selectie.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Geen acties voor deze filter.</p>
          )}
        </div>
      </div>
    </main>
  )
}
