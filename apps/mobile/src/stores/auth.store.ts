import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { setAuthToken } from '../api/client'
import * as authApi from '../api/auth.api'
import * as ordersApi from '../api/orders.api'
import { getGuestOrderIds } from './guestSession.store'
import type { User } from '../api/types'

const TOKEN_KEY = 'almanzil_token'
const USER_KEY = 'almanzil_user'

interface AuthStore {
  user: User | null
  token: string | null
  ready: boolean
  init: () => Promise<void>
  setAuth: (user: User, token: string) => Promise<void>
  logout: () => Promise<void>
}

async function claimGuestOrders() {
  try {
    const orderIds = await getGuestOrderIds()
    if (!orderIds.length) return
    await ordersApi.claimGuestOrders(orderIds)
  } catch {
    // best-effort — my-orders screen still works from /orders/mine even if claim failed
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  ready: false,

  init: async () => {
    const [token, userStr] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ])
    if (token && userStr) {
      try {
        setAuthToken(token)
        set({ token, user: JSON.parse(userStr), ready: true })
        return
      } catch {
        // fall through to unauthenticated state
      }
    }
    set({ ready: true })
  },

  setAuth: async (user, token) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ])
    setAuthToken(token)
    set({ user, token, ready: true })
    claimGuestOrders()
  },

  logout: async () => {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)])
    setAuthToken(null)
    set({ user: null, token: null })
  },
}))
