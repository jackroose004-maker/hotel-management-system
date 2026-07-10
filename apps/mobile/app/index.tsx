import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, ViewToken } from 'react-native'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { Star, ArrowRight, Clock } from 'lucide-react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth.store'
import { useBrandStore } from '../src/stores/brand.store'
import { homeRouteForRole } from '../src/navigation/roleGuard'
import { glass } from '../src/theme/colors'

const FALLBACK_VIDEO = 'https://assets.mixkit.co/videos/preview/mixkit-chef-seasoning-food-in-a-restaurant-kitchen-43235-large.mp4'
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80'

// Mirrors DISHES_FALLBACK / SignatureDishesMobile from apps/web/app/page.tsx — same 6 dishes,
// same copy, used unconfigured (no per-restaurant heroConfig dish overrides on mobile yet).
const DISHES_FALLBACK = [
  { name: 'Malabar Biriyani', desc: 'Fragrant basmati with tender chicken & caramelised onions', price: '55', time: 25, img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=700&q=80' },
  { name: 'Masala Dosa', desc: 'Crispy golden crepe, spiced potato filling, fresh chutneys', price: '22', time: 12, img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=700&q=80' },
  { name: 'Appam & Stew', desc: 'Lacy rice pancakes with velvety coconut milk stew', price: '28', time: 15, img: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=700&q=80' },
  { name: 'Kerala Fish Curry', desc: 'Spiced red curry with wild-caught fish & kudampuli', price: '48', time: 20, img: 'https://images.unsplash.com/photo-1626508035297-0e8a5f53700b?w=700&q=80' },
  { name: 'Prawn Fry', desc: 'Crispy prawns in Kerala masala with fresh curry leaves', price: '65', time: 18, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&q=80' },
  { name: 'Puttu & Kadala', desc: 'Steamed rice cylinders with black chickpea curry', price: '22', time: 10, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&q=80' },
]

// Mirrors AMBIENCE from apps/web/app/page.tsx — same 4 fallback photos, 2x2 grid on mobile.
const AMBIENCE = [
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1400&q=90',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=88',
  'https://images.unsplash.com/photo-1578474846132-4be0e60b7952?w=900&q=88',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=90',
]

const CARD_GAP = 16

// Mirrors the actual hero section on apps/web/app/page.tsx (not a generic splash) — looping
// video background, "Now Open" badge, two-line headline (brand-colored italic second line),
// dual CTA (Order Now / Reserve a Table), and a stats row. Content comes from the live
// heroConfig (GET /settings), same as web, with the same fallback copy web uses when a
// restaurant hasn't customized it.
export default function Splash() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, token, ready } = useAuthStore()
  const brand = useBrandStore()
  // useWindowDimensions (not module-scope Dimensions.get()) — the latter runs once at bundle
  // eval time, before native dimensions are reliably available under Fabric/bridgeless mode.
  const { width: winW } = useWindowDimensions()
  const CARD_W = Math.min(winW * 0.86, 360)

  const videoUri = brand.heroConfig?.videoUrl || FALLBACK_VIDEO
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  useEffect(() => {
    player.play()
  }, [player])

  const [activeDish, setActiveDish] = useState(0)
  const onDishesViewChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setActiveDish(viewableItems[0].index)
  }).current

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
      {/* Poster renders first (underneath) so it shows while the video loads, then the
          opaque video frame naturally covers it once playback starts — a poster added
          AFTER VideoView in the tree would permanently hide the video regardless of
          playback state, which was the bug here. */}
      {/* pointerEvents="none" on all three: they're fixed decorative backdrop layers spanning
          the full (non-scrolling) container, so every touch anywhere on this screen — including
          on scrolled-in content far below the fold — physically overlaps them. Android's
          SurfaceView (which expo-video's VideoView renders through) can swallow touches meant
          for content declared after it in the tree regardless of visual z-order, since native
          SurfaceViews composite outside RN's normal view hierarchy. This was silently breaking
          every tap/swipe below the hero (dish carousel swipe, ambience taps, etc.) — confirmed
          via onTouchStart logging that literally nothing below this point ever received a touch. */}
      <Image source={{ uri: brand.heroConfig?.posterUrl || FALLBACK_POSTER }} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.98)']}
        locations={[0, 0.45, 0.75, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* style={{ flex: 1 }} is required here, separately from contentContainerStyle — without
          it ScrollView has no bounded viewport height to compare content against (it's a
          sibling of absolutely-positioned views, not a normal flex child), so it silently
          never scrolls even when content overflows the screen. This was the actual bug. */}
      <ScrollView style={styles.scrollFlex} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>{brand.heroConfig?.badgeText || `Now Open · ${brand.address ?? 'Dubai, UAE'}`}</Text>
        </View>

        <Text style={styles.line1}>{brand.heroConfig?.line1 || 'Taste of'}</Text>
        <Text style={[styles.line2, { color: brand.brandColor }]}>{brand.heroConfig?.line2 || 'Kerala'}</Text>
        <Text style={styles.subtext}>{brand.heroConfig?.subtext || brand.tagline || 'Authentic South Indian cuisine · Dubai'}</Text>

        <View style={styles.ctaRow}>
          <Pressable style={[styles.ctaPrimary, { backgroundColor: brand.brandColor }]} onPress={() => router.push('/(guest)/menu')}>
            <Text style={styles.ctaPrimaryText}>{brand.heroConfig?.ctaLabel || 'Order Now'}</Text>
            <ArrowRight size={14} color="#000" />
          </Pressable>
          {brand.bookingsEnabled && (
            <Pressable style={styles.ctaSecondary} onPress={() => router.push('/(guest)/book')}>
              <Text style={styles.ctaSecondaryText}>{brand.heroConfig?.ctaSecondaryLabel || 'Reserve a Table'}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>4.8</Text>
            <View style={styles.starsRow}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={9} color={brand.brandColor} fill={brand.brandColor} />
              ))}
            </View>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>18m</Text>
            <Text style={styles.statLabel}>Avg prep time</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>24h</Text>
            <Text style={styles.statLabel}>Opens daily</Text>
          </View>
        </View>

        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push('/scan')}>
            <Text style={styles.footerLink}>Scan Table QR</Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.footerLink}>Log In</Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable onPress={() => router.push('/(auth)/staff-login')}>
            <Text style={styles.footerLink}>Staff Login</Text>
          </Pressable>
        </View>

        {/* Below-the-fold sections — matches web's Signature Dishes + Ambience sections
            (apps/web/app/page.tsx). Kept inside the same ScrollView as the hero content
            (not a separate scroll region) so the whole landing page scrolls as one — the
            video/gradient backdrop above is absolutely positioned to the outer container,
            so it stays pinned behind the hero content while these sections scroll up over
            solid black, matching the visual effect of web's fixed-hero layout. */}
      <View style={styles.belowFold}>
        <View style={styles.sectionHead}>
          <Text style={[styles.eyebrow, { color: brand.brandColor }]}>
            {brand.heroConfig?.dishesSubtext || 'Signature Dishes'}
          </Text>
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>
              {brand.heroConfig?.dishesHeadline || "Dishes you'll dream about."}
            </Text>
            <Pressable style={styles.fullMenuLink} onPress={() => router.push('/(guest)/menu')}>
              <Text style={[styles.fullMenuText, { color: brand.brandColor }]}>Full Menu</Text>
              <ArrowRight size={13} color={brand.brandColor} />
            </Pressable>
          </View>
        </View>

        <FlatList
          data={DISHES_FALLBACK}
          keyExtractor={(d, i) => `${d.name}-${i}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Nested inside the hero's vertical ScrollView — without this, Android's touch
          // dispatch hands every drag to the outer (vertical) scrollable before this
          // (horizontal, opposite-axis) list ever gets a chance, so the carousel never moves.
          nestedScrollEnabled
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 24, gap: CARD_GAP }}
          onViewableItemsChanged={onDishesViewChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index }) => (
            <Pressable
              style={[styles.dishCard, { width: CARD_W }]}
              onPress={() => router.push('/(guest)/menu')}
            >
              <Image source={{ uri: item.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.92)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
              <Text style={[styles.dishIndex, { color: brand.brandColor }]}>
                SIGNATURE · {String(index + 1).padStart(2, '0')}
              </Text>
              <View style={styles.dishInfo}>
                <Text style={styles.dishName}>{item.name}</Text>
                <Text style={styles.dishDesc} numberOfLines={2}>{item.desc}</Text>
                <View style={styles.dishFooter}>
                  <View style={styles.dishTime}>
                    <Clock size={11} color="rgba(255,255,255,0.35)" />
                    <Text style={styles.dishTimeText}>{item.time} min</Text>
                  </View>
                  <View style={styles.dishTaste}>
                    <Text style={[styles.dishTasteText, { color: brand.brandColor }]}>Taste This</Text>
                    <ArrowRight size={12} color={brand.brandColor} />
                  </View>
                </View>
              </View>
            </Pressable>
          )}
        />

        <View style={styles.dotsRow}>
          {DISHES_FALLBACK.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { width: i === activeDish ? 24 : 6, backgroundColor: i === activeDish ? brand.brandColor : 'rgba(255,255,255,0.18)' },
              ]}
            />
          ))}
        </View>

        <View style={[styles.sectionHead, styles.ambienceHead]}>
          <Text style={[styles.eyebrow, styles.eyebrowCenter, { color: brand.brandColor }]}>
            {brand.heroConfig?.ambienceTagline || 'The Space'}
          </Text>
          <Text style={[styles.sectionTitle, styles.sectionTitleCenter]}>
            {brand.heroConfig?.ambienceHeadline || 'Come for the food.'}
            {'\n'}
            <Text style={{ color: brand.brandColor }}>
              {brand.heroConfig?.ambienceHeadlinePart2 || 'Stay for the feeling.'}
            </Text>
          </Text>
        </View>

        <View style={styles.ambienceGrid}>
          {AMBIENCE.map((src, i) => (
            <View key={i} style={[styles.ambiencePhotoBox, { aspectRatio: 4 / 5 }]}>
              <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
          ))}
        </View>
      </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrollFlex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 22,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: glass.brand },
  badgeText: { color: glass.textPrimary, fontSize: 12, fontWeight: '600' },
  line1: { color: '#fff', fontSize: 52, fontWeight: '900', textAlign: 'center', lineHeight: 54, letterSpacing: -1 },
  line2: { fontSize: 52, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', lineHeight: 54, letterSpacing: -1 },
  subtext: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '300', textAlign: 'center', marginTop: 16 },
  ctaRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' },
  ctaPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  ctaPrimaryText: { color: '#000', fontWeight: '800', fontSize: 15 },
  ctaSecondary: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  ctaSecondaryText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 15 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 36 },
  stat: { alignItems: 'center' },
  statValue: { color: '#fff', fontWeight: '900', fontSize: 18 },
  starsRow: { flexDirection: 'row', gap: 1, marginTop: 3 },
  statLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 40 },
  footerLink: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  footerDot: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },

  belowFold: { backgroundColor: '#000', paddingTop: 72, paddingBottom: 40 },
  sectionHead: { paddingHorizontal: 24, marginBottom: 20 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 8 },
  eyebrowCenter: { textAlign: 'center' },
  sectionTitle: { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 30, letterSpacing: -0.5, flexShrink: 1 },
  sectionTitleCenter: { textAlign: 'center', fontSize: 30, lineHeight: 34 },
  fullMenuLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  fullMenuText: { fontSize: 13, fontWeight: '700' },

  dishCard: {
    aspectRatio: 3 / 4.2,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111',
    justifyContent: 'space-between',
    padding: 18,
  },
  dishIndex: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  dishInfo: { gap: 6 },
  dishName: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  dishDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18 },
  dishFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  dishTime: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dishTimeText: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  dishTaste: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dishTasteText: { fontSize: 12, fontWeight: '700' },

  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  dot: { height: 6, borderRadius: 3 },

  ambienceHead: { marginTop: 56, marginBottom: 24 },
  // Classic space-between + percentage-width 2-column grid — avoids `gap` combined with
  // dynamically-computed child widths, which produced a broken single-column layout (each
  // photo claimed a full row instead of pairing up) despite the width math being correct.
  ambienceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 24, rowGap: 10 },
  ambiencePhotoBox: { width: '48%', borderRadius: 14, backgroundColor: '#111', overflow: 'hidden' },
})
