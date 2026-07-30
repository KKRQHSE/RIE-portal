'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Persoon } from '@/lib/types'
import Bevestig from './Bevestig'

// Twee persoon-records samenvoegen (migratie 0048). Alleen zichtbaar voor de
// admin; de RPC weigert het sowieso voor iedereen anders.
//
// De handeling is onomkeerbaar, dus het scherm toont eerst een voorbeeld: wat
// verschuift er precies, wat blijft er staan, en wat verdwijnt. Dat voorbeeld
// komt uit de database (personen_merge_voorbeeld), niet uit een schatting hier.

type Voorbeeld = {
  doel_naam: string
  bron_naam: string
  inspecties: number
  acties: number
  herinneringen: number
  toolbox: number
  bewijsstukken: number
  inspectie_doel: number
  deellink: number
  doel_botst: boolean
  deellink_botst: boolean
  botsingen: { soort: string; omschrijving: string }[]
}

type Props = {
  personen: Persoon[]
  // Na een geslaagde merge: de bron uit de lijst halen zonder herladen.
  onSamengevoegd: (bronId: string) => void
}

export default function PersoonSamenvoegen({ personen, onSamengevoegd }: Props) {
  const supabase = createClient()
  const [doelId, setDoelId] = useState('')
  const [bronId, setBronId] = useState('')
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)

  const doel = personen.find(p => p.id === doelId)
  const bron = personen.find(p => p.id === bronId)
  const gekozen = !!doel && !!bron && doelId !== bronId

  // Stap 1: het voorbeeld ophalen. Pas als dat er is, opent het bevestigingsvenster.
  async function voorbereiden() {
    setFout(null)
    setKlaar(null)
    setBezig(true)
    const { data, error } = await supabase.rpc('personen_merge_voorbeeld', {
      p_doel_id: doelId,
      p_bron_id: bronId,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setVoorbeeld(data as Voorbeeld)
  }

  // Stap 2: uitvoeren. De RPC controleert alles nog een keer zelf.
  async function samenvoegen() {
    setFout(null)
    setBezig(true)
    const { error } = await supabase.rpc('personen_samenvoegen', {
      p_doel_id: doelId,
      p_bron_id: bronId,
    })
    setBezig(false)
    if (error) { setFout(error.message); setVoorbeeld(null); return }
    const verdwenen = bron?.naam ?? ''
    const behouden = doel?.naam ?? ''
    onSamengevoegd(bronId)
    setVoorbeeld(null)
    setBronId('')
    setKlaar(`"${verdwenen}" is samengevoegd met "${behouden}".`)
  }

  function omdraaien() {
    setDoelId(bronId)
    setBronId(doelId)
    setKlaar(null)
  }

  const geblokkeerd = (voorbeeld?.botsingen.length ?? 0) > 0
  const veld =
    'w-full text-sm px-3 py-2 min-h-[44px] rounded-xl border border-ink/15 bg-white text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

  return (
    <section className="glass-tile rounded-2xl p-4 mb-6">
      <h2 className="font-medium text-ink">Personen samenvoegen</h2>
      <p className="text-sm text-ink/60 leading-relaxed mt-1">
        Staat dezelfde medewerker twee keer in de lijst (bijvoorbeeld door een typefout)?
        Voeg de records samen. Alle inspecties, toolboxen en acties komen bij één persoon
        te staan. Dit kan niet ongedaan worden gemaakt.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <div>
          <label htmlFor="merge-doel" className="block text-xs text-ink/50 mb-1">
            Blijft bestaan
          </label>
          <select
            id="merge-doel"
            value={doelId}
            onChange={e => { setDoelId(e.target.value); setKlaar(null) }}
            className={veld}
          >
            <option value="">— kies een persoon —</option>
            {personen.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === bronId}>{p.naam}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="merge-bron" className="block text-xs text-ink/50 mb-1">
            Verdwijnt
          </label>
          <select
            id="merge-bron"
            value={bronId}
            onChange={e => { setBronId(e.target.value); setKlaar(null) }}
            className={veld}
          >
            <option value="">— kies een persoon —</option>
            {personen.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === doelId}>{p.naam}</option>
            ))}
          </select>
        </div>
      </div>

      {/* In gewone taal herhalen wat er staat te gebeuren, vóór het bevestigen. */}
      {gekozen && (
        <p className="text-sm text-ink mt-3">
          <span className="font-medium">{doel.naam}</span> blijft.{' '}
          <span className="font-medium">{bron.naam}</span> verdwijnt.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={voorbereiden}
          disabled={!gekozen || bezig}
          className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {bezig && !voorbeeld ? 'Bezig…' : 'Samenvoegen'}
        </button>
        <button
          type="button"
          onClick={omdraaien}
          disabled={!doelId && !bronId}
          className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40 disabled:opacity-40 transition-colors"
        >
          Omdraaien
        </button>
      </div>

      {fout && <p className="text-sm text-red-600 mt-3">{fout}</p>}
      {klaar && <p className="text-sm text-green-700 mt-3">{klaar}</p>}

      <Bevestig
        open={voorbeeld !== null}
        titel="Personen samenvoegen?"
        bevestigLabel={geblokkeerd ? 'Niet mogelijk' : 'Definitief samenvoegen'}
        gevaar
        bezig={bezig || geblokkeerd}
        onAnnuleer={() => setVoorbeeld(null)}
        onBevestig={samenvoegen}
      >
        {voorbeeld && (
          <>
            <p>
              <span className="font-medium text-ink">{voorbeeld.doel_naam}</span> blijft bestaan.{' '}
              <span className="font-medium text-ink">{voorbeeld.bron_naam}</span> wordt definitief verwijderd.
            </p>

            <p className="font-medium text-ink pt-1">Dit verschuift mee:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>{voorbeeld.inspecties} werkplekinspecties</li>
              <li>{voorbeeld.toolbox} toolbox-deelnames en aanwezigheden</li>
              <li>{voorbeeld.acties} acties</li>
              <li>{voorbeeld.herinneringen} verstuurde herinneringen</li>
              {voorbeeld.inspectie_doel > 0 && (
                <li>
                  {voorbeeld.doel_botst
                    ? `het inspectiedoel vervalt (${voorbeeld.doel_naam} heeft al een eigen doel)`
                    : 'het inspectiedoel'}
                </li>
              )}
              {voorbeeld.deellink > 0 && (
                <li>
                  {voorbeeld.deellink_botst
                    ? `de deellink vervalt (${voorbeeld.doel_naam} heeft al een eigen link)`
                    : 'de deellink'}
                </li>
              )}
            </ul>

            <p className="pt-1">
              Lege velden van {voorbeeld.doel_naam} (e-mail, functiegroep, dienstdata) worden
              aangevuld vanuit {voorbeeld.bron_naam}. Ingevulde velden blijven zoals ze zijn.
            </p>

            <p className="pt-1">
              De naam op ondertekende toolbox-bewijsstukken blijft staan zoals destijds is
              getekend ({voorbeeld.bewijsstukken} {voorbeeld.bewijsstukken === 1 ? 'stuk' : 'stuks'}).
              Alleen de koppeling verschuift, de bevestigde naam en handtekening niet.
            </p>

            {geblokkeerd ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 mt-2">
                <p className="text-red-800 font-medium">Samenvoegen kan niet.</p>
                <p className="text-red-800">
                  Beide personen hebben zelf getekend bij:
                </p>
                <ul className="list-disc pl-5 text-red-800">
                  {voorbeeld.botsingen.map(b => <li key={b.omschrijving}>{b.omschrijving}</li>)}
                </ul>
                <p className="text-red-800 mt-1">
                  Dat zijn twee ondertekende bewijsstukken; die kunnen niet op één persoon
                  staan en mogen niet verdwijnen.
                </p>
              </div>
            ) : (
              <p className="font-medium text-ink pt-1">
                Dit kan niet ongedaan worden gemaakt.
              </p>
            )}
          </>
        )}
      </Bevestig>
    </section>
  )
}
