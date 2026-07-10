import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Minus, Plus, Trash2, Table2, Clock } from 'lucide-react-native'
import { useCartStore } from '../../src/stores/cart.store'
import { getActiveTableId } from '../../src/stores/guestSession.store'
import { GlassButton } from '../../src/components/GlassButton'
import { useBrandStore, hexToRgbString } from '../../src/stores/brand.store'
import { order as theme } from '../../src/theme/colors'
import { useEffect } from 'react'

// Mirrors apps/web/app/menu/page.tsx's `view === 'cart'` screen: order-type toggle,
// itemized cart, net/VAT price breakdown, est. prep time. Deliberately does NOT replicate
// the desktop table-picker or the staff "who are you ordering for" session picker — this
// mobile app is QR-scan-first (table is already resolved by the time a guest reaches cart),
// so those two branches don't apply to the flows this app supports.
export default function CartScreen() {
  const router = useRouter()
  const { items, orderType, setOrderType, updateQty, removeItem, subtotal, vatPortion, total, maxPrepTime } = useCartStore()
  const brandColor = useBrandStore((s) => s.brandColor)
  const [tableId, setTableId] = useState<string | null>(null)

  useEffect(() => {
    getActiveTableId().then(setTableId)
  }, [])

  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <GlassButton title="Browse Menu" onPress={() => router.replace('/(guest)/menu')} />
      </View>
    )
  }

  const netDishPrice = total() - vatPortion()

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.cartKey}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={styles.orderTypeCard}>
            <Text style={styles.sectionLabel}>How would you like it?</Text>
            {tableId ? (
              <View style={[styles.tableBanner, { backgroundColor: `rgba(${hexToRgbString(brandColor)},0.12)`, borderColor: `rgba(${hexToRgbString(brandColor)},0.5)` }]}>
                <Table2 size={14} color={brandColor} />
                <Text style={[styles.tableBannerText, { color: brandColor }]}>Table selected</Text>
                <Text style={styles.tableBannerHint}>from QR scan</Text>
              </View>
            ) : (
              <View style={styles.toggleRow}>
                {(['DINE_IN', 'TAKEAWAY'] as const).map((t) => {
                  const active = orderType === t
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setOrderType(t)}
                      style={[styles.toggleBtn, active && { backgroundColor: brandColor }]}
                    >
                      <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                        {t === 'DINE_IN' ? 'Dine In' : 'Takeaway'}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
            {orderType === 'TAKEAWAY' && <Text style={styles.tokenHint}>You'll get a token number when you order</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.modifiers.map((m) => (
                <Text key={m.optionId} style={styles.modifier}>
                  + {m.name}
                </Text>
              ))}
              {item.notes ? <Text style={styles.modifier}>Note: {item.notes}</Text> : null}
              <Text style={[styles.itemPrice, { color: brandColor }]}>AED {(item.price * item.quantity).toFixed(2)}</Text>
            </View>
            <View style={styles.qtyControls}>
              <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.cartKey, -1)}>
                <Minus size={14} color={theme.textPrimary} />
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.cartKey, 1)}>
                <Plus size={14} color={theme.textPrimary} />
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(item.cartKey)} style={styles.removeBtn}>
              <Trash2 size={15} color="#f87171" />
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Dish prices (net)</Text>
              <Text style={styles.summaryValue}>AED {netDishPrice.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryDivider]}>
              <Text style={styles.summaryLabel}>VAT (included)</Text>
              <Text style={styles.summaryValue}>AED {vatPortion().toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={[styles.totalValue, { color: brandColor }]}>AED {total().toFixed(2)}</Text>
            </View>
            <View style={styles.prepTimeRow}>
              <Clock size={11} color={theme.textFaint} />
              <Text style={styles.prepTimeText}>
                Est. {maxPrepTime()}–{maxPrepTime() + 5} mins
              </Text>
            </View>
          </View>
        }
      />

      <View style={styles.footer}>
        <GlassButton
          title="Continue to Checkout"
          onPress={() => router.push('/(guest)/checkout')}
          disabled={orderType === 'DINE_IN' && !tableId}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: theme.pageBg, padding: 24 },
  emptyText: { fontSize: 15, color: theme.textSecondary },
  orderTypeCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.pillBg },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  toggleBtnTextActive: { color: '#000' },
  tableBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  tableBannerText: { fontWeight: '800', fontSize: 13 },
  tableBannerHint: { color: theme.textMuted, fontSize: 11, marginLeft: 'auto' },
  tokenHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 10,
  },
  itemName: { fontWeight: '800', color: theme.textPrimary, fontSize: 15 },
  modifier: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  itemPrice: { fontWeight: '700', marginTop: 6 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '800', color: theme.textPrimary, minWidth: 16, textAlign: 'center' },
  removeBtn: { padding: 6 },
  summary: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 6, marginTop: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryDivider: { paddingBottom: 8, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: theme.border },
  summaryLabel: { color: theme.textMuted, fontSize: 12 },
  summaryValue: { color: theme.textSecondary, fontSize: 12 },
  totalLabel: { fontSize: 16, fontWeight: '900', color: theme.textPrimary, marginTop: 4 },
  totalValue: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  prepTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  prepTimeText: { fontSize: 11, color: theme.textFaint },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.borderFaint, backgroundColor: theme.cardBg },
})
