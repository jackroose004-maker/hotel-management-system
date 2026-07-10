import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Clock, Minus, Plus, MapPin } from 'lucide-react-native'
import * as bookingsApi from '../../../src/api/bookings.api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { GlassButton } from '../../../src/components/GlassButton'
import type { BookingSlot } from '../../../src/api/bookings.api'
import { order as theme } from '../../../src/theme/colors'

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}
function dayLabel(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}
function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

const WEEK = Array.from({ length: 7 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() + i)
  return d
})

export default function BookScreen() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const [date, setDate] = useState(WEEK[0])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [partySize, setPartySize] = useState(2)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<bookingsApi.Booking | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSelectedTime(null)
    try {
      const res = await bookingsApi.getAvailability(formatDate(date))
      setSlots(res.slots)
      setBookingsEnabled(res.bookingsEnabled)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    if (token) load()
  }, [load, token])

  async function submit() {
    if (!selectedTime) return
    setSubmitting(true)
    try {
      const booking = await bookingsApi.createBooking({
        partySize,
        slotDate: formatDate(date),
        slotTime: selectedTime,
        notes: notes || undefined,
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
      setConfirmed(booking)
    } catch (err: any) {
      Alert.alert('Could not book', err.message ?? 'Please try a different slot')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <View style={styles.center}>
        <Text style={styles.gateTitle}>Sign in to book a table</Text>
        <Text style={styles.gateSubtitle}>Reservations require an account so we can confirm your slot.</Text>
        <GlassButton title="Log In" onPress={() => router.push('/(auth)/login')} />
      </View>
    )
  }

  if (confirmed) {
    return (
      <View style={styles.center}>
        <View style={styles.confirmBadge}>
          <Text style={styles.confirmBadgeText}>Confirmed</Text>
        </View>
        <Text style={styles.gateTitle}>Table reserved!</Text>
        <Text style={styles.gateSubtitle}>Table held for 15 minutes from your slot time.</Text>
        <View style={styles.ticket}>
          <TicketRow label="Date" value={new Date(confirmed.slotDate).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} />
          <TicketRow label="Time" value={slotLabel(confirmed.slotTime)} accent />
          <TicketRow label="Guests" value={`${confirmed.partySize} ${confirmed.partySize === 1 ? 'guest' : 'guests'}`} />
        </View>
        <GlassButton title="Done" onPress={() => { setConfirmed(null); router.replace('/(guest)/menu') }} />
      </View>
    )
  }

  const futureSlots = slots.filter((s) => !s.isPast)

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>Reserve a Table</Text>
          <View style={styles.heroMeta}>
            <MapPin size={12} color={theme.textMuted} />
            <Text style={styles.heroMetaText}>Al Manzil Hotel · Dubai, UAE</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
          {WEEK.map((d, i) => {
            const isSelected = formatDate(d) === formatDate(date)
            return (
              <Pressable key={i} onPress={() => setDate(d)} style={[styles.dayCell, isSelected && styles.dayCellActive]}>
                <Text style={[styles.dayLabel, isSelected && styles.dayLabelActive]}>{i === 0 ? 'Today' : dayLabel(d)}</Text>
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberActive]}>{d.getDate()}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={styles.slotsHeader}>
          <View style={styles.slotsHeaderLeft}>
            <Clock size={13} color={theme.brand} />
            <Text style={styles.slotsHeaderText}>{date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 30 }} />
        ) : !bookingsEnabled ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🚶</Text>
            <Text style={styles.emptyTitle}>Walk-in only right now</Text>
            <Text style={styles.emptySubtitle}>Online bookings are paused. Come in and we&apos;ll seat you directly.</Text>
          </View>
        ) : futureSlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>😴</Text>
            <Text style={styles.emptySubtitle}>No slots for this date</Text>
          </View>
        ) : (
          <View style={styles.slotGrid}>
            {futureSlots.map((slot) => {
              const disabled = slot.isFull
              const selected = selectedTime === slot.time
              return (
                <Pressable
                  key={slot.time}
                  disabled={disabled}
                  onPress={() => setSelectedTime(slot.time)}
                  style={[styles.slot, selected && styles.slotSelected, disabled && styles.slotDisabled]}
                >
                  <Text style={[styles.slotText, selected && styles.slotTextSelected, disabled && styles.slotTextDisabled]}>
                    {slotLabel(slot.time)}
                  </Text>
                  {slot.isWalkInOnly && <Text style={styles.slotHint}>Peak — walk-in</Text>}
                </Pressable>
              )
            })}
          </View>
        )}

        {selectedTime && (
          <>
            <View style={styles.partyCard}>
              <Text style={styles.cardLabel}>Party Size</Text>
              <View style={styles.partyRow}>
                <Pressable style={styles.partyBtn} onPress={() => setPartySize((p) => Math.max(1, p - 1))}>
                  <Minus size={16} color={theme.textPrimary} />
                </Pressable>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.partyNumber}>{partySize}</Text>
                  <Text style={styles.partyHint}>{partySize === 1 ? 'guest' : 'guests'}</Text>
                </View>
                <Pressable style={styles.partyBtn} onPress={() => setPartySize((p) => Math.min(12, p + 1))}>
                  <Plus size={16} color={theme.textPrimary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.notesCard}>
              <Text style={styles.cardLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anniversary, high chair needed, etc."
                placeholderTextColor={theme.textFaint}
                multiline
              />
            </View>

            <Text style={styles.arriveNotice}>
              ⏱ Please arrive within 15 minutes of your slot. After that, your table may be released to walk-in guests.
            </Text>

            <GlassButton title={`Reserve for ${partySize} at ${slotLabel(selectedTime)}`} onPress={submit} loading={submitting} />
          </>
        )}
      </ScrollView>
    </View>
  )
}

function TicketRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.ticketRow}>
      <Text style={styles.ticketLabel}>{label}</Text>
      <Text style={[styles.ticketValue, accent && { color: theme.brand }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.pageBg, padding: 24, gap: 14 },
  gateTitle: { fontSize: 19, fontWeight: '900', color: theme.textPrimary, textAlign: 'center' },
  gateSubtitle: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginBottom: 6 },
  confirmBadge: { backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  confirmBadgeText: { color: '#34d399', fontWeight: '800', fontSize: 11 },
  ticket: { width: '100%', backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 10, marginVertical: 6 },
  ticketRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ticketLabel: { color: theme.textMuted, fontSize: 12 },
  ticketValue: { color: theme.textPrimary, fontWeight: '700', fontSize: 13 },
  heroHeader: { marginBottom: 20 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: theme.textPrimary, marginBottom: 6 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { color: theme.textMuted, fontSize: 12 },
  weekStrip: { gap: 8, marginBottom: 18 },
  dayCell: { width: 54, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, gap: 2 },
  dayCellActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  dayLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  dayLabelActive: { color: 'rgba(0,0,0,0.6)' },
  dayNumber: { fontSize: 16, fontWeight: '800', color: theme.textSecondary },
  dayNumberActive: { color: '#000' },
  slotsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  slotsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotsHeaderText: { color: theme.textPrimary, fontWeight: '700', fontSize: 13 },
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 6 },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { color: theme.textPrimary, fontWeight: '700' },
  emptySubtitle: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31%', borderRadius: 12, padding: 10, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border },
  slotSelected: { backgroundColor: theme.brand, borderColor: theme.brand },
  slotDisabled: { opacity: 0.4 },
  slotText: { color: theme.textSecondary, fontWeight: '700', fontSize: 12.5 },
  slotTextSelected: { color: '#000' },
  slotTextDisabled: { color: theme.textFaint },
  slotHint: { fontSize: 9, color: theme.textFaint, marginTop: 2 },
  partyCard: { backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16, marginTop: 20 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 10 },
  partyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  partyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  partyNumber: { fontSize: 32, fontWeight: '900', color: theme.textPrimary },
  partyHint: { fontSize: 11, color: theme.textMuted },
  notesCard: { backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16, marginTop: 14 },
  notesInput: { color: theme.textPrimary, fontSize: 14, minHeight: 44, textAlignVertical: 'top' },
  arriveNotice: { fontSize: 11.5, color: '#fdba74', backgroundColor: 'rgba(154,52,18,0.1)', borderWidth: 1, borderColor: 'rgba(154,52,18,0.25)', borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 16, lineHeight: 17 },
})
