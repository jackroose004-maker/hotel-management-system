import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BellRing, CircleCheck, ChefHat, Clock, ClipboardList, Star, XCircle } from 'lucide-react-native'
import * as ordersApi from '../../../../src/api/orders.api'
import { useOrderEvents } from '../../../../src/realtime/useOrderEvents'
import type { Order, OrderStatus } from '../../../../src/api/types'
import { order as theme } from '../../../../src/theme/colors'

const STEPS: { status: OrderStatus; label: string; icon: any }[] = [
  { status: 'PENDING', label: 'Received', icon: ClipboardList },
  { status: 'ACCEPTED', label: 'Confirmed', icon: CircleCheck },
  { status: 'PREPARING', label: 'Preparing', icon: ChefHat },
  { status: 'READY', label: 'Ready', icon: BellRing },
]

function useElapsedMins(createdAt: string | undefined) {
  const [mins, setMins] = useState(0)
  useEffect(() => {
    if (!createdAt) return
    const update = () => setMins(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [createdAt])
  return mins
}

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

  const elapsed = useElapsedMins(order?.createdAt)

  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    )
  }

  const stepIdx = STEPS.findIndex((s) => s.status === order.status)
  const isReady = order.status === 'READY'
  const isDone = order.status === 'DELIVERED'
  const isCancelled = order.status === 'CANCELLED'

  return (
    <View style={styles.container}>
      {isReady && <HeroBanner icon={BellRing} color="#34d399" title="Your order is ready!" subtitle="Please collect it now" />}
      {isDone && <HeroBanner icon={Star} color={theme.brand} title="Enjoy your meal!" subtitle="Order delivered" />}
      {isCancelled && <HeroBanner icon={XCircle} color="#f87171" title="Order cancelled" subtitle="" />}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.tokenNumber}>{order.tokenNumber ? `Order #${order.tokenNumber}` : `Order ${order.id.slice(0, 8)}`}</Text>
            <Text style={styles.tableLabel}>{order.type === 'TAKEAWAY' ? 'Takeaway' : 'Dine In'}</Text>
          </View>
          <View style={styles.elapsedPill}>
            <Clock size={11} color={theme.brand} />
            <Text style={styles.elapsedText}>{elapsed < 1 ? 'just now' : `${elapsed} min`}</Text>
          </View>
        </View>

        {!isCancelled && (
          <View style={styles.stepper}>
            {STEPS.map((step, i) => {
              const done = i <= stepIdx
              const active = i === stepIdx
              const Icon = step.icon
              return (
                <View key={step.status} style={styles.stepItem}>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.connector, { backgroundColor: i < stepIdx ? theme.brand : '#2a2a2a' }]} />
                  )}
                  <View
                    style={[
                      styles.stepBubble,
                      { borderColor: done ? theme.brand : '#2a2a2a' },
                      active ? { backgroundColor: theme.brand } : done ? { backgroundColor: `rgba(${theme.brandRgb},0.18)` } : { backgroundColor: '#1a1a1a' },
                    ]}
                  >
                    <Icon size={15} color={active ? '#000' : done ? theme.brand : '#555'} />
                  </View>
                  <Text style={[styles.stepLabel, { color: active ? theme.brand : done ? '#ccc' : '#444' }]}>{step.label}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

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

function HeroBanner({ icon: Icon, color, title, subtitle }: { icon: any; color: string; title: string; subtitle: string }) {
  return (
    <View style={[styles.hero, { backgroundColor: `${color}14`, borderColor: `${color}40` }]}>
      <View style={[styles.heroIcon, { backgroundColor: `${color}26`, borderColor: `${color}66` }]}>
        <Icon size={26} color={color} />
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={[styles.heroSubtitle, { color }]}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg, padding: 16, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.pageBg },
  hero: { borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  heroIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 19, fontWeight: '900', color: theme.textPrimary, textAlign: 'center' },
  heroSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  card: { backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 18 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  tokenNumber: { fontSize: 18, fontWeight: '900', color: theme.textPrimary },
  tableLabel: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  elapsedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: `rgba(${theme.brandRgb},0.1)`, borderWidth: 1, borderColor: `rgba(${theme.brandRgb},0.2)` },
  elapsedText: { fontSize: 11, fontWeight: '800', color: theme.brand },
  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { flex: 1, alignItems: 'center', gap: 6, position: 'relative' },
  connector: { position: 'absolute', top: 18, left: '50%', width: '100%', height: 1 },
  stepBubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  itemsCard: { backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { color: theme.textSecondary, fontSize: 14 },
  itemPrice: { color: theme.textMuted, fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  totalLabel: { fontWeight: '900', color: theme.textPrimary },
  totalValue: { fontWeight: '900', color: theme.brand },
})
