import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { ChevronLeft, Clock, Heart, ShoppingCart } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as menuApi from '../../../src/api/menu.api'
import { useCartStore } from '../../../src/stores/cart.store'
import { useBrandStore, hexToRgbString } from '../../../src/stores/brand.store'
import type { MenuCategory, MenuItem } from '../../../src/api/types'
import { order } from '../../../src/theme/colors'

// Mirrors the ACTUAL mobile web menu (apps/web/app/menu/page.tsx): one continuous scroll
// through every category as a labeled section (not a tab-filtered single-category view,
// which is what this screen was before — the category pill rail just jumps you to that
// section, all categories stay mounted and scrollable). All items are fetched once on
// mount instead of on-demand per pill tap, which also fixes the jank from before: tapping
// a pill used to trigger a fresh network fetch + re-render every time.
function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2))
  return out
}

interface Section {
  title: string
  id: string
  data: MenuItem[][] // rows of up to 2 items
}

export default function MenuScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const brand = useBrandStore()
  const listRef = useRef<SectionList<MenuItem[], Section>>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItem[]>>({});
  const [loading, setLoading] = useState(true)
  const { items: cartItems } = useCartStore()
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0)
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cats = await menuApi.getCategories()
      setCategories(cats)
      // Fetch every category's items in parallel once — a single restaurant menu is small
      // enough (a few dozen to ~100 items total) that this is one fast burst of requests
      // instead of a fetch-on-every-tap loop.
      const results = await Promise.all(cats.map((c) => menuApi.getCategoryItems(c.id)))
      const map: Record<string, MenuItem[]> = {}
      cats.forEach((c, i) => {
        map[c.id] = results[i].items
      })
      setItemsByCategory(map)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sections: Section[] = useMemo(
    () =>
      categories
        .filter((c) => (itemsByCategory[c.id]?.length ?? 0) > 0)
        .map((c) => ({ title: c.name, id: c.id, data: chunkPairs(itemsByCategory[c.id] ?? []) })),
    [categories, itemsByCategory],
  )

  function jumpToCategory(categoryId: string) {
    const sectionIndex = sections.findIndex((s) => s.id === categoryId)
    if (sectionIndex === -1) return
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, animated: true })
  }

  return (
    <View style={styles.container}>
      {/* Sticky header: brand + cart pill */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          {/* Explicit back-chevron icon, not just tappable text — plain text alone isn't a
              strong enough "this is a button" signal, which is why it wasn't discoverable. */}
          <Pressable style={styles.homeLink} onPress={() => router.push('/')} hitSlop={8}>
            <ChevronLeft size={20} color={order.textPrimary} />
            <View>
              <Text style={styles.brandName}>{brand.name.toUpperCase()}</Text>
              <Text style={[styles.brandTagline, { color: brand.brandColor }]}>{brand.tagline || 'Restaurant'}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.cartPill, cartCount > 0 && { backgroundColor: brand.brandColor, borderColor: brand.brandColor }]}
            onPress={() => router.push('/(guest)/cart')}
          >
            <ShoppingCart size={15} color={cartCount > 0 ? '#000' : order.textSecondary} />
            {cartCount > 0 && (
              <Text style={styles.cartPillText}>
                {cartCount} · AED {cartTotal.toFixed(0)}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Category pill rail — jumps to the section, does not filter. `style={{ flexGrow: 0 }}`
            keeps this ScrollView's own bounding box from being miscalculated inside the
            header (same class of issue as the hero screen's missing ScrollView style —
            see app/index.tsx), which is what made it feel unresponsive/inconsistent. */}
        <ScrollView
          horizontal
          style={styles.pillRailScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRail}
        >
          {categories.map((c) => (
            <Pressable key={c.id} onPress={() => jumpToCategory(c.id)} style={styles.pill}>
              <Text style={styles.pillText}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={brand.brandColor} style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(row, idx) => row.map((i) => i.id).join('-') || String(idx)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
          onScrollToIndexFailed={() => {}}
          decelerationRate="normal"
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{(itemsByCategory[section.id] ?? []).length} dishes</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.map((item) => (
                <FoodCard
                  key={item.id}
                  item={item}
                  qty={cartItems.filter((ci) => ci.menuItemId === item.id).reduce((s, ci) => s + ci.quantity, 0)}
                  onPress={() => router.push(`/(guest)/menu/item/${item.id}`)}
                />
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          )}
        />
      )}

      {cartCount > 0 && (
        <Pressable style={[styles.cartBar, { backgroundColor: brand.brandColor }]} onPress={() => router.push('/(guest)/cart')}>
          <Text style={styles.cartBarText}>
            View Cart · {cartCount} item{cartCount === 1 ? '' : 's'} · AED {cartTotal.toFixed(2)}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

function FoodCard({ item, qty, onPress }: { item: MenuItem; qty: number; onPress: () => void }) {
  const brandColor = useBrandStore((s) => s.brandColor)
  const brandRgb = hexToRgbString(brandColor)
  const vatInclusive = item.price * 1.05
  const modifierPreview = item.modifierGroups?.flatMap((g) => g.options).slice(0, 3) ?? []

  return (
    <Pressable
      style={[styles.card, qty > 0 && { backgroundColor: `rgba(${brandRgb},0.06)`, borderColor: `rgba(${brandRgb},0.4)` }]}
      onPress={onPress}
      disabled={!item.isAvailable}
    >
      <View style={styles.cardImageWrap}>
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} contentFit="cover" transition={150} />
        <Pressable style={styles.favHeart} hitSlop={8}>
          <Heart size={13} color="#fff" />
        </Pressable>
        {qty > 0 && (
          <View style={[styles.qtyBadge, { backgroundColor: brandColor }]}>
            <Text style={styles.qtyBadgeText}>{qty}</Text>
          </View>
        )}
        {!item.isAvailable && (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Unavailable</Text>
          </View>
        )}
        <View style={styles.cardPriceRow}>
          <Text style={[styles.cardPrice, { color: brandColor }]}>AED {vatInclusive.toFixed(2)}</Text>
          <View style={styles.prepTime}>
            <Clock size={9} color="rgba(255,255,255,0.75)" />
            <Text style={styles.prepTimeText}>{item.prepTimeMins}m</Text>
          </View>
        </View>
      </View>

      <Text style={styles.cardName} numberOfLines={1}>
        {item.name}
      </Text>
      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      {modifierPreview.length > 0 && (
        <View style={styles.modTagRow}>
          {modifierPreview.map((opt) => (
            <View key={opt.id} style={styles.modTag}>
              <Text style={styles.modTagText} numberOfLines={1}>
                {opt.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: order.pageBg },
  header: { backgroundColor: order.headerBg, borderBottomWidth: 1, borderBottomColor: order.borderFaint },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  homeLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  brandName: { color: order.textPrimary, fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  brandTagline: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  cartPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: order.pillBg, borderWidth: 1, borderColor: order.border },
  cartPillText: { color: '#000', fontWeight: '800', fontSize: 12 },
  pillRailScroll: { flexGrow: 0, flexShrink: 0 },
  pillRail: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pillText: { color: order.textMuted, fontWeight: '700', fontSize: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 20, marginBottom: 12 },
  sectionTitle: { color: order.textPrimary, fontWeight: '900', fontSize: 19 },
  sectionCount: { color: order.textFaint, fontSize: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: order.cardBg, borderWidth: 1, borderColor: order.border, paddingBottom: 10 },
  cardImageWrap: { height: 110, width: '100%', position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  favHeart: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  qtyBadge: { position: 'absolute', top: 6, right: 6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  qtyBadgeText: { color: '#000', fontWeight: '900', fontSize: 11 },
  unavailableOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  unavailableText: { color: '#fff', fontWeight: '800', fontSize: 11, backgroundColor: 'rgba(239,68,68,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  cardPriceRow: { position: 'absolute', left: 8, right: 8, bottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontWeight: '900', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  prepTime: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  prepTimeText: { color: 'rgba(255,255,255,0.85)', fontSize: 9 },
  cardName: { color: order.textPrimary, fontWeight: '800', fontSize: 13, paddingHorizontal: 10, paddingTop: 8 },
  cardDesc: { color: order.textMuted, fontSize: 11, paddingHorizontal: 10, marginTop: 3, lineHeight: 15 },
  modTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 10, marginTop: 6 },
  modTag: { backgroundColor: order.pillBg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '100%' },
  modTagText: { color: order.textMuted, fontSize: 9, fontWeight: '600' },
  cartBar: { position: 'absolute', bottom: 16, left: 16, right: 16, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  cartBarText: { color: '#000', fontWeight: '800', fontSize: 14 },
})
