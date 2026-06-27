'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Merk, BedrijfHuisstijl } from '@/lib/types'
import { kleurUitLogo } from '@/lib/logo-kleur'
import LogoutButton from './LogoutButton'

const BUCKET = 'merk-assets'

const LETTERTYPES = [
  { value: 'grotesk', label: 'Grotesk (Hanken)' },
  { value: 'modern', label: 'Modern (Inter)' },
  { value: 'klassiek', label: 'Klassiek (serif)' },
  { value: 'zakelijk', label: 'Zakelijk (IBM Plex)' },
]

const MODI = [
  { value: 'default', label: 'Standaard', uitleg: 'Alleen het merklogo en de merkstijl.' },
  { value: 'co_branding', label: 'Co-branding', uitleg: 'Klantlogo naast het merklogo.' },
  { value: 'white_label', label: 'White-label', uitleg: 'Klantlogo voorop; de partner is het merk.' },
]

type Supa = ReturnType<typeof createClient>

function extVan(naam: string): string {
  const e = naam.split('.').pop()
  return e ? e.toLowerCase() : 'png'
}

const LogoPreview = ({ src, alt }: { src: string; alt: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} className="h-10 w-auto object-contain" />
)

// Knop "Kleur uit logo halen" → toont een VOORSTEL (kleurstaal + hex + bevestigknop).
// Niets wordt automatisch overgenomen: pas op "Gebruik deze kleur" roept hij onGebruik
// aan, dat de bestaande accent-state vult (opslaan gebeurt via de gewone Opslaan-knop).
function KleurUitLogo({ logoUrl, onGebruik }: { logoUrl: string | null; onGebruik: (hex: string) => void }) {
  const [bezig, setBezig] = useState(false)
  const [voorstel, setVoorstel] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)

  async function bepaal() {
    if (!logoUrl) return
    setBezig(true)
    setMelding(null)
    setVoorstel(null)
    const res = await kleurUitLogo(logoUrl)
    setBezig(false)
    if ('hex' in res) {
      setVoorstel(res.hex)
    } else if (res.fout === 'geen-kleur') {
      setMelding('Geen duidelijke kleur gevonden — kies handmatig.')
    } else {
      setMelding('Kon het logo niet uitlezen — kies handmatig.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={bepaal}
        disabled={!logoUrl || bezig}
        title={logoUrl ? undefined : 'Upload eerst een logo'}
        className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
      >
        {bezig ? 'Bezig…' : 'Kleur uit logo halen'}
      </button>

      {voorstel && (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rounded border border-ink/20 shrink-0"
            style={{ backgroundColor: voorstel }}
          />
          <span className="text-xs font-mono text-ink/70">{voorstel}</span>
          <button
            type="button"
            onClick={() => { onGebruik(voorstel); setVoorstel(null); setMelding(null) }}
            className="text-xs px-3 py-1.5 rounded-full bg-ink text-white hover:opacity-90 transition-opacity"
          >
            Gebruik deze kleur {voorstel}
          </button>
        </span>
      )}

      {melding && <span className="text-xs text-ink/50">{melding}</span>}
    </div>
  )
}

export default function HuisstijlAdmin({
  initialMerken,
  initialBedrijven,
}: {
  initialMerken: Merk[]
  initialBedrijven: BedrijfHuisstijl[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [merken, setMerken] = useState<Merk[]>(initialMerken)
  const [bedrijven, setBedrijven] = useState<BedrijfHuisstijl[]>(initialBedrijven)

  function publicUrl(pad: string | null): string | null {
    return pad ? supabase.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl : null
  }

  function updateMerk(m: Merk) {
    setMerken(prev => prev.map(x => (x.id === m.id ? m : x)))
  }

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-ink/50 hover:text-accent transition-colors">← Beheer</Link>
          <h1 className="text-xl font-semibold text-ink mt-1">Huisstijl</h1>
          <p className="text-sm text-ink/50 mt-0.5">Merken en de huisstijl per klant beheren.</p>
        </div>

        {/* SECTIE A — Merken */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-ink mb-3">Merken</h2>
          <div className="space-y-3">
            {merken.map(merk => (
              <MerkKaart key={merk.id} merk={merk} supabase={supabase} publicUrl={publicUrl} onSaved={updateMerk} />
            ))}
            {merken.length === 0 && (
              <p className="text-sm text-ink/40">Nog geen merken.</p>
            )}
          </div>
          <NieuwMerk supabase={supabase} onAdded={m => setMerken(prev => [...prev, m].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))} />
        </section>

        {/* SECTIE B — Huisstijl per klant */}
        <section>
          <h2 className="text-sm font-semibold text-ink mb-3">Huisstijl per klant</h2>
          <KlantSectie
            bedrijven={bedrijven}
            setBedrijven={setBedrijven}
            merken={merken}
            supabase={supabase}
            publicUrl={publicUrl}
          />
        </section>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Merk bewerken
// ---------------------------------------------------------------------------
function MerkKaart({
  merk,
  supabase,
  publicUrl,
  onSaved,
}: {
  merk: Merk
  supabase: Supa
  publicUrl: (pad: string | null) => string | null
  onSaved: (m: Merk) => void
}) {
  const [naam, setNaam] = useState(merk.naam)
  const [accent, setAccent] = useState(merk.accent_kleur || '#FF5200')
  const [lettertype, setLettertype] = useState(merk.lettertype || 'grotesk')
  const [logoPad, setLogoPad] = useState<string | null>(merk.logo_pad)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  async function opslaan() {
    setBezig(true)
    setMelding(null)
    const { error } = await supabase
      .from('merken')
      .update({ naam: naam.trim(), accent_kleur: accent, lettertype })
      .eq('id', merk.id)
    setBezig(false)
    if (error) { setMelding(`Opslaan mislukt: ${error.message}`); return }
    onSaved({ ...merk, naam: naam.trim(), accent_kleur: accent, lettertype, logo_pad: logoPad })
    setMelding('✓ Opgeslagen')
    setTimeout(() => setMelding(null), 2000)
  }

  async function uploadLogo(file: File) {
    setBezig(true)
    setMelding(null)
    const pad = `merken/${merk.id}-${Date.now()}.${extVan(file.name)}`
    const up = await supabase.storage.from(BUCKET).upload(pad, file, { upsert: true })
    if (up.error) { setBezig(false); setMelding(`Upload mislukt: ${up.error.message}`); return }
    const { error } = await supabase.from('merken').update({ logo_pad: pad }).eq('id', merk.id)
    setBezig(false)
    if (error) { setMelding(`Opslaan mislukt: ${error.message}`); return }
    setLogoPad(pad)
    onSaved({ ...merk, naam, accent_kleur: accent, lettertype, logo_pad: pad })
    setMelding('✓ Logo geüpload')
    setTimeout(() => setMelding(null), 2000)
  }

  const logoUrl = publicUrl(logoPad)

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-28 h-12 flex items-center justify-center rounded border border-surface bg-surface/40">
          {logoUrl ? <LogoPreview src={logoUrl} alt={`Logo ${naam}`} /> : <span className="text-[11px] text-ink/40">geen logo</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={naam}
            onChange={e => setNaam(e.target.value)}
            placeholder="Merknaam"
            className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white font-medium"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink/50">
              Accent
              <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-7 w-10 rounded border border-ink/20 bg-white" />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink/50">
              Lettertype
              <select value={lettertype} onChange={e => setLettertype(e.target.value)} className="text-sm border border-ink/20 rounded px-2 py-1 bg-white">
                {LETTERTYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink/50 cursor-pointer">
              <span className="underline hover:text-accent">Logo uploaden</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }}
              />
            </label>
          </div>
          <KleurUitLogo logoUrl={logoUrl} onGebruik={setAccent} />
          <div className="flex items-center gap-3">
            <button
              onClick={opslaan}
              disabled={bezig || !naam.trim()}
              className="text-sm px-4 py-1.5 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {bezig ? 'Bezig…' : 'Opslaan'}
            </button>
            {melding && <span className="text-xs text-ink/50">{melding}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nieuw merk
// ---------------------------------------------------------------------------
function NieuwMerk({ supabase, onAdded }: { supabase: Supa; onAdded: (m: Merk) => void }) {
  const [naam, setNaam] = useState('')
  const [accent, setAccent] = useState('#FF5200')
  const [lettertype, setLettertype] = useState('grotesk')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function toevoegen(e: React.FormEvent) {
    e.preventDefault()
    if (!naam.trim() || bezig) return
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase
      .from('merken')
      .insert({ naam: naam.trim(), accent_kleur: accent, lettertype })
      .select('id, naam, logo_pad, accent_kleur, lettertype')
      .single()
    setBezig(false)
    if (error || !data) { setFout(`Toevoegen mislukt${error ? `: ${error.message}` : ''}`); return }
    onAdded(data as Merk)
    setNaam('')
    setAccent('#FF5200')
    setLettertype('grotesk')
  }

  return (
    <form onSubmit={toevoegen} className="bg-white rounded-lg shadow-sm p-4 mt-3">
      <p className="text-sm font-medium text-ink mb-3">Nieuw merk toevoegen</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={naam}
          onChange={e => setNaam(e.target.value)}
          placeholder="Merknaam"
          className="flex-1 min-w-[160px] text-sm border border-ink/20 rounded px-3 py-2 bg-white"
        />
        <label className="flex items-center gap-2 text-xs text-ink/50">
          Accent
          <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-7 w-10 rounded border border-ink/20 bg-white" />
        </label>
        <select value={lettertype} onChange={e => setLettertype(e.target.value)} className="text-sm border border-ink/20 rounded px-2 py-1 bg-white">
          {LETTERTYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <button
          type="submit"
          disabled={bezig || !naam.trim()}
          className="text-sm px-4 py-2 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Toevoegen
        </button>
      </div>
      {fout && <p className="text-xs text-red-600 mt-2">{fout}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Huisstijl per klant
// ---------------------------------------------------------------------------
function KlantSectie({
  bedrijven,
  setBedrijven,
  merken,
  supabase,
  publicUrl,
}: {
  bedrijven: BedrijfHuisstijl[]
  setBedrijven: React.Dispatch<React.SetStateAction<BedrijfHuisstijl[]>>
  merken: Merk[]
  supabase: Supa
  publicUrl: (pad: string | null) => string | null
}) {
  const [selId, setSelId] = useState(bedrijven[0]?.id ?? '')
  const bedrijf = bedrijven.find(b => b.id === selId)

  function onSaved(b: BedrijfHuisstijl) {
    setBedrijven(prev => prev.map(x => (x.id === b.id ? b : x)))
  }

  if (bedrijven.length === 0) {
    return <p className="text-sm text-ink/40">Nog geen bedrijven.</p>
  }

  return (
    <div className="space-y-3">
      <select
        value={selId}
        onChange={e => setSelId(e.target.value)}
        className="text-sm border border-ink/20 rounded px-3 py-2 bg-white w-full"
      >
        {bedrijven.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {bedrijf && (
        <KlantForm key={bedrijf.id} bedrijf={bedrijf} merken={merken} supabase={supabase} publicUrl={publicUrl} onSaved={onSaved} />
      )}
    </div>
  )
}

function KlantForm({
  bedrijf,
  merken,
  supabase,
  publicUrl,
  onSaved,
}: {
  bedrijf: BedrijfHuisstijl
  merken: Merk[]
  supabase: Supa
  publicUrl: (pad: string | null) => string | null
  onSaved: (b: BedrijfHuisstijl) => void
}) {
  const [merkId, setMerkId] = useState(bedrijf.merk_id ?? '')
  const [modus, setModus] = useState(bedrijf.huisstijl_modus ?? 'default')
  const [klantLogoPad, setKlantLogoPad] = useState<string | null>(bedrijf.klant_logo_pad)
  const [accentOverride, setAccentOverride] = useState(bedrijf.accent_kleur_override ?? '')
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  const merk = merken.find(m => m.id === merkId)
  const merkLogoUrl = publicUrl(merk?.logo_pad ?? null)
  const klantLogoUrl = publicUrl(klantLogoPad)

  async function opslaan() {
    setBezig(true)
    setMelding(null)
    const { error } = await supabase
      .from('companies')
      .update({
        merk_id: merkId || null,
        huisstijl_modus: modus,
        accent_kleur_override: accentOverride.trim() || null,
      })
      .eq('id', bedrijf.id)
    setBezig(false)
    if (error) { setMelding(`Opslaan mislukt: ${error.message}`); return }
    onSaved({ ...bedrijf, merk_id: merkId || null, huisstijl_modus: modus, accent_kleur_override: accentOverride.trim() || null, klant_logo_pad: klantLogoPad })
    setMelding('✓ Opgeslagen')
    setTimeout(() => setMelding(null), 2000)
  }

  async function uploadKlantLogo(file: File) {
    setBezig(true)
    setMelding(null)
    const pad = `klanten/${bedrijf.id}-${Date.now()}.${extVan(file.name)}`
    const up = await supabase.storage.from(BUCKET).upload(pad, file, { upsert: true })
    if (up.error) { setBezig(false); setMelding(`Upload mislukt: ${up.error.message}`); return }
    const { error } = await supabase.from('companies').update({ klant_logo_pad: pad }).eq('id', bedrijf.id)
    setBezig(false)
    if (error) { setMelding(`Opslaan mislukt: ${error.message}`); return }
    setKlantLogoPad(pad)
    onSaved({ ...bedrijf, merk_id: merkId || null, huisstijl_modus: modus, accent_kleur_override: accentOverride.trim() || null, klant_logo_pad: pad })
    setMelding('✓ Logo geüpload')
    setTimeout(() => setMelding(null), 2000)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
      {/* Merk */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink/50 w-28 shrink-0">Merk</span>
        <select value={merkId} onChange={e => setMerkId(e.target.value)} className="text-sm border border-ink/20 rounded px-2 py-1 bg-white flex-1">
          <option value="">— geen —</option>
          {merken.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
        </select>
      </div>

      {/* Modus */}
      <div className="flex items-start gap-2">
        <span className="text-xs text-ink/50 w-28 shrink-0 mt-1">Modus</span>
        <div className="flex-1 space-y-1">
          {MODI.map(m => (
            <label key={m.value} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name={`modus-${bedrijf.id}`} value={m.value} checked={modus === m.value} onChange={() => setModus(m.value)} className="mt-1 accent-accent" />
              <span><span className="font-medium text-ink">{m.label}</span> <span className="text-ink/50">— {m.uitleg}</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* Klantlogo */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink/50 w-28 shrink-0">Klantlogo</span>
        <div className="flex items-center gap-3">
          <div className="w-28 h-10 flex items-center justify-center rounded border border-surface bg-surface/40">
            {klantLogoUrl ? <LogoPreview src={klantLogoUrl} alt="Klantlogo" /> : <span className="text-[11px] text-ink/40">geen</span>}
          </div>
          <label className="text-xs text-ink/50 cursor-pointer">
            <span className="underline hover:text-accent">Uploaden</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadKlantLogo(f) }} />
          </label>
        </div>
      </div>

      {/* Accent override */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink/50 w-28 shrink-0">Accentkleur</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={accentOverride || merk?.accent_kleur || '#FF5200'}
            onChange={e => setAccentOverride(e.target.value)}
            className="h-7 w-10 rounded border border-ink/20 bg-white"
          />
          {accentOverride ? (
            <button onClick={() => setAccentOverride('')} className="text-xs text-ink/50 hover:text-accent">Wissen (erf van merk)</button>
          ) : (
            <span className="text-xs text-ink/40">erft van merk</span>
          )}
        </div>
      </div>

      {/* Kleur uit het (klant- of merk)logo halen — bron: klantlogo indien aanwezig */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink/50 w-28 shrink-0" />
        <KleurUitLogo logoUrl={klantLogoUrl ?? merkLogoUrl} onGebruik={setAccentOverride} />
      </div>

      {/* Mini-preview van de logocombinatie */}
      <div className="rounded border border-surface bg-surface/40 p-3">
        <p className="text-[11px] text-ink/40 mb-2">Voorbeeld logo</p>
        {modus === 'default' ? (
          merkLogoUrl ? <LogoPreview src={merkLogoUrl} alt="Merklogo" /> : <span className="text-xs text-ink/40">merklogo (of /logo.jpg)</span>
        ) : (
          <div className="flex items-center gap-3">
            {klantLogoUrl && <LogoPreview src={klantLogoUrl} alt="Klantlogo" />}
            {klantLogoUrl && merkLogoUrl && <span className="h-8 w-px bg-ink/15" />}
            {merkLogoUrl && <LogoPreview src={merkLogoUrl} alt="Merklogo" />}
            {!klantLogoUrl && !merkLogoUrl && <span className="text-xs text-ink/40">nog geen logo&apos;s</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={opslaan}
          disabled={bezig}
          className="text-sm px-4 py-1.5 rounded-full bg-accent text-white font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {bezig ? 'Bezig…' : 'Opslaan'}
        </button>
        {melding && <span className="text-xs text-ink/50">{melding}</span>}
      </div>
    </div>
  )
}
