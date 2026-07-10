import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useBrandStore } from '../stores/brand.store'

interface Props {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'translucent'
}

// Matches the submit button on apps/web/app/login/page.tsx: brand-filled, rounded-2xl,
// bold white text, subtle shadow. `translucent` matches the Google sign-in button style.
// Reads brandColor from the live brand store (fetched from GET /settings/brand) rather
// than a hardcoded constant, so it tracks whatever the restaurant has actually configured.
export function GlassButton({ title, onPress, disabled, loading, variant = 'primary' }: Props) {
  const brandColor = useBrandStore((s) => s.brandColor)
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? { backgroundColor: brandColor } : styles.translucent,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translucent: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
