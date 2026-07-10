import { Pressable, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useBrandStore } from '../stores/brand.store'

interface Props {
  color: string
}

// Small tappable brand mark for screen headers — tapping it returns to the hero/landing
// screen ("/"), matching web's logo-links-home convention used across menu/login/track
// pages. Only used on tab-root screens (no back button already present); pushed detail
// screens keep the automatic back arrow instead, matching web's own back-only sub-pages.
// Includes an explicit chevron icon, not just tappable text — plain text alone isn't a
// strong enough "this is a button" signal for users to discover on their own.
export function HeaderLogo({ color }: Props) {
  const router = useRouter()
  const name = useBrandStore((s) => s.name)
  return (
    <Pressable onPress={() => router.push('/')} style={styles.wrap} hitSlop={10}>
      <ChevronLeft size={18} color={color} />
      <Text style={[styles.text, { color }]}>{name.toUpperCase()}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 2 },
  text: { fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
})
