import { StyleSheet, Text, View } from 'react-native'
import { colors, orderStatusVariant } from '../theme/colors'

interface Props {
  status: keyof typeof orderStatusVariant | string
  label?: string
}

// Mirrors apps/web/components/ui/StatusBadge.tsx — single shared way to render order/table
// status everywhere so colors stay consistent instead of hard-coded per screen.
export function StatusBadge({ status, label }: Props) {
  const variant = orderStatusVariant[status] ?? 'neutral'
  const tone = colors.status[variant]
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{label ?? status}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
})
