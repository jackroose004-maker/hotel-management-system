import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as menuApi from '../../../../src/api/menu.api'
import { useCartStore, type SelectedModifier } from '../../../../src/stores/cart.store'
import type { MenuItem } from '../../../../src/api/types'
import { GlassButton } from '../../../../src/components/GlassButton'
import { order } from '../../../../src/theme/colors'

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const [item, setItem] = useState<MenuItem | null>(null)
  const [selected, setSelected] = useState<Record<string, string[]>>({}) // groupId -> optionIds
  const [notes, setNotes] = useState('')

  useEffect(() => {
    menuApi.getItem(id).then((data) => {
      setItem(data)
      const defaults: Record<string, string[]> = {}
      data.modifierGroups?.forEach((g) => {
        const def = g.options.find((o) => o.isDefault) ?? g.options[0]
        if (def) defaults[g.id] = [def.id]
      })
      setSelected(defaults)
    })
  }, [id])

  const selectedModifiers: SelectedModifier[] = useMemo(() => {
    if (!item?.modifierGroups) return []
    const result: SelectedModifier[] = []
    for (const group of item.modifierGroups) {
      const optionIds = selected[group.id] ?? []
      for (const opt of group.options) {
        if (optionIds.includes(opt.id)) {
          result.push({ optionId: opt.id, groupName: group.name, name: opt.name, priceAdd: opt.priceAdd })
        }
      }
    }
    return result
  }, [item, selected])

  function toggleOption(groupId: string, optionId: string, maxSelect: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      if (maxSelect === 1) {
        return { ...prev, [groupId]: current[0] === optionId ? [] : [optionId] }
      }
      const exists = current.includes(optionId)
      const next = exists ? current.filter((oid) => oid !== optionId) : [...current, optionId].slice(0, maxSelect)
      return { ...prev, [groupId]: next }
    })
  }

  function missingRequiredGroup(): boolean {
    if (!item?.modifierGroups) return false
    return item.modifierGroups.some((g) => g.required && (selected[g.id]?.length ?? 0) < Math.max(1, g.minSelect))
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={order.brand} />
      </View>
    )
  }

  const previewPrice = (item.price + selectedModifiers.reduce((s, m) => s + m.priceAdd, 0)) * 1.05

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }}>
        {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" />}
        <View style={styles.body}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <Text style={styles.price}>
            AED {previewPrice.toFixed(2)} <Text style={styles.priceHint}>incl. VAT</Text>
          </Text>

          {item.modifierGroups?.map((group) => (
            <View key={group.id} style={styles.group}>
              <Text style={styles.groupTitle}>
                {group.name} <Text style={styles.groupHint}>{group.required ? '· required' : '· optional'}</Text>
              </Text>
              {group.options.map((opt) => {
                const isSelected = (selected[group.id] ?? []).includes(opt.id)
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => toggleOption(group.id, opt.id, group.maxSelect)}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.name}</Text>
                    <Text style={styles.optionPrice}>{opt.priceAdd > 0 ? `+AED ${opt.priceAdd.toFixed(2)}` : 'Free'}</Text>
                  </Pressable>
                )
              })}
            </View>
          ))}

          <Text style={styles.groupTitle}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. no onions"
            placeholderTextColor={order.textFaint}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GlassButton
          title="Add to Cart"
          disabled={missingRequiredGroup()}
          onPress={() => {
            addItem({
              menuItemId: item.id,
              name: item.name,
              basePrice: item.price,
              modifiers: selectedModifiers,
              notes: notes || undefined,
              prepTimeMins: item.prepTimeMins,
            })
            router.back()
          }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: order.pageBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: order.pageBg },
  image: { width: '100%', height: 240 },
  body: { padding: 18, gap: 4 },
  name: { fontSize: 22, fontWeight: '900', color: order.textPrimary },
  description: { fontSize: 14, color: order.textSecondary, marginTop: 4, lineHeight: 20 },
  price: { fontSize: 18, fontWeight: '900', color: order.brand, marginTop: 10 },
  priceHint: { fontSize: 10, fontWeight: '400', color: 'rgba(252,211,77,0.7)' },
  group: { marginTop: 22 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: order.textPrimary, marginBottom: 10 },
  groupHint: { fontWeight: '400', color: order.textMuted, fontSize: 11 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: order.cardBg,
    borderWidth: 1,
    borderColor: order.border,
    marginBottom: 8,
  },
  optionSelected: { borderColor: order.brand, backgroundColor: `rgba(${order.brandRgb},0.08)` },
  optionText: { fontSize: 14, color: order.textSecondary },
  optionTextSelected: { color: order.textPrimary, fontWeight: '700' },
  optionPrice: { fontSize: 12, color: order.textMuted },
  notesInput: {
    borderWidth: 1,
    borderColor: order.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: order.pillBg,
    color: order.textPrimary,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: order.borderFaint, backgroundColor: order.pageBg },
})
