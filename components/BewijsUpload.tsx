'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BEWIJS_BUCKET, MAX_BYTES, isAfbeelding, isToegestaanType } from '@/lib/bewijs'
import { verkleinAfbeelding } from '@/lib/afbeelding'

type Modus = 'gast' | 'beheerder'

type Props = {
  modus: Modus
  actieId: string
  /** Vereist bij modus 'gast': de deellink-token. */
  token?: string
  /** Wordt aangeroepen na een geslaagde upload (bv. om de lijst te verversen). */
  onUploaded?: () => void
}

// Vervang de extensie van een bestandsnaam (verkleinde foto's worden jpg).
export default function BewijsUpload({ modus, actieId, token, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = useState(false)
  const [sleep, setSleep] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function verwerk(file: File) {
    setFout(null)

    if (!isToegestaanType(file.type)) {
      setFout('Alleen afbeeldingen of pdf-bestanden zijn toegestaan.')
      return
    }

    setBezig(true)
    try {
      // 1. Voorbereiden: foto's verkleinen, pdf's ongemoeid laten.
      let blob: Blob = file
      let naam = file.name
      let type = file.type
      if (isAfbeelding(file.type)) {
        try {
          const verkleind = await verkleinAfbeelding(file)
          blob = verkleind.blob
          naam = verkleind.naam
          type = verkleind.type
        } catch {
          // Kon niet verkleinen (bv. niet te decoderen formaat) → origineel proberen.
          blob = file
          naam = file.name
          type = file.type
        }
      }

      if (blob.size > MAX_BYTES) {
        setFout('Bestand te groot (max 5 MB).')
        return
      }

      // 2. Signed upload-URL ophalen bij de juiste server-route.
      const endpoint = modus === 'gast' ? '/api/bewijs/gast-upload' : '/api/bewijs/beheerder-upload'
      const payload =
        modus === 'gast'
          ? { token, actieId, bestandsnaam: naam }
          : { actieId, bestandsnaam: naam }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setFout(res.status === 403 ? 'Geen toegang om bewijs toe te voegen.' : 'Upload voorbereiden mislukt.')
        return
      }
      const { pad, uploadToken } = (await res.json()) as { pad?: string; uploadToken?: string }
      if (!pad || !uploadToken) {
        setFout('Upload voorbereiden mislukt.')
        return
      }

      // 3. Bestand direct naar de signed URL uploaden (kortlevend, één pad).
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from(BEWIJS_BUCKET)
        .uploadToSignedUrl(pad, uploadToken, blob, { contentType: type })
      if (upErr) {
        setFout('Uploaden mislukt. Probeer het opnieuw.')
        return
      }

      // 4. Bewijs-rij vastleggen via de juiste registratie-RPC (logt historie).
      const { error: regErr } =
        modus === 'gast'
          ? await supabase.rpc('deellink_bewijs_registreren', {
              p_token: token,
              p_actie_id: actieId,
              p_pad: pad,
              p_bestandsnaam: naam,
              p_type: type,
              p_grootte: blob.size,
            })
          : await supabase.rpc('bewijs_registreren', {
              p_actie_id: actieId,
              p_pad: pad,
              p_bestandsnaam: naam,
              p_type: type,
              p_grootte: blob.size,
            })
      if (regErr) {
        setFout('Vastleggen van het bewijs mislukt.')
        return
      }

      onUploaded?.()
    } catch {
      setFout('Er ging iets mis bij het uploaden.')
    } finally {
      setBezig(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) verwerk(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setSleep(false)
    if (bezig) return
    const file = e.dataTransfer.files?.[0]
    if (file) verwerk(file)
  }

  return (
    <div>
      <label
        onDragOver={e => {
          e.preventDefault()
          if (!bezig) setSleep(true)
        }}
        onDragLeave={() => setSleep(false)}
        onDrop={onDrop}
        className={`flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer text-sm text-center transition-colors ${
          sleep ? 'border-accent bg-accent/5' : 'border-ink/20 bg-white hover:border-ink/40'
        } ${bezig ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={onChange}
          disabled={bezig}
        />
        <span className="text-ink/60">
          {bezig ? 'Bezig met uploaden…' : 'Sleep een foto of pdf hierheen, of tik om te kiezen'}
        </span>
      </label>
      {fout && <p className="text-xs text-red-600 mt-1">{fout}</p>}
    </div>
  )
}
