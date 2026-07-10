import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as authApi from '../../src/api/auth.api'
import { useAuthStore } from '../../src/stores/auth.store'
import { homeRouteForRole } from '../../src/navigation/roleGuard'
import { GlassBackground } from '../../src/components/GlassBackground'
import { GlassCard } from '../../src/components/GlassCard'
import { GlassInput } from '../../src/components/GlassInput'
import { GlassButton } from '../../src/components/GlassButton'
import { glass } from '../../src/theme/colors'

export default function OtpScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setAuth = useAuthStore((s) => s.setAuth)
  const { name, email, phone } = useLocalSearchParams<{ name: string; email: string; phone?: string }>()
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!otp || password.length < 6) return
    setLoading(true)
    try {
      const { user, token } = await authApi.register({
        name,
        email,
        password,
        phone: phone || undefined,
        otp,
      })
      await setAuth(user, token)
      router.replace(homeRouteForRole(user.role))
    } catch (err: any) {
      Alert.alert('Verification failed', err.message ?? 'Please check the code and try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 24 }]}>
          <GlassCard>
            <View style={styles.codeBanner}>
              <Text style={styles.codeBannerLabel}>Code sent to</Text>
              <Text style={styles.codeBannerEmail}>{email}</Text>
            </View>

            <View style={styles.form}>
              <GlassInput
                label="Verification Code"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
              />
              <GlassInput
                label="Create a Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 6 characters"
              />
            </View>

            <GlassButton title="Verify & Create Account" onPress={submit} loading={loading} disabled={!otp || password.length < 6} />
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassBackground>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  codeBanner: {
    backgroundColor: `rgba(${glass.brandRgb},0.08)`,
    borderWidth: 1,
    borderColor: `rgba(${glass.brandRgb},0.2)`,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  codeBannerLabel: { fontSize: 12, color: glass.textSecondary },
  codeBannerEmail: { fontSize: 14, fontWeight: '700', color: glass.textPrimary, marginTop: 2 },
  form: { marginBottom: 8 },
})
