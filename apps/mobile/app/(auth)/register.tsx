import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as authApi from '../../src/api/auth.api'
import { GlassBackground } from '../../src/components/GlassBackground'
import { GlassCard } from '../../src/components/GlassCard'
import { GlassInput } from '../../src/components/GlassInput'
import { GlassButton } from '../../src/components/GlassButton'
import { glass } from '../../src/theme/colors'

export default function RegisterScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!name || !email) return
    setLoading(true)
    try {
      await authApi.sendOtp(email.trim(), name.trim())
      router.push({ pathname: '/(auth)/otp', params: { name: name.trim(), email: email.trim(), phone: phone.trim() } })
    } catch (err: any) {
      Alert.alert('Could not send code', err.message ?? 'Please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 24 }]}>
          <GlassCard>
            <Text style={styles.heading}>Create your account</Text>
            <Text style={styles.subheading}>Join us to order food, book tables, and track your meals.</Text>

            <View style={styles.form}>
              <GlassInput label="Full Name" value={name} onChangeText={setName} placeholder="Your name" />
              <GlassInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@email.com"
              />
              <GlassInput
                label="Phone (optional)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+971 50 000 0000"
              />
            </View>

            <GlassButton title="Send Verification Code" onPress={submit} loading={loading} disabled={!name || !email} />
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
