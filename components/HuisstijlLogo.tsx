import Image from 'next/image'
import type { HuisstijlView } from '@/lib/huisstijl'

// Dynamische logo's uit Storage: een gewone <img> (geen next/image-domeinconfig
// nodig). Vaste hoogte zodat verschillende aspect-ratio's netjes uitlijnen.
function LogoImg({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-[46px] w-auto object-contain" />
}

// Terugval = exact het huidige QHSE-logo (pixelidentiek aan nu).
function QhseFallback() {
  return <Image src="/logo.jpg" alt="QHSE Totaal" width={140} height={46} className="object-contain" />
}

export default function HuisstijlLogo({
  huisstijl,
  className,
}: {
  huisstijl: HuisstijlView
  className?: string
}) {
  const { modus, merkLogoUrl, klantLogoUrl, merkNaam } = huisstijl

  let inhoud
  if (modus === 'default') {
    // Alleen het merklogo; ontbreekt dat → terugval op /logo.jpg.
    inhoud = merkLogoUrl ? <LogoImg src={merkLogoUrl} alt={merkNaam ?? 'Logo'} /> : <QhseFallback />
  } else if (!merkLogoUrl && !klantLogoUrl) {
    inhoud = <QhseFallback />
  } else {
    // co-branding / white-label: klantlogo + merklogo naast elkaar, subtiele scheiding.
    inhoud = (
      <div className="flex items-center gap-3">
        {klantLogoUrl && <LogoImg src={klantLogoUrl} alt="Klantlogo" />}
        {klantLogoUrl && merkLogoUrl && <span className="h-8 w-px bg-ink/15" aria-hidden />}
        {merkLogoUrl && <LogoImg src={merkLogoUrl} alt={merkNaam ?? 'Merklogo'} />}
      </div>
    )
  }

  return <div className={className}>{inhoud}</div>
}
