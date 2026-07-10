import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isVeiligOpslagPad } from '@/lib/bewijs'
import { INSPECTIE_FOTO_BUCKET } from '@/lib/inspectie-foto'

export const dynamic = 'force-dynamic'

function fout(bericht: string, status: number) {
  return NextResponse.json({ fout: bericht }, { status })
}

// Een verkeerd geüploade foto weghalen, zolang de inspectie nog loopt. De RPC doet
// de guard (mag_bedrijf_beheren + niet-afgerond), verwijdert de rij en geeft het
// storage-pad terug; pas daarna ruimt de service role het object op. Een afgeronde
// inspectie is bevroren — dan weigert de RPC en blijft alles staan.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fout('Ongeldige aanvraag.', 400)
  }

  const { fotoId } = (body ?? {}) as Record<string, unknown>
  if (typeof fotoId !== 'string' || !fotoId) return fout('Ongeldige invoer.', 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fout('Niet ingelogd.', 401)

  const { data: pad, error } = await supabase.rpc('inspectie_foto_verwijderen', { p_foto_id: fotoId })
  if (error) return fout(error.message || 'Verwijderen mislukt.', 403)

  // De rij is weg; het object opruimen is best-effort. Lukt dat niet, dan blijft er
  // een wees in de privé-bucket staan die door niemand meer te bereiken is.
  if (isVeiligOpslagPad(pad)) {
    const service = createServiceClient()
    await service.storage.from(INSPECTIE_FOTO_BUCKET).remove([pad])
  }

  return NextResponse.json({ ok: true })
}
