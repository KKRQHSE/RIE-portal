'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { PvaItem, Company, Persoon } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import PvaCard from './PvaCard'
import Gauge from './Gauge'
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
  toonInspecties?: boolean
}

export default function PvaClient({ company, initialItems, magBeheren = false, personen = [], huisstijl = VEILIGE_HUISSTIJL, toonNaamVragen = false, ritme = 'uit', toonInspecties = false }: Props) {
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
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        {toonNaamVragen && <NaamVragen />}

        <div className="flex items-start justify-between mb-6">
          <div>
            <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
            <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
            <p className="text-sm text-ink/50 mt-0.5">Plan van Aanpak RI&amp;E</p>
            <Link
              href={`/${company.id}/actielijst`}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1"
            >
              Centrale actielijst (alle bronnen) →
            </Link>
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

        {/* Overzicht: voortgang + openstaande acties bovenaan */}
        <div className="glass-tile rounded-2xl p-5 mb-6 flex flex-wrap items-center gap-5">
          <Gauge value={afgerond} total={items.length} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{afgerond} van {items.length} acties afgerond</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
              <span className="text-ink/60">{items.length - afgerond} open</span>
              {hoogOpen > 0 && <span className="text-red-600 font-medium">{hoogOpen} hoog nog open</span>}
            </div>
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
