import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { glass } from '../theme/colors'
import { useBrandStore } from '../stores/brand.store'

interface Props {
  /** Explicit override — most screens should omit this and let it read the live brand
   * background (GET /settings/brand → loginBg) automatically. */
  imageUrl?: string
  children: ReactNode
}

// Full-bleed photo + dark gradient overlay — mirrors the fixed inset-0 background treatment
// on apps/web/app/login/page.tsx and apps/web/app/page.tsx's hero. Defaults to the live
// brand's configured background image so every screen using this component (Welcome,
// Login, Register, OTP, Staff Login) stays in sync without each one wiring it manually.
export function GlassBackground({ imageUrl, children }: Props) {
  const loginBg = useBrandStore((s) => s.loginBg)
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: imageUrl || loginBg || glass.fallbackHeroImage }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
      />
      <LinearGradient
        colors={[glass.overlayFrom, glass.overlayTo]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
})
