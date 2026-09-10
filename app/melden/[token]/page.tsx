import { createClient } from '@/lib/supabase/server'
import IncidentMeldClient from '@/components/IncidentMeldClient'
import {
  VEILIGE_HUISSTIJL,
  normaliseerLettertype,
  normaliseerModus,
  type HuisstijlView,
} from '@/lib/huisstijl'
import type { GevolgOptie } from '@/lib/incident'
import { normaliseerBeschikbareTalen } from '@/lib/i18n-werknemer'

const HUISSTIJL_BUCKET = 'merk-assets'

// Geen login: de meldpagina landt via het bedrijfstoken in de juiste tenant. De
// context-RPC (SECURITY DEFINER) valideert het token en levert alleen bedrijf +
// huisstijl + gevolg-labels — nooit bestaande incident-data.
type RawData = {
  bedrijf?: string | null
  beschikbare_talen?: unknown
  huisstijl?: Record<string, unknown> | null
  gevolg_opties?: GevolgOptie[] | null
}

// Server-component, geen taal-state (het token is nog niet gevalideerd, dus
// er is geen bedrijf/huisstijl om een taalwissel op te baseren). Dood-lopend
// scherm, dus statisch tweetalig i.p.v. een interactieve toggle (Kees'
// keuze, optie A uit NACHT_2026-09-06.md). ⚠️ TR is machinevertaling, nog te
// laten nakijken door een moedertaalspreker.
function OngeldigeLink() {
  return (
    <main className="min-h-screen glass-bg flex items-center justify-center px-4">
      <div className="glass-tile rounded-2xl p-8 max-w-md text-center space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-ink mb-2">Deze meldlink is niet geldig</h1>
          <p className="text-sm text-ink/50">
            De link is ingetrokken of onjuist. Vraag je contactpersoon om de actuele meldlink of QR-code.
          </p>
        </div>
        <div className="pt-4 border-t border-ink/10">
          <p className="text-lg font-semibold text-ink mb-2">Bu bildirim bağlantısı geçerli değil</p>
          <p className="text-sm text-ink/50">
            Bağlantı iptal edildi veya hatalı. Güncel bildirim bağlantısını veya QR kodunu iletişim kişinden iste.
          </p>
        </div>
      </div>
    </main>
  )
}

export default async function IncidentMeldPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('incident_meldcontext_token', { p_token: token })
  if (error || !data) return <OngeldigeLink />

  const raw = data as RawData
  const bedrijfNaam = typeof raw.bedrijf === 'string' ? raw.bedrijf : null
  const beschikbareTalen = normaliseerBeschikbareTalen(raw.beschikbare_talen)
  const gevolgOpties = Array.isArray(raw.gevolg_opties) ? raw.gevolg_opties : []

  const h = raw.huisstijl
  const publiekeUrl = (pad: unknown): string | null =>
    typeof pad === 'string' && pad ? supabase.storage.from(HUISSTIJL_BUCKET).getPublicUrl(pad).data.publicUrl : null
  const huisstijl: HuisstijlView = h
    ? {
        modus: normaliseerModus(h.modus),
        merkNaam: typeof h.merk_naam === 'string' ? h.merk_naam : null,
        merkLogoUrl: publiekeUrl(h.merk_logo),
        klantLogoUrl: publiekeUrl(h.klant_logo),
        accentKleur: typeof h.accent_kleur === 'string' && h.accent_kleur ? h.accent_kleur : '#FF5200',
        lettertype: normaliseerLettertype(h.lettertype),
      }
    : VEILIGE_HUISSTIJL

  return (
    <IncidentMeldClient
      token={token}
      bedrijfNaam={bedrijfNaam}
      beschikbareTalen={beschikbareTalen}
      huisstijl={huisstijl}
      gevolgOpties={gevolgOpties}
    />
  )
}
