import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '../theme/colors'
import { useBrandStore } from '../stores/brand.store'

interface Props {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary'
}

// Reads brandColor from the live brand store (GET /settings/brand) for the primary variant
// instead of a hardcoded constant — same rationale as GlassButton, just for the light
// (staff-app) theme.
export function Button({ title, onPress, disabled, loading, variant = 'primary' }: Props) {
  const brandColor = useBrandStore((s) => s.brandColor)
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? { backgroundColor: brandColor } : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : brandColor} />
      ) : (
        <Text style={isPrimary ? styles.primaryText : [styles.secondaryText, { color: colors.textPrimary }]}>{title}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.cardBorder },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryText: { fontWeight: '600', fontSize: 16 },
})
