'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type {
  Audit, AuditStatus, AuditVcaBevinding, AuditVcaBevindingStatus,
  AuditIsoObservatie, AuditVerbeterpunt,
} from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'

type Supa = ReturnType<typeof createClient>

const STATUS_OPTS: AuditStatus[] = ['gepland', 'uitgevoerd', 'afgerond']
const STATUS_LABEL: Record<AuditStatus, string> = { gepland: 'Gepland', uitgevoerd: 'Uitgevoerd', afgerond: 'Afgerond' }

const BEV_OPTS: AuditVcaBevindingStatus[] = ['geen_bemerkingen', 'verbeterpunt', 'afwijking']
const BEV_LABEL: Record<AuditVcaBevindingStatus, string> = {
  geen_bemerkingen: 'Geen bemerkingen', verbeterpunt: 'Verbeterpunt', afwijking: 'Afwijking',
}
const BEV_KLEUR: Record<AuditVcaBevindingStatus, string> = {
  geen_bemerkingen: 'bg-green-50 text-green-700', verbeterpunt: 'bg-amber-100 text-amber-800', afwijking: 'bg-red-100 text-red-800',
}

const linesToArr = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const arrToLines = (a: string[] | null | undefined) => (a ?? []).join('\n')

const veld = 'w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none'

