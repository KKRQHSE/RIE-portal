'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Audit, AuditSjabloon, AuditStatus, Company } from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'
import Gauge from './Gauge'

const STATUS_BADGE: Record<AuditStatus, string> = {
  gepland:    'bg-gray-100 text-gray-600',
  uitgevoerd: 'bg-blue-100 text-blue-800',
  afgerond:   'bg-green-100 text-green-800',
}
const STATUS_LABEL: Record<AuditStatus, string> = {
  gepland: 'Gepland', uitgevoerd: 'Uitgevoerd', afgerond: 'Afgerond',
}
const SJABLOON_LABEL: Record<AuditSjabloon, string> = { vca: 'VCA-checklist', iso: 'ISO-verslag' }

export default function AuditsClient({
  company, companyId, huisstijl = VEILIGE_HUISSTIJL, initialAudits,
}: {
  company: Company
  companyId: string
  huisstijl?: HuisstijlView
  initialAudits: Audit[]
}) {
  const router = useRouter()
  const [audits] = useState<Audit[]>(initialAudits)
  const [formOpen, setFormOpen] = useState(false)
  const [sjabloon, setSjabloon] = useState<AuditSjabloon>('iso')
  const [titel, setTitel] = useState('')
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const jaren = Array.from(new Set(audits.map(a => a.jaar))).sort((a, b) => b - a)
  const ditJaar = new Date().getFullYear()
  const ditJaarAudits = audits.filter(a => a.jaar === ditJaar)
  const gedaan = ditJaarAudits.filter(a => a.status !== 'gepland').length

  async function maakAan(e: React.FormEvent) {
    e.preventDefault()
    if (!titel.trim() || bezig) return
    setBezig(true); setFout(null)
    const supabase = createClient()
    const { data: id, error } = await supabase.rpc('audit_aanmaken', {
      p_company_id: companyId, p_sjabloon: sjabloon, p_titel: titel.trim(), p_jaar: jaar,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    router.push(`/${companyId}/audits/${id as string}`)
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2"><LogoutButton /></div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Audits</p>
        </div>

        {/* Voortgang dit jaar */}
        <div className="glass-tile rounded-2xl p-4 mb-5 flex items-center gap-4">
          <Gauge value={gedaan} total={ditJaarAudits.length} size={72} label="uitgevoerd" />
          <div>
            <p className="text-sm font-medium text-ink">{gedaan} van {ditJaarAudits.length} interne audits uitgevoerd</p>
            <p className="text-xs text-ink/40 mt-0.5">{ditJaar}</p>
          </div>
        </div>

        {/* Nieuwe audit */}
        <div className="mb-5">
          {!formOpen ? (
            <button type="button" onClick={() => setFormOpen(true)}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center gap-2 rounded-full bg-accent text-white hover:opacity-90 transition-opacity">
              + Nieuwe audit
            </button>
          ) : (
            <form onSubmit={maakAan} className="bg-white rounded-2xl shadow-sm border border-ink/10 p-4 space-y-3">
              <p className="text-sm font-medium text-ink">Nieuwe audit</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="a-sjabloon" className="block text-xs text-ink/40 mb-1">Sjabloon</label>
                  <select id="a-sjabloon" value={sjabloon} onChange={e => setSjabloon(e.target.value as AuditSjabloon)}
                    className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm bg-white">
                    <option value="iso">ISO-verslag (per audit-moment)</option>
                    <option value="vca">VCA-checklist (H1-H11)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="a-jaar" className="block text-xs text-ink/40 mb-1">Jaar</label>
                  <input id="a-jaar" type="number" value={jaar} onChange={e => setJaar(parseInt(e.target.value) || ditJaar)}
                    className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="a-titel" className="block text-xs text-ink/40 mb-1">Titel</label>
                  <input id="a-titel" value={titel} onChange={e => setTitel(e.target.value)} required
                    placeholder="bv. Uitvoering tankauto's" className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm" />
                </div>
              </div>
              {fout && <p className="text-sm text-red-600">{fout}</p>}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={bezig || !titel.trim()}
                  className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                  {bezig ? 'Bezig…' : 'Aanmaken'}
                </button>
                <button type="button" onClick={() => { setFormOpen(false); setFout(null) }}
                  className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center rounded-full border border-ink/20 text-ink/60 hover:border-ink/40 transition-colors">
                  Annuleren
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Lijst per jaar */}
        {audits.length === 0 ? (
          <p className="text-center text-ink/40 py-10 text-sm">Nog geen audits. Maak er een aan.</p>
        ) : (
          jaren.map(j => (
            <div key={j} className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-3">{j}</h2>
              <div className="space-y-3">
                {audits.filter(a => a.jaar === j).map(a => (
                  <Link key={a.id} href={`/${companyId}/audits/${a.id}`}
                    className="block glass-tile glass-tile-hover rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{a.titel}</p>
                        <p className="text-xs text-ink/40 mt-0.5">{SJABLOON_LABEL[a.sjabloon]}{a.datum ? ` · ${a.datum}` : ''}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  )
}
