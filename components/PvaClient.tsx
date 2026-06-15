'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { PvaItem, Company } from '@/lib/types'
import PvaCard from './PvaCard'
import ProgressRing from './ProgressRing'
import FilterBar from './FilterBar'
import LogoutButton from './LogoutButton'

type Props = {
  company: Company
  initialItems: PvaItem[]
}

export default function PvaClient({ company, initialItems }: Props) {
  const [items, setItems] = useState<PvaItem[]>(initialItems)
  const [filterStatus, setFilterStatus] = useState('Alle')
  const [filterPrio, setFilterPrio] = useState('Alle')

  function handleUpdate(id: string, updates: Partial<PvaItem>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

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

        <FilterBar
          filterStatus={filterStatus}
          filterPrio={filterPrio}
          onStatusChange={setFilterStatus}
          onPrioChange={setFilterPrio}
        />

        <div className="space-y-3 mt-4">
          {filtered.map(item => (
            <PvaCard key={item.id} item={item} onUpdate={handleUpdate} />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Geen acties voor deze filter.</p>
          )}
        </div>
      </div>
    </main>
  )
}
