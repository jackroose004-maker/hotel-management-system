import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth.store'
import { homeRouteForRole } from '../src/navigation/roleGuard'
import { GlassBackground } from '../src/components/GlassBackground'
import { GlassButton } from '../src/components/GlassButton'
import { glass } from '../src/theme/colors'

export default function Splash() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, token, ready } = useAuthStore()

  if (!ready) {
    return (
      <GlassBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={glass.brand} />
        </View>
      </GlassBackground>
    )
  }

  if (token && user) {
    return <Redirect href={homeRouteForRole(user.role)} />
  }

  // Not logged in — guests can browse/order without an account, so this is a real
  // landing screen, not a blind redirect to login. Mirrors the hero treatment on
  // apps/web/app/page.tsx (full-bleed photo + dark gradient + brand headline).
  return (
    <GlassBackground>
      <View style={[styles.container, { paddingBottom: insets.bottom + 32, paddingTop: insets.top + 24 }]}>
        <View style={styles.hero}>
          <Text style={styles.title}>Al Manzil</Text>
          <Text style={styles.subtitle}>Kerala &amp; South Indian cuisine — Dubai</Text>
        </View>

        <View style={styles.actions}>
          <GlassButton title="Scan Table QR" onPress={() => router.push('/scan')} />
          <GlassButton title="Log In" variant="translucent" onPress={() => router.push('/(auth)/login')} />
          <GlassButton title="Staff Login" variant="translucent" onPress={() => router.push('/(auth)/staff-login')} />
        </View>
      </View>
    </GlassBackground>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  hero: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '900', color: glass.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: glass.textSecondary, textAlign: 'center', marginTop: 10 },
  actions: { gap: 12 },
})
