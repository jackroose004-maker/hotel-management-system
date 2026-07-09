import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as ordersApi from '../../../../src/api/orders.api'
import { useOrderEvents } from '../../../../src/realtime/useOrderEvents'
import { StatusBadge } from '../../../../src/components/StatusBadge'
import type { Order, OrderStatus } from '../../../../src/api/types'
import { colors } from '../../../../src/theme/colors'

const STEPS: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED']

export default function TrackOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const [order, setOrder] = useState<Order | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.getById(orderId)
      setOrder(data)
    } catch {
      // keep last known state — a transient fetch failure shouldn't blank the screen
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  useOrderEvents({
    onEvent: (updated) => {
      if (updated.id === orderId) setOrder(updated)
    },
    onResume: load,
  })

  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    )
  }

  const stepIndex = STEPS.indexOf(order.status)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tokenNumber}>{order.tokenNumber ? `Order #${order.tokenNumber}` : `Order ${order.id.slice(0, 8)}`}</Text>
        <StatusBadge status={order.status} />
      </View>

      {order.status !== 'CANCELLED' && (
        <View style={styles.timeline}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.timelineRow}>
              <View style={[styles.dot, i <= stepIndex && styles.dotActive]} />
              <Text style={[styles.timelineLabel, i <= stepIndex && styles.timelineLabelActive]}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.itemsCard}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.quantity}× {item.menuItem?.name ?? item.menuItemId}
            </Text>
            <Text style={styles.itemPrice}>AED {(item.unitPrice * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>AED {order.total.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  tokenNumber: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  timeline: { gap: 14, marginBottom: 24 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.mutedBg },
  dotActive: { backgroundColor: colors.brand },
  timelineLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  timelineLabelActive: { color: colors.textPrimary },
  itemsCard: { backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { color: colors.textPrimary, fontSize: 14 },
  itemPrice: { color: colors.textMuted, fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.headerBorder },
  totalLabel: { fontWeight: '800', color: colors.textPrimary },
  totalValue: { fontWeight: '800', color: colors.brandDark },
})
