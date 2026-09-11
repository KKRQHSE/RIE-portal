import Link from 'next/link'
import type { Company, RieToetsing, RieToetsverslag } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import LogoutButton from './LogoutButton'
import HuisstijlLogo from './HuisstijlLogo'

type Props = {
  company: Pick<Company, 'id' | 'name'>
  toetsing: RieToetsing
  toetsverslag: RieToetsverslag
  huisstijl?: HuisstijlView
}

// Eén sectie: titel + letterlijke tekst uit het toetsverslag. whitespace-pre-wrap
// bewaart de alinea's zoals ze in het brondocument staan — geen samenvatting,
// geen herformulering.
function Sectie({ titel, tekst }: { titel: string; tekst: string | null }) {
  if (!tekst) return null
  return (
    <div className="glass-tile rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-ink mb-2">{titel}</h2>
      <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{tekst}</p>
    </div>
  )
}

export default function RieToetsverslagClient({ company, toetsing, toetsverslag, huisstijl = VEILIGE_HUISSTIJL }: Props) {
  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-2">
          <Link href={`/${company.id}/rie`} className="text-sm text-ink/50 hover:text-accent">
            ← Terug naar RI&amp;E
          </Link>
        </div>

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">
            Toetsverslag RI&amp;E versie {toetsing.versie}
            {toetsing.toetser_naam && (
              <> · getoetst door {toetsing.toetser_naam}
                {toetsing.toetser_certificaatnummer ? ` (cert. ${toetsing.toetser_certificaatnummer})` : ''}
                {toetsing.toetser_namens ? `, namens ${toetsing.toetser_namens}` : ''}
              </>
            )}
          </p>
        </div>

        {toetsverslag.eindoordeel && (
          <div className="glass-tile rounded-2xl p-5 mb-4 border-l-4 border-l-green-500">
            <h2 className="text-sm font-semibold text-ink mb-2">Eindoordeel</h2>
            <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{toetsverslag.eindoordeel}</p>
          </div>
        )}

        <div className="space-y-4">
          <Sectie titel="Managementsamenvatting" tekst={toetsverslag.managementsamenvatting} />
          <Sectie titel="Toetsbrief" tekst={toetsverslag.toetsbrief} />
          <Sectie titel="Conclusie: Volledigheid" tekst={toetsverslag.conclusie_volledigheid} />
          <Sectie titel="Conclusie: Brongebruik" tekst={toetsverslag.conclusie_brongebruik} />
          <Sectie titel="Conclusie: Verplichte aspecten" tekst={toetsverslag.conclusie_verplichte_aspecten} />
          <Sectie titel="Conclusie: Wettelijk kader" tekst={toetsverslag.conclusie_wettelijk_kader} />
          <Sectie titel="Conclusie: Actualiteit" tekst={toetsverslag.conclusie_actualiteit} />
          <Sectie titel="Conclusie: Betrouwbaarheid" tekst={toetsverslag.conclusie_betrouwbaarheid} />
          <Sectie titel="Conclusie: Plan van aanpak" tekst={toetsverslag.conclusie_plan_van_aanpak} />
          <Sectie titel="Conclusie: Systeem- en scopetoetsing" tekst={toetsverslag.conclusie_systeem_scopetoets} />
        </div>
      </div>
    </main>
  )
}
