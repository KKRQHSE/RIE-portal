// Browser-side afbeeldingverkleining, gedeeld door alle upload-flows (bewijs,
// incident-foto, inspectie-foto). Stond eerder identiek in twee componenten.
// Draait alleen in de browser: gebruikt Image, canvas en URL.createObjectURL.

export function metExt(naam: string, ext: string): string {
  const basis = (naam || '').replace(/\.[^.]+$/, '')
  return `${basis || 'foto'}.${ext}`
}

// Verklein een (telefoon)foto: lange zijde max 1600px, JPEG-kwaliteit 0.8.
// Faalt de conversie, dan hoort de aanroeper het origineel te proberen.
export function verkleinAfbeelding(file: File): Promise<{ blob: Blob; naam: string; type: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxZijde = 1600
      let { width, height } = img
      if (Math.max(width, height) > maxZijde) {
        const schaal = maxZijde / Math.max(width, height)
        width = Math.round(width * schaal)
        height = Math.round(height * schaal)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('geen canvas-context'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        b => (b ? resolve({ blob: b, naam: metExt(file.name, 'jpg'), type: 'image/jpeg' }) : reject(new Error('toBlob faalde'))),
        'image/jpeg',
        0.8,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('afbeelding laden mislukt'))
    }
    img.src = url
  })
}
