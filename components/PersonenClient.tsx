'use client'

import { useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { voorspelEmail } from '@/lib/email'
import type { Company, Persoon, Deellink, Functiegroep } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import LogoutButton from './LogoutButton'
import NaamVragen from './NaamVragen'
import HuisstijlLogo from './HuisstijlLogo'
import FunctiegroepBeheer from './FunctiegroepBeheer'

type Props = {
  company: Company
  initialPersonen: Persoon[]
  initialDeellinks: Deellink[]
  initialFunctiegroepen?: Functiegroep[]
  huisstijl?: HuisstijlView
  toonNaamVragen?: boolean
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

export default function PersonenClient({ company, initialPersonen, initialDeellinks, initialFunctiegroepen = [], huisstijl = VEILIGE_HUISSTIJL, toonNaamVragen = false }: Props) {
  const [personen, setPersonen] = useState<Persoon[]>(initialPersonen)
  const [functiegroepen, setFunctiegroepen] = useState<Functiegroep[]>(initialFunctiegroepen)
  const [links, setLinks] = useState<Record<string, Deellink>>(() =>
    Object.fromEntries(initialDeellinks.map(l => [l.persoon_id, l]))
  )

  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [suggestie, setSuggestie] = useState<{ actief: boolean; zeker: boolean }>({ actief: false, zeker: false })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const [gekopieerd, setGekopieerd] = useState<string | null>(null)
  const [linkBezig, setLinkBezig] = useState<string | null>(null)

  // Uitnodiging per e-mail (expliciet per persoon — geen automatische mail).
  const [mailBezig, setMailBezig] = useState<string | null>(null)
  const [mailUitkomst, setMailUitkomst] = useState<
    Record<string, { ok: true } | { ok: false; reden: string }>
  >({})

  // Browser-only origin voor de deellink-URL's; server-snapshot is leeg zodat
  // er geen hydration-mismatch of setState in een effect nodig is.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ''
  )

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
      .select('id, company_id, naam, email, status, voorgesteld_door, archived_at, functiegroep_id, datum_in_dienst, datum_uit_dienst')
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

  // Functiegroep (rol binnen het bedrijf) van een persoon zetten/losmaken via de
  // RPC met cross-company-guard. Optimistisch; bij een fout draaien we terug.
  async function zetFunctiegroep(persoonId: string, functiegroepId: string | null) {
    const vorige = personen.find(p => p.id === persoonId)?.functiegroep_id ?? null
    setPersonen(prev => prev.map(p => (p.id === persoonId ? { ...p, functiegroep_id: functiegroepId } : p)))
    const supabase = createClient()
    const { error } = await supabase.rpc('persoon_functiegroep_zetten', {
      p_persoon_id: persoonId,
      p_functiegroep_id: functiegroepId,
    })
    if (error) {
      setPersonen(prev => prev.map(p => (p.id === persoonId ? { ...p, functiegroep_id: vorige } : p)))
      setFout('Functiegroep wijzigen mislukt. Probeer het opnieuw.')
    }
  }

  // Dienstdatum (in/uit) van een persoon zetten — direct op personen (RLS dekt het
  // eigen bedrijf). Voor de naar-rato-berekening in het toolbox-dashboard.
  async function zetDienst(persoonId: string, veld: 'datum_in_dienst' | 'datum_uit_dienst', waarde: string) {
    const datum = waarde || null
    const vorige = personen.find(p => p.id === persoonId)?.[veld] ?? null
    setPersonen(prev => prev.map(p => (p.id === persoonId ? { ...p, [veld]: datum } : p)))
    const supabase = createClient()
    const { error } = await supabase.from('personen').update({ [veld]: datum }).eq('id', persoonId)
    if (error) {
      setPersonen(prev => prev.map(p => (p.id === persoonId ? { ...p, [veld]: vorige } : p)))
      setFout('Dienstdatum opslaan mislukt. Probeer het opnieuw.')
    }
  }

  // Stuurt de actiehouder een uitnodiging met zijn deellink. De mailsleutel zit
  // uitsluitend server-side; deze client roept alleen de server-route aan. De
  // mail is een extra — een fout blokkeert niets, we tonen alleen de uitkomst.
  async function stuurUitnodiging(persoonId: string) {
    setMailBezig(persoonId)
    setMailUitkomst(prev => {
      const { [persoonId]: _weg, ...rest } = prev
      return rest
    })
    try {
      const r = await fetch('/api/mail/toewijzen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persoonId }),
      })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; fout?: string } | null
      setMailUitkomst(prev => ({
        ...prev,
        [persoonId]: j?.ok ? { ok: true } : { ok: false, reden: j?.fout || 'onbekende reden' },
      }))
    } catch {
      setMailUitkomst(prev => ({ ...prev, [persoonId]: { ok: false, reden: 'netwerkfout' } }))
    } finally {
      setMailBezig(null)
    }
  }

  function kopieer(url: string, persoonId: string) {
    navigator.clipboard?.writeText(url)
    setGekopieerd(persoonId)
    setTimeout(() => setGekopieerd(g => (g === persoonId ? null : g)), 2000)
  }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        {toonNaamVragen && <NaamVragen />}

        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Personen &amp; deellinks</p>
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
                className="w-full text-sm border border-ink/20 rounded px-3 py-2 min-h-[44px] bg-white"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-ink/40 mb-1">E-mail</label>
              <input
                value={email}
                onChange={e => emailChange(e.target.value)}
                placeholder="naam@bedrijf.nl"
                type="email"
                className={`w-full text-sm border rounded px-3 py-2 min-h-[44px] bg-white ${
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
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {bezig ? 'Bezig…' : 'Toevoegen'}
            </button>
            {fout && <span className="text-xs text-red-600">{fout}</span>}
          </div>
        </form>

        {/* Functiegroepen beheren — de rollen die je hierboven aan personen koppelt */}
        <FunctiegroepBeheer
          companyId={company.id}
          functiegroepen={functiegroepen}
          setFunctiegroepen={setFunctiegroepen}
        />

        {/* Lijst */}
        <div className="space-y-3">
          {personen.map(p => {
            const link: Deellink | undefined = links[p.id]
            const actief = isActief(link)
            const ingetrokken = !!link && link.ingetrokken
            const url = actief ? `${origin}/a/${link.token}` : ''
            return (
              <div key={p.id} className="glass-tile rounded-2xl p-4">
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

                {/* Functiegroep (rol in het bedrijf) — los van het portaalrecht */}
                {functiegroepen.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <label htmlFor={`fg-${p.id}`} className="text-xs text-ink/50">Functiegroep</label>
                    <select
                      id={`fg-${p.id}`}
                      value={p.functiegroep_id ?? ''}
                      onChange={e => zetFunctiegroep(p.id, e.target.value || null)}
                      className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white"
                    >
                      <option value="">— geen —</option>
                      {functiegroepen.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
                    </select>
                  </div>
                )}

                {/* Dienstverband — voor de naar-rato-berekening in het toolbox-dashboard */}
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <label className="text-xs text-ink/50 flex items-center gap-1.5">
                    In dienst
                    <input type="date" defaultValue={p.datum_in_dienst ?? ''} onChange={e => zetDienst(p.id, 'datum_in_dienst', e.target.value)}
                      aria-label={`Datum in dienst van ${p.naam}`} className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white" />
                  </label>
                  <label className="text-xs text-ink/50 flex items-center gap-1.5">
                    Uit dienst
                    <input type="date" defaultValue={p.datum_uit_dienst ?? ''} onChange={e => zetDienst(p.id, 'datum_uit_dienst', e.target.value)}
                      aria-label={`Datum uit dienst van ${p.naam}`} className="text-sm border border-ink/20 rounded px-2 py-1.5 min-h-[40px] bg-white" />
                  </label>
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
                          className="flex-1 min-w-0 text-xs font-mono border border-ink/15 rounded px-2 py-2 min-h-[44px] bg-surface/50 text-ink/70"
                        />
                        <button
                          onClick={() => kopieer(url, p.id)}
                          className="shrink-0 text-xs px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-ink text-white hover:opacity-90 transition-opacity"
                        >
                          {gekopieerd === p.id ? '✓ Gekopieerd' : 'Kopieer link'}
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => maakOfVernieuw(p.id)}
                          disabled={linkBezig === p.id}
                          className="inline-flex items-center min-h-[44px] px-2 text-xs text-ink/50 hover:text-accent transition-colors disabled:opacity-40"
                        >
                          Opnieuw genereren
                        </button>
                        <button
                          onClick={() => trekIn(p.id)}
                          disabled={linkBezig === p.id}
                          className="inline-flex items-center min-h-[44px] px-2 text-xs text-red-600 hover:underline disabled:opacity-40"
                        >
                          Intrekken
                        </button>
                      </div>
                      <p className="text-xs text-ink/40">
                        Opnieuw genereren maakt de huidige link direct ongeldig.
                      </p>

                      {/* Uitnodiging per e-mail — expliciete knop per persoon */}
                      <div className="pt-2 border-t border-surface space-y-1">
                        <button
                          onClick={() => stuurUitnodiging(p.id)}
                          disabled={!p.email || mailBezig === p.id}
                          title={p.email ? undefined : 'Deze persoon heeft geen e-mailadres'}
                          className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                        >
                          {mailBezig === p.id ? 'Versturen…' : 'Stuur uitnodiging per e-mail'}
                        </button>
                        {!p.email && (
                          <p className="text-xs text-ink/40">
                            Geen e-mailadres — voeg er een toe om te kunnen uitnodigen.
                          </p>
                        )}
                        {mailUitkomst[p.id]?.ok && (
                          <p className="text-xs text-green-600">Uitnodiging verstuurd naar {p.email}.</p>
                        )}
                        {mailUitkomst[p.id] && !mailUitkomst[p.id].ok && (
                          <p className="text-xs text-amber-600">
                            E-mail niet verstuurd ({(mailUitkomst[p.id] as { reden: string }).reden}).
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => maakOfVernieuw(p.id)}
                      disabled={linkBezig === p.id}
                      className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
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
