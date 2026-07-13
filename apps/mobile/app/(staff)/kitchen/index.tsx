import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { ChefHat, Clock, Utensils, Package, Flame } from 'lucide-react-native'
import * as ordersApi from '../../../src/api/orders.api'
import { useOrderEvents } from '../../../src/realtime/useOrderEvents'
import type { Order } from '../../../src/api/types'
import { useBrandStore } from '../../../src/stores/brand.store'
import { colors } from '../../../src/theme/colors'

const KITCHEN_STATUSES = ['ACCEPTED', 'PREPARING']
const LATE_THRESHOLD_MINS = 20

// Mirrors apps/web/app/staff/kitchen/page.tsx closely: colored ticket strip (yellow
// waiting / orange preparing / red late), countdown-to-est-ready (not just elapsed time),
// header stat pills, sorted late-first. This replaces the earlier simplified version that
// only had two states and showed elapsed time instead of the actual "Xm left" countdown.
function estMinsFor(order: Order) {
  return Math.max(...order.items.map((i) => i.menuItem?.prepTimeMins ?? 15), 15)
}

function formatDuration(ms: number) {
  const totalSecs = Math.floor(Math.abs(ms) / 1000)
  if (totalSecs < 60) return `${totalSecs}s`
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins < 60) return `${mins}m ${secs}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function useCountdown(createdAt: string, estMins: number) {
  const estMs = estMins * 60 * 1000
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(createdAt).getTime())
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - new Date(createdAt).getTime()), 1000)
    return () => clearInterval(t)
  }, [createdAt])
  const remaining = estMs - elapsed
  const late = remaining < 0
  return { label: late ? `-${formatDuration(remaining)}` : formatDuration(remaining), late }
}

export default function KitchenScreen() {
  const brandColor = useBrandStore((s) => s.brandColor)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const active = await ordersApi.getActive()
      setOrders(active.filter((o) => KITCHEN_STATUSES.includes(o.status)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useOrderEvents({ onEvent: () => load(), onResume: load })

  async function advance(order: Order, next: 'PREPARING' | 'READY') {
    setBusy((p) => ({ ...p, [order.id]: true }))
    try {
      await ordersApi.updateOrderStatus(order.id, next)
      setOrders((prev) => (next === 'READY' ? prev.filter((o) => o.id !== order.id) : prev.map((o) => (o.id === order.id ? { ...o, status: next } : o))))
    } finally {
      setBusy((p) => ({ ...p, [order.id]: false }))
    }
  }

  const sorted = [...orders].sort((a, b) => {
    const aMin = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 60000)
    const bMin = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000)
    const aLate = aMin > LATE_THRESHOLD_MINS ? 1 : 0
    const bLate = bMin > LATE_THRESHOLD_MINS ? 1 : 0
    if (bLate !== aLate) return bLate - aLate
    return bMin - aMin
  })

  const lateCount = orders.filter((o) => Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000) > LATE_THRESHOLD_MINS).length
  const preparingCount = orders.filter((o) => o.status === 'PREPARING').length
  const waitingCount = orders.filter((o) => o.status === 'ACCEPTED').length

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kitchen Display</Text>
        <View style={styles.statPills}>
          <StatPill label={`${orders.length} active`} bg="#fff7ed" fg="#c2410c" />
          {waitingCount > 0 && <StatPill label={`${waitingCount} waiting`} bg="#fefce8" fg="#a16207" />}
          {preparingCount > 0 && <StatPill label={`${preparingCount} cooking`} bg="#eff6ff" fg="#1d4ed8" />}
          {lateCount > 0 && <StatPill label={`${lateCount} late`} bg="#fef2f2" fg="#b91c1c" />}
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(o) => o.id}
        numColumns={1}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={brandColor} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <ChefHat size={28} color="#86efac" />
              <Text style={styles.emptyTitle}>Kitchen is all clear</Text>
              <Text style={styles.emptySubtitle}>No tickets in the queue. Orders accepted by staff will appear here automatically.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <Ticket order={item} onAdvance={advance} busy={!!busy[item.id]} />}
      />
    </View>
  )
}

function StatPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <Text style={[styles.statPillText, { color: fg }]}>{label}</Text>
    </View>
  )
}

function Ticket({ order, onAdvance, busy }: { order: Order; onAdvance: (o: Order, next: 'PREPARING' | 'READY') => void; busy: boolean }) {
  const estMins = estMinsFor(order)
  const { label, late } = useCountdown(order.createdAt, estMins)
  const isPreparing = order.status === 'PREPARING'

  const stripColor = late ? '#f87171' : isPreparing ? '#fb923c' : '#fde047'
  const headerBg = late ? '#fef2f2' : isPreparing ? '#fff7ed' : '#f9fafb'
  const borderColor = late ? '#fecaca' : isPreparing ? '#fed7aa' : colors.cardBorder

  return (
    <View style={[styles.ticket, { borderColor }]}>
      <View style={[styles.stripe, { backgroundColor: stripColor }]} />
      <View style={[styles.ticketHeader, { backgroundColor: headerBg }]}>
        <View style={styles.ticketHeaderLeft}>
          {order.type === 'DINE_IN' ? <Utensils size={13} color="#f97316" /> : <Package size={13} color="#3b82f6" />}
          <Text style={styles.ticketTitle}>
            {order.type === 'DINE_IN' ? `Table ${order.table?.name ?? order.table?.tableNumber ?? '—'}` : `Token #${order.tokenNumber}`}
          </Text>
          {order.tokenNumber != null && order.type === 'DINE_IN' && (
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>#{order.tokenNumber}</Text>
            </View>
          )}
        </View>
        <View style={styles.ticketHeaderRight}>
          {late && <Flame size={12} color="#ef4444" />}
          <Clock size={10} color={late ? '#dc2626' : '#16a34a'} />
          <Text style={[styles.timeLabel, { color: late ? '#dc2626' : '#16a34a' }]}>{late ? label : `${label} left`}</Text>
        </View>
      </View>

      <View style={styles.itemsBlock}>
        {order.items.map((line) => (
          <View key={line.id} style={styles.itemRow}>
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyBadgeText}>{line.quantity}×</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{line.menuItem?.name ?? line.menuItemId}</Text>
              {line.notes ? <Text style={styles.itemNote}>↳ {line.notes}</Text> : null}
            </View>
          </View>
        ))}
        {order.notes ? (
          <View style={styles.orderNoteBox}>
            <Text style={styles.orderNoteText}>
              <Text style={{ fontWeight: '800' }}>Note: </Text>
              {order.notes}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionBlock}>
        {order.status === 'ACCEPTED' && (
          <Pressable style={styles.startBtn} onPress={() => onAdvance(order, 'PREPARING')} disabled={busy}>
            <Text style={styles.startBtnText}>{busy ? '…' : 'Start Preparing'}</Text>
          </Pressable>
        )}
        {isPreparing && (
          <Pressable style={styles.readyBtn} onPress={() => onAdvance(order, 'READY')} disabled={busy}>
            <Text style={styles.readyBtnText}>{busy ? '…' : 'Ready to Serve ✓'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.headerBg, borderBottomWidth: 1, borderBottomColor: colors.headerBorder },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  statPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statPillText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontWeight: '700', color: colors.textPrimary, fontSize: 14 },
  emptySubtitle: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  ticket: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  stripe: { height: 4 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  ticketHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticketTitle: { fontWeight: '800', color: colors.textPrimary, fontSize: 13 },
  tokenBadge: { backgroundColor: 'rgba(217,119,6,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  tokenBadgeText: { fontSize: 9, fontWeight: '900', color: '#d97706' },
  ticketHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeLabel: { fontSize: 11, fontWeight: '800' },
  itemsBlock: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  qtyBadge: { backgroundColor: colors.mutedBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 28, alignItems: 'center' },
  qtyBadgeText: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  itemNote: { fontSize: 11, color: '#f97316', marginTop: 2 },
  orderNoteBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 8, marginTop: 4 },
  orderNoteText: { fontSize: 11, color: '#c2410c' },
  actionBlock: { paddingHorizontal: 14, paddingBottom: 14 },
  startBtn: { backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  readyBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  readyBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
})
