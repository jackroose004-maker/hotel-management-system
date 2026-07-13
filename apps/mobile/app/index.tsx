import { useEffect } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { Star, ArrowRight, CalendarDays, Clock } from 'lucide-react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth.store'
import { useBrandStore, hexToRgbString } from '../src/stores/brand.store'
import { homeRouteForRole } from '../src/navigation/roleGuard'

const FALLBACK_VIDEO = 'https://assets.mixkit.co/videos/preview/mixkit-chef-seasoning-food-in-a-restaurant-kitchen-43235-large.mp4'
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80'

// Small static preview grid, not a horizontal carousel — a nested horizontal scroller inside
// this screen's vertical ScrollView fought Android's touch dispatch badly in an earlier pass
// (drags never registered reliably). A fixed 2-column grid gives the same "here's what's
// good" signal without any nested-scroll gesture conflict.
const DISH_PREVIEW = [
  { name: 'Malabar biriyani', time: 25, price: 55, img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&q=80' },
  { name: 'Kerala fish curry', time: 20, price: 48, img: 'https://images.unsplash.com/photo-1626508035297-0e8a5f53700b?w=500&q=80' },
  { name: 'Masala dosa', time: 12, price: 22, img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&q=80' },
  { name: 'Appam & stew', time: 15, price: 28, img: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=500&q=80' },
]

// Native-app hero — video/photo confined to a fixed-height header, not the full screen, so
// the content below has real breathing room instead of being crammed against the bottom
// edge. A short dish preview brings back "what's on the menu" (flagged as missing in an
// earlier pass) without reintroducing the horizontal-carousel nesting bug. Every accent
// color reads brand.brandColor live from the store (GET /settings/brand) — never a static
// hex — so a restaurant's color change in staff settings reflects here immediately.
export default function Splash() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, token, ready } = useAuthStore()
  const brand = useBrandStore()
  const brandRgb = hexToRgbString(brand.brandColor)
  const { width: winW } = useWindowDimensions()
  const heroHeight = Math.round(winW * 1.15)

  const videoUri = brand.heroConfig?.videoUrl || FALLBACK_VIDEO
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  useEffect(() => {
    player.play()
  }, [player])

  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={brand.brandColor} />
      </View>
    )
  }

  if (token && user) {
    return <Redirect href={homeRouteForRole(user.role)} />
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={{ height: heroHeight }}>
          <Image source={{ uri: brand.heroConfig?.posterUrl || FALLBACK_POSTER }} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', '#000']}
            locations={[0, 0.4, 0.75, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={[styles.topBar, { top: insets.top + 12 }]}>
            <Pressable style={styles.iconPill} onPress={() => router.push('/scan')} hitSlop={8}>
              <Text style={styles.iconPillText}>Scan QR</Text>
            </Pressable>
            <Pressable style={styles.iconPill} onPress={() => router.push('/(auth)/staff-login')} hitSlop={8}>
              <Text style={styles.iconPillText}>Staff</Text>
            </Pressable>
          </View>

          <View style={styles.heroContent}>
            <View style={styles.badge}>
              <View style={[styles.badgeDot, { backgroundColor: brand.brandColor }]} />
              <Text style={styles.badgeText}>{brand.name.toUpperCase()} · {brand.address ?? 'DUBAI'}</Text>
            </View>

            <Text style={styles.headline}>
              {brand.heroConfig?.line1 || 'Kerala,'}
              {'\n'}
              <Text style={{ color: brand.brandColor }}>{brand.heroConfig?.line2 || 'plated well.'}</Text>
            </Text>
            <Text style={styles.subtext}>
              {brand.heroConfig?.subtext || brand.tagline || 'Authentic South Indian cuisine, delivered to your table.'}
            </Text>

            <View style={styles.ctaRow}>
              <Pressable style={[styles.ctaPrimary, { backgroundColor: brand.brandColor }]} onPress={() => router.push('/(guest)/menu')}>
                <Text style={styles.ctaPrimaryText}>{brand.heroConfig?.ctaLabel || 'Order now'}</Text>
                <ArrowRight size={15} color="#000" />
              </Pressable>
              {brand.bookingsEnabled && (
                <Pressable style={styles.ctaIcon} onPress={() => router.push('/(guest)/book')} hitSlop={6}>
                  <CalendarDays size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <View style={styles.statTop}>
                <Text style={styles.statValue}>4.8</Text>
                <Star size={11} color={brand.brandColor} fill={brand.brandColor} />
              </View>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>18m</Text>
              <Text style={styles.statLabel}>Prep</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>24h</Text>
              <Text style={styles.statLabel}>Open</Text>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Signature dishes</Text>
            <Pressable style={styles.sectionLink} onPress={() => router.push('/(guest)/menu')}>
              <Text style={[styles.sectionLinkText, { color: brand.brandColor }]}>Full menu</Text>
              <ArrowRight size={12} color={brand.brandColor} />
            </Pressable>
          </View>

          <View style={styles.dishGrid}>
            {DISH_PREVIEW.map((dish) => (
              <Pressable key={dish.name} style={styles.dishCard} onPress={() => router.push('/(guest)/menu')}>
                <Image source={{ uri: dish.img }} style={styles.dishImage} contentFit="cover" />
                <Text style={styles.dishName} numberOfLines={1}>{dish.name}</Text>
                <View style={styles.dishMeta}>
                  <View style={styles.dishTime}>
                    <Clock size={10} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.dishTimeText}>{dish.time}m</Text>
                  </View>
                  <Text style={[styles.dishPrice, { color: brand.brandColor }]}>AED {dish.price}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.loginLink}>
              Already have an account? <Text style={{ color: `rgba(${brandRgb},1)`, fontWeight: '500' }}>Log in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },

  topBar: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  iconPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  iconPillText: { color: '#fff', fontSize: 11, fontWeight: '500' },

  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 32, paddingHorizontal: 24 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500', letterSpacing: 1.2 },

  headline: { color: '#fff', fontSize: 40, fontWeight: '500', lineHeight: 44, letterSpacing: -1 },
  subtext: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 12, lineHeight: 20, maxWidth: 280 },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  ctaPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
  ctaPrimaryText: { color: '#000', fontWeight: '500', fontSize: 15 },
  ctaIcon: { width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },

  body: { paddingHorizontal: 24, paddingTop: 28 },

  statsRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 28 },
  stat: { flex: 1 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: '#fff', fontWeight: '500', fontSize: 15 },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 12 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '500' },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionLinkText: { fontSize: 12, fontWeight: '500' },

  dishGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 32 },
  dishCard: { width: '48%' },
  dishImage: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#111' },
  dishName: { color: '#fff', fontSize: 13, fontWeight: '500', marginTop: 8 },
  dishMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  dishTime: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dishTimeText: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  dishPrice: { fontSize: 12, fontWeight: '500' },

  loginLink: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' },
})
