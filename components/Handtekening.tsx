'use client'

import { useRef, useState, useEffect } from 'react'

// Vinger-/muis-handtekening op een canvas (Pointer Events dekt touch én muis).
// Roept onChange aan met de PNG data-URL na elke streep, en met '' bij wissen.
export default function Handtekening({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tekenen = useRef(false)
  const [leeg, setLeeg] = useState(true)

  // Canvas op de werkelijke pixelgrootte zetten (scherp op retina), eenmalig.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#14161B'
    }
  }, [])

  function punt(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    tekenen.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const p = punt(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function beweeg(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!tekenen.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = punt(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function eind() {
    if (!tekenen.current) return
    tekenen.current = false
    setLeeg(false)
    const url = canvasRef.current?.toDataURL('image/png') ?? ''
    onChange(url)
  }

  function wis() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setLeeg(true)
    onChange('')
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={beweeg}
        onPointerUp={eind}
        onPointerLeave={eind}
        className="w-full h-40 rounded border border-ink/30 bg-white touch-none"
        style={{ touchAction: 'none' }}
        aria-label="Handtekeningveld"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink/40">{leeg ? 'Zet hier je handtekening met je vinger of muis.' : 'Handtekening gezet.'}</p>
        <button type="button" onClick={wis} className="text-xs text-ink/50 hover:text-accent">Wissen</button>
      </div>
    </div>
  )
}
