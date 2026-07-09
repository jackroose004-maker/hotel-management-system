import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as ordersApi from '../../../src/api/orders.api'
import { getOrCreateTabToken } from '../../../src/stores/guestSession.store'
import { useAuthStore } from '../../../src/stores/auth.store'
import { StatusBadge } from '../../../src/components/StatusBadge'
import type { Order } from '../../../src/api/types'
import { colors } from '../../../src/theme/colors'

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
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>No orders yet</Text> : null}
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
  container: { flex: 1, backgroundColor: colors.background },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tokenNumber: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textMuted },
})
