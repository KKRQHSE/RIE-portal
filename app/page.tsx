import { redirect } from 'next/navigation'
import { getSessionProfile, homePathFor } from '@/lib/auth'

export default async function Home() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  redirect(homePathFor(profile))
}
