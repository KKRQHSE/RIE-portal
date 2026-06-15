'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetWachtwoord() {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/set-wachtwoord`,
    })

    setLoading(false)
    if (error) setError('Er ging iets mis. Probeer het opnieuw.')
    else setSent(true)
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-semibold text-ink mb-6">Wachtwoord vergeten</h1>

        {sent ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/60 leading-relaxed">
              Als dit e-mailadres bekend is, ontvang je een link om een nieuw
              wachtwoord in te stellen. De link is 60 minuten geldig.
            </p>
            <p className="text-sm text-ink/50 bg-surface rounded px-3 py-2 leading-relaxed">
              Geen mail ontvangen? Controleer je <strong>spam-map</strong>. Mail
              van een nieuw adres belandt daar soms.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-ink/60 mb-1">E-mailadres</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full font-mono text-sm border border-ink/20 rounded px-3 py-2.5
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder="naam@bedrijf.nl"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-accent text-white font-medium py-2.5 rounded
                         hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Even geduld…' : 'Stuur resetlink'}
            </button>
          </form>
        )}

        <div className="text-center pt-4">
          <Link href="/login" className="text-sm text-ink/50 hover:text-accent">
            Terug naar inloggen
          </Link>
        </div>
      </div>
    </main>
  )
}
