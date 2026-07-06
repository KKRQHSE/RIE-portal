'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'

export type NavItem = { key: string; label: string; href: string; seg: string }

type Props = {
  companyId: string
  companyNaam: string
  items: NavItem[]
  huisstijl?: HuisstijlView
}

// Vaste, altijd zichtbare bovenbalk met de modules van het bedrijf + broodkruimel.
// Vanaf elke module direct naar elke andere; op mobiel ingeklapt tot een menuknop.
export default function CompanyTopBar({
  companyId, companyNaam, items, huisstijl = VEILIGE_HUISSTIJL,
}: Props) {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)

  // Actief = het pad valt binnen dit modulesegment (ook sub-routes zoals /inspecties/[id]).
  const isActief = (it: NavItem) => {
    const basis = `/${companyId}/${it.seg}`
    return pathname === basis || pathname.startsWith(basis + '/')
  }
  const actief = items.find(isActief)

  const linkBasis = 'text-sm px-3 py-2 min-h-[44px] inline-flex items-center rounded-full transition-colors'
  const linkActief = `${linkBasis} bg-accent text-white`
  const linkRest = `${linkBasis} text-ink/60 hover:text-ink hover:bg-ink/5`

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-ink/10" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-5xl mx-auto px-4">
        {/* Bovenrij: merk/bedrijf + navigatie (desktop) of menuknop (mobiel) */}
        <div className="flex items-center justify-between gap-3 h-14">
          <Link href={`/${companyId}/dashboard`} className="font-semibold text-ink truncate">
            {companyNaam}
          </Link>

          {/* Desktop-navigatie */}
          <nav className="hidden md:flex items-center gap-1 flex-wrap justify-end">
            {items.map(it => (
              <Link key={it.key} href={it.href} className={isActief(it) ? linkActief : linkRest}>
                {it.label}
              </Link>
            ))}
          </nav>

          {/* Mobiele menuknop */}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label="Menu"
            className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink/70 hover:bg-ink/5"
          >
            <span aria-hidden className="text-xl leading-none">{open ? '✕' : '☰'}</span>
          </button>
        </div>

        {/* Broodkruimel: waar ben ik */}
        <div className="pb-2 -mt-1 text-xs text-ink/45">
          <span>{companyNaam}</span>
          <span className="mx-1.5" aria-hidden>›</span>
          <span className="text-ink/70">{actief?.label ?? 'Dashboard'}</span>
        </div>
      </div>

      {/* Mobiel uitklapmenu */}
      {open && (
        <nav className="md:hidden border-t border-ink/10 bg-white px-4 py-2 flex flex-col">
          {items.map(it => (
            <Link
              key={it.key}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`min-h-[44px] inline-flex items-center px-3 rounded-lg text-sm ${
                isActief(it) ? 'bg-accent text-white' : 'text-ink/70 hover:bg-ink/5'
              }`}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
