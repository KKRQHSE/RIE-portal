import { redirect } from 'next/navigation'
import { getSessionProfile, homePathFor } from '@/lib/auth'
import LoginForm from './login-form'

export default async function LoginPage() {
  const profile = await getSessionProfile()
  if (profile) redirect(homePathFor(profile))
  return <LoginForm />
}
