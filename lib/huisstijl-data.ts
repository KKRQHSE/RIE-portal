// Server-only: haalt de effectieve huisstijl op via de RPC en bouwt publieke
// logo-URL's (getPublicUrl). Niet importeren in client components.
import { createClient } from '@/lib/supabase/server'
import {
  VEILIGE_HUISSTIJL,
  normaliseerLettertype,
  normaliseerModus,
  type HuisstijlView,
} from '@/lib/huisstijl'

const BUCKET = 'merk-assets'

export async function haalHuisstijl(companyId: string): Promise<HuisstijlView> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('huisstijl_van_bedrijf', { p_company_id: companyId })
    if (error || !data) return VEILIGE_HUISSTIJL

    const h = typeof data === 'string' ? JSON.parse(data) : data
    const url = (pad: unknown): string | null =>
      typeof pad === 'string' && pad
        ? supabase.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl
        : null

    return {
      modus: normaliseerModus(h.modus),
      merkNaam: typeof h.merk_naam === 'string' ? h.merk_naam : null,
      merkLogoUrl: url(h.merk_logo),
      klantLogoUrl: url(h.klant_logo),
      accentKleur: typeof h.accent_kleur === 'string' && h.accent_kleur ? h.accent_kleur : '#FF5200',
      lettertype: normaliseerLettertype(h.lettertype),
    }
  } catch {
    // Bij welke fout dan ook: terugvallen op de veilige standaard (huidige look).
    return VEILIGE_HUISSTIJL
  }
}
