export const PERMISSIONS = {
  DASHBOARD: 'dashboard',
  ORDERS:    'orders',
  TABLES:    'tables',
  BOOKINGS:  'bookings',
  BILLS:     'bills',
  MENU:      'menu',
  ANALYTICS: 'analytics',
  TEAM:      'team',
  SETTINGS:  'settings',  // OWNER only — never assigned via custom role
  KITCHEN:   'kitchen',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

// Default permissions per built-in role (fallback when no custom staffRole assigned)
// MANAGER / CHEF granularity is handled via StaffRole.permissions — not the role column
export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  OWNER:    ALL_PERMISSIONS,
  STAFF:    ['dashboard','orders','tables','bookings'],
  CUSTOMER: [],
}

export function resolvePermissions(role: string, staffRolePermissions?: unknown): Permission[] {
  if (role === 'OWNER') return ALL_PERMISSIONS
  if (Array.isArray(staffRolePermissions) && staffRolePermissions.length > 0) {
    return staffRolePermissions as Permission[]
  }
  return DEFAULT_PERMISSIONS[role] ?? []
}

export function hasPermission(role: string, staffRolePermissions: unknown, key: Permission): boolean {
  if (role === 'OWNER') return true
  return resolvePermissions(role, staffRolePermissions).includes(key)
}
