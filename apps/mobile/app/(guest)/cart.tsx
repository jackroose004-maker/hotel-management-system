import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useCartStore } from '../../src/stores/cart.store'
import { Button } from '../../src/components/Button'
import { colors } from '../../src/theme/colors'

export default function CartScreen() {
  const router = useRouter()
  const { items, updateQty, removeItem, subtotal, vatPortion, total } = useCartStore()

  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <Button title="Browse Menu" onPress={() => router.replace('/(guest)/menu')} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.cartKey}
        contentContainerStyle={{ padding: 16, gap: 12 }}
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
              <Text style={styles.itemPrice}>AED {(item.price * item.quantity).toFixed(2)}</Text>
            </View>
            <View style={styles.qtyControls}>
              <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.cartKey, -1)}>
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.cartKey, 1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(item.cartKey)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal (incl. VAT)</Text>
          <Text style={styles.summaryValue}>AED {subtotal().toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>VAT (5%, included)</Text>
          <Text style={styles.summaryValue}>AED {vatPortion().toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>AED {total().toFixed(2)}</Text>
        </View>
        <Button title="Checkout" onPress={() => router.push('/(guest)/checkout')} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.background },
  emptyText: { fontSize: 16, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    gap: 10,
  },
  itemName: { fontWeight: '700', color: colors.textPrimary, fontSize: 15 },
  modifier: { fontSize: 12, color: colors.textMuted },
  itemPrice: { fontWeight: '600', color: colors.brandDark, marginTop: 4 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.mutedBg, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  qtyText: { fontSize: 15, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  remove: { color: colors.status.danger.fg, fontSize: 12, fontWeight: '600' },
  summary: { padding: 16, borderTopWidth: 1, borderTopColor: colors.headerBorder, backgroundColor: colors.cardBg, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: colors.textMuted, fontSize: 13 },
  summaryValue: { color: colors.textPrimary, fontSize: 13 },
  totalLabel: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.brandDark, marginTop: 4 },
})
