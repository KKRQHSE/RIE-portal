'use client'

import { useState } from 'react'
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
  module: Module
  vragen: Vraag[]
  fotos: Foto[]
  filter: 'Alle' | 'Nee'
}

export default function ModuleCard({ module, vragen, fotos, filter }: Props) {
  const [open, setOpen] = useState(false)

  const shown = filter === 'Nee' ? vragen.filter(v => v.antwoord === 'Nee') : vragen
  const neeInModule = vragen.filter(v => v.antwoord === 'Nee').length

  if (filter === 'Nee' && shown.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                <div key={v.id} className="px-4 py-3">
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
                          <span className="text-xs text-ink/40 font-mono">→ actie {v.pva}</span>
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
