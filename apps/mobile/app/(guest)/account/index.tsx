import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../../src/stores/auth.store'
import { Button } from '../../../src/components/Button'
import { colors } from '../../../src/theme/colors'

// Full account screen (profile fields, favorites, notification settings) is Phase 2 —
// this Phase 1 stub only covers sign-in state so the tab isn't a dead end.
export default function AccountScreen() {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're browsing as a guest</Text>
        <Text style={styles.subtitle}>Log in to see your order history across visits and save favorites.</Text>
        <View style={styles.actions}>
          <Button title="Log In" onPress={() => router.push('/(auth)/login')} />
          <Button title="Create Account" variant="secondary" onPress={() => router.push('/(auth)/register')} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{user.name}</Text>
      <Text style={styles.subtitle}>{user.email}</Text>
      <View style={styles.actions}>
        <Button title="Log Out" variant="secondary" onPress={() => logout()} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  actions: { gap: 12 },
})
