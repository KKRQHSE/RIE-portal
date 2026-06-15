import type { Metadata } from 'next'
import { Hanken_Grotesk, JetBrains_Mono, Inter, Source_Serif_4, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

// Extra huisstijl-lettertypes (opt-in per bedrijf).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RI&E Portal',
  description: 'Plan van Aanpak — QVOX',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${hanken.variable} ${mono.variable} ${inter.variable} ${sourceSerif.variable} ${ibmPlex.variable}`}>
      <body className="bg-surface text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
