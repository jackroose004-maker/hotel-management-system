import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as authApi from '../../src/api/auth.api'
import { useAuthStore } from '../../src/stores/auth.store'
import { homeRouteForRole } from '../../src/navigation/roleGuard'
import { GlassBackground } from '../../src/components/GlassBackground'
import { GlassCard } from '../../src/components/GlassCard'
import { GlassInput } from '../../src/components/GlassInput'
import { GlassButton } from '../../src/components/GlassButton'
import { glass } from '../../src/theme/colors'

// Mirrors the frosted-glass login card on apps/web/app/login/page.tsx: hero photo
// background, dark blurred card, brand-filled submit button. Google sign-in and the
// login/signup tab-switcher visual are deferred (Google needs expo-auth-session wiring —
// Phase 2 per the mobile plan); this ships the email/password path styled to match.
export default function LoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!email || !password) return
    setLoading(true)
    try {
      const { user, token } = await authApi.login(email.trim(), password)
      await setAuth(user, token)
      router.replace(homeRouteForRole(user.role))
    } catch (err: any) {
      if (err.message === 'STAFF_PORTAL') {
        Alert.alert('Staff account', 'This account is a staff account — use Staff Login instead.', [
          { text: 'Go to Staff Login', onPress: () => router.push('/(auth)/staff-login') },
          { text: 'Cancel', style: 'cancel' },
        ])
      } else {
        Alert.alert('Login failed', err.message ?? 'Please try again')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 24 }]}>
          <GlassCard>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to order, track meals, and manage bookings.</Text>

            <View style={styles.form}>
              <GlassInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@email.com"
              />
              <GlassInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
            </View>

            <GlassButton title="Sign In" onPress={submit} loading={loading} disabled={!email || !password} />

            <Link href="/(auth)/register" style={styles.link}>
              <Text style={styles.linkText}>Don&apos;t have an account? Create one</Text>
            </Link>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  heading: { fontSize: 24, fontWeight: '900', color: glass.textPrimary, marginBottom: 6 },
  subheading: { fontSize: 14, color: glass.textSecondary, marginBottom: 20, lineHeight: 20 },
  form: { marginBottom: 8 },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { color: glass.textMuted, fontSize: 13 },
})
