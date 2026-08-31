This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AI-foto-analyse instellen (werkplekinspectie)

De inspecteur kan één foto bij een inspectiepunt door een AI laten beschrijven en
krijgt daar een **concept**-bevinding bij die hij zelf aanpast en bevestigt. Zonder
sleutel werkt het portaal gewoon door; het scherm meldt dan "AI-analyse is nog niet
geconfigureerd".

**De repo is publiek — geen sleutel in de code of in git.** Alle waarden hieronder
zijn server-only omgevingsvariabelen (nooit `NEXT_PUBLIC_`). Ze worden uitsluitend
gelezen in `lib/ai/*` en `app/api/inspectie/ai-analyse`; de browser krijgt alleen te
zien wie de leverancier is en in welke regio hij draait, nooit de sleutel zelf.

| Variabele | Verplicht | Wat het doet |
| --- | --- | --- |
| `GROQ_API_KEY` | voor Groq | De sleutel. Ontbreekt hij, dan is de functie netjes uit. |
| `AI_LEVERANCIER` | nee | Welke adapter (`lib/ai/leverancier.ts`). Leeg = `groq`. |
| `GROQ_MODEL` | nee | Welk Groq-model. Leeg = de standaard uit `lib/ai/groq-bericht.ts`. |

Lokaal in `.env.local`, in productie in de projectinstellingen van Vercel (en daarna
opnieuw deployen — een omgevingsvariabele werkt niet met terugwerkende kracht).

**Van leverancier wisselen.** Groq draait in de **VS**. Overstappen naar Anthropic of
een EU-model raakt alleen de adapterlaag:

1. Maak `lib/ai/<naam>.ts` met een `maak<Naam>Leverancier(): Leverancier`.
2. Zet hem in de `KIES`-tabel in `lib/ai/leverancier.ts`.
3. Zet `AI_LEVERANCIER=<naam>` en de bijbehorende sleutel in de omgeving.

Zet `regio` op `'eu'` zodra de dienst binnen de EU draait — de waarschuwing bij het
toestemmingsvinkje past zich daar vanzelf op aan. De route, de RPC's, het datamodel
en het scherm blijven ongewijzigd. De volledige instructie staat onderaan
`lib/ai/leverancier.ts`.

**Testen.**

```bash
node --use-system-ca scripts/ai_analyse_selftest.ts       # parser + echte aanroep
node --use-system-ca scripts/inspectie_ai_isolatie_test.mjs
npm run dev                                               # in een tweede terminal:
node --use-system-ca scripts/inspectie_ai_route_test.ts   # de route, echte sessie
GROQ_API_KEY= npm run dev                                 # en hetzelfde zónder sleutel
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
