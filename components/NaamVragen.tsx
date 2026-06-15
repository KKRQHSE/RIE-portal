'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Eénmalige prompt voor beheerders zonder naam. De server-pagina bepaalt of dit
// blok verschijnt (magBeheren én nog geen naam). Na opslaan: router.refresh(),
// zodat de server-pagina opnieuw draait en koppel_mij_als_persoon uitvoert.
export default function NaamVragen() {
  const router = useRouter()
  const [naam, setNaam] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan(e: React.FormEvent) {
    e.preventDefault()
    if (!naam.trim() || bezig) return
    setBezig(true)
    setFout(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('zet_mijn_naam', { p_naam: naam.trim() })
      if (error) {
        setBezig(false)
        setFout(`Opslaan mislukt: ${error.message}`)
        return
      }
      router.refresh()
    } catch {
      // Bv. als de client niet kan worden opgebouwd (ontbrekende config).
      setBezig(false)
      setFout('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.')
    }
  }

  return (
    <form onSubmit={opslaan} className="bg-white rounded-lg shadow-sm p-4 mb-6 border-l-4 border-accent">
      <p className="text-sm font-medium text-ink mb-1">Hoe heet je?</p>
      <p className="text-xs text-ink/50 mb-3">Verschijnt bij acties die aan jou zijn toegewezen.</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={naam}
          onChange={e => setNaam(e.target.value)}
          placeholder="Voor- en achternaam"
          className="flex-1 min-w-[160px] text-sm border border-ink/20 rounded px-3 py-2 bg-white"
        />
        <button
          type="submit"
          disabled={!naam.trim() || bezig}
          className="text-sm px-4 py-2 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {bezig ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
      {fout && <p className="text-xs text-red-600 mt-2">{fout}</p>}
    </form>
  )
}
