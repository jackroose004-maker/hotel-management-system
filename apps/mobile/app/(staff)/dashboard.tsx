import { StyleSheet, Text, View } from 'react-native'
import { useAuthStore } from '../../src/stores/auth.store'
import { Button } from '../../src/components/Button'
import { colors } from '../../src/theme/colors'

// Placeholder landing screen for staff roles. Kitchen Display, Orders Kanban, Tables Grid,
// Bookings, Bills/Settlement, and Team Management are scoped to Phase 3 of the mobile plan
// (see the mobile app implementation plan) — not built yet.
export default function StaffDashboard() {
  const { user, logout } = useAuthStore()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.name}</Text>
      <Text style={styles.subtitle}>Role: {user?.role}</Text>
      <Text style={styles.notice}>
        Kitchen, Orders, Tables, Bookings and Bills screens ship in Phase 3 of the mobile app rollout. For now,
        continue using the staff web portal for these workflows.
      </Text>
      <Button title="Log Out" variant="secondary" onPress={() => logout()} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textMuted },
  notice: { fontSize: 13, color: colors.textMuted, marginVertical: 20, lineHeight: 20 },
})
