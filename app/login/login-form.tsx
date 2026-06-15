'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mailadres of wachtwoord klopt niet.')
      setLoading(false)
      return
    }

    // Routing gebeurt op één plek: stuur naar / en die bepaalt de bestemming.
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
        <div className="mb-8">
          <Image src="/logo.jpg" alt="QHSE Totaal" width={180} height={60} className="object-contain" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div>
            <label className="block text-sm text-ink/60 mb-1">Wachtwoord</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
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
            {loading ? 'Even geduld…' : 'Inloggen'}
          </button>

          <div className="text-center pt-1">
            <Link href="/reset-wachtwoord" className="text-sm text-ink/50 hover:text-accent">
              Wachtwoord vergeten?
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
