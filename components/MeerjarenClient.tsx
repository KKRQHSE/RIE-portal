// Server component (geen interactie): meerjaren-dashboard, Fase 3 (voorbereidend).
// ----------------------------------------------------------------------------
// Toont IF-getal, toolbox-dekking, inspectie-voortgang, aantal incidenten en
// doelstelling per jaar naast elkaar. Alleen data die het systeem al per jaar
// vastlegt (dashboard_meerjaren, migratie 0075/0076) -- geen verzonnen
// historie.
//
// Sinds migratie 0076 zijn de drie eerdere benaderingen opgelost:
//   - Toolbox-dekking rekent nu met de historisch-correcte headcount per
//     jaar (personen.datum_in_dienst/datum_uit_dienst), niet meer het
//     huidige aantal.
//   - Inspectiedoel is nu een echte jaar-specifieke waarde
//     (bedrijf_inspectie_doel.jaar), geen terugwerkende toepassing meer.
//   - Doelstelling is nu een echte jaar-specifieke tekst
//     (bedrijf_jaardoelstelling), dus gewoon een rij in de tabel.
import Link from 'next/link'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'
import type { MeerjarenRegel } from '@/lib/types'

type Props = {
  companyId: string
  companyNaam: string
  huisstijl?: HuisstijlView
  jaren: MeerjarenRegel[]
}

export default function MeerjarenClient({
  companyId, companyNaam, huisstijl = VEILIGE_HUISSTIJL, jaren,
}: Props) {
  const cel = 'px-4 py-3 text-sm text-ink whitespace-nowrap'
  const doelstellingCel = 'px-4 py-3 text-sm text-ink align-top min-w-[16rem] max-w-xs whitespace-normal'
  const label = 'px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink/40 whitespace-nowrap align-top'

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <Link href={`/${companyId}/dashboard`} className="text-sm text-ink/50 hover:text-accent transition-colors">
          ← Terug naar dashboard
        </Link>

        <div className="mt-3 mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">Meerjarenoverzicht</h1>
          <p className="text-sm text-ink/50 mt-0.5">{companyNaam}</p>
        </div>

        {jaren.length <= 1 && (
          <p className="text-sm text-ink/50 bg-white rounded-lg shadow-sm p-4 mb-4">
            Nog maar {jaren.length === 1 ? 'één jaar' : 'geen jaar'} met gegevens. Dit overzicht vult
            zich vanzelf naarmate er meer jaren bijkomen.
          </p>
        )}

        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-ink/10">
                <th className={`${label} text-left`}>Jaar</th>
                {jaren.map(j => (
                  <th key={j.jaar} className={`${cel} font-semibold text-right`}>{j.jaar}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/5">
                <td className={label} title="Incident Frequency: (aantal ongevallen met verzuim x 1.000.000) / totaal gewerkte uren.">
                  IF-getal
                </td>
                {jaren.map(j => (
                  <td key={j.jaar} className={`${cel} text-right tabular-nums`}>
                    {j.if_getal.if_getal != null ? j.if_getal.if_getal : (
                      <span className="text-ink/30 italic text-xs">nog geen urenbasis</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-ink/5">
                <td className={label} title="Percentage van de in dat jaar effectief in dienst zijnde medewerkers dat minstens één toolbox-sessie bijwoonde.">
                  Toolbox-dekking
                </td>
                {jaren.map(j => (
                  <td key={j.jaar} className={`${cel} text-right tabular-nums`}>
                    {j.toolbox.dekking_pct != null ? (
                      <>
                        {j.toolbox.dekking_pct}%
                        <span className="text-ink/40 text-xs"> ({j.toolbox.sessies} {j.toolbox.sessies === 1 ? 'sessie' : 'sessies'})</span>
                      </>
                    ) : (
                      <span className="text-ink/30 italic text-xs">nog geen sessie</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-ink/5">
                <td className={label}>Inspecties afgerond</td>
                {jaren.map(j => (
                  <td key={j.jaar} className={`${cel} text-right tabular-nums`}>
                    {j.inspecties.doel_totaal > 0 ? (
                      <>{j.inspecties.afgerond}<span className="text-ink/30">/{j.inspecties.doel_totaal}</span></>
                    ) : (
                      j.inspecties.afgerond
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-ink/5">
                <td className={label}>Incidenten</td>
                {jaren.map(j => (
                  <td key={j.jaar} className={`${cel} text-right tabular-nums`}>{j.incidenten}</td>
                ))}
              </tr>
              <tr>
                <td className={label}>Doelstelling</td>
                {jaren.map(j => (
                  <td key={j.jaar} className={doelstellingCel}>
                    {j.doelstelling ? (
                      <span className="whitespace-pre-line">{j.doelstelling}</span>
                    ) : (
                      <span className="text-ink/30 italic text-xs">niet vastgelegd</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink/40 mt-4 leading-relaxed">
          Toelichting: dit overzicht gebruikt uitsluitend gegevens die per jaar zijn vastgelegd — er
          is niets bijgeschat. De toolbox-dekking en het inspectiedoel zijn beide echte
          jaar-specifieke cijfers (geen huidige instelling met terugwerkende kracht). Een lege
          doelstelling betekent dat er voor dat jaar niets is vastgelegd, niet dat er geen doel was.
        </p>

      </div>
    </main>
  )
}
