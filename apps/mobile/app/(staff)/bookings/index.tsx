import { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CalendarDays, CheckCircle2, Phone, Users } from 'lucide-react-native'
import * as bookingsApi from '../../../src/api/bookings.api'
import { useBrandStore, hexToRgbString } from '../../../src/stores/brand.store'
import { colors } from '../../../src/theme/colors'

// Mirrors the `sm:hidden` mobile card list on apps/web/app/staff/bookings/page.tsx: same
// 4-way filter bar (Upcoming/Arrived/No-shows/All), same card layout (time + table pill +
// status badge, guest name + party size + phone, status-dependent action row). "Order Food"
// (ARRIVED bookings deep-link into staff Orders with the table pre-selected) is NOT ported
// — that requires a staff order-placement flow this app doesn't have yet.
const FILTERS: { key: 'upcoming' | 'arrived' | 'noshows' | 'all'; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'noshows', label: 'No-shows' },
  { key: 'all', label: 'All' },
]

function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: colors.status.pending.bg, fg: colors.status.pending.fg },
  CONFIRMED: { bg: colors.status.info.bg, fg: colors.status.info.fg },
  ARRIVED: { bg: colors.status.success.bg, fg: colors.status.success.fg },
  NO_SHOW: { bg: colors.status.danger.bg, fg: colors.status.danger.fg },
  CANCELLED: { bg: colors.status.neutral.bg, fg: colors.status.neutral.fg },
}

export default function BookingsScreen() {
  const brandColor = useBrandStore((s) => s.brandColor)
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('upcoming')

  const load = useCallback(async () => {
    try {
      setBookings(await bookingsApi.getTodayBookings())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const filtered = useMemo(() => {
    let result = bookings
    if (filter === 'upcoming') result = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status))
    else if (filter === 'arrived') result = bookings.filter((b) => b.status === 'ARRIVED')
    else if (filter === 'noshows') result = bookings.filter((b) => b.status === 'NO_SHOW')
    return [...result].sort((a, b) => a.slotTime.localeCompare(b.slotTime))
  }, [bookings, filter])

  async function runAction(id: string, action: () => Promise<any>, patch: (b: any) => any) {
    setBusy((p) => ({ ...p, [id]: true }))
    try {
      await action()
      setBookings((prev) => prev.map((b) => (b.id === id ? patch(b) : b)))
    } catch (err: any) {
      Alert.alert('Action failed', err.message ?? 'Please try again')
    } finally {
      setBusy((p) => ({ ...p, [id]: false }))
    }
  }

  function confirmCancel(id: string) {
    Alert.alert('Cancel booking?', 'This will free up the slot.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: () => runAction(id, () => bookingsApi.staffCancelBooking(id, 'Cancelled by staff'), (b) => ({ ...b, status: 'CANCELLED' })),
      },
    ])
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {FILTERS.map((f) => {
          const active = f.key === filter
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterPill, active && { backgroundColor: `rgba(${hexToRgbString(brandColor)},0.15)`, borderColor: brandColor }]}
            >
              <Text style={[styles.filterPillText, active && { color: brandColor }]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <CalendarDays size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No bookings here</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const tone = STATUS_TONE[item.status] ?? STATUS_TONE.PENDING
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardTopLeft}>
                  <Text style={styles.time}>{slotLabel(item.slotTime)}</Text>
                  <View style={styles.tablePill}>
                    <Text style={styles.tablePillText}>{item.table ? (item.table.name ?? `T${item.table.tableNumber}`) : 'TBD'}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{item.status}</Text>
                </View>
              </View>

              <View style={styles.guestBlock}>
                <Text style={styles.customer}>{item.customer?.name ?? '—'}</Text>
                <View style={styles.guestMeta}>
                  <View style={styles.guestMetaItem}>
                    <Users size={11} color={colors.textMuted} />
                    <Text style={styles.guestMetaText}>{item.partySize} guests</Text>
                  </View>
                  {item.customer?.phone && (
                    <View style={styles.guestMetaItem}>
                      <Phone size={11} color={colors.textMuted} />
                      <Text style={styles.guestMetaText}>{item.customer.phone}</Text>
                    </View>
                  )}
                </View>
              </View>

              {(item.status === 'CONFIRMED' || item.status === 'PENDING') && (
                <View style={styles.actions}>
                  {item.status === 'CONFIRMED' && (
                    <Pressable
                      style={styles.arriveBtn}
                      onPress={() => runAction(item.id, () => bookingsApi.markArrived(item.id), (b) => ({ ...b, status: 'ARRIVED' }))}
                      disabled={busy[item.id]}
                    >
                      <CheckCircle2 size={13} color="#fff" />
                      <Text style={styles.arriveBtnText}>Mark Arrived</Text>
                    </Pressable>
                  )}
                  {item.status === 'PENDING' && (
                    <Pressable
                      style={[styles.confirmBtn, { backgroundColor: `rgba(${hexToRgbString(brandColor)},0.12)`, borderColor: brandColor }]}
                      onPress={() => runAction(item.id, () => bookingsApi.confirmBooking(item.id), (b) => ({ ...b, status: 'CONFIRMED' }))}
                      disabled={busy[item.id]}
                    >
                      <CheckCircle2 size={13} color={brandColor} />
                      <Text style={[styles.confirmBtnText, { color: brandColor }]}>Confirm</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.cancelBtn} onPress={() => confirmCancel(item.id)} disabled={busy[item.id]}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.headerBg, borderBottomWidth: 1, borderBottomColor: colors.headerBorder },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.mutedBg, borderWidth: 1, borderColor: colors.cardBorder },
  filterPillText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  card: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  tablePill: { backgroundColor: colors.mutedBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tablePillText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  guestBlock: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  customer: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  guestMeta: { flexDirection: 'row', gap: 14, marginTop: 4 },
  guestMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guestMetaText: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  arriveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 9 },
  arriveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 9 },
  confirmBtnText: { fontWeight: '700', fontSize: 12 },
  cancelBtn: { paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedBg },
  cancelBtnText: { color: colors.status.danger.fg, fontWeight: '700', fontSize: 12 },
})
