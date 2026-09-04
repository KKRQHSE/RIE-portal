import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AuditDetailClient from '@/components/AuditDetailClient'
import { haalHuisstijl } from '@/lib/huisstijl-data'
import type { Audit, AuditVcaBevinding, AuditIsoObservatie, AuditVerbeterpunt } from '@/lib/types'

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ company_id: string; audit_id: string }>
}) {
  const { company_id, audit_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: moduleRij }, { data: audit }, huisstijl] = await Promise.all([
    supabase.from('users').select('role, company_id').eq('id', user.id).single(),
    // Zelfde modulegate als het overzicht: een losse deeplink mag er niet omheen.
    supabase
      .from('bedrijf_modules')
      .select('actief')
      .eq('company_id', company_id)
      .eq('module', 'audit')
      .eq('module_status', 'actief')
      .eq('actief', true)
      .maybeSingle(),
    supabase.from('audit').select('*').eq('id', audit_id).eq('company_id', company_id).maybeSingle(),
    haalHuisstijl(company_id),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.company_id !== company_id) notFound()
  // Audits blijven volledig dicht voor teamleider (zelfde regel als het
  // overzicht, audits/page.tsx) — een losse deeplink naar een auditdetail
  // mag daar niet omheen. De audit-tabel zelf is en blijft dicht
  // (mag_bedrijf_beheren), dus dit is consistentie, geen nieuwe grens.
  if (profile.role === 'teamleider') notFound()
  if (!moduleRij) notFound()
  if (!audit) notFound()

  const a = audit as Audit
  const [{ data: bevindingen }, { data: observaties }, { data: verbeterpunten }] = await Promise.all([
    a.sjabloon === 'vca'
      ? supabase.from('audit_vca_bevinding').select('*').eq('audit_id', audit_id).order('volgorde')
      : Promise.resolve({ data: [] }),
    a.sjabloon === 'iso'
      ? supabase.from('audit_iso_observatie').select('*').eq('audit_id', audit_id).order('volgorde')
      : Promise.resolve({ data: [] }),
    supabase.from('audit_verbeterpunt').select('*').eq('audit_id', audit_id).order('volgorde'),
  ])

  return (
    <AuditDetailClient
      companyId={company_id}
      huisstijl={huisstijl}
      initialAudit={a}
      initialBevindingen={(bevindingen ?? []) as AuditVcaBevinding[]}
      initialObservaties={(observaties ?? []) as AuditIsoObservatie[]}
      initialVerbeterpunten={(verbeterpunten ?? []) as AuditVerbeterpunt[]}
    />
  )
}
