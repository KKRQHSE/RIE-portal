'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { DashboardInstelling } from '@/lib/types'

type Props = {
  companyId: string
  companyNaam: string
  huisstijl?: HuisstijlView
  initial: DashboardInstelling | null
}

// Getal-uit-tekst: lege string → leeg laten (voor optionele score) of 0 (voor tellingen).
function numOrNull(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function BedrijfsvoeringForm({
  companyId, companyNaam, huisstijl = VEILIGE_HUISSTIJL, initial,
}: Props) {
  const router = useRouter()

  const [klachten, setKlachten] = useState(String(initial?.klachten_aantal ?? 0))
  const [score, setScore] = useState(initial?.tevredenheid_score != null ? String(initial.tevredenheid_score) : '')
  const [toelichting, setToelichting] = useState(initial?.tevredenheid_toelichting ?? '')
  const [auditGedaan, setAuditGedaan] = useState(String(initial?.audit_intern_gedaan ?? 0))
  const [auditTotaal, setAuditTotaal] = useState(String(initial?.audit_intern_totaal ?? 0))
  const [auditExtern, setAuditExtern] = useState(initial?.audit_extern_omschrijving ?? '')
  const [auditStatus, setAuditStatus] = useState(initial?.audit_status ?? '')
  const [doelstelling, setDoelstelling] = useState(initial?.doelstelling_tekst ?? '')
  const [isoTaken, setIsoTaken] = useState(initial?.iso_taken_tekst ?? '')

  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan() {
    if (bezig) return
    setBezig(true)
    setFout(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('dashboard_instelling_zetten', {
        p_company_id: companyId,
        p_klachten_aantal: numOrNull(klachten) ?? 0,
        p_tevredenheid_score: numOrNull(score),
        p_tevredenheid_toelichting: toelichting,
        p_audit_intern_gedaan: numOrNull(auditGedaan) ?? 0,
        p_audit_intern_totaal: numOrNull(auditTotaal) ?? 0,
        p_audit_extern_omschrijving: auditExtern,
        p_audit_status: auditStatus,
        p_doelstelling_tekst: doelstelling,
        p_iso_taken_tekst: isoTaken,
      })
      if (error) {
        setFout('Opslaan mislukt. Probeer het opnieuw.')
        return
      }
      // Terug naar het dashboard; refresh zodat de nieuwe waarden meteen zichtbaar zijn.
      router.push(`/${companyId}/dashboard`)
      router.refresh()
    } catch {
      setFout('Opslaan mislukt. Probeer het opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  const veld = 'w-full min-h-[44px] rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none'
  const label = 'block text-sm font-medium text-ink mb-1'
  const kaart = 'bg-white rounded-lg shadow-sm p-5 space-y-4'

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        <Link href={`/${companyId}/dashboard`} className="text-sm text-ink/50 hover:text-accent transition-colors">
          ← Terug naar dashboard
        </Link>

        <h1 className="text-xl font-semibold text-ink mt-3 mb-1">Bedrijfsvoering bewerken</h1>
        <p className="text-sm text-ink/50 mb-6">{companyNaam}</p>

        <div className="space-y-4">

          {/* Klanttevredenheid */}
          <div className={kaart}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Klanttevredenheid</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="klachten">Aantal klachten</label>
                <input id="klachten" type="number" min={0} inputMode="numeric" className={veld}
                  value={klachten} onChange={e => setKlachten(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="score">Meetscore</label>
                <input id="score" type="number" step="0.1" inputMode="decimal" className={veld}
                  placeholder="bv. 7.5" value={score} onChange={e => setScore(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="toelichting">Toelichting</label>
              <textarea id="toelichting" rows={2} className={`${veld} min-h-[72px]`}
                value={toelichting} onChange={e => setToelichting(e.target.value)} />
            </div>
          </div>

          {/* Audits */}
          <div className={kaart}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Audits</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="auditGedaan">Interne audits gedaan</label>
                <input id="auditGedaan" type="number" min={0} inputMode="numeric" className={veld}
                  value={auditGedaan} onChange={e => setAuditGedaan(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="auditTotaal">Interne audits gepland</label>
                <input id="auditTotaal" type="number" min={0} inputMode="numeric" className={veld}
                  value={auditTotaal} onChange={e => setAuditTotaal(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="auditExtern">Externe audit — datum &amp; omschrijving</label>
              <input id="auditExtern" type="text" className={veld}
                placeholder="bv. 11 en 13 maart — ISO 9001 hercertificering"
                value={auditExtern} onChange={e => setAuditExtern(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="auditStatus">Status</label>
              <input id="auditStatus" type="text" className={veld}
                placeholder="bv. gepland / afgerond" value={auditStatus} onChange={e => setAuditStatus(e.target.value)} />
            </div>
          </div>

          {/* Vrije tekstblokken */}
          <div className={kaart}>
            <div>
              <label className={label} htmlFor="doelstelling">Doelstelling</label>
              <textarea id="doelstelling" rows={4} className={`${veld} min-h-[104px]`}
                value={doelstelling} onChange={e => setDoelstelling(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="isoTaken">Openstaande ISO-taken</label>
              <textarea id="isoTaken" rows={4} className={`${veld} min-h-[104px]`}
                value={isoTaken} onChange={e => setIsoTaken(e.target.value)} />
            </div>
          </div>

          {fout && <p className="text-sm text-red-600">{fout}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={opslaan}
              disabled={bezig}
              className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {bezig ? 'Bezig…' : 'Opslaan'}
            </button>
            <Link
              href={`/${companyId}/dashboard`}
              className="text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors"
            >
              Annuleren
            </Link>
          </div>

        </div>
      </div>
    </main>
  )
}
