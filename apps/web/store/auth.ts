'use client'
import { create } from 'zustand'

export type Permission =
  | 'dashboard' | 'orders' | 'tables' | 'bookings'
  | 'bills' | 'menu' | 'analytics' | 'team' | 'settings' | 'kitchen'

export interface StaffRole { id: string; name: string; color: string; permissions: Permission[] }

interface User {
  id: string; name: string; email: string; role: string
  avatarUrl?: string | null; googleId?: string | null
  staffRoleId?: string | null
  staffRole?: StaffRole | null
}

// Only the fields the UI actually needs — never write DB internals to localStorage
function sanitizeUser(raw: any): User {
  return {
    id:          raw.id,
    name:        raw.name,
    email:       raw.email,
    role:        raw.role,
    avatarUrl:   raw.avatarUrl ?? null,
    googleId:    raw.googleId ?? null,
    staffRoleId: raw.staffRoleId ?? null,
    staffRole:   raw.staffRole ?? null,
  }
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

const STAFF_ROLES = ['OWNER', 'MANAGER', 'STAFF', 'CHEF']
// Keys that only make sense for the customer-facing menu — clear on staff login
const CUSTOMER_KEYS = ['almanzil-cart', 'almanzil_order_ids', 'almanzil_guest_order_count', 'almanzil-lang']

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
  } catch {}
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

export const useAuthStore = create<AuthStore>(set => ({
  user: null,
  token: null,
  permissions: [],
  setAuth: (rawUser, token) => {
    const user = sanitizeUser(rawUser)
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token, permissions: getPermissions(user) })

    if (STAFF_ROLES.includes(user.role)) {
      // Staff portal: clear any customer-side keys that don't belong here
      CUSTOMER_KEYS.forEach(k => localStorage.removeItem(k))
    } else {
      // Customer login: claim any guest orders made before login
      claimGuestOrders(token)
    }
  },
  updatePermissions: (staffRole) => {
    set(state => {
      if (!state.user) return {}
      const updated = sanitizeUser({ ...state.user, staffRole })
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
        const user = sanitizeUser(JSON.parse(userStr))
        set({ token, user, permissions: getPermissions(user) })
      } catch {}
    }
  },
}))
