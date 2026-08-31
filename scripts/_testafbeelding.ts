// Testplaatje voor de AI-scripts. Geen dependency, geen bestand op schijf en
// vooral: geen échte inspectiefoto. Wat hier naar buiten gaat is een blokje dat
// dit bestand zelf tekent — bovenhelft rood, onderhelft blauw. Dat is genoeg om
// te controleren of een vision-model werkelijk naar het beeld kijkt.
import { deflateSync, crc32 } from 'node:zlib'

export function maakTestPng(breedte = 32, hoogte = 32): Buffer {
  const rauw: number[] = []
  for (let y = 0; y < hoogte; y++) {
    rauw.push(0) // filter-byte per rij
    for (let x = 0; x < breedte; x++) {
      const boven = y < hoogte / 2
      rauw.push(boven ? 220 : 20, boven ? 30 : 40, boven ? 30 : 200)
    }
  }
  const blok = (type: string, data: Buffer) => {
    const lengte = Buffer.alloc(4)
    lengte.writeUInt32BE(data.length)
    const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(typeData) >>> 0)
    return Buffer.concat([lengte, typeData, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breedte, 0)
  ihdr.writeUInt32BE(hoogte, 4)
  ihdr[8] = 8   // bitdiepte
  ihdr[9] = 2   // kleurtype 2 = truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(Buffer.from(rauw))),
    blok('IEND', Buffer.alloc(0)),
  ])
}
