'use client'
import { create } from 'zustand'

export type Permission =
  | 'dashboard' | 'orders' | 'tables' | 'bookings'
  | 'bills' | 'menu' | 'analytics' | 'team' | 'settings' | 'kitchen'

export interface StaffRole { id: string; name: string; color: string; permissions: Permission[] }

interface User {
  id: string; name: string; email: string; role: string
  avatarUrl?: string; googleId?: string
  staffRoleId?: string | null
  staffRole?: StaffRole | null
}

function getPermissions(user: User | null): Permission[] {
  if (!user) return []
  if (user.role === 'OWNER') return ['dashboard','orders','tables','bookings','bills','menu','analytics','team','settings','kitchen']
  if (user.staffRole?.permissions?.length) return user.staffRole.permissions as Permission[]
  const defaults: Record<string, Permission[]> = {
    MANAGER: ['dashboard','orders','tables','bookings','bills','menu','analytics','team'],
    STAFF:   ['dashboard','orders','tables','bookings'],
    CHEF:    ['kitchen'],
  }
  return defaults[user.role] ?? []
}

interface AuthStore {
  user: User | null
  token: string | null
  permissions: Permission[]
  setAuth: (user: User, token: string) => void
  updatePermissions: (staffRole: StaffRole | null) => void
  logout: () => void
  init: () => void
}

async function claimGuestOrders(token: string) {
  try {
    const raw = localStorage.getItem('almanzil_order_ids')
    if (!raw) return
    const orderIds: string[] = JSON.parse(raw)
    if (!orderIds.length) return
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/orders/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderIds }),
    })
    // Keep localStorage IDs in place — menu/orders deduplicates against /orders/mine.
    // Removing them here races with the page's fetchOrders and causes blank order lists.
  } catch {}
}

export const useAuthStore = create<AuthStore>(set => ({
  user: null,
  token: null,
  permissions: [],
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token, permissions: getPermissions(user) })
    claimGuestOrders(token)
  },
  updatePermissions: (staffRole) => {
    set(state => {
      if (!state.user) return {}
      const updated = { ...state.user, staffRole }
      localStorage.setItem('user', JSON.stringify(updated))
      return { user: updated, permissions: getPermissions(updated) }
    })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null, permissions: [] })
  },
  init: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr && userStr !== 'undefined' && userStr !== 'null') {
      try {
        const user = JSON.parse(userStr)
        set({ token, user, permissions: getPermissions(user) })
      } catch {}
    }
  },
}))
