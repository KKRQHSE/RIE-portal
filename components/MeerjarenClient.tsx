// Server component (geen interactie): meerjaren-dashboard, Fase 3 (voorbereidend).
// ----------------------------------------------------------------------------
// Toont IF-getal, toolbox-dekking, inspectie-voortgang en aantal incidenten
// per jaar naast elkaar. Alleen data die het systeem al per jaar vastlegt
// (dashboard_meerjaren, migratie 0075) -- geen verzonnen historie.
//
// Bewuste vereenvoudigingen, hieronder ook zichtbaar voor de gebruiker (niet
// alleen in het rapport):
//   - Toolbox-dekking gebruikt het HUIDIGE aantal actieve personen als
//     noemer voor elk jaar -- voor oudere jaren dus een benadering.
//   - Inspectie-doel is de huidige instelling, met terugwerkende kracht
//     toegepast; het aantal afgeronde inspecties zelf is wel jaar-echt.
//   - Doelstellingen zijn niet per jaar opgeslagen -- alleen de huidige tekst
//     bestaat, apart getoond onder de tabel.
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
  doelstellingTekst: string | null
}

function parseDoelen(tekst: string | null): string[] {
  if (!tekst) return []
  const regels = tekst.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const bron = regels.length > 1 ? regels : tekst.split(/[;•]/)
  return bron.map(s => s.replace(/^[-*•\s]+/, '').trim()).filter(Boolean)
}

export default function MeerjarenClient({
  companyId, companyNaam, huisstijl = VEILIGE_HUISSTIJL, jaren, doelstellingTekst,
}: Props) {
  const doelen = parseDoelen(doelstellingTekst)
  const cel = 'px-4 py-3 text-sm text-ink whitespace-nowrap'
  const label = 'px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink/40 whitespace-nowrap'

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-4xl mx-auto px-4 py-8">

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
                <td className={label}>Toolbox-dekking</td>
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
              <tr>
                <td className={label}>Incidenten</td>
                {jaren.map(j => (
                  <td key={j.jaar} className={`${cel} text-right tabular-nums`}>{j.incidenten}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Doelstellingen: alleen de HUIDIGE tekst, niet per jaar (zie toelichting onderaan). */}
        <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40 mb-2">Huidige doelstellingen</p>
          {doelen.length === 0 ? (
            <p className="text-sm text-ink/40">Nog niet ingevuld.</p>
          ) : (
            <ul className="space-y-1.5">
              {doelen.map((d, i) => (
                <li key={i} className="text-sm text-ink flex items-start gap-2">
                  <span className="text-accent mt-0.5">·</span>{d}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-ink/40 mt-4 leading-relaxed">
          Toelichting: dit overzicht gebruikt uitsluitend gegevens die per jaar zijn vastgelegd —
          er is niets bijgeschat. Twee kanttekeningen: de toolbox-dekking rekent met het huidige
          aantal actieve medewerkers als noemer (voor oudere jaren dus een benadering), en het
          inspectiedoel is de huidige instelling, met terugwerkende kracht toegepast op elk jaar.
          Doelstellingen worden niet per jaar bewaard — hierboven staat steeds de actuele tekst.
        </p>

      </div>
    </main>
  )
}
