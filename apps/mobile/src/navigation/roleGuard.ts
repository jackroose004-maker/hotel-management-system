import type { Role } from '../api/types'

export const GUEST_ROLES: Role[] = ['GUEST', 'USER']
export const STAFF_ROLES: Role[] = ['STAFF', 'MANAGER', 'OWNER']

export function isGuestRole(role: Role | undefined) {
  return !!role && GUEST_ROLES.includes(role)
}

export function isStaffRole(role: Role | undefined) {
  return !!role && STAFF_ROLES.includes(role)
}

/**
 * This is a UX convenience only, so the app doesn't briefly flash the wrong screens.
 * It is NOT a security boundary — every staff endpoint is independently protected
 * server-side by JwtAuthGuard + RolesGuard + @Roles(...) in the NestJS backend
 * (apps/backend/src/common/guards/roles.guard.ts). A user could bypass this client-side
 * check entirely and would still be rejected by the API. Never rely on this for security.
 */
export function homeRouteForRole(role: Role | undefined): '/(guest)/menu' | '/(staff)/dashboard' | '/(auth)/login' {
  if (isStaffRole(role)) return '/(staff)/dashboard'
  if (isGuestRole(role)) return '/(guest)/menu'
  return '/(auth)/login'
}
