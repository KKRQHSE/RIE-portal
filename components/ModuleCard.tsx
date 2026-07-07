'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Module, Vraag, Foto } from '@/lib/types'

const ANTWOORD_STYLE: Record<string, string> = {
  'Ja':                   'bg-green-100 text-green-800',
  'Nee':                  'bg-red-100 text-red-800',
  'NVT':                  'bg-gray-100 text-gray-600',
  'Gericht uit te vragen':'bg-yellow-100 text-yellow-800',
}

const KLASSE_STYLE: Record<string, string> = {
  Laag:   'bg-yellow-100 text-yellow-800',
  Middel: 'bg-orange-100 text-orange-800',
  Hoog:   'bg-red-100 text-red-800',
}

type Props = {
  companyId: string
  module: Module
  vragen: Vraag[]
  fotos: Foto[]
  filter: 'Alle' | 'Nee'
  highlightVraag: string | null
}

export default function ModuleCard({ companyId, module, vragen, fotos, filter, highlightVraag }: Props) {
  // Bevat deze module de aangewezen vraag? Zo ja: standaard open zodat het
  // anker-element bestaat en de scroll/highlight kan plaatsvinden.
  const hasTarget = highlightVraag != null && vragen.some(v => v.nr === highlightVraag)
  const [open, setOpen] = useState(hasTarget)

  // Forceer open zodra deze module het doelwit wordt (gebruiker mag daarna nog
  // zelf in-/uitklappen). Aangepast tijdens render i.p.v. in een effect — zie
  // React-docs "adjusting state when a prop changes".
  const [vorigHasTarget, setVorigHasTarget] = useState(hasTarget)
  if (hasTarget !== vorigHasTarget) {
    setVorigHasTarget(hasTarget)
    if (hasTarget) setOpen(true)
  }

  // Pas scrollen+markeren als de module daadwerkelijk open is en het anker bestaat.
  useEffect(() => {
    if (!open || !hasTarget) return
    const el = document.getElementById(`vraag-${highlightVraag}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('rie-flash')
    const t = setTimeout(() => el.classList.remove('rie-flash'), 2000)
    return () => clearTimeout(t)
  }, [open, hasTarget, highlightVraag])

  const shown = filter === 'Nee' ? vragen.filter(v => v.antwoord === 'Nee') : vragen
  const neeInModule = vragen.filter(v => v.antwoord === 'Nee').length

  if (filter === 'Nee' && shown.length === 0) return null

  return (
    <div className="glass-tile rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="shrink-0 font-mono text-xs font-medium bg-ink text-white px-2 py-1 rounded">
          {module.code}
        </span>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-ink">{module.titel}</span>
          {neeInModule > 0 && (
            <span className="ml-2 text-xs text-red-600">{neeInModule} aandachtspunt{neeInModule > 1 ? 'en' : ''}</span>
          )}
        </div>
        <span className="text-ink/30 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-surface">
          {module.intro && (
            <p className="text-sm text-ink/60 leading-relaxed px-4 py-3 bg-surface/50">
              {module.intro}
            </p>
          )}

          <div className="divide-y divide-surface">
            {shown.map(v => {
              const vraagFotos = fotos.filter(f => f.refs?.includes(v.nr))
              return (
                <div key={v.id} id={`vraag-${v.nr}`} className="px-4 py-3 scroll-mt-20">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs text-ink/40 mt-1 shrink-0">{v.nr}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">{v.vraag}</p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {v.antwoord && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${ANTWOORD_STYLE[v.antwoord] ?? 'bg-gray-100'}`}>
                            {v.antwoord}
                          </span>
                        )}
                        {v.klasse && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${KLASSE_STYLE[v.klasse] ?? ''}`}>
                            {v.klasse}
                          </span>
                        )}
                        {v.pva && (
                          <Link
                            href={`/${companyId}/pva#actie-${v.pva}`}
                            className="inline-flex items-center px-2 py-2.5 -my-2.5 text-xs text-accent font-mono hover:underline"
                          >
                            → actie {v.pva}
                          </Link>
                        )}
                      </div>

                      {v.bevinding && (
                        <p className="text-sm text-ink/60 leading-relaxed mt-2">{v.bevinding}</p>
                      )}

                      {vraagFotos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {vraagFotos.map(f => (
                            <span key={f.id} className="text-xs text-ink/40 font-mono bg-surface px-2 py-1 rounded">
                              foto {f.nr}: {f.locatie}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
