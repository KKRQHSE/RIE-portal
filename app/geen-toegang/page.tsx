import LogoutButton from '@/components/LogoutButton'

export default function GeenToegang() {
  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8 text-center">
        <h1 className="text-lg font-semibold text-ink mb-2">Nog geen toegang</h1>
        <p className="text-sm text-ink/60 leading-relaxed mb-6">
          Je account is wel ingelogd, maar nog niet gekoppeld aan een bedrijf.
          Neem contact op met de beheerder.
        </p>
        <LogoutButton className="text-sm text-accent hover:underline" />
      </div>
    </main>
  )
}
