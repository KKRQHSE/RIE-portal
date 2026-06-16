'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import BewijsUpload from './BewijsUpload'
import BewijsLijst from './BewijsLijst'
import type { BewijsItem } from '@/lib/bewijs'

type Modus = 'gast' | 'beheerder'

type Props = {
  modus: Modus
  actieId: string
  /** Vereist bij modus 'gast'. */
  token?: string
}

// Combineert upload + lijst voor één actie en houdt de lijst actueel: na een
// upload (of verwijderen door de beheerder) wordt de lijst opnieuw opgehaald via
// de signed-download-route. Alle Storage-toegang loopt via de server-routes.
export default function BewijsBlok({ modus, actieId, token }: Props) {
  const [bewijzen, setBewijzen] = useState<BewijsItem[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [verwijderBezigId, setVerwijderBezigId] = useState<string | null>(null)

  const haal = useCallback(async () => {
    setFout(null)
    const endpoint = modus === 'gast' ? '/api/bewijs/gast-download' : '/api/bewijs/beheerder-download'
    const payload = modus === 'gast' ? { token, actieId } : { actieId }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setFout('Bewijzen laden mislukt.')
        setBewijzen([])
        return
      }
      const data = (await res.json()) as { bewijzen?: BewijsItem[] }
      setBewijzen(data.bewijzen ?? [])
    } catch {
      setFout('Bewijzen laden mislukt.')
    } finally {
      setLaden(false)
    }
  }, [modus, actieId, token])

  useEffect(() => {
    haal()
  }, [haal])

  async function verwijder(id: string) {
    setFout(null)
    setVerwijderBezigId(id)
    const supabase = createClient()
    // Markeert verwijderd + logt 'bewijs_verwijderd' (rij blijft in de DB).
    const { error } = await supabase.rpc('bewijs_verwijderen', { p_bewijs_id: id })
    setVerwijderBezigId(null)
    if (error) {
      setFout('Verwijderen mislukt.')
      return
    }
    setBewijzen(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="space-y-2">
      <BewijsUpload modus={modus} actieId={actieId} token={token} onUploaded={haal} />
      {fout && <p className="text-xs text-red-600">{fout}</p>}
      <BewijsLijst
        bewijzen={bewijzen}
        laden={laden}
        magVerwijderen={modus === 'beheerder'}
        verwijderBezigId={verwijderBezigId}
        onVerwijder={verwijder}
      />
    </div>
  )
}
