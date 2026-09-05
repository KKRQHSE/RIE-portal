'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Company } from '@/lib/types'

type Props = {
  company: Company
  huisstijl?: HuisstijlView
}

type ZoekResultaat = { id: string; naam: string; functiegroep_naam: string | null; in_dienst: boolean }
type Duplicaat = { id: string; naam: string; functiegroep_naam: string | null; in_dienst: boolean }

type Modus = 'kies' | 'koppel' | 'nieuw'

// Teamleider maakt hier een medewerker aan — of koppelt aan een bestaande. Beide
// routes zijn altijd beschikbaar (geen verplichte zoekstap bij "nieuw"), levert
// in beide gevallen een goedkeuringsverzoek op voor de KAM. Zie
// concept_medewerker_koppelen / concept_medewerker_aanmaken (migratie 0070).
export default function MedewerkerToevoegenClient({ company, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  const [modus, setModus] = useState<Modus>('kies')

  // Koppel-route
  const [zoekterm, setZoekterm] = useState('')
  const [zoekBezig, setZoekBezig] = useState(false)
  const [resultaten, setResultaten] = useState<ZoekResultaat[] | null>(null)
  const [zoekFout, setZoekFout] = useState<string | null>(null)

  // Nieuw-route
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [duplicaten, setDuplicaten] = useState<Duplicaat[] | null>(null)

  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)

  function reset() {
    setModus('kies')
    setZoekterm('')
    setResultaten(null)
    setZoekFout(null)
    setNaam('')
    setEmail('')
    setDuplicaten(null)
    setFout(null)
  }

  async function zoek(e: React.FormEvent) {
    e.preventDefault()
    if (!zoekterm.trim() || zoekBezig) return
    setZoekBezig(true)
    setZoekFout(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('persoon_zoeken_voor_koppeling', {
      p_company_id: company.id,
      p_zoekterm: zoekterm.trim(),
    })
    setZoekBezig(false)
    if (error) {
      setZoekFout('Zoeken mislukt. Probeer het opnieuw.')
      return
    }
    setResultaten((data ?? []) as ZoekResultaat[])
  }

  async function koppel(persoonId: string) {
    setBezig(true)
    setFout(null)
    const supabase = createClient()
    const { error } = await supabase.rpc('concept_medewerker_koppelen', {
      p_company_id: company.id,
      p_persoon_id: persoonId,
    })
    setBezig(false)
    if (error) {
      setFout('Koppelen mislukt. Probeer het opnieuw.')
      return
    }
    setKlaar('Koppeling doorgegeven aan de KAM ter bevestiging.')
  }

  async function maakNieuw(negeerWaarschuwing: boolean) {
    if (!naam.trim()) return
    setBezig(true)
    setFout(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('concept_medewerker_aanmaken', {
      p_company_id: company.id,
      p_naam: naam.trim(),
      p_email: email.trim() || null,
      p_negeer_duplicaat_waarschuwing: negeerWaarschuwing,
    })
    setBezig(false)
    if (error) {
      setFout('Aanmaken mislukt. Probeer het opnieuw.')
      return
    }
    const uitkomst = data as { aangemaakt: boolean; mogelijke_duplicaten?: Duplicaat[] }
    if (!uitkomst.aangemaakt) {
      setDuplicaten(uitkomst.mogelijke_duplicaten ?? [])
      return
    }
    setDuplicaten(null)
    setKlaar('Concept-medewerker aangemaakt en ter goedkeuring voorgelegd aan de KAM.')
  }

  if (klaar) {
    return (
      <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
        <div className="max-w-lg mx-auto px-4 py-10">
          <div className="glass-tile rounded-2xl p-6 text-center">
            <p className="text-ink font-medium">{klaar}</p>
            <button
              onClick={reset}
              className="btn btn-accent mt-4 text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium"
            >
              Nog een medewerker
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Medewerker toevoegen</p>
        </div>

        {modus === 'kies' && (
          <div className="glass-tile rounded-2xl p-4 space-y-3">
            <p className="text-sm text-ink/70">
              Is dit iemand die al in het systeem staat, of een nieuwe medewerker?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setModus('koppel')}
                className="btn text-sm px-4 py-3 min-h-[44px] rounded-xl bg-white text-ink border border-ink/20 hover:border-accent hover:text-accent transition-colors text-left"
              >
                Koppel aan bestaande persoon
              </button>
              <button
                onClick={() => setModus('nieuw')}
                className="btn text-sm px-4 py-3 min-h-[44px] rounded-xl bg-white text-ink border border-ink/20 hover:border-accent hover:text-accent transition-colors text-left"
              >
                Nieuwe persoon
              </button>
            </div>
          </div>
        )}

        {modus === 'koppel' && (
          <div className="glass-tile rounded-2xl p-4 space-y-3">
            <button onClick={reset} className="text-xs text-ink/40 hover:text-ink">← terug</button>
            <p className="text-sm font-medium text-ink">Koppel aan bestaande persoon</p>
            <form onSubmit={zoek} className="flex gap-2">
              <input
                value={zoekterm}
                onChange={e => setZoekterm(e.target.value)}
                placeholder="Naam of e-mail"
                className="flex-1 text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
              <button
                type="submit"
                disabled={!zoekterm.trim() || zoekBezig}
                className="btn btn-accent text-sm px-4 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium disabled:opacity-40"
              >
                {zoekBezig ? 'Bezig…' : 'Zoek'}
              </button>
            </form>
            {zoekFout && <p className="text-xs text-red-600">{zoekFout}</p>}
            {resultaten !== null && (
              <div className="space-y-2">
                {resultaten.length === 0 && (
                  <p className="text-sm text-ink/40">Geen personen gevonden.</p>
                )}
                {resultaten.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 border border-ink/10 rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{r.naam}</p>
                      <p className="text-xs text-ink/50">
                        {r.functiegroep_naam ?? '—'} · {r.in_dienst ? 'in dienst' : 'uit dienst'}
                      </p>
                    </div>
                    <button
                      onClick={() => koppel(r.id)}
                      disabled={bezig}
                      className="btn shrink-0 text-xs px-3 py-2 min-h-[40px] rounded-full bg-ink text-white disabled:opacity-40"
                    >
                      Koppel
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fout && <p className="text-xs text-red-600">{fout}</p>}
          </div>
        )}

        {modus === 'nieuw' && (
          <div className="glass-tile rounded-2xl p-4 space-y-3">
            <button onClick={reset} className="text-xs text-ink/40 hover:text-ink">← terug</button>
            <p className="text-sm font-medium text-ink">Nieuwe persoon</p>
            <div>
              <label className="block text-xs text-ink/40 mb-1">Naam</label>
              <input
                value={naam}
                onChange={e => { setNaam(e.target.value); setDuplicaten(null) }}
                placeholder="Voor- en achternaam"
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-ink/40 mb-1">E-mail (optioneel)</label>
              <input
                value={email}
                onChange={e => { setEmail(e.target.value); setDuplicaten(null) }}
                type="email"
                placeholder="naam@bedrijf.nl"
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
            </div>

            {duplicaten !== null && duplicaten.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-800">
                  Dit lijkt op een bestaande persoon — koppelen, of toch nieuw aanmaken?
                </p>
                {duplicaten.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{d.naam}</p>
                      <p className="text-xs text-ink/50">
                        {d.functiegroep_naam ?? '—'} · {d.in_dienst ? 'in dienst' : 'uit dienst'}
                      </p>
                    </div>
                    <button
                      onClick={() => koppel(d.id)}
                      disabled={bezig}
                      className="btn shrink-0 text-xs px-3 py-2 min-h-[40px] rounded-full bg-ink text-white disabled:opacity-40"
                    >
                      Koppel aan deze
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => maakNieuw(true)}
                  disabled={bezig}
                  className="btn text-xs px-3 py-2 min-h-[40px] rounded-full bg-white text-ink/70 border border-ink/20 hover:text-accent disabled:opacity-40"
                >
                  {bezig ? 'Bezig…' : 'Toch nieuw aanmaken'}
                </button>
              </div>
            )}

            {duplicaten === null && (
              <button
                onClick={() => maakNieuw(false)}
                disabled={!naam.trim() || bezig}
                className="btn btn-accent text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40"
              >
                {bezig ? 'Bezig…' : 'Aanmaken'}
              </button>
            )}
            {fout && <p className="text-xs text-red-600">{fout}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