export default function AuditDetailClient({
  companyId, huisstijl = VEILIGE_HUISSTIJL,
  initialAudit, initialBevindingen, initialObservaties, initialVerbeterpunten,
}: {
  companyId: string
  huisstijl?: HuisstijlView
  initialAudit: Audit
  initialBevindingen: AuditVcaBevinding[]
  initialObservaties: AuditIsoObservatie[]
  initialVerbeterpunten: AuditVerbeterpunt[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [audit, setAudit] = useState<Audit>(initialAudit)
  const [bevindingen, setBevindingen] = useState<AuditVcaBevinding[]>(initialBevindingen)
  const [observaties, setObservaties] = useState<AuditIsoObservatie[]>(initialObservaties)
  const [verbeterpunten, setVerbeterpunten] = useState<AuditVerbeterpunt[]>(initialVerbeterpunten)
  const [fout, setFout] = useState<string | null>(null)

  async function persist(table: string, id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) setFout(error.message)
  }
  function updAudit(patch: Partial<Audit>, persistDb = true) {
    setAudit(prev => ({ ...prev, ...patch }))
    if (persistDb) persist('audit', audit.id, { ...patch, bijgewerkt_op: new Date().toISOString() })
  }

  async function maakActie(soort: 'vca' | 'verbeterpunt', bronId: string) {
    setFout(null)
    const { data: actieId, error } = await supabase.rpc('audit_bevinding_naar_actie', { p_soort: soort, p_bron_id: bronId })
    if (error) { setFout(error.message); return }
    if (soort === 'vca') setBevindingen(prev => prev.map(b => (b.id === bronId ? { ...b, actie_id: actieId as string } : b)))
    else setVerbeterpunten(prev => prev.map(v => (v.id === bronId ? { ...v, actie_id: actieId as string } : v)))
  }

  // Kopregel-tellers. Bewust AFGELEID, niet opgeslagen (0041): een opgeslagen
  // teller kan uit de pas lopen met de bevindingen eronder. Een VCA-audit heeft
  // geen verbeterpunt-rijen en een ISO-audit geen bevinding-rijen, dus beide
  // bronnen optellen werkt voor allebei de sjablonen.
  const tellers = useMemo(() => ({
    afwijkingen:
      bevindingen.filter(b => b.status === 'afwijking').length +
      verbeterpunten.filter(v => v.soort === 'afwijking').length,
    verbeterpunten:
      bevindingen.filter(b => b.status === 'verbeterpunt').length +
      verbeterpunten.filter(v => v.soort === 'verbeterpunt').length,
  }), [bevindingen, verbeterpunten])

  // VCA: groepeer op hoofdstuk (in volgorde).
  const vcaGroepen = useMemo(() => {
    const groepen: { hoofdstuk: string; titel: string; items: AuditVcaBevinding[] }[] = []
    for (const b of bevindingen) {
      let g = groepen.find(x => x.hoofdstuk === b.hoofdstuk)
      if (!g) { g = { hoofdstuk: b.hoofdstuk, titel: b.hoofdstuk_titel, items: [] }; groepen.push(g) }
      g.items.push(b)
    }
    return groepen
  }, [bevindingen])

  async function nieuweObservatie() {
    const { data, error } = await supabase.from('audit_iso_observatie')
      .insert({ audit_id: audit.id, company_id: audit.company_id, thema: '', volgorde: observaties.length })
      .select('*').single()
    if (error) { setFout(error.message); return }
    setObservaties(prev => [...prev, data as AuditIsoObservatie])
  }
  async function verwijderObservatie(id: string) {
    setObservaties(prev => prev.filter(o => o.id !== id))
    const { error } = await supabase.from('audit_iso_observatie').delete().eq('id', id)
    if (error) setFout(error.message)
  }
  async function nieuwVerbeterpunt() {
    const { data, error } = await supabase.from('audit_verbeterpunt')
      .insert({ audit_id: audit.id, company_id: audit.company_id, constatering: '', soort: 'verbeterpunt', volgorde: verbeterpunten.length })
      .select('*').single()
    if (error) { setFout(error.message); return }
    setVerbeterpunten(prev => [...prev, data as AuditVerbeterpunt])
  }
  async function verwijderVerbeterpunt(id: string) {
    setVerbeterpunten(prev => prev.filter(v => v.id !== id))
    const { error } = await supabase.from('audit_verbeterpunt').delete().eq('id', id)
    if (error) setFout(error.message)
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <Link href={`/${companyId}/audits`} className="text-sm text-ink/50 hover:text-accent transition-colors">← Terug naar audits</Link>
          <LogoutButton />
        </div>

        <div className="mb-5">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
            {audit.sjabloon === 'vca' ? 'VCA-checklist' : 'ISO-verslag'}
          </p>
        </div>

        {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

        {/* Kop */}
        <div className="glass-tile rounded-2xl p-5 mb-5 space-y-3">
          <input
            value={audit.titel}
            onChange={e => setAudit(p => ({ ...p, titel: e.target.value }))}
            onBlur={() => persist('audit', audit.id, { titel: audit.titel.trim() || 'Naamloze audit' })}
            aria-label="Titel" className={`${veld} font-medium`} placeholder="Titel van de audit"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink/40 mb-1">Aan</label>
              <input value={audit.gericht_aan ?? ''} placeholder="bv. Directie Dutch Waste Collectors BV"
                onChange={e => setAudit(p => ({ ...p, gericht_aan: e.target.value }))}
                onBlur={() => persist('audit', audit.id, { gericht_aan: audit.gericht_aan })} className={veld} />
            </div>
            <div>
              <label className="block text-xs text-ink/40 mb-1">Van</label>
              <input value={audit.auditor ?? ''} placeholder="Naam van de auditor"
                onChange={e => setAudit(p => ({ ...p, auditor: e.target.value }))}
                onBlur={() => persist('audit', audit.id, { auditor: audit.auditor })} className={veld} />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink/40 mb-1">Status</label>
              <select value={audit.status} onChange={e => updAudit({ status: e.target.value as AuditStatus })} className={`${veld} bg-white`}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink/40 mb-1">Datum</label>
              <input type="date" value={audit.datum ?? ''} onChange={e => updAudit({ datum: e.target.value || null })} className={veld} />
            </div>
            <div>
              <label className="block text-xs text-ink/40 mb-1">Gesproken met</label>
              <input value={audit.gesproken_met ?? ''} onChange={e => setAudit(p => ({ ...p, gesproken_met: e.target.value }))}
                onBlur={() => persist('audit', audit.id, { gesproken_met: audit.gesproken_met })} className={veld} />
            </div>
          </div>

          {/* Afgeleide tellers, zoals de kop van beide bronformulieren. */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tellers.afwijkingen > 0 ? 'bg-red-100 text-red-800' : 'bg-green-50 text-green-700'}`}>
              Afwijkingen: {tellers.afwijkingen}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tellers.verbeterpunten > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-50 text-green-700'}`}>
              Verbeterpunten: {tellers.verbeterpunten}
            </span>
          </div>
        </div>

        {/* VCA-checklist */}
        {audit.sjabloon === 'vca' && vcaGroepen.map(g => (
          <div key={g.hoofdstuk} className="mb-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-3">{g.hoofdstuk} · {g.titel}</h2>
            <div className="space-y-3">
              {g.items.map(b => (
                <div key={b.id} className="glass-tile rounded-2xl p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-xs text-ink/40">{b.code}</span>
                    <span className="font-medium text-ink">{b.titel}</span>
                  </div>
                  {b.omschrijving && <p className="text-xs text-ink/50 leading-relaxed mb-2">{b.omschrijving}</p>}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <select value={b.status}
                      onChange={e => {
                        const status = e.target.value as AuditVcaBevindingStatus
                        setBevindingen(prev => prev.map(x => (x.id === b.id ? { ...x, status } : x)))
                        persist('audit_vca_bevinding', b.id, { status })
                      }}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer ${BEV_KLEUR[b.status]}`}>
                      {BEV_OPTS.map(s => <option key={s} value={s}>{BEV_LABEL[s]}</option>)}
                    </select>
                    {b.status !== 'geen_bemerkingen' && (
                      b.actie_id
                        ? <span className="text-xs text-green-700">✓ Actie gekoppeld</span>
                        : <button type="button" onClick={() => maakActie('vca', b.id)}
                            className="text-xs px-3 py-1 rounded-full bg-accent text-white hover:opacity-90">Maak hier een actie van</button>
                    )}
                  </div>
                  <textarea rows={2} value={b.toelichting ?? ''} placeholder="Toelichting"
                    onChange={e => setBevindingen(prev => prev.map(x => (x.id === b.id ? { ...x, toelichting: e.target.value } : x)))}
                    onBlur={() => persist('audit_vca_bevinding', b.id, { toelichting: b.toelichting })}
                    className={`${veld} resize-y`} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ISO-verslag */}
        {audit.sjabloon === 'iso' && (
          <div className="space-y-5">
            <Blok titel="Besproken onderwerpen (één per regel)">
              <textarea rows={4} defaultValue={arrToLines(audit.besproken_onderwerpen)}
                onBlur={e => updAudit({ besproken_onderwerpen: linesToArr(e.target.value) })} className={`${veld} resize-y`} />
            </Blok>
            <Blok titel="Bewijsdocumenten (één per regel)">
              <textarea rows={3} defaultValue={arrToLines(audit.bewijsdocumenten)}
                onBlur={e => updAudit({ bewijsdocumenten: linesToArr(e.target.value) })} className={`${veld} resize-y`} />
            </Blok>
            <Blok titel="Samenvatting">
              <textarea rows={4} value={audit.samenvatting ?? ''}
                onChange={e => setAudit(p => ({ ...p, samenvatting: e.target.value }))}
                onBlur={() => persist('audit', audit.id, { samenvatting: audit.samenvatting })} className={`${veld} resize-y`} />
            </Blok>

            <Blok titel="Observaties per thema" actie={<AddKnop label="+ observatie" onClick={nieuweObservatie} />}>
              {observaties.length === 0 && <p className="text-sm text-ink/40">Nog geen observaties.</p>}
              <div className="space-y-3">
                {observaties.map(o => (
                  <div key={o.id} className="rounded-lg border border-ink/10 p-3 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input value={o.thema} placeholder="Thema (bv. Werkplekinspecties)"
                        onChange={e => setObservaties(prev => prev.map(x => (x.id === o.id ? { ...x, thema: e.target.value } : x)))}
                        onBlur={() => persist('audit_iso_observatie', o.id, { thema: o.thema })} className={veld} />
                      <input value={o.iso_clausule ?? ''} placeholder="ISO-clausule (bv. 7.1.4 – Omgeving)"
                        onChange={e => setObservaties(prev => prev.map(x => (x.id === o.id ? { ...x, iso_clausule: e.target.value } : x)))}
                        onBlur={() => persist('audit_iso_observatie', o.id, { iso_clausule: o.iso_clausule })} className={veld} />
                    </div>
                    <textarea rows={2} value={o.observatie ?? ''} placeholder="Observatie"
                      onChange={e => setObservaties(prev => prev.map(x => (x.id === o.id ? { ...x, observatie: e.target.value } : x)))}
                      onBlur={() => persist('audit_iso_observatie', o.id, { observatie: o.observatie })} className={`${veld} resize-y`} />
                    <button type="button" onClick={() => verwijderObservatie(o.id)}
                      className="text-xs text-red-600 hover:underline">Verwijderen</button>
                  </div>
                ))}
              </div>
            </Blok>

            <Blok titel="Positieve waarnemingen (één per regel)">
              <textarea rows={3} defaultValue={arrToLines(audit.positieve_waarnemingen)}
                onBlur={e => updAudit({ positieve_waarnemingen: linesToArr(e.target.value) })} className={`${veld} resize-y`} />
            </Blok>

            <Blok titel="Verbeterpunten" actie={<AddKnop label="+ verbeterpunt" onClick={nieuwVerbeterpunt} />}>
              {verbeterpunten.length === 0 && <p className="text-sm text-ink/40">Nog geen verbeterpunten.</p>}
              <div className="space-y-3">
                {verbeterpunten.map(v => (
                  <div key={v.id} className="rounded-lg border border-ink/10 p-3 space-y-2">
                    <textarea rows={2} value={v.constatering} placeholder="Constatering"
                      onChange={e => setVerbeterpunten(prev => prev.map(x => (x.id === v.id ? { ...x, constatering: e.target.value } : x)))}
                      onBlur={() => persist('audit_verbeterpunt', v.id, { constatering: v.constatering })} className={`${veld} resize-y`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={v.soort}
                        onChange={e => { const soort = e.target.value as 'verbeterpunt' | 'afwijking'; setVerbeterpunten(prev => prev.map(x => (x.id === v.id ? { ...x, soort } : x))); persist('audit_verbeterpunt', v.id, { soort }) }}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer ${v.soort === 'afwijking' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        <option value="verbeterpunt">Verbeterpunt</option>
                        <option value="afwijking">Afwijking</option>
                      </select>
                      {v.actie_id
                        ? <span className="text-xs text-green-700">✓ Actie gekoppeld</span>
                        : <button type="button" onClick={() => maakActie('verbeterpunt', v.id)}
                            className="text-xs px-3 py-1 rounded-full bg-accent text-white hover:opacity-90">Maak hier een actie van</button>}
                      <button type="button" onClick={() => verwijderVerbeterpunt(v.id)}
                        className="text-xs text-red-600 hover:underline ml-auto">Verwijderen</button>
                    </div>
                  </div>
                ))}
              </div>
            </Blok>

            <Blok titel="Conclusie">
              <textarea rows={4} value={audit.conclusie ?? ''}
                onChange={e => setAudit(p => ({ ...p, conclusie: e.target.value }))}
                onBlur={() => persist('audit', audit.id, { conclusie: audit.conclusie })} className={`${veld} resize-y`} />
            </Blok>
          </div>
        )}
      </div>
    </main>
  )
}

function Blok({ titel, actie, children }: { titel: string; actie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-tile rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">{titel}</p>
        {actie}
      </div>
      {children}
    </div>
  )
}

function AddKnop({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
      {label}
    </button>
  )
}
