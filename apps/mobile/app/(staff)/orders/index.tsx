import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { AlertCircle, ChefHat, CheckCircle } from 'lucide-react-native'
import * as ordersApi from '../../../src/api/orders.api'
import { useOrderEvents } from '../../../src/realtime/useOrderEvents'
import type { Order, OrderStatus } from '../../../src/api/types'
import { useBrandStore } from '../../../src/stores/brand.store'
import { colors } from '../../../src/theme/colors'

// Mirrors the actual mobile view of apps/web/app/staff/orders/page.tsx (it has its own
// `mobileTab` breakpoint-driven UI, not just a shrunk desktop kanban): 3 dot-colored pill
// tabs (Approval/Kitchen/Ready) with live counts, single-column list per tab. Desktop's
// 4-column kanban, zombie/abandoned-payment chips, rush/reply-to-guest, and void/add-items
// staff tools are NOT ported — those are desktop-density admin tools, not part of the
// mobile-web experience this screen is matching.
const NEXT_STATUS: Record<string, OrderStatus> = { PENDING: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' }
const NEXT_LABEL: Record<string, string> = {
  PENDING: 'Accept & Send to Kitchen',
  ACCEPTED: 'Start Preparing',
  PREPARING: 'Mark Ready',
  READY: 'Mark Served',
}

const TABS: { key: 'approval' | 'kitchen' | 'ready'; label: string; dot: string; statuses: OrderStatus[] }[] = [
  { key: 'approval', label: 'Approval', dot: '#eab308', statuses: ['PENDING'] },
  { key: 'kitchen', label: 'Kitchen', dot: '#3b82f6', statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'ready', label: 'Ready', dot: '#22c55e', statuses: ['READY'] },
]

export default function OrdersScreen() {
  const brandColor = useBrandStore((s) => s.brandColor)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('approval')

  const load = useCallback(async () => {
    try {
      setOrders(await ordersApi.getActive())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useOrderEvents({ onEvent: () => load(), onResume: load })

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setBusy((p) => ({ ...p, [order.id]: true }))
    try {
      await ordersApi.updateOrderStatus(order.id, next)
      load()
    } finally {
      setBusy((p) => ({ ...p, [order.id]: false }))
    }
  }

  function confirmCancel(order: Order) {
    Alert.alert('Cancel order?', 'This cannot be undone.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel Order',
        style: 'destructive',
        onPress: async () => {
          setBusy((p) => ({ ...p, [order.id]: true }))
          try {
            await ordersApi.updateOrderStatus(order.id, 'CANCELLED')
            load()
          } finally {
            setBusy((p) => ({ ...p, [order.id]: false }))
          }
        },
      },
    ])
  }

  const tab = TABS.find((t) => t.key === activeTab)!
  const tabOrders = orders.filter((o) => tab.statuses.includes(o.status))

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const count = orders.filter((o) => t.statuses.includes(o.status)).length
          const active = t.key === activeTab
          return (
            <Pressable
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[styles.tab, { borderColor: active ? t.dot : colors.cardBorder, backgroundColor: active ? `${t.dot}22` : colors.mutedBg }]}
            >
              <View style={[styles.tabDot, { backgroundColor: t.dot }]} />
              <Text style={[styles.tabLabel, { color: active ? t.dot : colors.textMuted }]}>{t.label}</Text>
              <Text style={[styles.tabCount, { color: active ? t.dot : colors.textMuted }]}>{count}</Text>
            </Pressable>
          )
        })}
      </View>

      <FlatList
        data={tabOrders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              {tab.key === 'kitchen' ? <ChefHat size={28} color={colors.textMuted} /> : tab.key === 'ready' ? <CheckCircle size={28} color={colors.textMuted} /> : <AlertCircle size={28} color={colors.textMuted} />}
              <Text style={styles.emptyText}>Nothing here</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.tableLabel}>
                {item.type === 'DINE_IN' ? (item.table?.name ?? `Table ${item.table?.tableNumber ?? '—'}`) : `Takeaway #${item.tokenNumber}`}
              </Text>
              <Text style={[styles.total, { color: brandColor }]}>AED {item.total.toFixed(2)}</Text>
            </View>
            {item.items.map((line) => (
              <Text key={line.id} style={styles.itemLine}>
                {line.quantity}× {line.menuItem?.name ?? line.menuItemId}
              </Text>
            ))}
            <View style={styles.actions}>
              <Pressable style={[styles.advanceBtn, { backgroundColor: brandColor }]} onPress={() => advance(item)} disabled={busy[item.id]}>
                <Text style={styles.advanceBtnText}>{busy[item.id] ? '…' : NEXT_LABEL[item.status]}</Text>
              </Pressable>
              {item.status === 'PENDING' && (
                <Pressable style={styles.cancelBtn} onPress={() => confirmCancel(item)} disabled={busy[item.id]}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: 'row', gap: 6, padding: 12, backgroundColor: colors.headerBg, borderBottomWidth: 1, borderBottomColor: colors.headerBorder },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabLabel: { fontSize: 10, fontWeight: '700' },
  tabCount: { fontSize: 13, fontWeight: '900' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  card: { backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableLabel: { fontWeight: '800', fontSize: 15, color: colors.textPrimary },
  total: { fontWeight: '700', fontSize: 14 },
  itemLine: { fontSize: 13, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  advanceBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  advanceBtnText: { color: '#000', fontWeight: '700', fontSize: 12 },
  cancelBtn: { paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedBg },
  cancelBtnText: { color: colors.status.danger.fg, fontWeight: '700', fontSize: 12 },
})
