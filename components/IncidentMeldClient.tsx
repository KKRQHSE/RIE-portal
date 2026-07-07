'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import { MAX_BYTES, isAfbeelding, isToegestaanType } from '@/lib/bewijs'
import { INCIDENT_FOTO_BUCKET, type GevolgOptie } from '@/lib/incident'
import { MELD_TEKST, vertaal } from '@/lib/i18n-werknemer'
import TaalWissel, { useTaal } from './TaalWissel'
import HuisstijlLogo from './HuisstijlLogo'

// Datum/tijd voor de <input>-velden, vooringevuld op nu (aanpasbaar).
function nuDatum(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nuTijd(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function metExt(naam: string, ext: string): string {
  const basis = (naam || '').replace(/\.[^.]+$/, '')
  return `${basis || 'foto'}.${ext}`
}

// Verklein een telefoonfoto in de browser: lange zijde max 1600px, JPEG ~0.8.
function verkleinAfbeelding(file: File): Promise<{ blob: Blob; naam: string; type: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxZijde = 1600
      let { width, height } = img
      if (Math.max(width, height) > maxZijde) {
        const schaal = maxZijde / Math.max(width, height)
        width = Math.round(width * schaal)
        height = Math.round(height * schaal)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('geen canvas-context')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        b => (b ? resolve({ blob: b, naam: metExt(file.name, 'jpg'), type: 'image/jpeg' }) : reject(new Error('toBlob faalde'))),
        'image/jpeg',
        0.8,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('afbeelding laden mislukt')) }
    img.src = url
  })
}

