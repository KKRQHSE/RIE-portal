'use client'

// AI-quiz per toolbox (migratie 0079) — de organisator (KAM/admin) laat op
// basis van de toolbox-inhoud conceptvragen genereren, neemt er minstens
// AI_QUIZ_MINIMUM_OVERGENOMEN over (aanvinken = ook het juiste antwoord
// bevestigen) en slaat pas dan iets op. Niets wordt definitief zonder die
// bevestiging — dit bestand doet zelf nooit een rechtstreekse tabel-write,
// alleen de RPC toolbox_quiz_opslaan (mag_bedrijf_beheren-gated).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ToolboxOverzichtItem, BedrijfToolboxQuizVraag } from '@/lib/types'
import {
  AI_NIET_GECONFIGUREERD, AI_QUIZ_AANTAL_VOORSTEL, AI_QUIZ_MINIMUM_OVERGENOMEN,
  type QuizVraagVoorstel, type AiLeverancierStatus,
} from '@/lib/ai-analyse'

type Supa = ReturnType<typeof createClient>

type Kandidaat = QuizVraagVoorstel & { overgenomen: boolean }

let volgendeId = 0
function nieuwId(): string {
  volgendeId += 1
  return `k${volgendeId}`
}

export default function ToolboxAiQuizBeheer({
  companyId, gekoppeldeToolboxen, initialQuizzes,
}: {
  companyId: string
  gekoppeldeToolboxen: ToolboxOverzichtItem[]
  initialQuizzes: BedrijfToolboxQuizVraag[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [quizzes, setQuizzes] = useState<BedrijfToolboxQuizVraag[]>(initialQuizzes)

  if (gekoppeldeToolboxen.length === 0) {
    return <p className="text-center text-ink/40 py-10 text-sm">Koppel eerst een toolbox voordat je er een AI-quiz bij kunt maken.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Laat per toolbox een AI-quiz voorstellen op basis van de toolbox-inhoud. Je kiest zelf
        welke vragen je overneemt — niets wordt definitief zonder jouw bevestiging.
      </p>
      {gekoppeldeToolboxen.map(t => (
        <ToolboxQuizKaart
          key={t.toolbox_id}
          companyId={companyId}
          item={t}
          opgeslagen={quizzes.filter(q => q.toolbox_id === t.toolbox_id).sort((a, b) => a.volgorde - b.volgorde)}
          supabase={supabase}
          onOpgeslagen={(toolboxId, nieuwe) =>
            setQuizzes(prev => [...prev.filter(q => q.toolbox_id !== toolboxId), ...nieuwe])
          }
        />
      ))}
    </div>
  )
}

function ToolboxQuizKaart({
  companyId, item, opgeslagen, supabase, onOpgeslagen,
}: {
  companyId: string
  item: ToolboxOverzichtItem
  opgeslagen: BedrijfToolboxQuizVraag[]
  supabase: Supa
  onOpgeslagen: (toolboxId: string, nieuwe: BedrijfToolboxQuizVraag[]) => void
}) {
  const [bewerken, setBewerken] = useState(opgeslagen.length === 0)

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{item.geldende_titel}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {opgeslagen.length > 0
              ? `AI-quiz opgeslagen: ${opgeslagen.length} vra${opgeslagen.length === 1 ? 'ag' : 'gen'}`
              : 'Nog geen AI-quiz opgeslagen'}
          </p>
        </div>
        {!bewerken && (
          <button type="button" onClick={() => setBewerken(true)}
            className="btn shrink-0 text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
            {opgeslagen.length > 0 ? 'Nieuwe AI-quiz maken' : 'AI-quiz maken'}
          </button>
        )}
      </div>

      {!bewerken && opgeslagen.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {opgeslagen.map(v => (
            <li key={v.id} className="text-sm text-ink/70">
              • {v.vraagtekst}
            </li>
          ))}
        </ul>
      )}

      {bewerken && (
        <ToolboxQuizGenerator
          companyId={companyId}
          toolboxId={item.toolbox_id}
          supabase={supabase}
          bestaandeVragen={opgeslagen.map(v => v.vraagtekst)}
          onOpgeslagen={nieuwe => { onOpgeslagen(item.toolbox_id, nieuwe); setBewerken(false) }}
          onAnnuleer={opgeslagen.length > 0 ? () => setBewerken(false) : undefined}
        />
      )}
    </div>
  )
}

