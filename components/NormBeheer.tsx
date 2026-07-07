'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NormRubriek, NormVraag } from '@/lib/types'

type Supa = ReturnType<typeof createClient>

const WAARSCHUWING =
  'Je wijkt af van de centrale norm op eigen initiatief. Gevolg: je krijgt centrale ' +
  'updates voor dit punt niet meer automatisch — je blijft op je eigen versie totdat je ' +
  'terugzet naar centraal.'

export default function NormBeheer({
  companyId,
  initialNorm,
}: {
  companyId: string
  initialNorm: NormRubriek[]
}) {
  const [supabase] = useState<Supa>(() => createClient())
  const [norm, setNorm] = useState<NormRubriek[]>(initialNorm)
  const [fout, setFout] = useState<string | null>(null)

  function patchRubriek(rubriekId: string, updates: Partial<NormRubriek>) {
    setNorm(prev => prev.map(r => (r.rubriek_id === rubriekId ? { ...r, ...updates } : r)))
  }
  function patchVraag(rubriekId: string, vraagId: string, updates: Partial<NormVraag>) {
    setNorm(prev => prev.map(r =>
      r.rubriek_id !== rubriekId ? r : {
        ...r,
        vragen: r.vragen.map(v => (v.vraag_id === vraagId ? { ...v, ...updates } : v)),
      }))
  }

  async function koppel(rubriekId: string, aan: boolean) {
    setFout(null)
    const rpc = aan ? 'rubriek_koppelen' : 'rubriek_ontkoppelen'
    const { error } = await supabase.rpc(rpc, { p_company_id: companyId, p_rubriek_id: rubriekId })
    if (error) { setFout(error.message); return }
    patchRubriek(rubriekId, { gekoppeld: aan })
  }

  if (norm.length === 0) {
    return <p className="text-center text-ink/40 py-10 text-sm">De centrale bibliotheek is nog leeg.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Dit is de centrale norm. Koppel de rubrieken die voor jou gelden; je neemt de
        vragen dan over als uitgangspunt. Je mag een vraag op eigen initiatief lokaal
        aanpassen of uitzetten — dat is altijd zichtbaar gemarkeerd.
      </p>

      {fout && <p className="text-sm text-red-600">{fout}</p>}

      {norm.map(r => (
        <RubriekBlok
          key={r.rubriek_id}
          rubriek={r}
          onKoppel={aan => koppel(r.rubriek_id, aan)}
          companyId={companyId}
          supabase={supabase}
          onVraag={(vid, u) => patchVraag(r.rubriek_id, vid, u)}
          setFout={setFout}
        />
      ))}
    </div>
  )
}

