'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SetWachtwoord() {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [status, setStatus] = useState<'checking' | 'ok' | 'none'>('checking')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Na het klikken van de mail-link is er een (herstel)sessie. Check die.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setStatus(data.user ? 'ok' : 'none')
    })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw1.length < 8) { setError('Gebruik minimaal 8 tekens.'); return }
    if (pw1 !== pw2)   { setError('De wachtwoorden komen niet overeen.'); return }

    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setLoading(false)

    if (error) {
      setError('Kon het wachtwoord niet opslaan. Vraag een nieuwe link aan.')
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-semibold text-ink mb-6">Nieuw wachtwoord instellen</h1>

        {status === 'checking' && (
          <p className="text-sm text-ink/50">Even controleren…</p>
        )}

        {status === 'none' && (
          <div className="space-y-4">
            <p className="text-sm text-ink/60 leading-relaxed">
              Deze link is verlopen of niet geldig. Vraag een nieuwe aan.
            </p>
            <Link href="/reset-wachtwoord" className="text-sm text-accent hover:underline">
              Nieuwe link aanvragen
            </Link>
          </div>
        )}

        {status === 'ok' && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-ink/60 mb-1">Nieuw wachtwoord</label>
              <input
                type="password" required value={pw1}
                onChange={e => setPw1(e.target.value)}
                className="w-full font-mono text-sm border border-ink/20 rounded px-3 py-2.5
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-ink/60 mb-1">Herhaal wachtwoord</label>
              <input
                type="password" required value={pw2}
                onChange={e => setPw2(e.target.value)}
                className="w-full font-mono text-sm border border-ink/20 rounded px-3 py-2.5
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-accent text-white font-medium py-2.5 rounded
                         hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Opslaan…' : 'Wachtwoord opslaan'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
