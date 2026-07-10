import { apiGet, apiPatch, apiPost } from './client'
import type { Role } from './types'

export interface StaffUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
}

export function listStaff() {
  return apiGet<StaffUser[]>('/users/staff')
}

export function createStaff(body: { name: string; email: string; password: string; role: string }) {
  return apiPost<StaffUser>('/users/staff', body)
}

export function updateStaff(id: string, body: { name?: string; role?: string; isActive?: boolean; password?: string }) {
  return apiPatch<StaffUser>(`/users/staff/${id}`, body)
}
