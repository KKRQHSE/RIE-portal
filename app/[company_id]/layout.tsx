import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth'

// Gedeelde laag rond de hele bedrijfssectie (/[company_id]/...). De per-pagina nav
// (Dashboard, PvA, RI&E, Personen, Modules, Werkplekinspectie) linkt alleen binnen
// hetzelfde bedrijf; er was geen weg terug naar de admin roll-up /dashboard. Daarom
// hier één terugbalk, die ALLEEN voor een admin verschijnt. Dit is puur een UI-link:
// /dashboard houdt zijn eigen admin-only-afscherming (redirect bij niet-admin).
export default async function CompanySectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getSessionProfile()
  const isAdmin = profile?.role === 'admin'

  return (
    <>
      {isAdmin && (
        <div className="bg-ink text-white">
          <div className="max-w-4xl mx-auto px-4 flex items-center gap-3">
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
      {children}
    </>
  )
}
