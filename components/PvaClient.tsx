'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { PvaItem, Company, Persoon } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import PvaCard from './PvaCard'
import ProgressRing from './ProgressRing'
import FilterBar from './FilterBar'
import LogoutButton from './LogoutButton'
import NaamVragen from './NaamVragen'
import HuisstijlLogo from './HuisstijlLogo'
import HerinnerBeheer, { type Ritme } from './HerinnerBeheer'

type Props = {
  company: Company
  initialItems: PvaItem[]
  magBeheren?: boolean
  personen?: Persoon[]
  huisstijl?: HuisstijlView
  toonNaamVragen?: boolean
  ritme?: Ritme
}

export default function PvaClient({ company, initialItems, magBeheren = false, personen = [], huisstijl = VEILIGE_HUISSTIJL, toonNaamVragen = false, ritme = 'uit' }: Props) {
  const [items, setItems] = useState<PvaItem[]>(initialItems)
  const [filterStatus, setFilterStatus] = useState('Alle')
  const [filterPrio, setFilterPrio] = useState('Alle')

  function handleUpdate(id: string, updates: Partial<PvaItem>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
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

  // Actiehouders met openstaande acties (voor de handmatige herinnering-keuze).
  // De eigenlijke verzendbaarheid (e-mail, geldige link, rem) bepaalt de server.
  const openPerPersoon = new Map<string, number>()
  items.forEach(i => {
    if (i.persoon_id && i.status !== 'Afgerond') {
      openPerPersoon.set(i.persoon_id, (openPerPersoon.get(i.persoon_id) ?? 0) + 1)
    }
  })
  const actiehouders = personen
    .filter(p => openPerPersoon.has(p.id))
    .map(p => ({ id: p.id, naam: p.naam, aantal: openPerPersoon.get(p.id) ?? 0 }))

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        {toonNaamVragen && <NaamVragen />}

        <div className="flex items-start justify-between mb-6">
          <div>
            <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
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

        <div className="flex gap-3 mb-6">
          <span className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white">
            Plan van Aanpak
          </span>
          <Link
            href={`/${company.id}/rie`}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
          >
            Volledige RI&amp;E
          </Link>
          {magBeheren && (
            <Link
              href={`/${company.id}/personen`}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
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

        {magBeheren && (
          <HerinnerBeheer
            companyId={company.id}
            initialRitme={ritme}
            actiehouders={actiehouders}
          />
        )}

        <FilterBar
          filterStatus={filterStatus}
          filterPrio={filterPrio}
          onStatusChange={setFilterStatus}
          onPrioChange={setFilterPrio}
        />

        <div className="space-y-3 mt-4">
          {filtered.map(item => (
            <PvaCard
              key={item.id}
              companyId={company.id}
              item={item}
              onUpdate={handleUpdate}
              personen={personen}
              magBeheren={magBeheren}
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
