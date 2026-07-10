import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChefHat, ClipboardList, CalendarDays, Receipt } from 'lucide-react-native'
import { Pressable } from 'react-native'
import * as ordersApi from '../../src/api/orders.api'
import * as bookingsApi from '../../src/api/bookings.api'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'

export default function StaffDashboard() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [activeOrders, setActiveOrders] = useState<number | null>(null)
  const [todayBookings, setTodayBookings] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [orders, bookings] = await Promise.all([
        ordersApi.getActive().catch(() => []),
        bookingsApi.getTodayBookings().catch(() => []),
      ])
      setActiveOrders(orders.length)
      setTodayBookings(bookings.length)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
    >
      <View>
        <Text style={styles.greeting}>Welcome, {user?.name}</Text>
        <Text style={styles.role}>{user?.role}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeOrders ?? '—'}</Text>
          <Text style={styles.statLabel}>Active Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayBookings ?? '—'}</Text>
          <Text style={styles.statLabel}>Bookings Today</Text>
        </View>
      </View>

      <View style={styles.quickLinks}>
        <QuickLink icon={ChefHat} label="Kitchen" onPress={() => router.push('/(staff)/kitchen')} />
        <QuickLink icon={ClipboardList} label="Orders" onPress={() => router.push('/(staff)/orders')} />
        <QuickLink icon={CalendarDays} label="Bookings" onPress={() => router.push('/(staff)/bookings')} />
        <QuickLink icon={Receipt} label="Bills" onPress={() => router.push('/(staff)/bills')} />
      </View>
    </ScrollView>
  )
}

function QuickLink({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickLink} onPress={onPress}>
      <Icon size={20} color={colors.brand} />
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '900', color: colors.brandDark },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickLink: { width: '47%', backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 8 },
  quickLinkLabel: { fontWeight: '700', color: colors.textPrimary, fontSize: 14 },
})
