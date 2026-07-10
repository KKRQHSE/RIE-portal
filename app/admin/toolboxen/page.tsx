import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import ToolboxAdmin from '@/components/ToolboxAdmin'
import type { CentraleToolbox, CentraleToolboxVraag, CentraleToolboxMetVragen, ToolboxBron } from '@/lib/types'

export default async function ToolboxAdminPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') notFound()

  const supabase = await createClient()

  const [{ data: toolboxen }, { data: vragen }, { data: bronnen }] = await Promise.all([
    supabase
      .from('centrale_toolbox')
      .select('id, titel, tekst, video_url, vereist_video, vereist_quiz, quiz_slaaggrens, quiz_uitleg_modus, toegang, volgorde, versie, gearchiveerd_op')
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    supabase
      .from('centrale_toolbox_vraag')
      .select('id, toolbox_id, vraagtekst, opties, juist_antwoord, uitleg, volgorde, versie, gearchiveerd_op')
      .is('gearchiveerd_op', null)
      .order('volgorde', { ascending: true }),
    // Ook de gearchiveerde bronnen: de admin kan ze terugzetten.
    supabase
      .from('toolbox_bron')
      .select('id, naam, url, omschrijving, volgorde, gearchiveerd_op')
      .order('volgorde', { ascending: true }),
  ])

  const metVragen: CentraleToolboxMetVragen[] = ((toolboxen ?? []) as CentraleToolbox[]).map(t => ({
    ...t,
    vragen: ((vragen ?? []) as CentraleToolboxVraag[]).filter(v => v.toolbox_id === t.id),
  }))

  return <ToolboxAdmin initialToolboxen={metVragen} initialBronnen={(bronnen ?? []) as ToolboxBron[]} />
}
