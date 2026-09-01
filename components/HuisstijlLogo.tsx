import Image from 'next/image'
import type { HuisstijlView } from '@/lib/huisstijl'

// Dynamische logo's uit Storage: een gewone <img> (geen next/image-domeinconfig
// nodig). Vaste hoogte zodat verschillende aspect-ratio's netjes uitlijnen.
//
// De BREEDTE moet begrensd zijn. Met alleen h-[46px] w-auto bepaalt de
// beeldverhouding hoe breed het logo wordt: een klantlogo van 1200x100 werd zo
// 358 px breed en duwde de pagina buiten het scherm (horizontale scroll op 390
// px, zie het testrapport van 1 sep 2026). Daarom:
//   max-w-full  — nooit breder dan de ruimte die er is
//   min-w-0     — in een flexrij mag een <img> anders niet onder zijn
//                 intrinsieke breedte krimpen (min-width is standaard 'auto')
//   shrink      — expliciet meekrimpen als de rij te smal wordt
// object-contain zorgt dat het logo daarbij zijn verhouding houdt; hij wordt
// kleiner in plaats van uitgerekt of afgesneden.
function LogoImg({ src, alt }: { src: string; alt: string }) {
  return (
    // Bewust een gewone <img>: het logo komt uit een Storage-bucket en hoeft
    // geen next/image-domeinconfig.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-[46px] w-auto max-w-full min-w-0 shrink object-contain"
    />
  )
}

// Terugval = exact het huidige QHSE-logo (pixelidentiek aan nu).
function QhseFallback() {
  return (
    <Image
      src="/logo.jpg"
      alt="QHSE Totaal"
      width={140}
      height={46}
      className="h-auto max-w-full object-contain"
    />
  )
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
      <div className="flex items-center gap-3 min-w-0 max-w-full">
        {klantLogoUrl && <LogoImg src={klantLogoUrl} alt="Klantlogo" />}
        {klantLogoUrl && merkLogoUrl && <span className="h-8 w-px bg-ink/15" aria-hidden />}
        {merkLogoUrl && <LogoImg src={merkLogoUrl} alt={merkNaam ?? 'Merklogo'} />}
      </div>
    )
  }

  // min-w-0 + max-w-full ook hier: staat dit blok ooit in een flexrij, dan mag
  // het meekrimpen in plaats van de pagina op te rekken.
  return <div className={`min-w-0 max-w-full ${className ?? ''}`}>{inhoud}</div>
}
