import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as authApi from '../../src/api/auth.api'
import { useAuthStore } from '../../src/stores/auth.store'
import { homeRouteForRole } from '../../src/navigation/roleGuard'
import { GlassBackground } from '../../src/components/GlassBackground'
import { GlassCard } from '../../src/components/GlassCard'
import { GlassInput } from '../../src/components/GlassInput'
import { GlassButton } from '../../src/components/GlassButton'
import { glass } from '../../src/theme/colors'

export default function StaffLoginScreen() {
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
      const { user, token } = await authApi.staffLogin(email.trim(), password)
      await setAuth(user, token)
      router.replace(homeRouteForRole(user.role))
    } catch (err: any) {
      Alert.alert('Login failed', err.message ?? 'Please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 24 }]}>
          <GlassCard>
            <Text style={styles.heading}>Staff Portal</Text>
            <Text style={styles.subheading}>Sign in with your staff account to manage orders, kitchen, and tables.</Text>

            <View style={styles.form}>
              <GlassInput
                label="Staff Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@almanzil.com"
              />
              <GlassInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            </View>

            <GlassButton title="Sign In" onPress={submit} loading={loading} disabled={!email || !password} />
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
})
