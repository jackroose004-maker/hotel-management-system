import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '../../src/stores/auth.store'
import { isStaffRole } from '../../src/navigation/roleGuard'

// Full staff nav (Kitchen, Orders Kanban, Tables, Bookings, Bills, Team) is Phase 3.
// This stub only exists so STAFF/MANAGER/OWNER logins have a valid landing route
// instead of hitting a missing-route error.
//
// This client-side check is a UX convenience only, not a security boundary — see
// src/navigation/roleGuard.ts. The real enforcement is server-side (RolesGuard).
export default function StaffLayout() {
  const { user, token } = useAuthStore()

  if (!token || !isStaffRole(user?.role)) {
    return <Redirect href="/(auth)/staff-login" />
  }

  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="dashboard" options={{ title: 'Al Manzil Staff' }} />
    </Stack>
  )
}
