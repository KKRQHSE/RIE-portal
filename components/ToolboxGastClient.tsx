'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import type { WerknemerToolbox } from '@/lib/types'
import HuisstijlLogo from './HuisstijlLogo'
import Handtekening from './Handtekening'

type Stap = 'inhoud' | 'quiz' | 'naam' | 'mismatch' | 'handtekening' | 'klaar' | 'al_afgerond'

// Best-effort omzetting van een YouTube/Vimeo-link naar een embed-bron.
function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) { const id = u.searchParams.get('v'); if (id) return `https://www.youtube.com/embed/${id}` }
    if (u.hostname === 'youtu.be') { const id = u.pathname.slice(1); if (id) return `https://www.youtube.com/embed/${id}` }
    if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean).pop(); if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}` }
  } catch { /* geen geldige URL */ }
  return null
}

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
  const [toolboxen, setToolboxen] = useState<WerknemerToolbox[]>(initialToolboxen)
  const [open, setOpen] = useState<WerknemerToolbox | null>(null)
  const [stap, setStap] = useState<Stap>('inhoud')
  const [videoBekeken, setVideoBekeken] = useState(false)
  const [antwoorden, setAntwoorden] = useState<Record<string, number>>({})
  const [nagekeken, setNagekeken] = useState(false)
  const [handtekening, setHandtekening] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function openToolbox(t: WerknemerToolbox) {
    // Al dit jaar afgerond → geen tweede flow/tekenscherm, alleen een melding.
    setOpen(t); setStap(t.afgerond_dit_jaar ? 'al_afgerond' : 'inhoud'); setVideoBekeken(false)
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

  const embed = open?.video_url ? videoEmbed(open.video_url) : null

  return (
    <main className="min-h-screen bg-surface" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-6">
          <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
          <h1 className="text-xl font-semibold text-ink">{bedrijfNaam ?? 'Toolboxen'}</h1>
          <p className="text-sm text-ink/50 mt-0.5">{persoonNaam ? `Hallo ${persoonNaam}` : 'Toolboxen'} — volg je toolboxen</p>
        </div>

        {!open && (
          <div className="space-y-3">
            {toolboxen.length === 0 && <p className="text-center text-ink/40 py-10 text-sm">Er staan op dit moment geen toolboxen voor je klaar.</p>}
            {toolboxen.map(t => (
              <button key={t.toolbox_id} onClick={() => openToolbox(t)}
                className="w-full text-left bg-white rounded-lg shadow-sm p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">{t.titel}</span>
                  {t.afgerond_dit_jaar
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 shrink-0">✓ Dit jaar gedaan</span>
                    : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">Te doen</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {open && (
          <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{open.titel}</h2>
              <button onClick={sluit} className="text-xs text-ink/40 hover:text-ink shrink-0">Sluiten</button>
            </div>

            {/* Al dit jaar afgerond — geen tweede flow, geen tekenscherm */}
            {stap === 'al_afgerond' && (
              <div className="space-y-3">
                <div className="rounded bg-green-50 border border-green-200 p-3">
                  <p className="text-sm font-medium text-green-800">Je hebt deze toolbox dit jaar al afgerond.</p>
                  <p className="text-sm text-ink/70 mt-1">
                    Je deelname is vastgelegd en bewaard — je hoeft hem dit jaar niet opnieuw te doen.
                    Volgend kalenderjaar staat hij weer voor je klaar.
                  </p>
                </div>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">Terug naar het overzicht</button>
              </div>
            )}

            {/* STAP: inhoud (tekst + video) */}
            {stap === 'inhoud' && (
              <div className="space-y-4">
                <p className="text-sm text-ink whitespace-pre-wrap">{open.tekst}</p>
                {open.video_url && (
                  <div>
                    {embed ? (
                      <div className="aspect-video w-full rounded overflow-hidden border border-surface">
                        <iframe src={embed} title="Toolbox-video" className="w-full h-full" allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                      </div>
                    ) : (
                      <a href={open.video_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">Open de video in een nieuw tabblad →</a>
                    )}
                  </div>
                )}
                {open.vereist_video && (
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input type="checkbox" checked={videoBekeken} onChange={e => setVideoBekeken(e.target.checked)} className="accent-[color:var(--color-accent)]" />
                    Ik heb de video bekeken
                  </label>
                )}
                <button onClick={() => setStap(heeftQuiz ? 'quiz' : 'naam')}
                  disabled={open.vereist_video && !videoBekeken}
                  className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
                  Volgende
                </button>
              </div>
            )}

            {/* STAP: quiz */}
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
                          {goed ? '✓ Goed.' : '✗ Niet juist.'}{v.uitleg ? ` ${v.uitleg}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-2">
                  {open.quiz_uitleg_modus === 'aan_eind' && !nagekeken ? (
                    <button onClick={() => setNagekeken(true)} disabled={!alleBeantwoord}
                      className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-ink text-white font-medium hover:opacity-90 disabled:opacity-40">Nakijken</button>
                  ) : (
                    <button onClick={() => setStap('naam')} disabled={!alleBeantwoord}
                      className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">Volgende</button>
                  )}
                </div>
              </div>
            )}

            {/* STAP: naam bevestigen */}
            {stap === 'naam' && (
              <div className="space-y-3">
                <p className="text-sm text-ink">Je staat geregistreerd als:</p>
                <p className="text-lg font-semibold text-ink">{persoonNaam ?? '—'}</p>
                <p className="text-sm text-ink/60">Klopt dit? Je handtekening komt straks onder déze naam te staan.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStap('handtekening')} className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90">Ja, dat ben ik</button>
                  <button onClick={() => setStap('mismatch')} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">Nee, dit ben ik niet</button>
                </div>
              </div>
            )}

            {/* STAP: naam-mismatch — stoppen, geen handtekening */}
            {stap === 'mismatch' && (
              <div className="space-y-3">
                <div className="rounded bg-amber-50 border border-amber-200 p-3">
                  <p className="text-sm font-medium text-amber-800">We stoppen hier.</p>
                  <p className="text-sm text-ink/70 mt-1">
                    Er wordt geen handtekening vastgelegd onder een naam die niet klopt. Neem
                    contact op met je KAM-coördinator zodat je je eigen persoonlijke link krijgt.
                  </p>
                </div>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-ink/40">Terug naar het overzicht</button>
              </div>
            )}

            {/* STAP: handtekening + afronden */}
            {stap === 'handtekening' && (
              <div className="space-y-3">
                <p className="text-sm text-ink">Zet hieronder je handtekening om te bevestigen dat je <span className="font-medium">{persoonNaam}</span> bent en deze toolbox hebt gevolgd.</p>
                <Handtekening onChange={setHandtekening} />
                <button onClick={afronden} disabled={!handtekening || bezig}
                  className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40">
                  {bezig ? 'Bezig…' : 'Afronden en vastleggen'}
                </button>
                {fout && <p className="text-xs text-red-600">{fout}</p>}
              </div>
            )}

            {/* STAP: klaar */}
            {stap === 'klaar' && (
              <div className="space-y-3 text-center py-4">
                <p className="text-2xl">✓</p>
                <p className="text-sm font-medium text-ink">Vastgelegd. Bedankt, {persoonNaam}.</p>
                <p className="text-xs text-ink/50">Je deelname is aantoonbaar opgeslagen en kan niet meer worden gewijzigd.</p>
                <button onClick={sluit} className="text-sm px-5 py-2 min-h-[44px] rounded-full bg-ink text-white hover:opacity-90">Terug naar het overzicht</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