function RubriekBlok({
  rubriek, onKoppel, companyId, supabase, onVraag, setFout,
}: {
  rubriek: NormRubriek
  onKoppel: (aan: boolean) => void
  companyId: string
  supabase: Supa
  onVraag: (vraagId: string, updates: Partial<NormVraag>) => void
  setFout: (v: string | null) => void
}) {
  const afwijkingen = rubriek.vragen.filter(v => v.afwijking).length

  return (
    <div className="glass-tile rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{rubriek.naam}</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {rubriek.vragen.length} vra{rubriek.vragen.length === 1 ? 'ag' : 'gen'}
            {rubriek.gekoppeld
              ? afwijkingen > 0 ? ` · ${afwijkingen} lokaal afwijkend` : ' · volgt de norm'
              : ' · niet gekoppeld'}
          </p>
        </div>
        {rubriek.gekoppeld ? (
          <button
            type="button"
            onClick={() => onKoppel(false)}
            className="shrink-0 text-xs px-3 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors"
          >
            Ontkoppelen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onKoppel(true)}
            className="shrink-0 text-sm px-4 py-2 min-h-[40px] inline-flex items-center justify-center rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Koppelen
          </button>
        )}
      </div>

      {rubriek.gekoppeld && (
        <div className="border-t border-surface px-4 pb-4 pt-3 space-y-3">
          {rubriek.vragen.length === 0 && <p className="text-xs text-ink/40">Deze rubriek heeft nog geen vragen.</p>}
          {rubriek.vragen.map(v => (
            <VraagRij
              key={v.vraag_id}
              vraag={v}
              companyId={companyId}
              supabase={supabase}
              onVeranderd={u => onVraag(v.vraag_id, u)}
              setFout={setFout}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VraagRij({
  vraag, companyId, supabase, onVeranderd, setFout,
}: {
  vraag: NormVraag
  companyId: string
  supabase: Supa
  onVeranderd: (updates: Partial<NormVraag>) => void
  setFout: (v: string | null) => void
}) {
  // 'lezen' = niets open; 'aanpassen' = waarschuwing + editor; 'uitzetten' = bevestiging.
  const [modus, setModus] = useState<'lezen' | 'aanpassen' | 'uitzetten'>('lezen')
  const [tekst, setTekst] = useState(vraag.geldende_tekst ?? vraag.centrale_tekst)
  const [bezig, setBezig] = useState(false)

  const afw = vraag.afwijking

  async function slaLokaalOp() {
    if (!tekst.trim()) return
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('vraag_lokaal_aanpassen', {
      p_company_id: companyId, p_vraag_id: vraag.vraag_id, p_lokale_tekst: tekst.trim(),
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onVeranderd({
      afwijking: { modus: 'lokaal', lokale_tekst: tekst.trim(), basis_versie: vraag.centrale_versie },
      norm_gewijzigd: false, actief: true, geldende_tekst: tekst.trim(),
    })
    setModus('lezen')
  }

  async function zetUit() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('vraag_uitzetten', {
      p_company_id: companyId, p_vraag_id: vraag.vraag_id,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    onVeranderd({
      afwijking: { modus: 'uit', lokale_tekst: null, basis_versie: vraag.centrale_versie },
      norm_gewijzigd: false, actief: false, geldende_tekst: null,
    })
    setModus('lezen')
  }

  async function terugNaarCentraal() {
    setBezig(true); setFout(null)
    const { error } = await supabase.rpc('vraag_terug_naar_centraal', {
      p_company_id: companyId, p_vraag_id: vraag.vraag_id,
    })
    setBezig(false)
    if (error) { setFout(error.message); return }
    setTekst(vraag.centrale_tekst)
    onVeranderd({ afwijking: null, norm_gewijzigd: false, actief: true, geldende_tekst: vraag.centrale_tekst })
    setModus('lezen')
  }

  // "Mijn versie houden" na een normwijziging: herbevestig de huidige afwijking,
  // wat basis_versie bijwerkt en het signaal opheft (blijft lokaal/uit).
  async function houdMijnVersie() {
    setBezig(true); setFout(null)
    let error
    if (afw?.modus === 'uit') {
      ({ error } = await supabase.rpc('vraag_uitzetten', { p_company_id: companyId, p_vraag_id: vraag.vraag_id }))
    } else {
      ({ error } = await supabase.rpc('vraag_lokaal_aanpassen', {
        p_company_id: companyId, p_vraag_id: vraag.vraag_id, p_lokale_tekst: (afw?.lokale_tekst ?? '').trim(),
      }))
    }
    setBezig(false)
    if (error) { setFout(error.message); return }
    onVeranderd({
      afwijking: afw ? { ...afw, basis_versie: vraag.centrale_versie } : null,
      norm_gewijzigd: false,
    })
  }

  const vervallen = vraag.centraal_vervallen
  const status = !afw
    ? { label: 'Volgt de norm', stijl: 'bg-green-50 text-green-700' }
    : afw.modus === 'uit'
    ? { label: 'Uitgezet — wijkt af van de norm', stijl: 'bg-amber-100 text-amber-800' }
    : vervallen
    ? { label: 'Centraal vervallen — eigen versie', stijl: 'bg-amber-100 text-amber-800' }
    : { label: 'Lokaal aangepast — wijkt af van de norm', stijl: 'bg-amber-100 text-amber-800' }

  return (
    <div className="rounded border border-surface p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm ${afw?.modus === 'uit' ? 'text-ink/40 line-through' : 'text-ink'}`}>
          {vraag.geldende_tekst ?? vraag.centrale_tekst}
        </p>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${status.stijl}`}>{status.label}</span>
      </div>

      {/* Signaal: de centrale vraag is vervallen, maar lokaal behouden */}
      {vervallen && afw?.modus === 'lokaal' && (
        <div className="rounded bg-amber-50 border border-amber-200 p-2">
          <p className="text-xs text-amber-800">
            Deze vraag is centraal vervallen. Je houdt je eigen versie zolang je wilt; met
            “Mijn versie verwijderen” volg je de norm en verdwijnt de vraag.
          </p>
        </div>
      )}

      {/* Signaal: de centrale norm is gewijzigd sinds de afwijking */}
      {vraag.norm_gewijzigd && (
        <div className="rounded bg-blue-50 border border-blue-200 p-2 space-y-2">
          <p className="text-xs text-blue-800">
            De centrale norm voor dit punt is bijgewerkt. Huidige centrale tekst:
            <span className="block mt-1 italic">“{vraag.centrale_tekst}”</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={terugNaarCentraal} disabled={bezig}
              className="text-xs px-3 py-1.5 rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40">
              Overnemen (terug naar centraal)
            </button>
            <button type="button" onClick={houdMijnVersie} disabled={bezig}
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors disabled:opacity-40">
              Mijn versie houden
            </button>
          </div>
        </div>
      )}

      {/* Acties afhankelijk van de huidige toestand */}
      {modus === 'lezen' && (
        <div className="flex flex-wrap gap-2">
          {!afw && (
            <>
              <button type="button" onClick={() => { setTekst(vraag.centrale_tekst); setModus('aanpassen') }}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
                Lokaal aanpassen
              </button>
              <button type="button" onClick={() => setModus('uitzetten')}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
                Uitzetten
              </button>
            </>
          )}
          {afw?.modus === 'lokaal' && (
            <>
              <button type="button" onClick={() => { setTekst(afw.lokale_tekst ?? ''); setModus('aanpassen') }}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/70 hover:border-accent hover:text-accent transition-colors">
                Lokale tekst bewerken
              </button>
              <button type="button" onClick={terugNaarCentraal} disabled={bezig}
                className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors disabled:opacity-40">
                {vervallen ? 'Mijn versie verwijderen' : 'Terug naar centraal'}
              </button>
            </>
          )}
          {afw?.modus === 'uit' && (
            <button type="button" onClick={terugNaarCentraal} disabled={bezig}
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors disabled:opacity-40">
              Weer aanzetten (terug naar centraal)
            </button>
          )}
        </div>
      )}

      {/* Waarschuwing + editor bij lokaal aanpassen */}
      {modus === 'aanpassen' && (
        <div className="rounded bg-amber-50 border border-amber-200 p-2 space-y-2">
          {!afw && <p className="text-xs text-amber-800">{WAARSCHUWING}</p>}
          <textarea
            value={tekst}
            onChange={e => setTekst(e.target.value)}
            rows={2}
            aria-label="Lokale vraagtekst"
            className="w-full text-sm border border-ink/20 rounded px-3 py-2 bg-white resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={slaLokaalOp} disabled={!tekst.trim() || bezig}
              className="text-xs px-3 py-1.5 rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40">
              {afw ? 'Lokale tekst opslaan' : 'Bevestig en sla lokaal op'}
            </button>
            <button type="button" onClick={() => setModus('lezen')}
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors">
              Annuleer
            </button>
          </div>
        </div>
      )}

      {/* Waarschuwing + bevestiging bij uitzetten */}
      {modus === 'uitzetten' && (
        <div className="rounded bg-amber-50 border border-amber-200 p-2 space-y-2">
          <p className="text-xs text-amber-800">{WAARSCHUWING}</p>
          <p className="text-xs text-ink/60">Je zet dit punt uit; het verschijnt niet in nieuwe inspecties.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={zetUit} disabled={bezig}
              className="text-xs px-3 py-1.5 rounded-full bg-amber-600 text-white hover:opacity-90 transition-opacity disabled:opacity-40">
              Bevestig: uitzetten
            </button>
            <button type="button" onClick={() => setModus('lezen')}
              className="text-xs px-3 py-1.5 rounded-full border border-ink/20 bg-white text-ink/60 hover:border-ink/40 transition-colors">
              Annuleer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
