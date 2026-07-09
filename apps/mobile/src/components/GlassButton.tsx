import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { glass } from '../theme/colors'

interface Props {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'translucent'
}

// Matches the submit button on apps/web/app/login/page.tsx: brand-filled, rounded-2xl,
// bold white text, subtle shadow. `translucent` matches the Google sign-in button style.
export function GlassButton({ title, onPress, disabled, loading, variant = 'primary' }: Props) {
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.translucent,
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
  primary: { backgroundColor: glass.brand },
  translucent: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
