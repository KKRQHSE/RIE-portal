import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import CompanyTopBar, { type NavItem } from '@/components/CompanyTopBar'

// Gedeelde laag rond de hele bedrijfssectie (/[company_id]/...). Levert één vaste
// bovenbalk met alle modules van het bedrijf + broodkruimel, zodat je vanaf elke
// module direct naar elke andere kunt zonder via het dashboard te gaan. Voor een
// admin blijft de terugweg naar de roll-up /dashboard bestaan.
export default async function CompanySectionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ company_id: string }>
}) {
  const { company_id } = await params
  const profile = await getSessionProfile()
  const isAdmin = profile?.role === 'admin'
  const magBeheren =
    isAdmin || (profile?.role === 'client' && profile.company_id === company_id)
  const isTeamleider = profile?.role === 'teamleider' && profile.company_id === company_id
  const magWerken = magBeheren || isTeamleider

  // Alleen voor wie in dit bedrijf mag werken de balk opbouwen (de pagina's doen hun
  // eigen afscherming; niet-gemachtigden krijgen daar een notFound/redirect).
  let topBar: React.ReactNode = null
  if (magWerken) {
    const supabase = await createClient()
    const [{ data: company }, { data: modules }, huisstijl] = await Promise.all([
      supabase.from('companies').select('name').eq('id', company_id).single(),
      supabase.from('bedrijf_modules').select('module')
        .eq('company_id', company_id).eq('module_status', 'actief').eq('actief', true),
      haalHuisstijl(company_id),
    ])

    const actief = new Set((modules ?? []).map(m => m.module))
    const maak = (key: string, label: string, seg: string): NavItem =>
      ({ key, label, seg, href: `/${company_id}/${seg}` })

    // Kernmodules altijd; toolbox/inspecties/incidenten alleen bij actieve module.
    // Dashboard/audits/personen/modules zijn beheerderswerk — teamleider ziet ze niet
    // (audits en bedrijfsvoering/personen blijven ook op de pagina zelf dicht).
    const items: NavItem[] = [
      ...(magBeheren ? [maak('dashboard', 'Dashboard', 'dashboard')] : []),
      maak('rie', 'RI&E', 'rie'),
      maak('pva', 'Plan van aanpak', 'pva'),
      ...(actief.has('toolbox') ? [maak('toolbox', 'Toolbox', 'toolbox')] : []),
      ...(actief.has('inspectie') ? [maak('inspecties', 'Inspecties', 'inspecties')] : []),
      ...(actief.has('incidenten') ? [maak('incidenten', 'Incidenten', 'incidenten')] : []),
      ...(magBeheren && actief.has('audit') ? [maak('audits', 'Audits', 'audits')] : []),
      ...(magBeheren ? [maak('personen', 'Personen', 'personen'), maak('modules', 'Modules', 'modules')] : []),
      ...(isTeamleider ? [maak('medewerker-toevoegen', 'Medewerker toevoegen', 'medewerker-toevoegen')] : []),
      ...(magBeheren ? [maak('goedkeuringen', 'Verzoeken', 'goedkeuringen')] : []),
    ]

    topBar = (
      <CompanyTopBar
        companyId={company_id}
        companyNaam={company?.name ?? 'Bedrijf'}
        items={items}
        huisstijl={huisstijl}
        homeHref={magBeheren ? `/${company_id}/dashboard` : `/${company_id}/pva`}
      />
    )
  }

  return (
    <>
      {isAdmin && (
        // Voor een admin is dit de allereerste balk op het scherm (vóór
        // CompanyTopBar), dus deze heeft zelf de top-marge nodig — anders
        // zou "← Alle bedrijven" onder de notch/systeembalk beginnen.
        <div className="bg-ink text-white pt-[env(safe-area-inset-top)]">
          <div className="max-w-5xl mx-auto px-4 flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-white/90 hover:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span aria-hidden="true">←</span> Alle bedrijven
            </Link>
            <span className="text-xs text-white/50">Beheerweergave</span>
          </div>
        </div>
      )}
      {topBar}
      {children}
    </>
  )
}
