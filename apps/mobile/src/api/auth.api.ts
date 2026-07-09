import { apiGet, apiPatch, apiPost } from './client'
import type { User } from './types'

export function sendOtp(email: string, name: string) {
  return apiPost<{ message: string }>('/auth/send-otp', { email, name })
}

export function register(input: { name: string; email: string; password: string; phone?: string; otp: string }) {
  return apiPost<{ user: User; token: string }>('/auth/register', input)
}

export function login(email: string, password: string) {
  return apiPost<{ user: User; token: string }>('/auth/login', { email, password })
}

export function staffLogin(email: string, password: string) {
  return apiPost<{ user: User; token: string }>('/auth/staff-login', { email, password })
}

export function me() {
  return apiGet<User>('/auth/me')
}

export function updateMe(dto: Partial<Pick<User, 'name' | 'phone' | 'dietaryTags' | 'notifOrderUpdates' | 'notifBookingReminders'>>) {
  return apiPatch<User>('/auth/me', dto)
}

export function getFavorites() {
  return apiGet('/auth/favorites')
}

export function toggleFavorite(menuItemId: string) {
  return apiPost<{ action: 'added' | 'removed'; menuItemId: string }>(`/auth/favorites/${menuItemId}`)
}
