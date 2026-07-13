import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { ChevronLeft, Clock, Plus, ShoppingBag } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as menuApi from '../../../src/api/menu.api'
import { useCartStore } from '../../../src/stores/cart.store'
import { useBrandStore, hexToRgbString } from '../../../src/stores/brand.store'
import type { MenuCategory, MenuItem } from '../../../src/api/types'
import { order } from '../../../src/theme/colors'

interface Section {
  title: string
  id: string
  data: MenuItem[]
}

// Compact row-card menu — a native food-delivery pattern (thumbnail + name + one-tap add),
// not the wide image-card grid the web version uses. Same category-jump / continuous-scroll
// structure as before, restyled for a phone-native feel. Every accent (active chip, price
// text, quick-add circle) reads brand.brandColor live — never a static hex — so a brand
// color change in staff settings shows up here immediately.
export default function MenuScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const brand = useBrandStore()
  const brandRgb = hexToRgbString(brand.brandColor)
  const listRef = useRef<SectionList<MenuItem, Section>>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined)
  const { items: cartItems, addItem } = useCartStore()
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0)
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cats = await menuApi.getCategories()
      setCategories(cats)
      const results = await Promise.all(cats.map((c) => menuApi.getCategoryItems(c.id)))
      const map: Record<string, MenuItem[]> = {}
      cats.forEach((c, i) => {
        map[c.id] = results[i].items
      })
      setItemsByCategory(map)
      if (cats.length) setActiveCategory(cats[0].id)
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
        .map((c) => ({ title: c.name, id: c.id, data: itemsByCategory[c.id] ?? [] })),
    [categories, itemsByCategory],
  )

  function jumpToCategory(categoryId: string) {
    const sectionIndex = sections.findIndex((s) => s.id === categoryId)
    if (sectionIndex === -1) return
    setActiveCategory(categoryId)
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, animated: true })
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { section?: Section }[] }) => {
    const first = viewableItems.find((v) => v.section)?.section
    if (first) setActiveCategory(first.id)
  }).current

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.homeLink} onPress={() => router.push('/')} hitSlop={8}>
            <ChevronLeft size={20} color={order.textPrimary} />
            <Text style={styles.brandName}>{brand.name}</Text>
          </Pressable>
          <Pressable
            style={[styles.cartPill, cartCount > 0 && { backgroundColor: brand.brandColor, borderColor: brand.brandColor }]}
            onPress={() => router.push('/(guest)/cart')}
          >
            <ShoppingBag size={15} color={cartCount > 0 ? '#000' : order.textSecondary} />
            {cartCount > 0 && <Text style={styles.cartPillText}>{cartCount}</Text>}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          style={styles.pillRailScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRail}
        >
          {categories.map((c) => {
            const isActive = c.id === activeCategory
            return (
              <Pressable
                key={c.id}
                onPress={() => jumpToCategory(c.id)}
                style={[styles.pill, isActive && { backgroundColor: brand.brandColor, borderColor: brand.brandColor }]}
              >
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{c.name}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={brand.brandColor} style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 140 }}
          stickySectionHeadersEnabled={false}
          onScrollToIndexFailed={() => {}}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 30 }}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={9}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => (
            <FoodRow
              item={item}
              qty={cartItems.filter((ci) => ci.menuItemId === item.id).reduce((s, ci) => s + ci.quantity, 0)}
              brandColor={brand.brandColor}
              brandRgb={brandRgb}
              onPress={() => router.push(`/(guest)/menu/item/${item.id}`)}
              onQuickAdd={() => {
                if (item.modifierGroups?.length) {
                  router.push(`/(guest)/menu/item/${item.id}`)
                  return
                }
                addItem({ menuItemId: item.id, name: item.name, basePrice: item.price, modifiers: [], prepTimeMins: item.prepTimeMins })
              }}
            />
          )}
        />
      )}

      {cartCount > 0 && (
        <Pressable
          style={[styles.cartBar, { backgroundColor: brand.brandColor, bottom: insets.bottom + 84 }]}
          onPress={() => router.push('/(guest)/cart')}
        >
          <Text style={styles.cartBarText}>
            View cart · {cartCount} item{cartCount === 1 ? '' : 's'}
          </Text>
          <Text style={styles.cartBarTotal}>AED {cartTotal.toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  )
}

function FoodRow({
  item,
  qty,
  brandColor,
  brandRgb,
  onPress,
  onQuickAdd,
}: {
  item: MenuItem
  qty: number
  brandColor: string
  brandRgb: string
  onPress: () => void
  onQuickAdd: () => void
}) {
  const vatInclusive = item.price * 1.05

  return (
    <Pressable
      style={[styles.row, qty > 0 && { backgroundColor: `rgba(${brandRgb},0.06)`, borderColor: `rgba(${brandRgb},0.35)` }]}
      onPress={onPress}
      disabled={!item.isAvailable}
    >
      <View style={styles.thumbWrap}>
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" transition={150} />
        {!item.isAvailable && (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Sold out</Text>
          </View>
        )}
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.rowMeta}>
          <Clock size={10} color={order.textFaint} />
          <Text style={styles.rowMetaText}>{item.prepTimeMins} min</Text>
        </View>
      </View>

      <View style={styles.rowRight}>
        <Text style={[styles.rowPrice, { color: brandColor }]}>AED {vatInclusive.toFixed(0)}</Text>
        <Pressable
          style={[styles.addCircle, { backgroundColor: qty > 0 ? brandColor : order.pillBg, borderColor: qty > 0 ? brandColor : order.border }]}
          onPress={onQuickAdd}
          hitSlop={8}
        >
          {qty > 0 ? <Text style={styles.addCircleQty}>{qty}</Text> : <Plus size={13} color={order.textSecondary} />}
        </Pressable>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: order.pageBg },
  header: { backgroundColor: order.headerBg, borderBottomWidth: 1, borderBottomColor: order.borderFaint },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  homeLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandName: { color: order.textPrimary, fontWeight: '500', fontSize: 16 },
  cartPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: order.pillBg, borderWidth: 1, borderColor: order.border },
  cartPillText: { color: '#000', fontWeight: '500', fontSize: 12 },
  pillRailScroll: { flexGrow: 0, flexShrink: 0 },
  pillRail: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: order.pillBg, borderWidth: 1, borderColor: order.border },
  pillText: { color: order.textMuted, fontWeight: '500', fontSize: 12 },
  pillTextActive: { color: '#000' },
  sectionTitle: { color: order.textPrimary, fontWeight: '500', fontSize: 17, marginTop: 20, marginBottom: 10 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 8, marginBottom: 8, backgroundColor: order.cardBg, borderWidth: 1, borderColor: order.border },
  thumbWrap: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: order.pillBg },
  thumb: { width: '100%', height: '100%' },
  unavailableOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  unavailableText: { color: '#fff', fontSize: 8, fontWeight: '500' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { color: order.textPrimary, fontWeight: '500', fontSize: 14 },
  rowDesc: { color: order.textMuted, fontSize: 11, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  rowMetaText: { color: order.textFaint, fontSize: 10 },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  rowPrice: { fontWeight: '500', fontSize: 13 },
  addCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  addCircleQty: { color: '#000', fontWeight: '500', fontSize: 12 },

  cartBar: { position: 'absolute', left: 16, right: 16, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartBarText: { color: '#000', fontWeight: '500', fontSize: 13 },
  cartBarTotal: { color: '#000', fontWeight: '500', fontSize: 13 },
})
