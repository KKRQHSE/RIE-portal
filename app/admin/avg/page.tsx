import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth'
import AvgBeheerClient from '@/components/AvgBeheerClient'
import type { AuditLogRegel } from '@/lib/types'

// Hoeveel recente audit_log-regels de log-sectie standaard toont. Geen paginering
// nog — dit is infrastructuur, geen volledig ingerichte log-viewer.
const LOG_LIMIET = 200

export default async function AvgBeheerPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') notFound()

  const supabase = await createClient()

  // Drie onafhankelijke leesacties: tegelijk i.p.v. na elkaar.
  const [{ data: bedrijven }, { data: log }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('audit_log')
      .select('id, wie, wanneer, actie, entiteit, entiteit_id, company_id, detail')
      .order('wanneer', { ascending: false })
      .limit(LOG_LIMIET),
  ])

  return (
    <AvgBeheerClient
      bedrijven={(bedrijven ?? []) as { id: string; name: string }[]}
      initialLog={(log ?? []) as AuditLogRegel[]}
    />
  )
}
