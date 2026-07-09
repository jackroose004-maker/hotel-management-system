import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as menuApi from '../../../../src/api/menu.api'
import { useCartStore, type SelectedModifier } from '../../../../src/stores/cart.store'
import type { MenuItem } from '../../../../src/api/types'
import { Button } from '../../../../src/components/Button'
import { colors } from '../../../../src/theme/colors'

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const [item, setItem] = useState<MenuItem | null>(null)
  const [selected, setSelected] = useState<Record<string, string[]>>({}) // groupId -> optionIds
  const [notes, setNotes] = useState('')

  useEffect(() => {
    menuApi.getItem(id).then(setItem)
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
      const next = exists ? current.filter((id) => id !== optionId) : [...current, optionId].slice(0, maxSelect)
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
        <ActivityIndicator color={colors.brand} />
      </View>
    )
  }

  const previewPrice = item.price + selectedModifiers.reduce((s, m) => s + m.priceAdd, 0)

  return (
    <View style={styles.container}>
      <ScrollView>
        {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.image} />}
        <View style={styles.body}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <Text style={styles.price}>AED {previewPrice.toFixed(2)} (incl. VAT)</Text>

          {item.modifierGroups?.map((group) => (
            <View key={group.id} style={styles.group}>
              <Text style={styles.groupTitle}>
                {group.name} {group.required ? '(required)' : '(optional)'}
              </Text>
              {group.options.map((opt) => {
                const isSelected = (selected[group.id] ?? []).includes(opt.id)
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => toggleOption(group.id, opt.id, group.maxSelect)}
                  >
                    <Text style={styles.optionText}>{opt.name}</Text>
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
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  image: { width: '100%', height: 220 },
  body: { padding: 16, gap: 4 },
  name: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  description: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  price: { fontSize: 17, fontWeight: '700', color: colors.brandDark, marginTop: 8 },
  group: { marginTop: 20 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  optionText: { fontSize: 14, color: colors.textPrimary },
  optionPrice: { fontSize: 13, color: colors.textMuted },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: colors.inputBg,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.headerBorder, backgroundColor: colors.cardBg },
})