function ToolboxQuizGenerator({
  companyId, toolboxId, supabase, bestaandeVragen, onOpgeslagen, onAnnuleer,
}: {
  companyId: string
  toolboxId: string
  supabase: Supa
  bestaandeVragen: string[]
  onOpgeslagen: (nieuwe: BedrijfToolboxQuizVraag[]) => void
  onAnnuleer?: () => void
}) {
  const [status, setStatus] = useState<AiLeverancierStatus | null>(null)
  const [toestemming, setToestemming] = useState(false)
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [nietGeconfigureerd, setNietGeconfigureerd] = useState(false)

  useEffect(() => {
    fetch('/api/toolbox/quiz-genereren')
      .then(r => r.json())
      .then(d => setStatus(d as AiLeverancierStatus))
      .catch(() => setStatus(null))
  }, [])

  const overgenomenAantal = kandidaten.filter(k => k.overgenomen).length
  const magOpslaan = overgenomenAantal >= AI_QUIZ_MINIMUM_OVERGENOMEN

  async function genereer() {
    setBezig(true); setFout(null); setNietGeconfigureerd(false)
    const overgenomen = kandidaten.filter(k => k.overgenomen)
    const uitsluiten = [...bestaandeVragen, ...kandidaten.map(k => k.vraagtekst)]
    const aantalNodig = AI_QUIZ_AANTAL_VOORSTEL - overgenomen.length
    try {
      const res = await fetch('/api/toolbox/quiz-genereren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, toolboxId, aantal: Math.max(aantalNodig, 1), uitsluiten, toestemming: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.code === AI_NIET_GECONFIGUREERD) setNietGeconfigureerd(true)
        setFout(data?.fout ?? 'Het genereren van de quiz is niet gelukt.')
        return
      }
      const nieuwe: Kandidaat[] = (data.vragen as { vraagtekst: string; opties: string[]; juist_antwoord: number; uitleg: string }[])
        .map(v => ({ id: nieuwId(), vraagtekst: v.vraagtekst, opties: v.opties, juist_antwoord: v.juist_antwoord, uitleg: v.uitleg, overgenomen: false }))
      setKandidaten([...overgenomen, ...nieuwe])
    } catch {
      setFout('Het genereren van de quiz is niet gelukt.')
    } finally {
      setBezig(false)
    }
  }

  async function opslaan() {
    setBezig(true); setFout(null)
    const overgenomen = kandidaten.filter(k => k.overgenomen)
    const { error } = await supabase.rpc('toolbox_quiz_opslaan', {
      p_company_id: companyId,
      p_toolbox_id: toolboxId,
      p_vragen: overgenomen.map(k => ({
        vraagtekst: k.vraagtekst, opties: k.opties, juist_antwoord: k.juist_antwoord, uitleg: k.uitleg,
      })),
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onOpgeslagen(overgenomen.map((k, i) => ({
      id: k.id, company_id: companyId, toolbox_id: toolboxId,
      vraagtekst: k.vraagtekst, opties: k.opties, juist_antwoord: k.juist_antwoord, uitleg: k.uitleg,
      volgorde: i, aangemaakt_op: new Date().toISOString(),
    })))
  }

  function toggle(id: string) {
    setKandidaten(prev => prev.map(k => (k.id === id ? { ...k, overgenomen: !k.overgenomen } : k)))
  }

  return (
    <div className="rounded bg-blue-50 border border-blue-200 p-3 space-y-3">
      {fout && <p className="text-sm text-red-600">{fout}</p>}
      {nietGeconfigureerd && (
        <p className="text-sm text-ink/60">AI-quiz is nog niet geconfigureerd voor dit portaal. Vraag de beheerder om een AI-leverancier in te stellen.</p>
      )}

      {kandidaten.length === 0 && !nietGeconfigureerd && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={toestemming} onChange={e => setToestemming(e.target.checked)} className="mt-0.5" />
            <span>
              Ik snap dat de toolbox-inhoud en de namen van eventueel relevante bronnen (geen
              persoonsgegevens) naar de AI-dienst
              {status?.geconfigureerd && status.regio === 'buiten_eu' ? ' (buiten de EU) ' : ' '}
              gaan.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={genereer} disabled={!toestemming || bezig}
              className="btn btn-accent text-sm px-4 py-2 min-h-[40px] rounded-full bg-accent text-white disabled:opacity-40">
              {bezig ? 'Genereren…' : `Genereer ${AI_QUIZ_AANTAL_VOORSTEL} conceptvragen`}
            </button>
            {onAnnuleer && (
              <button type="button" onClick={onAnnuleer} className="btn text-sm px-4 py-2 min-h-[40px] rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors">
                Annuleer
              </button>
            )}
          </div>
        </div>
      )}

      {kandidaten.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-ink/60">
            {overgenomenAantal} van minimaal {AI_QUIZ_MINIMUM_OVERGENOMEN} vragen geselecteerd. Door een vraag aan
            te vinken bevestig je ook het aangegeven juiste antwoord.
          </p>
          <div className="space-y-2">
            {kandidaten.map(k => (
              <label key={k.id} className={`block rounded border p-3 cursor-pointer transition-colors ${k.overgenomen ? 'border-accent bg-white' : 'border-ink/15 bg-white/60'}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={k.overgenomen} onChange={() => toggle(k.id)} className="mt-1" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-ink">{k.vraagtekst}</p>
                    <ul className="space-y-0.5">
                      {k.opties.map((optie, i) => (
                        <li key={i} className={`text-xs ${i === k.juist_antwoord ? 'text-green-700 font-medium' : 'text-ink/60'}`}>
                          {i === k.juist_antwoord ? '✓ ' : '· '}{optie}
                        </li>
                      ))}
                    </ul>
                    {k.uitleg && <p className="text-xs text-ink/40 italic mt-1">{k.uitleg}</p>}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={genereer} disabled={bezig}
              className="btn text-sm px-4 py-2 min-h-[40px] rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors disabled:opacity-40">
              {bezig ? 'Bezig…' : 'Nieuwe voorstellen voor de rest'}
            </button>
            <button type="button" onClick={opslaan} disabled={!magOpslaan || bezig}
              className="btn btn-accent text-sm px-4 py-2 min-h-[40px] rounded-full bg-accent text-white disabled:opacity-40">
              Opslaan
            </button>
            {onAnnuleer && (
              <button type="button" onClick={onAnnuleer} disabled={bezig} className="btn text-sm px-4 py-2 min-h-[40px] rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors">
                Annuleer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
