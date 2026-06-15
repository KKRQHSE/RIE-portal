'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { voorspelEmail } from '@/lib/email'
import type { Company, Persoon, Deellink } from '@/lib/types'
import LogoutButton from './LogoutButton'

type Props = {
  company: Company
  initialPersonen: Persoon[]
  initialDeellinks: Deellink[]
}

const STATUS_STYLE: Record<string, string> = {
  actief:      'bg-green-100 text-green-800',
  voorgesteld: 'bg-yellow-100 text-yellow-800',
}

function isActief(link: Deellink | undefined): link is Deellink {
  if (!link || link.ingetrokken) return false
  if (link.vervalt_op && new Date(link.vervalt_op) <= new Date()) return false
  return true
}

export default function PersonenClient({ company, initialPersonen, initialDeellinks }: Props) {
  const [personen, setPersonen] = useState<Persoon[]>(initialPersonen)
  const [links, setLinks] = useState<Record<string, Deellink>>(() =>
    Object.fromEntries(initialDeellinks.map(l => [l.persoon_id, l]))
  )

  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [suggestie, setSuggestie] = useState<{ actief: boolean; zeker: boolean }>({ actief: false, zeker: false })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [gekopieerd, setGekopieerd] = useState<string | null>(null)
  const [linkBezig, setLinkBezig] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const paren = personen.map(p => ({ naam: p.naam, email: p.email }))

  function naamChange(val: string) {
    setNaam(val)
    if (!emailTouched) {
      const pred = voorspelEmail(val, paren)
      setEmail(pred.email)
      setSuggestie({ actief: pred.email !== '', zeker: pred.zeker })
    }
  }

  function emailChange(val: string) {
    setEmail(val)
    setEmailTouched(true)
    setSuggestie({ actief: false, zeker: false })
  }

  async function voegToe(e: React.FormEvent) {
    e.preventDefault()
    if (!naam.trim() || bezig) return
    setBezig(true)
    setFout(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('personen')
      .insert({ company_id: company.id, naam: naam.trim(), email: email.trim() || null, status: 'actief' })
      .select('id, company_id, naam, email, status, voorgesteld_door, archived_at')
      .single()
    setBezig(false)
    if (error || !data) {
      setFout('Toevoegen mislukt. Probeer het opnieuw.')
      return
    }
    setPersonen(prev => [...prev, data as Persoon].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))
    setNaam('')
    setEmail('')
    setEmailTouched(false)
    setSuggestie({ actief: false, zeker: false })
  }

  async function maakOfVernieuw(persoonId: string) {
    setLinkBezig(persoonId)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('create_deellink', { p_persoon_id: persoonId })
    setLinkBezig(null)
    if (error || !data) return
    setLinks(prev => ({
      ...prev,
      [persoonId]: {
        id: prev[persoonId]?.id ?? '',
        company_id: company.id,
        persoon_id: persoonId,
        token: data as string,
        vervalt_op: null,
        ingetrokken: false,
      },
    }))
  }

  async function trekIn(persoonId: string) {
    setLinkBezig(persoonId)
    const supabase = createClient()
    const { error } = await supabase.rpc('intrek_deellink', { p_persoon_id: persoonId })
    setLinkBezig(null)
    if (error) return
    setLinks(prev => {
      const cur = prev[persoonId]
      if (!cur) return prev
      return { ...prev, [persoonId]: { ...cur, ingetrokken: true } }
    })
  }

  function kopieer(url: string, persoonId: string) {
    navigator.clipboard?.writeText(url)
    setGekopieerd(persoonId)
    setTimeout(() => setGekopieerd(g => (g === persoonId ? null : g)), 2000)
  }

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <Image src="/logo.jpg" alt="QHSE Totaal" width={140} height={46} className="object-contain mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Personen &amp; deellinks</p>
        </div>

        <div className="flex gap-2 mb-6">
          <Link
            href={`/${company.id}/pva`}
            className="text-sm px-4 py-2 rounded-full bg-white text-ink/60 border border-ink/20 hover:border-ink/40 transition-colors"
          >
            Plan van Aanpak
          </Link>
          <span className="text-sm px-4 py-2 rounded-full bg-ink text-white">
            Personen
          </span>
        </div>

        {/* Persoon toevoegen */}
        <form onSubmit={voegToe} className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-3">Persoon toevoegen</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-ink/40 mb-1">Naam</label>
              <input
                value={naam}
                onChange={e => naamChange(e.target.value)}
                placeholder="Voor- en achternaam"
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-ink/40 mb-1">E-mail</label>
              <input
                value={email}
                onChange={e => emailChange(e.target.value)}
                placeholder="naam@bedrijf.nl"
                type="email"
                className={`w-full text-sm border rounded px-3 py-2 bg-white ${
                  suggestie.actief ? 'border-accent/40' : 'border-ink/20'
                }`}
              />
              {suggestie.actief && (
                <p className="text-xs text-accent/70 mt-1">
                  Voorgesteld op basis van bestaande adressen{suggestie.zeker ? '' : ' — controleer dit'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="submit"
              disabled={!naam.trim() || bezig}
              className="text-sm px-4 py-2 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {bezig ? 'Bezig…' : 'Toevoegen'}
            </button>
            {fout && <span className="text-xs text-red-600">{fout}</span>}
          </div>
        </form>

        {/* Lijst */}
        <div className="space-y-3">
          {personen.map(p => {
            const link: Deellink | undefined = links[p.id]
            const actief = isActief(link)
            const ingetrokken = !!link && link.ingetrokken
            const url = actief ? `${origin}/a/${link.token}` : ''
            return (
              <div key={p.id} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{p.naam}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLE[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-sm text-ink/50 mt-0.5 truncate">{p.email || '— geen e-mail —'}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded ${actief ? 'bg-green-50 text-green-700' : 'bg-surface text-ink/40'}`}>
                    {actief ? 'deellink actief' : 'geen actieve link'}
                  </span>
                </div>

                {/* Deellink-beheer */}
                <div className="mt-3 pt-3 border-t border-surface">
                  {actief ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={url}
                          onFocus={e => e.currentTarget.select()}
                          className="flex-1 min-w-0 text-xs font-mono border border-ink/15 rounded px-2 py-1.5 bg-surface/50 text-ink/70"
                        />
                        <button
                          onClick={() => kopieer(url, p.id)}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-ink text-white hover:opacity-90 transition-opacity"
                        >
                          {gekopieerd === p.id ? '✓ Gekopieerd' : 'Kopieer link'}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => maakOfVernieuw(p.id)}
                          disabled={linkBezig === p.id}
                          className="text-xs text-ink/50 hover:text-accent transition-colors disabled:opacity-40"
                        >
                          Opnieuw genereren
                        </button>
                        <button
                          onClick={() => trekIn(p.id)}
                          disabled={linkBezig === p.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-40"
                        >
                          Intrekken
                        </button>
                      </div>
                      <p className="text-xs text-ink/40">
                        Opnieuw genereren maakt de huidige link direct ongeldig.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => maakOfVernieuw(p.id)}
                      disabled={linkBezig === p.id}
                      className="text-sm px-3 py-1.5 rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                    >
                      {linkBezig === p.id ? 'Bezig…' : ingetrokken ? 'Nieuwe deellink' : 'Deellink aanmaken'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {personen.length === 0 && (
            <p className="text-center text-ink/40 py-10 text-sm">Nog geen personen toegevoegd.</p>
          )}
        </div>
      </div>
    </main>
  )
}
