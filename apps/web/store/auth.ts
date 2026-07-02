'use client'
import { create } from 'zustand'

interface User { id: string; name: string; email: string; role: string; avatarUrl?: string; googleId?: string }

interface AuthStore {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
  init: () => void
}

async function claimGuestOrders(token: string) {
  try {
    const raw = localStorage.getItem('almanzil_order_ids')
    if (!raw) return
    const orderIds: string[] = JSON.parse(raw)
    if (!orderIds.length) return
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/v1/orders/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderIds }),
    })
    // Clear the local order ID list — they're now linked to the account
    localStorage.removeItem('almanzil_order_ids')
    localStorage.removeItem('almanzil_guest_order_count')
  } catch {}
}

export const useAuthStore = create<AuthStore>(set => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token })
    // Silently claim any orders placed as a guest before signing in (Option B)
    claimGuestOrders(token)
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },
  init: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr && userStr !== 'undefined' && userStr !== 'null') {
      try { set({ token, user: JSON.parse(userStr) }) } catch {}
    }
  },
}))