export default function IncidentMeldClient({
  token, bedrijfNaam, huisstijl = VEILIGE_HUISSTIJL, gevolgOpties,
}: {
  token: string
  bedrijfNaam: string | null
  huisstijl?: HuisstijlView
  gevolgOpties: GevolgOptie[]
}) {
  const [supabase] = useState(() => createClient())
  const [taal, setTaal] = useTaal()
  const t = (k: string) => vertaal(MELD_TEKST, k, taal)
  const [datum, setDatum] = useState(nuDatum)
  const [tijd, setTijd] = useState(nuTijd)
  const [locatie, setLocatie] = useState('')
  const [project, setProject] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [naamMelder, setNaamMelder] = useState('')
  const [gevolgen, setGevolgen] = useState<string[]>([])
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState(false)

  function toggleGevolg(code: string) {
    setGevolgen(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]))
  }

  function kiesFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const gekozen = Array.from(e.target.files ?? []).filter(f => isToegestaanType(f.type))
    if (gekozen.length) setFotos(prev => [...prev, ...gekozen])
    e.target.value = ''
  }
  function verwijderFoto(i: number) {
    setFotos(prev => prev.filter((_, idx) => idx !== i))
  }

  // Eén foto: verkleinen → signed upload-URL halen → uploaden → rij registreren.
  async function uploadFoto(incidentId: string, file: File) {
    let blob: Blob = file
    let naam = file.name
    let type = file.type
    if (isAfbeelding(file.type)) {
      try {
        const v = await verkleinAfbeelding(file)
        blob = v.blob; naam = v.naam; type = v.type
      } catch { /* origineel proberen */ }
    }
    if (blob.size > MAX_BYTES) throw new Error(`Foto "${file.name}" is te groot (max 5 MB).`)

    const res = await fetch('/api/incident/foto-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, incidentId, bestandsnaam: naam }),
    })
    if (!res.ok) throw new Error(t('foutFotoUpload'))
    const { pad, uploadToken } = (await res.json()) as { pad?: string; uploadToken?: string }
    if (!pad || !uploadToken) throw new Error(t('foutFotoUpload'))

    const { error: upErr } = await supabase.storage
      .from(INCIDENT_FOTO_BUCKET)
      .uploadToSignedUrl(pad, uploadToken, blob, { contentType: type })
    if (upErr) throw new Error(t('foutFotoUpload'))

    const { error: regErr } = await supabase.rpc('incident_foto_registreren_token', {
      p_token: token, p_incident_id: incidentId, p_pad: pad,
      p_bestandsnaam: naam, p_type: type, p_grootte: blob.size,
    })
    if (regErr) throw new Error(t('foutFotoVastleggen'))
  }

  async function verstuur() {
    setFout(null)
    if (!locatie.trim()) { setFout(t('foutLocatie')); return }
    if (!omschrijving.trim()) { setFout(t('foutOmschrijving')); return }
    if (!datum) { setFout(t('foutDatum')); return }

    setBezig(true)
    try {
      const { data, error } = await supabase.rpc('incident_melden_token', {
        p_token: token,
        p_datum: datum,
        p_tijd: tijd || null,
        p_locatie: locatie,
        p_project: project,
        p_omschrijving: omschrijving,
        p_naam_melder: naamMelder,
        p_gevolgen: gevolgen,
      })
      if (error || !data) throw new Error(error?.message || t('foutVersturen'))

      const incidentId = data as string
      for (const file of fotos) {
        await uploadFoto(incidentId, file)   // faalt één foto, dan stopt de melder-fout hieronder
      }
      setKlaar(true)
    } catch (e) {
      setFout(e instanceof Error ? e.message : t('foutAlgemeen'))
    } finally {
      setBezig(false)
    }
  }

  if (klaar) {
    return (
      <main className="min-h-screen glass-bg flex items-center justify-center px-4" style={huisstijlStyle(huisstijl)}>
        <div className="glass-tile rounded-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
          <h1 className="text-lg font-semibold text-ink mb-2">{t('klaarTitel')}</h1>
          <p className="text-sm text-ink/60">
            {t('klaarTekst').replace('{bedrijf}', bedrijfNaam ? (taal === 'tr' ? ` (${bedrijfNaam})` : ` van ${bedrijfNaam}`) : '')}
          </p>
        </div>
      </main>
    )
  }

  const veld = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-ink/15 bg-white text-ink text-base focus:outline-none focus:border-accent'
  const label = 'block text-sm font-medium text-ink mb-1'

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2">
          <TaalWissel taal={taal} onTaal={setTaal} />
        </div>
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{t('titel')}</h1>
          <p className="text-sm text-ink/50 mt-0.5">
            {bedrijfNaam ?? t('meldingFallback')} {t('subStaart')}
          </p>
        </div>

        <div className="glass-tile rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="datum">{t('datum')}</label>
              <input id="datum" type="date" className={veld} value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="tijd">{t('tijd')}</label>
              <input id="tijd" type="time" className={veld} value={tijd} onChange={e => setTijd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="locatie">{t('locatie')}</label>
            <input id="locatie" type="text" className={veld} placeholder={t('locatiePlaceholder')}
              value={locatie} onChange={e => setLocatie(e.target.value)} />
          </div>

          <div>
            <label className={label} htmlFor="project">{t('project')} <span className="text-ink/40 font-normal">{t('optioneel')}</span></label>
            <input id="project" type="text" className={veld} placeholder={t('projectPlaceholder')}
              value={project} onChange={e => setProject(e.target.value)} />
          </div>

          <div>
            <label className={label} htmlFor="omschrijving">{t('watGebeurd')}</label>
            <textarea id="omschrijving" rows={4} className={`${veld} resize-y`} placeholder={t('omschrijvingPlaceholder')}
              value={omschrijving} onChange={e => setOmschrijving(e.target.value)} />
          </div>

          {gevolgOpties.length > 0 && (
            <div>
              <span className={label}>{t('gevolgVraag')} <span className="text-ink/40 font-normal">{t('meerdereMogelijk')}</span></span>
              <div className="space-y-1.5">
                {gevolgOpties.map(g => (
                  <label key={g.code} className="flex items-center gap-2.5 min-h-[40px] px-3 rounded-lg border border-ink/10 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]"
                      checked={gevolgen.includes(g.code)} onChange={() => toggleGevolg(g.code)} />
                    <span className="text-sm text-ink">{g.omschrijving}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={label} htmlFor="naam">{t('jeNaam')} <span className="text-ink/40 font-normal">{t('optioneel')}</span></label>
            <input id="naam" type="text" className={veld} placeholder={t('naamPlaceholder')}
              value={naamMelder} onChange={e => setNaamMelder(e.target.value)} />
          </div>

          <div>
            <span className={label}>{t('fotos')} <span className="text-ink/40 font-normal">{t('optioneel')}</span></span>
            {fotos.length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {fotos.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="truncate text-ink/70">{f.name}</span>
                    <button type="button" onClick={() => verwijderFoto(i)} className="text-ink/40 hover:text-red-600 shrink-0" aria-label={t('verwijderFoto')}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-lg border-2 border-dashed border-ink/20 bg-white cursor-pointer text-sm text-ink/60 hover:border-ink/40">
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={kiesFotos} />
              <span>{t('fotoToevoegen')}</span>
            </label>
          </div>

          {fout && <p className="text-sm text-red-600">{fout}</p>}

          <button type="button" onClick={verstuur} disabled={bezig}
            className="w-full min-h-[48px] rounded-lg bg-accent text-white font-semibold text-base disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-accent)' }}>
            {bezig ? t('versturenBezig') : t('versturen')}
          </button>
        </div>
      </div>
    </main>
  )
}
