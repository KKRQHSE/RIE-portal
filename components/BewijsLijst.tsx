'use client'

import { isAfbeelding, type BewijsItem } from '@/lib/bewijs'

function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  bewijzen: BewijsItem[]
  laden?: boolean
  magVerwijderen?: boolean
  verwijderBezigId?: string | null
  onVerwijder?: (id: string) => void
}

// Toont de bewijzen van een actie: thumbnails voor afbeeldingen, een herkenbaar
// PDF-blok voor pdf's; elk opent in een nieuw tabblad. Per item: bestandsnaam,
// wie het uploadde en de datum.
export default function BewijsLijst({
  bewijzen,
  laden = false,
  magVerwijderen = false,
  verwijderBezigId = null,
  onVerwijder,
}: Props) {
  if (laden) return <p className="text-xs text-ink/40">Bewijzen laden…</p>
  if (bewijzen.length === 0) return <p className="text-xs text-ink/40">Nog geen bewijs toegevoegd.</p>

  return (
    <ul className="space-y-2">
      {bewijzen.map(b => {
        const naam = b.bestandsnaam ?? 'bestand'
        const img = isAfbeelding(b.type) && b.downloadUrl
        return (
          <li key={b.id} className="flex items-start gap-3 rounded border border-surface bg-white p-2">
            {img ? (
              <a href={b.downloadUrl!} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.downloadUrl!} alt={naam} className="w-16 h-16 object-cover rounded bg-surface" />
              </a>
            ) : (
              <a
                href={b.downloadUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-16 h-16 rounded bg-surface flex items-center justify-center text-xs font-mono font-medium text-ink/50"
              >
                PDF
              </a>
            )}

            <div className="flex-1 min-w-0">
              <a
                href={b.downloadUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-ink hover:underline break-words"
              >
                {naam}
              </a>
              <p className="text-xs text-ink/40 mt-0.5">
                {b.geupload_door ? `${b.geupload_door} · ` : ''}
                {formatDatum(b.created_at)}
              </p>
            </div>

            {magVerwijderen && onVerwijder && (
              <button
                onClick={() => onVerwijder(b.id)}
                disabled={verwijderBezigId === b.id}
                className="shrink-0 inline-flex items-center min-h-[44px] px-2 text-xs text-red-600 hover:underline disabled:opacity-40"
              >
                {verwijderBezigId === b.id ? 'Bezig…' : 'Verwijderen'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
