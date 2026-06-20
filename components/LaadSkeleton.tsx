// Generiek laadskelet (Server Component): verschijnt direct bij navigatie via de
// loading.tsx-bestanden, zodat een klik meteen reageert in plaats van 'dood' aan
// te voelen terwijl de serverpagina nog data ophaalt. Bewust licht en
// merkneutraal — het hoeft de definitieve pagina niet exact na te bootsen.
function Blok({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-ink/10 ${className}`} />
}

export default function LaadSkeleton() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
        {/* Kop */}
        <Blok className="h-7 w-48 mb-2" />
        <Blok className="h-4 w-32 mb-6 bg-ink/5" />

        {/* Navigatie-pillen */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Blok className="h-9 w-28 rounded-full" />
          <Blok className="h-9 w-32 rounded-full bg-ink/5" />
          <Blok className="h-9 w-28 rounded-full bg-ink/5" />
        </div>

        {/* Kaarten */}
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-5 min-h-[124px]">
              <Blok className="h-3 w-24 mb-4" />
              <Blok className="h-6 w-16 mb-2" />
              <Blok className="h-3 w-32 bg-ink/5" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
