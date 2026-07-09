import { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { glass } from '../theme/colors'

interface Props {
  children: ReactNode
  style?: ViewStyle
}

// Frosted glass card — mirrors the login form card on apps/web/app/login/page.tsx
// (rounded-3xl, backdrop-blur(24px), translucent dark background, subtle white border).
export function GlassCard({ children, style }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: glass.cardBorder,
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: glass.cardBg,
  },
  content: {
    padding: 24,
  },
})
