import { useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Banknote, Lock } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import * as ordersApi from '../../src/api/orders.api'
import { useCartStore } from '../../src/stores/cart.store'
import { useAuthStore } from '../../src/stores/auth.store'
import { getOrCreateTabToken, getActiveTableId, addGuestOrderId } from '../../src/stores/guestSession.store'
import { useBrandStore } from '../../src/stores/brand.store'
import { order as theme } from '../../src/theme/colors'

// Mirrors apps/web/app/menu/page.tsx's cash/card payment buttons + cash-confirm bottom
// sheet. Card payment is disabled for now (Stripe native SDK is Phase 4 per the mobile
// plan — requires a Dev Client rebuild + Apple/Google Pay merchant setup, deliberately not
// bundled into this pass) but shown in the same visual position web uses, so the layout
// doesn't jump once card support lands.
export default function CheckoutScreen() {
  const router = useRouter()
  const { items, orderType, total } = useCartStore()
  const token = useAuthStore((s) => s.token)
  const brandColor = useBrandStore((s) => s.brandColor)
  const [phone, setPhone] = useState('')
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [placing, setPlacing] = useState(false)

  const cashLabel = orderType === 'TAKEAWAY' ? 'Pay at Counter' : 'Pay Cash When Leaving'
  const confirmTitle = orderType === 'TAKEAWAY' ? 'Pay at Counter' : 'Pay Cash When Leaving'
  const confirmSub =
    orderType === 'TAKEAWAY'
      ? "You'll pay when you collect your order at the counter."
      : "You'll pay when your table is ready to leave."
  const confirmButtonLabel = orderType === 'TAKEAWAY' ? 'Confirm — Pay at Counter' : 'Confirm — Pay on Exit'

  async function placeOrder() {
    setPlacing(true)
    try {
      const [guestTabToken, tableId] = await Promise.all([getOrCreateTabToken(), getActiveTableId()])
      const placedOrder = await ordersApi.createOrder({
        type: tableId ? 'DINE_IN' : 'TAKEAWAY',
        tableId: tableId ?? undefined,
        guestTabToken,
        contactPhone: orderType === 'TAKEAWAY' ? phone || undefined : undefined,
        paymentMethod: 'CASH',
        items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
      })
      await addGuestOrderId(placedOrder.id)
      useCartStore.getState().clear()
      setConfirmVisible(false)
      router.replace(`/(guest)/orders/track/${placedOrder.id}`)
    } catch (err: any) {
      setConfirmVisible(false)
      Alert.alert('Could not place order', err.message ?? 'Please try again')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <View style={styles.container}>
      {orderType === 'TAKEAWAY' && (
        <View style={styles.phoneCard}>
          <Text style={styles.sectionLabel}>Contact Number</Text>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+971 50 000 0000"
            placeholderTextColor={theme.textFaint}
          />
          <Text style={styles.phoneHint}>We&apos;ll call/SMS you when your order is ready for pickup</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, { color: brandColor }]}>AED {total().toFixed(2)}</Text>
        </View>

        <Pressable style={styles.cashBtn} onPress={() => setConfirmVisible(true)} disabled={!items.length}>
          <Banknote size={16} color="#fff" />
          <Text style={styles.cashBtnText}>
            {cashLabel} · AED {total().toFixed(2)}
          </Text>
        </Pressable>

        <Pressable style={styles.cardBtn} disabled>
          <Lock size={16} color={theme.textFaint} />
          <Text style={styles.cardBtnText}>Pay by Card · coming soon</Text>
        </Pressable>

        {!token && (
          <Text style={styles.signInNudge}>
            Have an account? <Text style={[styles.signInLink, { color: brandColor }]} onPress={() => router.push('/(auth)/login')}>Sign in to track your orders</Text>
          </Text>
        )}
      </View>

      <Modal visible={confirmVisible} animationType="slide" transparent onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !placing && setConfirmVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{confirmTitle}</Text>
            <Text style={styles.modalSub}>{confirmSub}</Text>

            <View style={styles.modalItemsCard}>
              {items.map((item) => (
                <View key={item.cartKey} style={styles.modalItemRow}>
                  <Text style={styles.modalItemName}>
                    {item.quantity}× {item.name}
                  </Text>
                  <Text style={styles.modalItemPrice}>AED {(item.price * item.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>Total</Text>
                <Text style={[styles.modalTotalValue, { color: brandColor }]}>AED {total().toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.modalFinePrint}>Prices include VAT</Text>

            <Pressable style={styles.confirmBtn} onPress={placeOrder} disabled={placing}>
              {placing ? <ActivityIndicator color="#fff" /> : <Banknote size={18} color="#fff" />}
              <Text style={styles.confirmBtnText}>{placing ? 'Placing order…' : confirmButtonLabel}</Text>
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => setConfirmVisible(false)} disabled={placing}>
              <Text style={styles.backBtnText}>Go Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg, padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  phoneCard: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16 },
  phoneInput: { backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: theme.textPrimary, fontSize: 14 },
  phoneHint: { fontSize: 11, color: theme.textMuted, marginTop: 8 },
  footer: { gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 16, fontWeight: '900', color: theme.textPrimary },
  totalValue: { fontSize: 16, fontWeight: '900' },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 15 },
  cashBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: theme.border, borderRadius: 16, paddingVertical: 13, opacity: 0.6 },
  cardBtnText: { color: theme.textFaint, fontWeight: '700', fontSize: 14 },
  signInNudge: { textAlign: 'center', fontSize: 11, color: theme.textFaint, marginTop: 4 },
  signInLink: { fontWeight: '700', textDecorationLine: 'underline' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: theme.textPrimary, textAlign: 'center' },
  modalSub: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginTop: -8 },
  modalItemsCard: { backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border, borderRadius: 16 },
  modalItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalItemName: { color: theme.textSecondary, fontSize: 13 },
  modalItemPrice: { color: theme.textPrimary, fontWeight: '700', fontSize: 13 },
  modalTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  modalTotalLabel: { color: theme.textPrimary, fontWeight: '900' },
  modalTotalValue: { fontWeight: '900', fontSize: 17 },
  modalFinePrint: { textAlign: 'center', fontSize: 10, color: theme.textFaint, marginTop: -8 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 15 },
  confirmBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  backBtn: { alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingVertical: 12 },
  backBtnText: { color: theme.textMuted, fontSize: 14 },
})
