import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { X } from 'lucide-react-native'
import * as tablesApi from '../../../src/api/tables.api'
import * as ordersApi from '../../../src/api/orders.api'
import { useAuthStore } from '../../../src/stores/auth.store'
import type { RestaurantTable, TableStatus } from '../../../src/api/types'
import { colors } from '../../../src/theme/colors'

// Mirrors apps/web/app/staff/tables/page.tsx's responsive grid (same 2/3/4-column grid,
// just fewer columns at narrow widths — this page doesn't have a separate mobile layout
// the way Orders does). "Add Items" (staff placing an order on behalf of a table) and the
// QR code view/regenerate modal are NOT ported yet — those need a staff-context menu
// picker and QR rendering respectively, which don't exist in this app yet. Flagging as a
// known gap rather than a silent omission.
const STATUS_STYLE: Record<TableStatus, { bg: string; label: string }> = {
  EMPTY: { bg: '#10b981', label: 'Available' },
  OCCUPIED: { bg: '#ef4444', label: 'Seated' },
  BILL_PENDING: { bg: '#facc15', label: 'Awaiting Bill' },
  DIRTY: { bg: '#9ca3af', label: 'Clearing' },
}

export default function TablesScreen() {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [billTable, setBillTable] = useState<RestaurantTable | null>(null)
  const [bill, setBill] = useState<any>(null)
  const [billLoading, setBillLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      setTables(await tablesApi.getAll())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  async function setStatus(table: RestaurantTable, status: TableStatus) {
    setBusy((p) => ({ ...p, [table.id]: true }))
    try {
      await tablesApi.updateStatus(table.id, status)
      setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status } : t)))
    } finally {
      setBusy((p) => ({ ...p, [table.id]: false }))
    }
  }

  async function openBill(table: RestaurantTable) {
    setBillTable(table)
    setBillLoading(true)
    try {
      setBill(await ordersApi.getTableBill(table.id))
    } catch {
      setBill(null)
    } finally {
      setBillLoading(false)
    }
  }

  function onPress(table: RestaurantTable) {
    if (table.status === 'OCCUPIED' || table.status === 'BILL_PENDING') {
      openBill(table)
    }
  }

  function onLongPress(table: RestaurantTable) {
    if (table.status === 'DIRTY') {
      Alert.alert('Table ' + (table.name ?? table.tableNumber), 'Mark this table clean and available?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Clean', onPress: () => setStatus(table, 'EMPTY') },
      ])
      return
    }
    if ((table.status === 'OCCUPIED' || table.status === 'BILL_PENDING') && isOwner) {
      Alert.alert(
        'Force Available?',
        `This clears "${table.name ?? table.tableNumber}" back to available without settling a bill. Only use this if the table really has nothing due (e.g. the order behind it was voided).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Force Available', style: 'destructive', onPress: () => setStatus(table, 'EMPTY') },
        ],
      )
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={styles.container}
        data={tables}
        keyExtractor={(t) => t.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        columnWrapperStyle={{ gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => {
          const style = STATUS_STYLE[item.status]
          return (
            <Pressable
              style={[styles.card, { backgroundColor: style.bg }]}
              onPress={() => onPress(item)}
              onLongPress={() => onLongPress(item)}
              disabled={busy[item.id]}
            >
              <Text style={styles.tableName}>{item.name ?? `Table ${item.tableNumber}`}</Text>
              <Text style={styles.statusLabel}>{style.label}</Text>
              <Text style={styles.capacity}>{item.capacity} seats</Text>
            </Pressable>
          )
        }}
      />

      <Modal visible={!!billTable} animationType="slide" transparent onRequestClose={() => setBillTable(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{billTable?.name ?? `Table ${billTable?.tableNumber}`} — Bill</Text>
              <Pressable onPress={() => setBillTable(null)}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {billLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: 30 }} />
            ) : !bill || !bill.orders?.length ? (
              <Text style={styles.emptyBillText}>No unpaid orders for this table.</Text>
            ) : (
              <>
                {bill.orders.map((o: any) => (
                  <View key={o.id} style={styles.billOrderBlock}>
                    {o.items?.map((line: any) => (
                      <View key={line.id} style={styles.billRow}>
                        <Text style={styles.billItemName}>
                          {line.quantity}× {line.menuItem?.name}
                        </Text>
                        <Text style={styles.billItemPrice}>AED {(line.unitPrice * line.quantity).toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>Total</Text>
                  <Text style={styles.billTotalValue}>AED {Number(bill.summary?.total ?? 0).toFixed(2)}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: { flex: 1, borderRadius: 16, padding: 14, minHeight: 100, justifyContent: 'space-between' },
  tableName: { color: '#fff', fontWeight: '900', fontSize: 16 },
  statusLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12 },
  capacity: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  emptyBillText: { color: colors.textMuted, textAlign: 'center', paddingVertical: 30 },
  billOrderBlock: { marginBottom: 8 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  billItemName: { color: colors.textPrimary, fontSize: 13 },
  billItemPrice: { color: colors.textMuted, fontSize: 13 },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 2, borderTopColor: colors.cardBorder },
  billTotalLabel: { fontWeight: '900', color: colors.textPrimary, fontSize: 15 },
  billTotalValue: { fontWeight: '900', color: colors.brandDark, fontSize: 15 },
})
