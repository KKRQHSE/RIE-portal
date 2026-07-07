'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { WerknemerToolbox } from '@/lib/types'
import { videoBron } from '@/lib/video-bron'
import { TB_TEKST, vertaal } from '@/lib/i18n-werknemer'
import TaalWissel, { useTaal } from './TaalWissel'
import HuisstijlLogo from './HuisstijlLogo'
import Handtekening from './Handtekening'
import YouTubeSpeler from './YouTubeSpeler'
import BestandSpeler from './BestandSpeler'

type Stap = 'inhoud' | 'quiz' | 'naam' | 'mismatch' | 'handtekening' | 'klaar' | 'al_afgerond'

export default function ToolboxGastClient({
  token, persoonNaam, bedrijfNaam, huisstijl = VEILIGE_HUISSTIJL, initialToolboxen,
}: {
  token: string
  persoonNaam: string | null
  bedrijfNaam: string | null
  huisstijl?: HuisstijlView
  initialToolboxen: WerknemerToolbox[]
}) {
  const [supabase] = useState(() => createClient())
  const [taal, setTaal] = useTaal()
  const t = (k: string) => vertaal(TB_TEKST, k, taal)
  const [toolboxen, setToolboxen] = useState<WerknemerToolbox[]>(initialToolboxen)
  const [open, setOpen] = useState<WerknemerToolbox | null>(null)
  const [stap, setStap] = useState<Stap>('inhoud')
  const [videoBekeken, setVideoBekeken] = useState(false)
  const [videoFout, setVideoFout] = useState(false)
  const [antwoorden, setAntwoorden] = useState<Record<string, number>>({})
  const [nagekeken, setNagekeken] = useState(false)
  const [handtekening, setHandtekening] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function openToolbox(t: WerknemerToolbox) {
    setOpen(t); setStap(t.afgerond_dit_jaar ? 'al_afgerond' : 'inhoud'); setVideoBekeken(false); setVideoFout(false)
    setAntwoorden({}); setNagekeken(false); setHandtekening(''); setFout(null)
  }
  function sluit() { setOpen(null) }

  const heeftQuiz = !!open && open.vragen.length > 0
  const alleBeantwoord = !!open && open.vragen.every(v => antwoorden[v.id] !== undefined)

  async function afronden() {
    if (!open) return
    setBezig(true); setFout(null)
    const quizAntwoorden = open.vragen.map(v => (antwoorden[v.id] ?? -1))
    const { error } = await supabase.rpc('toolbox_afronden_token', {
      p_token: token, p_toolbox_id: open.toolbox_id,
      p_video_bekeken: videoBekeken || !open.vereist_video,
      p_quiz_antwoorden: quizAntwoorden,
      p_naam_bevestigd: true, p_handtekening: handtekening,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setToolboxen(prev => prev.map(t => (t.toolbox_id === open.toolbox_id ? { ...t, afgerond_dit_jaar: true } : t)))
    setStap('klaar')
  }

  const bron = open?.video_url ? videoBron(open.video_url) : null
  const speelbaar = !!bron && (bron.type === 'youtube' || bron.type === 'bestand') && !videoFout
  const naam = persoonNaam ?? '—'
  const kop = persoonNaam ? t('hallo').replace('{naam}', persoonNaam) : t('toolboxen')

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex justify-end mb-2">
          <TaalWissel taal={taal} onTaal={setTaal} />
        </div>
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{bedrijfNaam ?? t('toolboxen')}</h1>
          <p className="text-sm text-ink/50 mt-0.5">{kop} — {t('volgJeToolboxen')}</p>
        </div>

        {!open && (
          <div className="space-y-3">
            {toolboxen.length === 0 && <p className="text-center text-ink/40 py-10 text-sm">{t('geenToolboxen')}</p>}
            {toolboxen.map(tb => (
              <button key={tb.toolbox_id} onClick={() => openToolbox(tb)}
                className="w-full text-left glass-tile glass-tile-hover rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">{tb.titel}</span>
                  {tb.afgerond_dit_jaar
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 shrink-0">{t('ditJaarGedaan')}</span>
                    : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">{t('teDoen')}</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {open && (
          <div className="glass-tile rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{open.titel}</h2>
              <button onClick={sluit} className="text-xs text-ink/40 hover:text-ink shrink-0">{t('sluiten')}</button>
            </div>

            {stap === 'al_afgerond' && (
              <div className="space-y-3">
                <div className="rounded bg-green-50 border border-green-200 p-3">
                  <p className="text-sm font-medium text-green-800">{t('alAfgerondTitel')}</p>
                  <p className="text-sm text-ink/70 mt-1">{t('alAfgerondTekst')}</p>
                </div>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">{t('terugOverzicht')}</button>
              </div>
            )}

            {stap === 'inhoud' && (
              <div className="space-y-4">
                <p className="text-sm text-ink whitespace-pre-wrap">{open.tekst}</p>

                {open.video_url && bron && (
                  <div className="space-y-2">
                    {bron.type === 'youtube' && !videoFout && (
                      <YouTubeSpeler videoId={bron.id} onBekeken={() => setVideoBekeken(true)} onFout={() => setVideoFout(true)} />
                    )}
                    {bron.type === 'bestand' && !videoFout && (
                      <BestandSpeler src={bron.src} onBekeken={() => setVideoBekeken(true)} onFout={() => setVideoFout(true)} />
                    )}

                    {speelbaar && open.vereist_video && !videoBekeken && (
                      <p className="text-xs text-ink/50">{t('volgendeUitleg')}</p>
                    )}
                    {speelbaar && videoBekeken && (
                      <p className="text-xs text-green-700">{t('videoBekeken')}</p>
                    )}

                    {(!speelbaar) && (
                      <div className="rounded bg-amber-50 border border-amber-200 p-2 space-y-2">
                        <p className="text-xs text-amber-800">
                          {videoFout ? t('videoNietAf') : t('videoNietAuto')}
                          {open.vereist_video ? t('videoOpenInstrBevestig') : t('videoOpenInstr')}
                        </p>
                        <a href={open.video_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">{t('openVideoLink')}</a>
                        {open.vereist_video && (
                          <label className="flex items-center gap-2 text-sm text-ink/70">
                            <input type="checkbox" checked={videoBekeken} onChange={e => setVideoBekeken(e.target.checked)} className="accent-[color:var(--color-accent)]" />
                            {t('ikHebBekeken')}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={() => setStap(heeftQuiz ? 'quiz' : 'naam')}
                  disabled={open.vereist_video && !videoBekeken}
                  className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
                  {t('volgende')}
                </button>
              </div>
            )}

            {stap === 'quiz' && (
              <div className="space-y-5">
                {open.vragen.map((v, qi) => {
                  const gekozen = antwoorden[v.id]
                  const beantwoord = gekozen !== undefined
                  const toonUitleg = (open.quiz_uitleg_modus === 'per_vraag' && beantwoord) || (open.quiz_uitleg_modus === 'aan_eind' && nagekeken)
                  const goed = gekozen === v.juist_antwoord
                  return (
                    <div key={v.id} className="space-y-2">
                      <p className="text-sm font-medium text-ink">{qi + 1}. {v.vraagtekst}</p>
                      <div className="space-y-1">
                        {v.opties.map((opt, oi) => (
                          <label key={oi} className={`flex items-center gap-2 text-sm rounded px-2 py-1.5 border cursor-pointer
                            ${gekozen === oi ? 'border-accent bg-accent/5' : 'border-ink/15'}
                            ${toonUitleg && oi === v.juist_antwoord ? 'border-green-500 bg-green-50' : ''}`}>
                            <input type="radio" name={`q-${v.id}`} checked={gekozen === oi}
                              onChange={() => setAntwoorden(prev => ({ ...prev, [v.id]: oi }))}
                              className="accent-[color:var(--color-accent)]" />
                            {opt}
                          </label>
                        ))}
                      </div>
                      {toonUitleg && (
                        <p className={`text-xs ${goed ? 'text-green-700' : 'text-amber-700'}`}>
                          {goed ? t('goed') : t('nietJuist')}{v.uitleg ? ` ${v.uitleg}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-2">
                  {open.quiz_uitleg_modus === 'aan_eind' && !nagekeken ? (
                    <button onClick={() => setNagekeken(true)} disabled={!alleBeantwoord}
                      className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-ink text-white font-medium hover:opacity-90 disabled:opacity-40">{t('nakijken')}</button>
                  ) : (
                    <button onClick={() => setStap('naam')} disabled={!alleBeantwoord}
                      className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">{t('volgende')}</button>
                  )}
                </div>
              </div>
            )}

            {stap === 'naam' && (
              <div className="space-y-3">
                <p className="text-sm text-ink">{t('geregistreerdAls')}</p>
                <p className="text-lg font-semibold text-ink">{naam}</p>
                <p className="text-sm text-ink/60">{t('kloptDit')}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStap('handtekening')} className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90">{t('jaDatBenIk')}</button>
                  <button onClick={() => setStap('mismatch')} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">{t('neeNietIk')}</button>
                </div>
              </div>
            )}

            {stap === 'mismatch' && (
              <div className="space-y-3">
                <div className="rounded bg-amber-50 border border-amber-200 p-3">
                  <p className="text-sm font-medium text-amber-800">{t('stoppenTitel')}</p>
                  <p className="text-sm text-ink/70 mt-1">{t('stoppenTekst')}</p>
                </div>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">{t('terugOverzicht')}</button>
              </div>
            )}

            {stap === 'handtekening' && (
              <div className="space-y-3">
                <p className="text-sm text-ink">{t('handtekeningUitleg').replace('{naam}', naam)}</p>
                <Handtekening onChange={setHandtekening} />
                <button onClick={afronden} disabled={!handtekening || bezig}
                  className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
                  {bezig ? t('bezig') : t('afrondenKnop')}
                </button>
                {fout && <p className="text-xs text-red-600">{fout}</p>}
              </div>
            )}

            {stap === 'klaar' && (
              <div className="space-y-3 text-center py-4">
                <p className="text-2xl">✓</p>
                <p className="text-sm font-medium text-ink">{t('klaarBedankt').replace('{naam}', naam)}</p>
                <p className="text-xs text-ink/50">{t('klaarUitleg')}</p>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-ink text-white hover:opacity-90">{t('terugOverzicht')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
