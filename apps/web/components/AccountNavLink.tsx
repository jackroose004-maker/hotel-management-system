'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { User } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

export default function AccountNavLink() {
  const { user, token, init } = useAuthStore()
  useEffect(() => { init() }, [])
  if (token && user) {
    return (
      <Link href="/account" className="flex items-center gap-1.5 hover:text-orange-500 transition-colors">
        <User size={14} />
        {user.name.split(' ')[0]}
      </Link>
    )
  }
  return (
    <Link href="/login" className="hover:text-orange-500 transition-colors">Sign In</Link>
  )
}
