'use client'

import Link from 'next/link'
import type { Company, DashboardOverzicht } from '@/lib/types'
import { huisstijlStyle, VEILIGE_HUISSTIJL, type HuisstijlView } from '@/lib/huisstijl'
import Gauge from './Gauge'
import HuisstijlLogo from './HuisstijlLogo'
import LogoutButton from './LogoutButton'

// Toolbox naar-rato (doel-per-persoon), hergebruikt uit toolbox_dashboard().bedrijf.
export type ToolboxNaarRato = { doel: number; gedaan: number; pct: number | null }

// RI&E-gescopete PvA-voortgang (dashboard_pva_rie): alleen uit de RI&E
// voortgekomen acties, los van de centrale actielijst.
export type PvaRieVoortgang = { totaal: number; open: number; in_behandeling: number; afgerond: number; pct: number }

type Props = {
  company: Company
  overzicht: DashboardOverzicht
  huisstijl?: HuisstijlView
  toonInspecties?: boolean
  toonToolbox?: boolean
  toonIncidenten?: boolean
  toolbox?: ToolboxNaarRato | null
  magBewerken?: boolean
  ifDitJaar?: number | null
  ifVorigJaar?: number | null
  pvaRie?: PvaRieVoortgang | null
}

// De doelstelling is vrije tekst: soms één zin met puntkomma's, soms regels met
// streepjes. Splits naar losse doelen zodat we ze prominent kunnen tonen.
function parseDoelen(tekst: string | null | undefined): string[] {
  if (!tekst) return []
  const regels = tekst.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const bron = regels.length > 1 ? regels : tekst.split(/[;•]/)
  return bron.map(s => s.replace(/^[-*•\s]+/, '').trim()).filter(Boolean)
}

function datumNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Eén tegel: titel + inhoud, klikbaar als er een href is.
function Tegel({
  titel, children, href, urgent,
}: {
  titel: string
  children: React.ReactNode
  href?: string
  urgent?: boolean
}) {
  const inner = (
    <div
      className={`glass-tile rounded-3xl p-6 h-full min-h-[124px] ${
        href ? 'glass-tile-hover' : ''
      } ${urgent ? 'border-l-4 border-l-red-500' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="h-3.5 w-0.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">{titel}</p>
      </div>
      {children}
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

// Rij met gelijke kolommen, zodat de getallen op elke schermbreedte netjes
// uitlijnen i.p.v. uit de kaart te lopen.
function Rij({ kolommen = 3, children }: { kolommen?: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid ${kolommen === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>{children}</div>
}

// Klein gekleurd getal-met-label-blokje binnen een tegel.
function Cijfer({ n, label, kleur }: { n: number; label: string; kleur?: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xl font-semibold tabular-nums ${kleur ?? 'text-ink'}`}>{n}</p>
      <p className="text-xs text-ink/50 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

// "gedaan/doel"-cijfer met visueel gedempte noemer.
function Ratio({ gedaan, doel, kleur }: { gedaan: number; doel: number; kleur?: string }) {
  return (
    <p className={`text-2xl font-semibold tabular-nums ${kleur ?? 'text-ink'}`}>
      {gedaan}<span className="text-ink/30 text-lg">/{doel}</span>
    </p>
  )
}

export default function DashboardClient({
  company, overzicht, huisstijl = VEILIGE_HUISSTIJL,
  toonInspecties = false, toonToolbox = false, toonIncidenten = false,
  toolbox = null, magBewerken = false, ifDitJaar = null, ifVorigJaar = null,
  pvaRie = null,
}: Props) {
  const {
    te_beoordelen, prio_open, termijn, rie, inspecties,
    inspectie_doel, toolbox_sessies, incidenten, norm_bijgewerkt, bewijs, instellingen,
  } = overzicht
  const cid = company.id
  const inst = instellingen
  const pr = pvaRie ?? { totaal: 0, open: 0, in_behandeling: 0, afgerond: 0, pct: 0 }

  return (
    <main className="min-h-screen glass-bg" style={huisstijlStyle(huisstijl)}>
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex justify-end mb-2">
          <LogoutButton />
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <HuisstijlLogo huisstijl={huisstijl} className="mb-2" />
            <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
            <p className="text-sm text-ink/50 mt-0.5">Dashboard</p>
          </div>
          {company.approved_at && (
            <div className="text-right">
              <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
                RI&amp;E goedgekeurd
              </span>
              {company.approved_by && (
                <p className="text-xs text-ink/40 mt-1">{company.approved_by}</p>
              )}
            </div>
          )}
        </div>

        {/* IF-getal (Incident Frequency) — prominent bovenaan. Puur invoer. */}
        <div className="glass-tile rounded-3xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-3.5 w-0.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
            <p
              className="text-xs font-medium uppercase tracking-wide text-ink/40 cursor-help"
              title="Incident Frequency: het aantal verzuimongevallen per miljoen gewerkte uren. Een veiligheidskengetal — lager is beter."
            >
              IF-getal · Incident Frequency
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-4xl font-semibold text-ink tabular-nums leading-none">
                {ifDitJaar != null ? ifDitJaar : '—'}
              </p>
              <p className="text-xs text-ink/50 mt-1.5">Dit jaar</p>
            </div>
            <div>
              <p className="text-3xl font-semibold text-ink/50 tabular-nums leading-none">
                {ifVorigJaar != null ? ifVorigJaar : '—'}
              </p>
              <p className="text-xs text-ink/40 mt-1.5">Vorig jaar</p>
            </div>
            {ifDitJaar == null && ifVorigJaar == null && magBewerken && (
              <Link href={`/${cid}/dashboard/bedrijfsvoering`} className="text-xs text-accent hover:underline mb-1">
                Vul het IF-getal in →
              </Link>
            )}
          </div>
        </div>

        {/* Te beoordelen — de inbox. Alleen prominent als er iets wacht. */}
        {te_beoordelen > 0 && (
          <Link
            href={`/${cid}/pva`}
            className="block bg-accent/10 ring-1 ring-accent/30 rounded-lg p-5 mb-6 hover:bg-accent/15 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl font-semibold text-accent">{te_beoordelen}</span>
              <div>
                <p className="text-sm font-medium text-ink">
                  {te_beoordelen === 1 ? 'Actie wacht' : 'Acties wachten'} op jouw beoordeling
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  Een actiehouder diende een voorstel in — beoordeel het in het Plan van Aanpak →
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Norm bijgewerkt — alleen relevant bij actieve inspectiemodule en afwijkingen. */}
        {toonInspecties && norm_bijgewerkt > 0 && (
          <Link
            href={`/${cid}/inspecties`}
            className="block bg-blue-50 ring-1 ring-blue-200 rounded-lg p-5 mb-6 hover:bg-blue-100/60 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl font-semibold text-blue-700">{norm_bijgewerkt}</span>
              <div>
                <p className="text-sm font-medium text-ink">
                  {norm_bijgewerkt === 1 ? 'Afwijkend punt waar' : 'Afwijkende punten waar'} de centrale norm is bijgewerkt
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  Bekijk ze in Werkplekinspectie → Norm: overnemen of je eigen versie houden →
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* ── Sectie: Modules (live cijfers, doorklikbaar) ── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink/40">Modules</h2>
          <Link
            href={`/${cid}/actielijst`}
            className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
          >
            Centrale actielijst →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">

          {/* Voortgang Plan van Aanpak RI&E — alleen de uit de RI&E voortgekomen
              acties (los van de centrale actielijst, die alle bronnen omvat). */}
          <Tegel titel="Voortgang Plan van Aanpak RI&E" href={`/${cid}/pva`}>
            <div className="flex items-center gap-5">
              <Gauge value={pr.afgerond} total={pr.totaal} />
              <div>
                <p className="text-sm font-medium text-ink">{pr.afgerond} van {pr.totaal} afgerond</p>
                <p className="text-xs text-ink/40 mt-1">
                  {pr.open} open · {pr.in_behandeling} in behandeling
                </p>
              </div>
            </div>
          </Tegel>

          {/* RI&E-geldigheid */}
          <Tegel titel="RI&E" href={`/${cid}/rie`}>
            {rie ? (
              <div>
                <p className="text-sm text-ink">
                  Versie {rie.versie} · <span className="capitalize">{rie.status}</span>
                </p>
                <p className="text-sm text-ink/60 mt-1">Laatste toetsing: {datumNL(rie.toets_datum)}</p>
                <p className={`text-sm mt-1 ${rie.verloopt_binnenkort ? 'text-amber-600 font-medium' : 'text-ink/50'}`}>
                  {rie.geldig_tot ? `Geldig tot ${datumNL(rie.geldig_tot)}` : 'Geen einddatum vastgelegd'}
                </p>
                {rie.verloopt_binnenkort && (
                  <p className="text-xs text-amber-600 mt-1">Verloopt binnenkort — hertoets inplannen.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink/40">Nog geen getoetste RI&amp;E-versie vastgelegd.</p>
            )}
          </Tegel>

          {/* Termijn-urgentie */}
          <Tegel titel="Termijn PvA" href={`/${cid}/pva`} urgent={termijn.over > 0}>
            <Rij>
              <Cijfer n={termijn.over} label="over de termijn"
                kleur={termijn.over > 0 ? 'text-red-600' : 'text-ink/30'} />
              <Cijfer n={termijn.binnenkort} label="binnen 30 dagen"
                kleur={termijn.binnenkort > 0 ? 'text-amber-600' : 'text-ink/30'} />
              <Cijfer n={termijn.zonder_datum} label="zonder datum" kleur="text-ink/40" />
            </Rij>
          </Tegel>

          {/* Openstaand per prioriteit */}
          <Tegel titel="Openstaand per prioriteit" href={`/${cid}/pva`}>
            <Rij>
              <Cijfer n={prio_open.Hoog} label="Hoog"
                kleur={prio_open.Hoog > 0 ? 'text-red-600' : 'text-ink/30'} />
              <Cijfer n={prio_open.Middel} label="Middel" kleur="text-ink" />
              <Cijfer n={prio_open.Laag} label="Laag" kleur="text-ink/60" />
            </Rij>
          </Tegel>

          {/* Toolboxen — twee telwijzen naast elkaar, visueel gescheiden. */}
          {toonToolbox && (
            <Tegel titel="Toolboxen" href={`/${cid}/toolbox`}>
              <div className="flex divide-x divide-ink/10">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-[11px] text-ink/40 mb-1">Doel per persoon</p>
                  {toolbox ? (
                    <>
                      <Ratio gedaan={toolbox.gedaan} doel={toolbox.doel} />
                      <p className="text-xs text-ink/50 mt-0.5">{toolbox.pct ?? 0}% van de norm</p>
                    </>
                  ) : (
                    <p className="text-sm text-ink/40">—</p>
                  )}
                </div>
                <div className="flex-1 min-w-0 pl-4">
                  <p className="text-[11px] text-ink/40 mb-1">Aanwezigheid sessies</p>
                  <p className="text-2xl font-semibold text-ink tabular-nums">{toolbox_sessies.sessies}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{toolbox_sessies.aanwezig}× aanwezig geregistreerd</p>
                </div>
              </div>
              <p className="text-[11px] text-ink/40 mt-3">Afwezigheid bij een sessie telt niet als achterstand.</p>
            </Tegel>
          )}

          {/* Werkplekinspecties — open/afgerond/bevindingen */}
          {toonInspecties && (
            <Tegel titel="Werkplekinspecties" href={`/${cid}/inspecties`} urgent={inspecties.open_bevindingen > 0}>
              <Rij>
                <Cijfer n={inspecties.open} label="lopend" kleur="text-ink" />
                <Cijfer n={inspecties.afgerond} label="afgerond" kleur="text-ink/60" />
                <Cijfer n={inspecties.open_bevindingen} label="open bevindingen"
                  kleur={inspecties.open_bevindingen > 0 ? 'text-red-600' : 'text-ink/30'} />
              </Rij>
            </Tegel>
          )}

          {/* Inspectie-doelen per persoon */}
          {toonInspecties && inspectie_doel.personen.length > 0 && (
            <Tegel titel="Inspectie-doelen per persoon" href={`/${cid}/inspecties`}>
              <div className="flex items-baseline gap-2 mb-2">
                <Ratio gedaan={inspectie_doel.totaal_gedaan} doel={inspectie_doel.totaal_doel} />
                <p className="text-xs text-ink/50">uitgevoerd dit jaar</p>
              </div>
              <ul className="space-y-1">
                {inspectie_doel.personen.map(p => (
                  <li key={p.naam} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink/70 truncate">{p.naam}</span>
                    <span className="tabular-nums text-ink/50">{p.gedaan}/{p.doel}</span>
                  </li>
                ))}
              </ul>
            </Tegel>
          )}

          {/* Incidenten — naar status en gevolg */}
          {toonIncidenten && (
            <Tegel titel="Incidenten" href={`/${cid}/incidenten`} urgent={incidenten.per_status.open > 0}>
              <Rij>
                <Cijfer n={incidenten.per_status.open} label="open"
                  kleur={incidenten.per_status.open > 0 ? 'text-amber-600' : 'text-ink/30'} />
                <Cijfer n={incidenten.per_status.in_onderzoek} label="in onderzoek"
                  kleur={incidenten.per_status.in_onderzoek > 0 ? 'text-blue-700' : 'text-ink/30'} />
                <Cijfer n={incidenten.per_status.afgehandeld} label="afgehandeld" kleur="text-ink/60" />
              </Rij>
              {incidenten.totaal > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Object.entries(incidenten.per_gevolg).map(([label, n]) => (
                    <span key={label} className="text-[11px] bg-surface rounded-full px-2 py-0.5 text-ink/60">
                      {label}: {n}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink/40 mt-3">Nog geen incidenten gemeld.</p>
              )}
            </Tegel>
          )}

          {/* Bewijslast */}
          <Tegel titel="Bewijslast afgeronde acties" href={`/${cid}/pva`}>
            <Rij kolommen={2}>
              <Cijfer n={bewijs.afgerond_met_bewijs} label="met bewijs" kleur="text-green-700" />
              <Cijfer n={bewijs.afgerond_zonder_bewijs} label="zonder bewijs"
                kleur={bewijs.afgerond_zonder_bewijs > 0 ? 'text-amber-600' : 'text-ink/30'} />
            </Rij>
          </Tegel>

        </div>

        {/* ── Sectie: Bedrijfsvoering (handmatige velden, KAM/admin bewerkt) ── */}
        <div className="flex items-center justify-between mt-8 mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink/40">Bedrijfsvoering</h2>
          {magBewerken && (
            <Link
              href={`/${cid}/dashboard/bedrijfsvoering`}
              className="text-sm px-4 py-2 min-h-[44px] inline-flex items-center justify-center rounded-full bg-white text-ink/70 border border-ink/20 hover:border-accent hover:text-accent transition-colors"
            >
              Bewerken
            </Link>
          )}
        </div>

        {/* Doelstellingen — prominent heroblok i.p.v. een grijze bulletlijst. */}
        <div className="glass-tile rounded-3xl p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-3.5 w-0.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Doelstellingen</p>
          </div>
          {(() => {
            const doelen = parseDoelen(inst?.doelstelling_tekst)
            if (doelen.length === 0) {
              return (
                <p className="text-sm text-ink/40">
                  Nog niet ingevuld.
                  {magBewerken && <> <Link href={`/${cid}/dashboard/bedrijfsvoering`} className="text-accent hover:underline">Vul de doelstellingen in →</Link></>}
                </p>
              )
            }
            return (
              <ul className="space-y-3">
                {doelen.map((d, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-accent/10 text-accent inline-flex items-center justify-center text-sm font-semibold" aria-hidden="true">✓</span>
                    <p className="text-base sm:text-lg text-ink font-medium leading-snug">{d}</p>
                  </li>
                ))}
              </ul>
            )
          })()}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">

          {/* Klanttevredenheid */}
          <Tegel titel="Klanttevredenheid">
            <Rij kolommen={2}>
              <Cijfer n={inst?.klachten_aantal ?? 0} label="klachten"
                kleur={(inst?.klachten_aantal ?? 0) > 0 ? 'text-amber-600' : 'text-ink/30'} />
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {inst?.tevredenheid_score != null ? inst.tevredenheid_score : '—'}
                </p>
                <p className="text-xs text-ink/50 mt-0.5 leading-tight">meetscore</p>
              </div>
            </Rij>
            {inst?.tevredenheid_toelichting && (
              <p className="text-xs text-ink/50 mt-3 whitespace-pre-wrap">{inst.tevredenheid_toelichting}</p>
            )}
          </Tegel>

          {/* Audits */}
          <Tegel titel="Audits">
            <div className="space-y-1 text-sm">
              <p className="text-ink">
                <span className="font-semibold tabular-nums">
                  {inst?.audit_intern_gedaan ?? 0}/{inst?.audit_intern_totaal ?? 0}
                </span> interne audits
              </p>
              <p className="text-ink/70">Extern: {inst?.audit_extern_omschrijving || '—'}</p>
              {inst?.audit_status && <p className="text-xs text-ink/50">Status: {inst.audit_status}</p>}
            </div>
          </Tegel>

          {/* Openstaande ISO-taken (vrije tekst) */}
          <Tegel titel="Openstaande ISO-taken">
            {inst?.iso_taken_tekst
              ? <p className="text-sm text-ink/80 whitespace-pre-wrap">{inst.iso_taken_tekst}</p>
              : <p className="text-sm text-ink/40">Nog niet ingevuld.</p>}
          </Tegel>

        </div>

        {/* Ruimte voor de latere planning-tijdlijn (nog niet gebouwd). */}
        <div className="mt-4 rounded-lg border border-dashed border-ink/15 p-5 text-center">
          <p className="text-xs text-ink/30">Planning-tijdlijn — volgt later</p>
        </div>

      </div>
    </main>
  )
}
