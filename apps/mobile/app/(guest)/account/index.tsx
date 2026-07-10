import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import { Heart } from 'lucide-react-native'
import * as authApi from '../../../src/api/auth.api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useBrandStore, hexToRgbString } from '../../../src/stores/brand.store'
import { GlassButton } from '../../../src/components/GlassButton'
import type { MenuItem } from '../../../src/api/types'
import { order as theme } from '../../../src/theme/colors'

// Mirrors the Favourites + Profile/dietary sections of apps/web/app/account/page.tsx.
// Web's Account page also has Orders/Bookings tabs — those are intentionally NOT duplicated
// here since this app already has top-level "My Orders" and "Book" tabs; folding them into
// Account too would just be the same data in two places with mobile's flatter tab bar.
const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { id: 'vegan', label: 'Vegan', emoji: '🌱' },
  { id: 'halal', label: 'Halal only', emoji: '☪️' },
  { id: 'gluten', label: 'Gluten-free', emoji: '🌾' },
  { id: 'dairy', label: 'Dairy-free', emoji: '🥛' },
  { id: 'nut', label: 'Nut allergy', emoji: '🥜' },
  { id: 'seafood', label: 'No seafood', emoji: '🦐' },
  { id: 'spicy', label: 'Mild spice', emoji: '🌶️' },
]

export default function AccountScreen() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const brandColor = useBrandStore((s) => s.brandColor)
  const [notifyOrder, setNotifyOrder] = useState(true)
  const [notifyBooking, setNotifyBooking] = useState(true)
  const [favorites, setFavorites] = useState<MenuItem[]>([])
  const [dietary, setDietary] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    setNotifyOrder(user.notifOrderUpdates ?? true)
    setNotifyBooking(user.notifBookingReminders ?? true)
    setDietary((user.dietaryTags ?? '').split(',').filter(Boolean))
  }, [user])

  const loadFavorites = useCallback(() => {
    if (!user) return
    authApi.getFavorites().then((favs: any) => setFavorites(Array.isArray(favs) ? favs : [])).catch(() => {})
  }, [user])

  useFocusEffect(loadFavorites)

  async function updateNotif(key: 'notifOrderUpdates' | 'notifBookingReminders', value: boolean) {
    if (key === 'notifOrderUpdates') setNotifyOrder(value)
    else setNotifyBooking(value)
    try {
      await authApi.updateMe({ [key]: value })
    } catch {
      if (key === 'notifOrderUpdates') setNotifyOrder(!value)
      else setNotifyBooking(!value)
    }
  }

  async function toggleDietary(id: string) {
    const next = dietary.includes(id) ? dietary.filter((d) => d !== id) : [...dietary, id]
    setDietary(next)
    try {
      await authApi.updateMe({ dietaryTags: next.join(',') })
    } catch {
      setDietary(dietary) // revert
    }
  }

  async function removeFavorite(item: MenuItem) {
    setFavorites((prev) => prev.filter((f) => f.id !== item.id))
    try {
      await authApi.toggleFavorite(item.id)
    } catch {
      loadFavorites() // revert by refetching
    }
  }

  if (!user) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>You&apos;re browsing as a guest</Text>
        <Text style={styles.gateSubtitle}>Log in to see your order history across visits and save favorites.</Text>
        <View style={{ gap: 10, width: '100%' }}>
          <GlassButton title="Log In" onPress={() => router.push('/(auth)/login')} />
          <GlassButton title="Create Account" variant="translucent" onPress={() => router.push('/(auth)/register')} />
        </View>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: brandColor }]}>
          <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Heart size={14} color="#fb7185" />
          <Text style={styles.sectionTitle}>Favourites</Text>
        </View>
        {favorites.length === 0 ? (
          <Text style={styles.emptyHint}>Tap the heart on any dish to save it here.</Text>
        ) : (
          <View style={styles.favGrid}>
            {favorites.map((item) => (
              <Pressable
                key={item.id}
                style={styles.favCard}
                onPress={() => router.push(`/(guest)/menu/item/${item.id}`)}
              >
                <Image source={{ uri: item.imageUrl }} style={styles.favImage} contentFit="cover" />
                <Pressable style={styles.favHeart} onPress={() => removeFavorite(item)}>
                  <Heart size={13} color="#fb7185" fill="#fb7185" />
                </Pressable>
                <Text style={styles.favName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.favPrice, { color: brandColor }]}>AED {(item.price * 1.05).toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dietary Preferences</Text>
        <Text style={styles.sectionHint}>Shown to the kitchen in your order notes</Text>
        <View style={styles.dietaryGrid}>
          {DIETARY_OPTIONS.map((opt) => {
            const active = dietary.includes(opt.id)
            return (
              <Pressable
                key={opt.id}
                onPress={() => toggleDietary(opt.id)}
                style={[
                  styles.dietaryChip,
                  active && { backgroundColor: `rgba(${hexToRgbString(brandColor)},0.15)`, borderColor: brandColor },
                ]}
              >
                <Text style={styles.dietaryEmoji}>{opt.emoji}</Text>
                <Text style={[styles.dietaryLabel, active && { color: brandColor, fontWeight: '700' }]}>{opt.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Order updates</Text>
            <Text style={styles.toggleHint}>Status changes for your active orders</Text>
          </View>
          <Switch
            value={notifyOrder}
            onValueChange={(v) => updateNotif('notifOrderUpdates', v)}
            trackColor={{ false: theme.pillBg, true: brandColor }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Booking reminders</Text>
            <Text style={styles.toggleHint}>Reminders before your reserved slot</Text>
          </View>
          <Switch
            value={notifyBooking}
            onValueChange={(v) => updateNotif('notifBookingReminders', v)}
            trackColor={{ false: theme.pillBg, true: brandColor }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <GlassButton title="Log Out" variant="translucent" onPress={() => logout()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pageBg },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.pageBg, padding: 24, gap: 16 },
  gateTitle: { fontSize: 19, fontWeight: '900', color: theme.textPrimary, textAlign: 'center' },
  gateSubtitle: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginBottom: 8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 20 },
  name: { color: theme.textPrimary, fontWeight: '800', fontSize: 16 },
  email: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  section: { backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16, gap: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sectionTitle: { color: theme.textPrimary, fontWeight: '800', fontSize: 13 },
  sectionHint: { color: theme.textMuted, fontSize: 11, marginTop: 2, marginBottom: 10 },
  emptyHint: { color: theme.textMuted, fontSize: 13 },
  favGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  favCard: { width: '31%', gap: 4 },
  favImage: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: theme.pillBg },
  favHeart: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  favName: { fontSize: 11, fontWeight: '700', color: theme.textPrimary },
  favPrice: { fontSize: 11, fontWeight: '700' },
  dietaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dietaryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.pillBg, borderWidth: 1, borderColor: theme.border },
  dietaryEmoji: { fontSize: 13 },
  dietaryLabel: { fontSize: 12, color: theme.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 8, gap: 10 },
  toggleLabel: { color: theme.textPrimary, fontWeight: '700', fontSize: 13 },
  toggleHint: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
})
