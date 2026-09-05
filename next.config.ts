import type { NextConfig } from "next";

// Content-Security-Policy en overige beveiligingsheaders. Gevonden ontbrekend
// in SYSTEEMDOORLICHTING_RONDE2_2026-09-04.md (should-punt 9): geen enkele
// headers()-configuratie, geen CSP/HSTS/X-Frame-Options.
//
// Bewust GEEN nonce-gebaseerde CSP (zie node_modules/next/dist/docs/01-app/
// 02-guides/content-security-policy.md): dat vereist dynamic rendering op
// ELKE pagina (nonces kunnen niet in statisch gegenereerde HTML), wat lijnrecht
// ingaat tegen het bestaande performance-werk (zie memory
// prestatie-kritieke-pad) en een veel grotere, aparte architectuurkeuze is.
// Gevolg van deze keuze: script-src/style-src moeten 'unsafe-inline' toestaan
// (Next.js injecteert zelf inline hydration-scripts; de app gebruikt overal
// React's inline `style`-prop voor de per-bedrijf huisstijl-kleuren) — dat
// beperkt de XSS-waarde van deze CSP aanzienlijk. De overige richtlijnen
// (object-src/base-uri/form-action/frame-ancestors/connect-src/img-src) staan
// wél hard dicht en zijn onafhankelijk van die beperking waardevol
// (clickjacking, data-exfiltratie naar onbekende domeinen, base-tag-injectie).
//
// supabaseOrigin wordt PAS binnen headers() berekend, niet op module-top-
// level: next.config.ts wordt geëvalueerd vóór Next.js .env.local inleest,
// dus process.env.NEXT_PUBLIC_SUPABASE_URL staat op top-level nog op
// undefined (leverde eerst een CSP zonder de Supabase-origin op, live
// geverifieerd met een build+server-test).
function securityHeaders() {
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    } catch {
      return '';
    }
  })();

  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
    `font-src 'self'`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return [
    { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
    // Overbodig naast frame-ancestors 'none' in moderne browsers, maar staat
    // hier expliciet omdat sommige scanners/tools er los op controleren.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Geen enkele pagina gebruikt live camera/microfoon/locatie (foto-upload
    // gaat via een bestandskiezer met capture-attribuut, geen getUserMedia).
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // Veilig op Vercel (HTTPS-only); 2 jaar, inclusief subdomeinen.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ];
}

const nextConfig: NextConfig = {
  // Leg de workspace-root expliciet op deze projectmap vast. Zonder dit kiest
  // Next soms de verkeerde root door een losse package-lock.json in een hogere
  // map (de "multiple lockfiles"-waarschuwing).
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
