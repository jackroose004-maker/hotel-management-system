import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Receipt } from 'lucide-react-native'
import * as ordersApi from '../../../src/api/orders.api'
import { getOrCreateTabToken } from '../../../src/stores/guestSession.store'
import { useAuthStore } from '../../../src/stores/auth.store'
import { StatusBadge } from '../../../src/components/StatusBadge'
import type { Order } from '../../../src/api/types'
import { order as theme } from '../../../src/theme/colors'

export default function MyOrdersScreen() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = token ? await ordersApi.getMyOrders() : await ordersApi.getBySessionToken(await getOrCreateTabToken())
      setOrders([...data].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
    } finally {
      setLoading(false)
    }
  }, [token])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  return (
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.brand} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Receipt size={32} color={theme.textMuted} />
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/(guest)/orders/track/${item.id}`)}>
          <View style={styles.cardHeader}>
            <Text style={styles.tokenNumber}>{item.tokenNumber ? `#${item.tokenNumber}` : item.id.slice(0, 8)}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.meta}>
            {item.items.length} item{item.items.length === 1 ? '' : 's'} · AED {item.total.toFixed(2)}
          </Text>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { color: theme.textMuted, fontSize: 14 },
  card: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 15, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tokenNumber: { fontSize: 16, fontWeight: '900', color: theme.textPrimary },
  meta: { fontSize: 13, color: theme.textMuted },
})
