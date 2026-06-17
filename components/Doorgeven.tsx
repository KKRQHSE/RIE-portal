'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Modus = 'gast' | 'beheerder'

export type DoorgevenResultaat = { ontvangerNaam: string }

type Props = {
  modus: Modus
  actieId: string
  /** Vereist bij modus 'gast': de deellink-token. */
  token?: string
  /** Aangeroepen na succesvol doorgeven (parent kan lijst verversen/bijwerken). */
  onDoorgegeven?: (r: DoorgevenResultaat) => void
}

// Eenvoudige e-mail-vormcheck (alleen vorm, geen bestaanscontrole).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Doorgeven van een actie aan een collega. Eén component voor beide contexten:
// gast (via deellink_actie_doorgeven) en beheerder (via actie_doorgeven).
export default function Doorgeven({ modus, actieId, token, onDoorgegeven }: Props) {
  const [open, setOpen] = useState(false)
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<DoorgevenResultaat | null>(null)
  // Mail is een EXTRA bovenop het doorgeven: doorgeven slaagt ook als de mail faalt.
  const [mail, setMail] = useState<'bezig' | { ok: true } | { ok: false; reden: string } | null>(null)

  const naamTrim = naam.trim()
  const emailTrim = email.trim()
  const emailGeldig = emailTrim === '' || EMAIL_RE.test(emailTrim)
  // Minstens een naam OF een e-mail; e-mail (indien ingevuld) moet geldig zijn.
  const magVerzenden = (naamTrim !== '' || emailTrim !== '') && emailGeldig && !bezig

  function annuleer() {
    setOpen(false)
    setNaam('')
    setEmail('')
    setFout(null)
  }

  async function doorgeven() {
    if (!magVerzenden) return
    setBezig(true)
    setFout(null)

    const naamArg = naamTrim || null
    const emailArg = emailTrim || null

    try {
      const supabase = createClient()
      const { data, error } =
        modus === 'gast'
          ? await supabase.rpc('deellink_actie_doorgeven', {
              p_token: token,
              p_actie_id: actieId,
              p_naam: naamArg,
              p_email: emailArg,
            })
          : await supabase.rpc('actie_doorgeven', {
              p_actie_id: actieId,
              p_naam: naamArg,
              p_email: emailArg,
            })

      if (error) {
        setFout('Doorgeven mislukt. Probeer het opnieuw.')
        return
      }

      const obj = typeof data === 'string' ? JSON.parse(data) : data
      // null = ongeldige token/actie; { fout } = bv. doorgeven-aan-jezelf.
      if (!obj || typeof obj !== 'object') {
        setFout('Doorgeven niet gelukt. Controleer de gegevens en probeer opnieuw.')
        return
      }
      if (obj.fout) {
        setFout(String(obj.fout))
        return
      }
      if (!obj.ok) {
        setFout('Doorgeven niet gelukt.')
        return
      }

      const ontvangerNaam = String(
        obj.ontvanger_naam || obj.ontvanger_email || naamTrim || emailTrim || 'de collega'
      )
      // Doorgeven is gelukt — toon dat direct. De actie is al verhuisd.
      setKlaar({ ontvangerNaam })
      onDoorgegeven?.({ ontvangerNaam })

      // Extra: de nieuwe houder mailen. De server-route valideert de token +
      // toewijzing opnieuw en mailt naar het DB-adres; wij sturen geen vrij adres.
      const ontvangerToken = obj.ontvanger_token ? String(obj.ontvanger_token) : null
      const actieNr = obj.actie_nr != null ? String(obj.actie_nr) : null
      if (ontvangerToken && actieNr) {
        setMail('bezig')
        try {
          const r = await fetch('/api/mail/doorgeven', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: ontvangerToken, actieNr }),
          })
          const j = (await r.json().catch(() => null)) as { ok?: boolean; fout?: string } | null
          setMail(j?.ok ? { ok: true } : { ok: false, reden: j?.fout || 'onbekende reden' })
        } catch {
          setMail({ ok: false, reden: 'netwerkfout' })
        }
      }
    } catch {
      setFout('Er ging iets mis bij het doorgeven.')
    } finally {
      setBezig(false)
    }
  }

  if (klaar) {
    return (
      <div className="text-xs font-medium space-y-1">
        <p className="text-green-600">
          Doorgegeven aan {klaar.ontvangerNaam}.
          {modus === 'gast' ? ' Deze actie staat niet meer op jouw lijst.' : ''}
        </p>
        {mail === 'bezig' && <p className="text-ink/50">E-mail wordt verstuurd…</p>}
        {mail && mail !== 'bezig' && mail.ok && (
          <p className="text-green-600">Er is een e-mail gestuurd.</p>
        )}
        {mail && mail !== 'bezig' && !mail.ok && (
          <p className="text-amber-600">
            Let op: de e-mail kon niet worden verstuurd ({mail.reden}).
          </p>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors"
      >
        Doorgeven aan collega
      </button>
    )
  }

  return (
    <div className="rounded border border-surface bg-surface/40 p-3 space-y-2">
      <p className="text-xs text-ink/50">
        Geef deze actie door aan een collega — een bestaande of een nieuw e-mailadres.
        De ontvanger ziet de actie zodra die de eigen link opent.
      </p>
      <input
        value={naam}
        onChange={e => setNaam(e.target.value)}
        placeholder="Naam"
        className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
      />
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="E-mailadres"
        type="email"
        className={`w-full text-sm border rounded px-3 py-2 min-h-[44px] bg-white ${
          emailGeldig ? 'border-ink/20' : 'border-red-300'
        }`}
      />
      {!emailGeldig && <p className="text-xs text-red-600">Vul een geldig e-mailadres in.</p>}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={doorgeven}
          disabled={!magVerzenden}
          className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {bezig ? 'Bezig…' : 'Doorgeven'}
        </button>
        <button
          onClick={annuleer}
          disabled={bezig}
          className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors disabled:opacity-40"
        >
          Annuleren
        </button>
      </div>
      {fout && <p className="text-xs text-red-600">{fout}</p>}
    </div>
  )
}
