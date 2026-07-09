import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as menuApi from '../../../src/api/menu.api'
import { useCartStore } from '../../../src/stores/cart.store'
import type { MenuCategory, MenuItem } from '../../../src/api/types'
import { colors } from '../../../src/theme/colors'

export default function MenuScreen() {
  const router = useRouter()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0))

  const load = useCallback(async () => {
    try {
      const data = await menuApi.getCategories()
      setCategories(data)
      if (!activeCategoryId && data.length) setActiveCategoryId(data[0].id)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const items = activeCategory?.items ?? []

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setActiveCategoryId(c.id)}
            style={[styles.tabPill, c.id === activeCategoryId && styles.tabPillActive]}
          >
            <Text style={[styles.tabPillText, c.id === activeCategoryId && styles.tabPillTextActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => <MenuItemCard item={item} onPress={() => router.push(`/(guest)/menu/item/${item.id}`)} />}
      />

      {cartCount > 0 && (
        <Pressable style={styles.cartBar} onPress={() => router.push('/(guest)/cart')}>
          <Text style={styles.cartBarText}>View Cart ({cartCount})</Text>
        </Pressable>
      )}
    </View>
  )
}

function MenuItemCard({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!item.isAvailable}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardPrice}>AED {item.price.toFixed(2)}</Text>
        {!item.isAvailable && <Text style={styles.unavailable}>Unavailable</Text>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.headerBorder, paddingVertical: 10 },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.mutedBg,
    marginRight: 8,
  },
  tabPillActive: { backgroundColor: colors.brand },
  tabPillText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  tabPillTextActive: { color: '#fff' },
  card: { flex: 1, backgroundColor: colors.cardBg, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder },
  cardImage: { width: '100%', height: 110 },
  cardImagePlaceholder: { backgroundColor: colors.mutedBg },
  cardBody: { padding: 10, gap: 2 },
  cardName: { fontWeight: '700', color: colors.textPrimary, fontSize: 14 },
  cardPrice: { color: colors.brandDark, fontWeight: '600', fontSize: 13 },
  unavailable: { color: colors.status.danger.fg, fontSize: 11, fontWeight: '600' },
  cartBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cartBarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
