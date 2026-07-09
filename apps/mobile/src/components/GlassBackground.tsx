import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { glass } from '../theme/colors'

interface Props {
  imageUrl?: string
  children: ReactNode
}

// Full-bleed photo + dark gradient overlay — mirrors the fixed inset-0 background treatment
// on apps/web/app/login/page.tsx and apps/web/app/page.tsx's hero.
export function GlassBackground({ imageUrl, children }: Props) {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: imageUrl || glass.fallbackHeroImage }}
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
