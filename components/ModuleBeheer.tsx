'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Company, BedrijfModule, ModuleStatus } from '@/lib/types'
import { MODULE_CATALOGUS } from '@/lib/modules-catalogus'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'

type Props = {
  company: Company
  initialModules: BedrijfModule[]
  huisstijl?: HuisstijlView
}

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_BADGE: Record<ModuleStatus, string> = {
  geen: 'bg-gray-100 text-gray-600',
  actief: 'bg-green-100 text-green-800',
  gestopt: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<ModuleStatus, string> = {
  geen: 'Niet actief',
  actief: 'Actief',
  gestopt: 'Gestopt',
}

export default function ModuleBeheer({
  company,
  initialModules,
  huisstijl = VEILIGE_HUISSTIJL,
}: Props) {
  const supabase = createClient()
  // Snel opzoekbaar per module-sleutel.
  const [modules, setModules] = useState<Record<string, BedrijfModule>>(() =>
    Object.fromEntries(initialModules.map(m => [m.module, m]))
  )
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  function patch(module: string, updates: Partial<BedrijfModule>) {
    setModules(prev => ({
      ...prev,
      [module]: {
        ...(prev[module] ?? {
          company_id: company.id,
          module,
          actief: false,
          module_status: 'geen' as ModuleStatus,
          geactiveerd_op: null,
          gestopt_op: null,
        }),
        ...updates,
      },
    }))
  }

  async function activeren(module: string, titel: string) {
    if (!confirm(
      `Module "${titel}" activeren voor ${company.name}?\n\n` +
      `De module wordt meteen bruikbaar. Met Aan/Uit pauzeert u later alleen het ` +
      `gebruik; Stopzetten beëindigt de module helemaal.`
    )) return
    setFout(null)
    setBezig(module)
    const { error } = await supabase.rpc('module_activeren', {
      p_company_id: company.id,
      p_module: module,
    })
    setBezig(null)
    if (error) { setFout(error.message); return }
    patch(module, {
      module_status: 'actief',
      actief: true,
      geactiveerd_op: new Date().toISOString(),
      gestopt_op: null,
    })
  }

  async function gebruikZetten(module: string, aan: boolean) {
    setFout(null)
    setBezig(module)
    const { error } = await supabase.rpc('module_gebruik_zetten', {
      p_company_id: company.id,
      p_module: module,
      p_aan: aan,
    })
    setBezig(null)
    if (error) { setFout(error.message); return }
    patch(module, { actief: aan })
  }

  async function stopzetten(module: string, titel: string) {
    if (!confirm(
      `Module "${titel}" stopzetten?\n\nDe module is daarna niet meer bruikbaar. ` +
      `U kunt 'm later opnieuw activeren.`
    )) return
    setFout(null)
    setBezig(module)
    const { error } = await supabase.rpc('module_stopzetten', {
      p_company_id: company.id,
      p_module: module,
    })
    setBezig(null)
    if (error) { setFout(error.message); return }
    patch(module, { module_status: 'gestopt', actief: false, gestopt_op: new Date().toISOString() })
  }

  const knop =
    'text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-50'

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Modules</p>
        </div>

        {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

        <div className="space-y-3">
          {MODULE_CATALOGUS.map(item => {
            const rij = modules[item.module]
            const status: ModuleStatus = rij?.module_status ?? 'geen'
            const actief = !!rij?.actief
            const bezigHier = bezig === item.module
            const bruikbaar = status === 'actief' && actief

            return (
              <div key={item.module} className="glass-tile rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-medium text-ink">{item.titel}</h2>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      {status === 'actief' && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actief ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {actief ? 'In gebruik' : 'Gepauzeerd'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink/60 leading-relaxed mt-1">{item.omschrijving}</p>
                    {status === 'actief' && rij?.geactiveerd_op && (
                      <p className="text-xs text-ink/40 mt-2">
                        Actief sinds {formatDatum(rij.geactiveerd_op)}
                      </p>
                    )}
                    {status === 'gestopt' && rij?.gestopt_op && (
                      <p className="text-xs text-ink/40 mt-2">
                        Gestopt op {formatDatum(rij.gestopt_op)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {status === 'actief' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => gebruikZetten(item.module, !actief)}
                        disabled={bezigHier}
                        aria-pressed={actief}
                        className={`${knop} ${actief
                          ? 'bg-white text-ink/70 border-ink/20 hover:border-ink/40'
                          : 'bg-accent text-white border-accent hover:opacity-90'}`}
                      >
                        {actief ? 'Gebruik uitzetten' : 'Gebruik aanzetten'}
                      </button>
                      {bruikbaar && item.pad && (
                        <Link
                          href={`/${company.id}/${item.pad}`}
                          className={`${knop} bg-white text-ink/70 border-ink/20 hover:border-ink/40`}
                        >
                          Openen
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => stopzetten(item.module, item.titel)}
                        disabled={bezigHier}
                        className={`${knop} bg-white text-red-700 border-red-200 hover:border-red-400`}
                      >
                        Stopzetten
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activeren(item.module, item.titel)}
                      disabled={bezigHier}
                      className={`${knop} bg-accent text-white border-accent hover:opacity-90`}
                    >
                      {status === 'gestopt' ? 'Opnieuw activeren' : 'Activeren'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
