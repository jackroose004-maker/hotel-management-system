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
      router.replace(decodeURIComponent(redirect))
    } catch {
      toast.error('Sign-in failed. Please try again.')
      router.replace('/login')
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center animate-pulse">
        <UtensilsCrossed size={22} className="text-white" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Signing you in…</p>
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
