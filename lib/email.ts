// E-mailvoorspelling, volledig data-gedreven: het patroon wordt afgeleid uit
// bestaande naam+email-PAREN van het bedrijf, niet uit een e-mailadres alleen.
//
// Ondersteunde patronen: voornaam.achternaam, vletter.achternaam, voornaam,
// vletterachternaam. Tussenvoegsels (van, de, den, der, van den, van der, ...)
// worden zowel meegeplakt (j.vandenberg) als weggelaten (j.berg) overwogen; er
// wordt gekozen wat past bij de bestaande adressen.

export type NaamEmail = { naam: string; email: string | null }

type Pattern = 'voornaam.achternaam' | 'vletter.achternaam' | 'voornaam' | 'vletterachternaam'

const PATTERNS: Pattern[] = ['voornaam.achternaam', 'vletter.achternaam', 'voornaam', 'vletterachternaam']

// Nederlandse tussenvoegsels. Meerwoordige (van den) vóór enkelwoordige zodat
// ze als geheel herkend worden.
const TUSSENVOEGSELS = new Set([
  'van', 'de', 'den', 'der', 'ter', 'te', 'ten', 'op', 'aan', 'het', "'t",
])

export type NaamDelen = { voornaam: string; tussenvoegsel: string; achternaam: string }

export function splitNaam(naam: string): NaamDelen {
  const tokens = naam.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { voornaam: '', tussenvoegsel: '', achternaam: '' }
  if (tokens.length === 1) return { voornaam: tokens[0], tussenvoegsel: '', achternaam: '' }

  const voornaam = tokens[0]
  const rest = tokens.slice(1)
  const tv: string[] = []
  let i = 0
  while (i < rest.length - 1 && TUSSENVOEGSELS.has(rest[i].toLowerCase())) {
    tv.push(rest[i])
    i++
  }
  return {
    voornaam,
    tussenvoegsel: tv.join(' '),
    achternaam: rest.slice(i).join(' '),
  }
}

// Lowercase, diacrieten weg, alleen a-z0-9 (gebruikt voor de losse naamdelen).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

// Idem maar punten blijven behouden (gebruikt voor het local-part van een email).
function normLocal(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9.]/g, '')
}

function localPart(delen: NaamDelen, pattern: Pattern, metTussenvoegsel: boolean): string {
  const v = norm(delen.voornaam)
  const achter = norm(metTussenvoegsel ? `${delen.tussenvoegsel} ${delen.achternaam}` : delen.achternaam)
  const init = v.charAt(0)
  switch (pattern) {
    case 'voornaam.achternaam': return achter ? `${v}.${achter}` : v
    case 'vletter.achternaam':  return achter ? `${init}.${achter}` : init
    case 'voornaam':            return v
    case 'vletterachternaam':   return `${init}${achter}`
  }
}

export type Voorspelling = { email: string; zeker: boolean }

export function voorspelEmail(naam: string, bestaande: NaamEmail[]): Voorspelling {
  const samples = bestaande
    .filter(p => p.email && p.email.includes('@') && p.naam.trim())
    .map(p => {
      const [local, domein] = p.email!.split('@')
      return { delen: splitNaam(p.naam), local: normLocal(local), domein: domein.toLowerCase() }
    })

  // Domein: meest voorkomende onder bestaande adressen.
  const domeinTally = new Map<string, number>()
  for (const s of samples) domeinTally.set(s.domein, (domeinTally.get(s.domein) ?? 0) + 1)
  const domein = [...domeinTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  // Stem per patroon en (apart) of het tussenvoegsel meegeplakt wordt.
  const patternVotes = new Map<Pattern, number>()
  let tvMet = 0
  let tvZonder = 0

  for (const s of samples) {
    const heeftTv = s.delen.tussenvoegsel !== ''
    let matchte = false
    for (const pattern of PATTERNS) {
      const zonder = localPart(s.delen, pattern, false)
      const met = heeftTv ? localPart(s.delen, pattern, true) : zonder
      if (zonder === s.local || met === s.local) {
        patternVotes.set(pattern, (patternVotes.get(pattern) ?? 0) + 1)
        matchte = true
        if (heeftTv) {
          if (met === s.local && zonder !== s.local) tvMet++
          else if (zonder === s.local && met !== s.local) tvZonder++
        }
      }
    }
    void matchte
  }

  const gekozenPattern: Pattern =
    [...patternVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'voornaam.achternaam'
  const gekozenTv = tvMet > tvZonder
  const matchesVoorPattern = patternVotes.get(gekozenPattern) ?? 0

  const delen = splitNaam(naam)
  const local = localPart(delen, gekozenPattern, gekozenTv)
  const email = local && domein ? `${local}@${domein}` : ''

  // Bij 0 of 1 betrouwbare sample is de voorspelling een gok.
  const zeker = matchesVoorPattern >= 2 && email !== ''

  return { email, zeker }
}
