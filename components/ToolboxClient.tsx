'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { Company, ToolboxOverzichtItem, ToolboxSessiesOverzicht } from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'
import ToolboxMaandoverzicht from './ToolboxMaandoverzicht'
import ToolboxExport from './ToolboxExport'

type Supa = ReturnType<typeof createClient>
type View = 'maandoverzicht' | 'toolboxen' | 'export'

const WAARSCHUWING =
  'Je wijkt af van de centrale toolbox op eigen initiatief. Gevolg: je krijgt centrale ' +
  'updates voor deze toolbox niet meer automatisch — je blijft op je eigen versie totdat je ' +
  'terugzet naar centraal.'

export default function ToolboxClient({
  company, huisstijl = VEILIGE_HUISSTIJL, initialOverzicht, sessies, isAdmin = false,
}: {
  company: Company
  huisstijl?: HuisstijlView
  initialOverzicht: ToolboxOverzichtItem[]
  sessies: ToolboxSessiesOverzicht | null
  // Koppelen/beheren en bewijs&export zijn beheerwerk: alleen voor de admin.
  // De klant (KAM) ziet enkel het maandoverzicht.
  isAdmin?: boolean
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [view, setView] = useState<View>('maandoverzicht')
  const [overzicht, setOverzicht] = useState<ToolboxOverzichtItem[]>(initialOverzicht)
  const [fout, setFout] = useState<string | null>(null)

  function patch(id: string, u: Partial<ToolboxOverzichtItem>) {
    setOverzicht(prev => prev.map(t => (t.toolbox_id === id ? { ...t, ...u } : t)))
  }

  const tab = (v: View, label: string) => (
    <button onClick={() => setView(v)}
      className={`text-sm px-4 py-2 min-h-[44px] rounded-full border transition-colors
        ${view === v ? 'bg-accent text-white border-accent' : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'}`}>
      {label}
    </button>
  )

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2"><LogoutButton /></div>
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <p className="text-sm text-ink/50 mt-0.5">Toolboxen</p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tab('maandoverzicht', 'Maandoverzicht')}
            {tab('toolboxen', 'Toolboxen')}
            {tab('export', 'Bewijs & export')}
          </div>
        )}

        {fout && <p className="text-sm text-red-600 mb-3">{fout}</p>}

        {/* Niet-admin: altijd alleen het maandoverzicht, ongeacht de view-state. */}
        {!isAdmin || view === 'maandoverzicht' ? (
          <ToolboxMaandoverzicht companyId={company.id} initial={sessies}
            gekoppeldeToolboxen={overzicht.filter(t => t.gekoppeld)} />
        ) : view === 'toolboxen' ? (
          <KoppelBeheer companyId={company.id} supabase={supabase} overzicht={overzicht} onPatch={patch} setFout={setFout} />
        ) : (
          <ToolboxExport companyId={company.id} />
        )}
      </div>
    </main>
  )
}

function KoppelBeheer({
  companyId, supabase, overzicht, onPatch, setFout,
}: {
  companyId: string
  supabase: Supa
  overzicht: ToolboxOverzichtItem[]
  onPatch: (id: string, u: Partial<ToolboxOverzichtItem>) => void
  setFout: (v: string | null) => void
}) {
  async function koppel(id: string, aan: boolean) {
    setFout(null)
    const { error } = await supabase.rpc(aan ? 'toolbox_koppelen' : 'toolbox_ontkoppelen', { p_company_id: companyId, p_toolbox_id: id })
    if (error) { setFout(error.message); return }
    onPatch(id, { gekoppeld: aan })
  }

  if (overzicht.length === 0) {
    return <p className="text-center text-ink/40 py-10 text-sm">Er zijn nog geen centrale toolboxen.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Koppel de toolboxen die voor jou gelden; je neemt de centrale inhoud over als
        uitgangspunt. Je mag een toolbox op eigen initiatief lokaal aanpassen of uitzetten —
        dat is altijd zichtbaar gemarkeerd.
      </p>
      {overzicht.map(t => (
        <ToolboxRij key={t.toolbox_id} item={t} companyId={companyId} supabase={supabase}
          onPatch={u => onPatch(t.toolbox_id, u)} onKoppel={aan => koppel(t.toolbox_id, aan)} setFout={setFout} />
      ))}
    </div>
  )
}

