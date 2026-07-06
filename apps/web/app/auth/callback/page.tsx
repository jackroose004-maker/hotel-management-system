'use client'
import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UtensilsCrossed } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()

  useEffect(() => {
    const token    = searchParams.get('token')
    const userB64  = searchParams.get('user')
    const redirect = searchParams.get('redirect') ?? '/account'

    if (!token || !userB64) {
      toast.error('Sign-in failed. Please try again.')
      router.replace('/login')
      return
    }

    try {
      const user = JSON.parse(Buffer.from(userB64, 'base64').toString())
      setAuth(user, token)
      toast.success(`Welcome, ${user.name.split(' ')[0]}!`)
      const isStaff = user?.role && ['STAFF', 'MANAGER', 'OWNER'].includes(user.role)
      router.replace(isStaff ? '/staff' : decodeURIComponent(redirect))
    } catch {
      toast.error('Sign-in failed. Please try again.')
      router.replace('/login')
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse" style={{ backgroundColor: 'var(--brand, #f59e0b)' }}>
        <UtensilsCrossed size={22} className="text-black" />
      </div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Signing you in…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
