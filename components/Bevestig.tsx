'use client'

import { useEffect, useRef } from 'react'

// Herbruikbaar in-app bevestigingsscherm. Vervangt de native confirm(), die in
// dit portaal niet gebruikt wordt: hij is niet te stylen, niet te vertalen, toont
// de huisstijl niet en kan door de browser onderdrukt worden.
//
// Toegankelijkheid: role=alertdialog met aria-labelledby/-describedby, focus gaat
// bij openen naar de annuleerknop (de veilige keuze), Escape sluit, en de focus
// blijft binnen het venster zolang het open staat.
//
// `gevaar` kleurt de bevestigknop rood — voor onomkeerbare handelingen.

type Props = {
  open: boolean
  titel: string
  // De uitleg is vrij invulbaar zodat een scherm precies kan tonen wát er gebeurt.
  children: React.ReactNode
  bevestigLabel: string
  annuleerLabel?: string
  gevaar?: boolean
  bezig?: boolean
  onBevestig: () => void
  onAnnuleer: () => void
}

export default function Bevestig({
  open, titel, children, bevestigLabel, annuleerLabel = 'Annuleren',
  gevaar = false, bezig = false, onBevestig, onAnnuleer,
}: Props) {
  const venster = useRef<HTMLDivElement>(null)
  const annuleerKnop = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    annuleerKnop.current?.focus()

    function bijToets(e: KeyboardEvent) {
      if (e.key === 'Escape' && !bezig) {
        e.preventDefault()
        onAnnuleer()
        return
      }
      if (e.key !== 'Tab' || !venster.current) return
      // Focus vasthouden binnen het venster: van de laatste knop terug naar de
      // eerste en omgekeerd, zodat je niet ongemerkt achter het venster belandt.
      const focusbaar = venster.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
      if (focusbaar.length === 0) return
      const eerste = focusbaar[0]
      const laatste = focusbaar[focusbaar.length - 1]
      if (e.shiftKey && document.activeElement === eerste) {
        e.preventDefault()
        laatste.focus()
      } else if (!e.shiftKey && document.activeElement === laatste) {
        e.preventDefault()
        eerste.focus()
      }
    }

    document.addEventListener('keydown', bijToets)
    return () => document.removeEventListener('keydown', bijToets)
  }, [open, bezig, onAnnuleer])

  if (!open) return null

  const knop =
    'btn text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-ink/40">
      <div
        ref={venster}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bevestig-titel"
        aria-describedby="bevestig-uitleg"
        className="glass-tile rounded-3xl p-6 w-full max-w-md shadow-xl"
      >
        <h2 id="bevestig-titel" className="text-lg font-semibold text-ink">{titel}</h2>
        <div id="bevestig-uitleg" className="text-sm text-ink/70 leading-relaxed mt-2 space-y-2">
          {children}
        </div>
        <div className="flex flex-wrap gap-2 mt-6 justify-end">
          <button
            type="button"
            ref={annuleerKnop}
            onClick={onAnnuleer}
            disabled={bezig}
            className={`${knop} bg-white text-ink/70 border-ink/20 hover:border-ink/40`}
          >
            {annuleerLabel}
          </button>
          <button
            type="button"
            onClick={onBevestig}
            disabled={bezig}
            className={`${knop} ${gevaar
              ? 'btn-danger bg-red-600 text-white border-red-600'
              : 'btn-accent bg-accent text-white border-accent'}`}
          >
            {bezig ? 'Bezig…' : bevestigLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
