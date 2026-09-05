'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { DashboardInstelling } from '@/lib/types'

type GewerkteUrenRegel = { jaar: number; uren: number | null }

type Props = {
  companyId: string
  companyNaam: string
  huisstijl?: HuisstijlView
  initial: DashboardInstelling | null
  huidigJaar: number
  initialGewerkteUren: GewerkteUrenRegel[]
  initialDoelstelling: string
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
  huidigJaar, initialGewerkteUren, initialDoelstelling,
}: Props) {
  const router = useRouter()

  const [klachten, setKlachten] = useState(String(initial?.klachten_aantal ?? 0))
  const [score, setScore] = useState(initial?.tevredenheid_score != null ? String(initial.tevredenheid_score) : '')
  const [toelichting, setToelichting] = useState(initial?.tevredenheid_toelichting ?? '')
  const [auditGedaan, setAuditGedaan] = useState(String(initial?.audit_intern_gedaan ?? 0))
  const [auditTotaal, setAuditTotaal] = useState(String(initial?.audit_intern_totaal ?? 0))
  const [auditExtern, setAuditExtern] = useState(initial?.audit_extern_omschrijving ?? '')
  const [auditStatus, setAuditStatus] = useState(initial?.audit_status ?? '')
  const [doelstelling, setDoelstelling] = useState(initialDoelstelling)
  const [isoTaken, setIsoTaken] = useState(initial?.iso_taken_tekst ?? '')

  const vorigJaar = huidigJaar - 1
  const urenVoorJaar = (jaar: number) => initialGewerkteUren.find(u => u.jaar === jaar)?.uren ?? null
  const [urenDitJaar, setUrenDitJaar] = useState(urenVoorJaar(huidigJaar) != null ? String(urenVoorJaar(huidigJaar)) : '')
  const [urenVorigJaar, setUrenVorigJaar] = useState(urenVoorJaar(vorigJaar) != null ? String(urenVoorJaar(vorigJaar)) : '')

  // Overige jaren (los van dit/vorig jaar) -- elk jaar heeft zijn eigen
  // opslaan-knop, want dit is een losse, dynamisch groeiende lijst en geen
  // vast onderdeel van de grote "Opslaan"-knop hieronder.
  const [overigeJaren, setOverigeJaren] = useState<GewerkteUrenRegel[]>(
    initialGewerkteUren.filter(u => u.jaar !== huidigJaar && u.jaar !== vorigJaar).sort((a, b) => b.jaar - a.jaar),
  )
  const [overigeInvoer, setOverigeInvoer] = useState<Record<number, string>>(
    Object.fromEntries(
      initialGewerkteUren
        .filter(u => u.jaar !== huidigJaar && u.jaar !== vorigJaar)
        .map(u => [u.jaar, u.uren != null ? String(u.uren) : '']),
    ),
  )
  const [overigeBezig, setOverigeBezig] = useState<number | null>(null)
  const [overigeFout, setOverigeFout] = useState<string | null>(null)
  const [nieuwJaar, setNieuwJaar] = useState('')
  const [nieuwUren, setNieuwUren] = useState('')

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
        // Doelstelling gaat sinds migratie 0076 via jaardoelstelling_zetten (per
        // jaar); null hier zodat de oude kolom blijft staan zoals hij stond
        // (dashboard_instelling_zetten bewaart 'm null-veilig, overschrijft niet).
        p_doelstelling_tekst: null,
        p_audit_intern_gedaan: numOrNull(auditGedaan) ?? 0,
        p_audit_intern_totaal: numOrNull(auditTotaal) ?? 0,
        p_audit_extern_omschrijving: auditExtern,
        p_audit_status: auditStatus,
        p_iso_taken_tekst: isoTaken,
      })
      if (error) {
        setFout('Opslaan mislukt. Probeer het opnieuw.')
        return
      }
      const [{ error: urenErr1 }, { error: urenErr2 }, { error: doelErr }] = await Promise.all([
        supabase.rpc('gewerkte_uren_zetten', { p_company_id: companyId, p_jaar: huidigJaar, p_uren: numOrNull(urenDitJaar) }),
        supabase.rpc('gewerkte_uren_zetten', { p_company_id: companyId, p_jaar: vorigJaar, p_uren: numOrNull(urenVorigJaar) }),
        supabase.rpc('jaardoelstelling_zetten', { p_company_id: companyId, p_jaar: huidigJaar, p_tekst: doelstelling }),
      ])
      if (urenErr1 || urenErr2 || doelErr) {
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

  async function bewaarOverigJaar(jaar: number) {
    setOverigeBezig(jaar)
    setOverigeFout(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('gewerkte_uren_zetten', {
        p_company_id: companyId, p_jaar: jaar, p_uren: numOrNull(overigeInvoer[jaar] ?? ''),
      })
      if (error) { setOverigeFout('Opslaan van ' + jaar + ' mislukt.'); return }
    } finally {
      setOverigeBezig(null)
    }
  }

  function voegJaarToe() {
    const jaar = Number(nieuwJaar)
    if (!Number.isInteger(jaar) || jaar < 2000 || jaar > huidigJaar) {
      setOverigeFout('Vul een geldig jaar in (2000 t/m ' + huidigJaar + ').')
      return
    }
    if (jaar === huidigJaar || jaar === vorigJaar || overigeJaren.some(j => j.jaar === jaar)) {
      setOverigeFout('Dat jaar staat er al.')
      return
    }
    setOverigeFout(null)
    setOverigeJaren(prev => [...prev, { jaar, uren: null }].sort((a, b) => b.jaar - a.jaar))
    setOverigeInvoer(prev => ({ ...prev, [jaar]: nieuwUren }))
    setNieuwJaar('')
    setNieuwUren('')
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

          {/* Gewerkte uren — urenbasis voor het berekende IF-getal (migratie 0073) */}
          <div className={kaart}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Gewerkte uren (urenbasis IF-getal)</p>
            <p className="text-xs text-ink/50 -mt-2">
              Het IF-getal op het dashboard wordt nu automatisch berekend uit de incidentmodule en deze uren
              — geen handmatige invoer van het IF-getal zelf meer.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="urenDitJaar">Gewerkte uren {huidigJaar}</label>
                <input id="urenDitJaar" type="number" min={0} step="1" inputMode="decimal" className={veld}
                  placeholder="bv. 42000" value={urenDitJaar} onChange={e => setUrenDitJaar(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="urenVorigJaar">Gewerkte uren {vorigJaar}</label>
                <input id="urenVorigJaar" type="number" min={0} step="1" inputMode="decimal" className={veld}
                  placeholder="bv. 40000" value={urenVorigJaar} onChange={e => setUrenVorigJaar(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-ink/40">
              Leeg laten toont op het dashboard &quot;nog geen urenbasis&quot; in plaats van een gedeeld-door-nul-fout.
              Deze twee jaren worden pas bewaard bij de grote Opslaan-knop onderaan.
            </p>

            {/* Overige jaren: los invulbaar/bewerkbaar, per jaar direct opgeslagen -- zodat
                het meerjarenoverzicht ook oudere, echt bekende cijfers kan tonen. */}
            {overigeJaren.length > 0 && (
              <div className="pt-2 border-t border-ink/10 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Overige jaren</p>
                {overigeJaren.map(({ jaar }) => (
                  <div key={jaar} className="flex items-center gap-2">
                    <span className="text-sm text-ink w-16 shrink-0">{jaar}</span>
                    <input
                      type="number" min={0} step="1" inputMode="decimal" className={`${veld} flex-1`}
                      placeholder="gewerkte uren"
                      value={overigeInvoer[jaar] ?? ''}
                      onChange={e => setOverigeInvoer(prev => ({ ...prev, [jaar]: e.target.value }))}
                    />
                    <button
                      onClick={() => bewaarOverigJaar(jaar)}
                      disabled={overigeBezig === jaar}
                      className="text-sm px-3 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors disabled:opacity-40 shrink-0"
                    >
                      {overigeBezig === jaar ? '…' : 'Opslaan'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-ink/10">
              <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-2">Ander jaar toevoegen</p>
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="numeric" className={`${veld} w-24 shrink-0`}
                  placeholder="jaar" value={nieuwJaar} onChange={e => setNieuwJaar(e.target.value)}
                />
                <input
                  type="number" min={0} step="1" inputMode="decimal" className={`${veld} flex-1`}
                  placeholder="gewerkte uren" value={nieuwUren} onChange={e => setNieuwUren(e.target.value)}
                />
                <button
                  onClick={voegJaarToe}
                  className="text-sm px-3 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors shrink-0"
                >
                  Toevoegen
                </button>
              </div>
              <p className="text-xs text-ink/40 mt-1.5">
                Alleen voor uren die je echt weet — hier vul je geen schattingen in.
              </p>
              {overigeFout && <p className="text-xs text-red-600 mt-1.5">{overigeFout}</p>}
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

          {/* Doelstelling: sinds migratie 0076 per jaar bewaard (bedrijf_jaardoelstelling). */}
          <div className={kaart}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Doelstelling {huidigJaar}</p>
            <p className="text-xs text-ink/50 -mt-2">
              Wordt per jaar bewaard — het meerjarenoverzicht toont per jaar wat hier stond.
            </p>
            <textarea id="doelstelling" rows={4} className={`${veld} min-h-[104px]`}
              value={doelstelling} onChange={e => setDoelstelling(e.target.value)} />
          </div>

          {/* Vrije tekstblok */}
          <div className={kaart}>
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
              className="btn btn-accent text-sm px-5 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40"
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
