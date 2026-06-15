'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Company, Module, Vraag, Foto } from '@/lib/types'
import LogoutButton from './LogoutButton'
import ModuleCard from './ModuleCard'

type Props = {
  company: Company
  modules: Module[]
  vragen: Vraag[]
  fotos: Foto[]
}

export default function RieClient({ company, modules, vragen, fotos }: Props) {
  const [filter, setFilter] = useState<'Alle' | 'Nee'>('Alle')

  const neeCount = vragen.filter(v => v.antwoord === 'Nee').length

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <Image src="/logo.jpg" alt="QHSE Totaal" width={140} height={46} className="object-contain mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Risico-inventarisatie &amp; -evaluatie</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Link
            href={`/${company.id}/pva`}
            className="text-sm px-4 py-2 rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
          >
            Plan van Aanpak
          </Link>
          <span className="text-sm px-4 py-2 rounded-full bg-ink text-white">
            Volledige RI&amp;E
          </span>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setFilter('Alle')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === 'Alle' ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20'
            }`}
          >
            Alle vragen
          </button>
          <button
            onClick={() => setFilter('Nee')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === 'Nee' ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-ink/20'
            }`}
          >
            Alleen aandachtspunten ({neeCount})
          </button>
        </div>

        <div className="space-y-3">
          {modules.map(mod => (
            <ModuleCard
              key={mod.id}
              module={mod}
              vragen={vragen.filter(v => v.module_id === mod.id)}
              fotos={fotos}
              filter={filter}
            />
          ))}
          {modules.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Geen RI&amp;E-inhoud gevonden.</p>
          )}
        </div>
      </div>
    </main>
  )
}
