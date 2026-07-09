import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as ordersApi from '../../src/api/orders.api'
import { useCartStore } from '../../src/stores/cart.store'
import { getOrCreateTabToken, getActiveTableId, addGuestOrderId } from '../../src/stores/guestSession.store'
import { Button } from '../../src/components/Button'
import { colors } from '../../src/theme/colors'

// Phase 1 ships cash-only checkout — Stripe native SDK (card / Apple Pay / Google Pay)
// requires a Dev Client build and is deferred to Phase 4 per the mobile app plan.
export default function CheckoutScreen() {
  const router = useRouter()
  const { items, total, clear } = useCartStore()
  const [placing, setPlacing] = useState(false)

  async function placeOrder() {
    setPlacing(true)
    try {
      const [guestTabToken, tableId] = await Promise.all([getOrCreateTabToken(), getActiveTableId()])
      const order = await ordersApi.createOrder({
        type: tableId ? 'DINE_IN' : 'TAKEAWAY',
        tableId: tableId ?? undefined,
        guestTabToken,
        paymentMethod: 'CASH',
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          notes: i.notes,
        })),
      })
      await addGuestOrderId(order.id)
      clear()
      router.replace(`/(guest)/orders/track/${order.id}`)
    } catch (err: any) {
      Alert.alert('Could not place order', err.message ?? 'Please try again')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment Method</Text>
      <View style={styles.methodCard}>
        <Text style={styles.methodName}>Cash — pay at the table</Text>
        <Text style={styles.methodHint}>Card, Apple Pay and Google Pay are coming soon.</Text>
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>AED {total().toFixed(2)}</Text>
        </View>
        <Button title="Place Order" onPress={placeOrder} loading={placing} disabled={!items.length} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  methodCard: {
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 12,
    padding: 14,
  },
  methodName: { fontWeight: '700', color: colors.textPrimary },
  methodHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  footer: { gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.brandDark },
})