function ToolboxRij({
  item, companyId, supabase, onPatch, onKoppel, setFout,
}: {
  item: ToolboxOverzichtItem
  companyId: string
  supabase: Supa
  onPatch: (u: Partial<ToolboxOverzichtItem>) => void
  onKoppel: (aan: boolean) => void
  setFout: (v: string | null) => void
}) {
  const [modus, setModus] = useState<'lezen' | 'aanpassen' | 'uitzetten'>('lezen')
  const [titel, setTitel] = useState(item.geldende_titel)
  const [tekst, setTekst] = useState(item.geldende_tekst)
  const [video, setVideo] = useState(item.geldende_video_url ?? '')
  const [bezig, setBezig] = useState(false)
  const afw = item.afwijking
  const vervallen = item.centraal_vervallen

  async function slaLokaalOp() {
    if (!tekst.trim()) return
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_lokaal_aanpassen', {
      p_company_id: companyId, p_toolbox_id: item.toolbox_id,
      p_lokale_titel: titel.trim() || null, p_lokale_tekst: tekst.trim(), p_lokale_video_url: video.trim() || null,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onPatch({
      afwijking: { modus: 'lokaal', lokale_titel: titel.trim() || null, lokale_tekst: tekst.trim(), lokale_video_url: video.trim() || null, basis_versie: item.centrale_versie },
      norm_gewijzigd: false, actief: true,
      geldende_titel: titel.trim() || item.centrale_titel, geldende_tekst: tekst.trim(), geldende_video_url: video.trim() || null,
    })
    setModus('lezen')
  }

  async function zetUit() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_uitzetten', { p_company_id: companyId, p_toolbox_id: item.toolbox_id })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onPatch({ afwijking: { modus: 'uit', lokale_titel: null, lokale_tekst: null, lokale_video_url: null, basis_versie: item.centrale_versie }, norm_gewijzigd: false, actief: false })
    setModus('lezen')
  }

  async function terug() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('toolbox_terug_naar_centraal', { p_company_id: companyId, p_toolbox_id: item.toolbox_id })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setTitel(item.centrale_titel); setTekst(item.centrale_tekst); setVideo(item.centrale_video_url ?? '')
    onPatch({ afwijking: null, norm_gewijzigd: false, actief: true, geldende_titel: item.centrale_titel, geldende_tekst: item.centrale_tekst, geldende_video_url: item.centrale_video_url })
    setModus('lezen')
  }

  async function houdMijnVersie() {
    if (!afw) return
    setBezig(true); setFout(null)
    const { error } = afw.modus === 'uit'
      ? await supabase.rpc('toolbox_uitzetten', { p_company_id: companyId, p_toolbox_id: item.toolbox_id })
      : await supabase.rpc('toolbox_lokaal_aanpassen', { p_company_id: companyId, p_toolbox_id: item.toolbox_id, p_lokale_titel: afw.lokale_titel, p_lokale_tekst: afw.lokale_tekst ?? '', p_lokale_video_url: afw.lokale_video_url })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onPatch({ afwijking: { ...afw, basis_versie: item.centrale_versie }, norm_gewijzigd: false })
  }

  const status = !afw
    ? { label: 'Volgt de norm', stijl: 'bg-green-50 text-green-700' }
    : afw.modus === 'uit' ? { label: 'Uitgezet — wijkt af', stijl: 'bg-amber-100 text-amber-800' }
    : vervallen ? { label: 'Centraal vervallen — eigen versie', stijl: 'bg-amber-100 text-amber-800' }
    : { label: 'Lokaal aangepast — wijkt af', stijl: 'bg-amber-100 text-amber-800' }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${afw?.modus === 'uit' ? 'text-ink/40 line-through' : 'text-ink'}`}>{item.geldende_titel}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {item.quiz_aantal} quizvra{item.quiz_aantal === 1 ? 'ag' : 'gen'}
            {item.vereist_video ? ' · video vereist' : ''}{item.vereist_quiz ? ' · quiz vereist' : ''}
            {item.toegang === 'login' ? ' · alleen via login' : ''}
          </p>
        </div>
        {item.gekoppeld
          ? <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${status.stijl}`}>{status.label}</span>
          : <button type="button" onClick={() => onKoppel(true)} className="shrink-0 text-sm px-4 py-2 min-h-[40px] rounded-full bg-accent text-white font-medium hover:opacity-90">Koppelen</button>}
      </div>

      {item.gekoppeld && (
        <>
          {vervallen && afw?.modus === 'lokaal' && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2">
              <p className="text-xs text-amber-800">Deze toolbox is centraal vervallen. Je houdt je eigen versie; met “Mijn versie verwijderen” volg je de norm en verdwijnt hij.</p>
            </div>
          )}
          {item.norm_gewijzigd && (
            <div className="rounded bg-blue-50 border border-blue-200 p-2 space-y-2">
              <p className="text-xs text-blue-800">De centrale toolbox is bijgewerkt. Huidige centrale titel: <span className="italic">“{item.centrale_titel}”</span></p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={terug} disabled={bezig} className="text-xs px-3 py-1.5 rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40">Overnemen (terug naar centraal)</button>
                <button type="button" onClick={houdMijnVersie} disabled={bezig} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 disabled:opacity-40">Mijn versie houden</button>
              </div>
            </div>
          )}

          {modus === 'lezen' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {!afw && <>
                <button type="button" onClick={() => { setTitel(item.geldende_titel); setTekst(item.geldende_tekst); setVideo(item.geldende_video_url ?? ''); setModus('aanpassen') }} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">Lokaal aanpassen</button>
                <button type="button" onClick={() => setModus('uitzetten')} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">Uitzetten</button>
              </>}
              {afw?.modus === 'lokaal' && <>
                <button type="button" onClick={() => { setTitel(afw.lokale_titel ?? item.centrale_titel); setTekst(afw.lokale_tekst ?? ''); setVideo(afw.lokale_video_url ?? ''); setModus('aanpassen') }} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent">Lokaal bewerken</button>
                <button type="button" onClick={terug} disabled={bezig} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 disabled:opacity-40">{vervallen ? 'Mijn versie verwijderen' : 'Terug naar centraal'}</button>
              </>}
              {afw?.modus === 'uit' && (
                <button type="button" onClick={terug} disabled={bezig} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 disabled:opacity-40">Weer aanzetten (terug naar centraal)</button>
              )}
              <button type="button" onClick={() => onKoppel(false)} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/50 hover:border-ink/40">Ontkoppelen</button>
            </div>
          )}

          {modus === 'aanpassen' && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 space-y-2">
              {!afw && <p className="text-xs text-amber-800">{WAARSCHUWING}</p>}
              <input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Titel" aria-label="Lokale titel" className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white" />
              <textarea value={tekst} onChange={e => setTekst(e.target.value)} rows={4} aria-label="Lokale tekst" className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white resize-y" />
              <input value={video} onChange={e => setVideo(e.target.value)} placeholder="Video-link (optioneel)" aria-label="Lokale video-link" className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={slaLokaalOp} disabled={!tekst.trim() || bezig} className="text-xs px-3 py-1.5 rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40">{afw ? 'Lokale versie opslaan' : 'Bevestig en sla lokaal op'}</button>
                <button type="button" onClick={() => setModus('lezen')} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Annuleer</button>
              </div>
            </div>
          )}

          {modus === 'uitzetten' && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 space-y-2">
              <p className="text-xs text-amber-800">{WAARSCHUWING}</p>
              <p className="text-xs text-ink/60">Je zet deze toolbox uit; hij telt niet meer mee voor de doelstelling.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={zetUit} disabled={bezig} className="text-xs px-3 py-1.5 rounded-full bg-amber-600 text-white hover:opacity-90 disabled:opacity-40">Bevestig: uitzetten</button>
                <button type="button" onClick={() => setModus('lezen')} className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40">Annuleer</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
