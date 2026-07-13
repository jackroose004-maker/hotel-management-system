import { useCallback, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Receipt, Banknote, CreditCard, History } from 'lucide-react-native'
import * as ordersApi from '../../../src/api/orders.api'
import * as paymentsApi from '../../../src/api/payments.api'
import { useBrandStore, hexToRgbString } from '../../../src/stores/brand.store'
import { colors } from '../../../src/theme/colors'

// Mirrors apps/web/app/staff/bills/page.tsx: this page is a single scroll of stacked
// sections (no tab switcher, confirmed by the absence of any tab state in the web source)
// — Active Bills, then Settled Today (closed dine-in + takeaway combined) with the day's
// revenue total. Refund request handling (OWNER/MANAGER approve/deny) is NOT ported —
// that's a lower-frequency admin action, same descope rationale as Menu Admin/Analytics.
export default function BillsScreen() {
  const brandColor = useBrandStore((s) => s.brandColor)
  const brandRgb = hexToRgbString(brandColor)
  const [active, setActive] = useState<any[]>([])
  const [closed, setClosed] = useState<any[]>([])
  const [takeaway, setTakeaway] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const [activeRes, closedRes, takeawayRes] = await Promise.all([
        ordersApi.getActiveBills(),
        ordersApi.getClosedBillsToday(),
        ordersApi.getTakeawayToday(),
      ])
      setActive(activeRes)
      setClosed(closedRes)
      setTakeaway(takeawayRes)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  function settle(tableId: string, tableName: string, method: 'CASH' | 'CARD') {
    Alert.alert(`Settle ${tableName}`, `Confirm ${method === 'CASH' ? 'cash' : 'card'} payment for all unpaid tabs at this table?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy((p) => ({ ...p, [tableId]: true }))
          try {
            await paymentsApi.settleAllCashForTable(tableId, method)
            load()
          } catch (err: any) {
            Alert.alert('Could not settle', err.message ?? 'Please try again')
          } finally {
            setBusy((p) => ({ ...p, [tableId]: false }))
          }
        },
      },
    ])
  }

  const todayRevenue =
    closed.reduce((s, c) => s + Number(c.summary?.total ?? 0), 0) + takeaway.reduce((s, t) => s + Number(t.summary?.total ?? 0), 0)
  const historyCount = closed.length + takeaway.length

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 24 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View>
        <View style={styles.sectionHeader}>
          <Receipt size={14} color={brandColor} />
          <Text style={styles.sectionTitle}>Active Bills</Text>
          {active.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: `rgba(${brandRgb},0.12)` }]}>
              <Text style={[styles.countBadgeText, { color: brandColor }]}>{active.length}</Text>
            </View>
          )}
        </View>

        {active.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIcon, { backgroundColor: `rgba(${brandRgb},0.12)` }]}>
              <Receipt size={20} color={brandColor} />
            </View>
            <Text style={styles.emptyTitle}>No active bills right now</Text>
            <Text style={styles.emptySubtitle}>Bills appear here when guests place dine-in orders</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {active.map((item) => (
              <View key={item.table.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.tableName}>{item.table.name ?? `Table ${item.table.tableNumber}`}</Text>
                  <Text style={styles.tabCount}>
                    {item.tabs.length} tab{item.tabs.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={[styles.total, { color: brandColor }]}>AED {Number(item.combined?.total ?? 0).toFixed(2)}</Text>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.settleBtn, { backgroundColor: brandColor }]}
                    onPress={() => settle(item.table.id, item.table.name ?? `Table ${item.table.tableNumber}`, 'CASH')}
                    disabled={busy[item.table.id]}
                  >
                    <Banknote size={14} color="#fff" />
                    <Text style={styles.settleBtnText}>Cash</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.settleBtn, styles.settleBtnCard]}
                    onPress={() => settle(item.table.id, item.table.name ?? `Table ${item.table.tableNumber}`, 'CARD')}
                    disabled={busy[item.table.id]}
                  >
                    <CreditCard size={14} color={colors.textPrimary} />
                    <Text style={styles.settleBtnCardText}>Card</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {!loading && historyCount > 0 && (
        <View>
          <View style={styles.sectionHeader}>
            <History size={14} color={colors.textMuted} />
            <Text style={styles.sectionTitle}>Settled Today</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.status.success.bg }]}>
              <Text style={[styles.countBadgeText, { color: colors.status.success.fg }]}>{historyCount}</Text>
            </View>
            <Text style={styles.revenueText}>AED {todayRevenue.toFixed(2)}</Text>
          </View>
          <View style={{ gap: 8 }}>
            {closed.map((s) => (
              <View key={s.sessionId} style={styles.historyRow}>
                <Text style={styles.historyLabel}>{s.table?.name ?? `Table ${s.table?.tableNumber ?? '—'}`}</Text>
                <Text style={styles.historyValue}>AED {Number(s.summary?.total ?? 0).toFixed(2)}</Text>
              </View>
            ))}
            {takeaway.map((t) => (
              <View key={t.tokenNumber} style={styles.historyRow}>
                <Text style={styles.historyLabel}>Takeaway #{t.tokenNumber}</Text>
                <Text style={styles.historyValue}>AED {Number(t.summary?.total ?? 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  countBadgeText: { fontSize: 10, fontWeight: '800' },
  revenueText: { marginLeft: 'auto', fontSize: 14, fontWeight: '900', color: colors.status.success.fg },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8, backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardBorder },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontWeight: '700', color: colors.textPrimary, fontSize: 14 },
  emptySubtitle: { color: colors.textMuted, fontSize: 12 },
  card: { backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableName: { fontSize: 16, fontWeight: '900', color: colors.textPrimary },
  tabCount: { fontSize: 12, color: colors.textMuted },
  total: { fontSize: 22, fontWeight: '900', marginVertical: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  settleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10 },
  settleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  settleBtnCard: { backgroundColor: colors.mutedBg },
  settleBtnCardText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 14, paddingVertical: 10 },
  historyLabel: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  historyValue: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
})
