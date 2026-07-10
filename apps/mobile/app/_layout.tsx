import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth.store'
import { useBrandStore } from '../src/stores/brand.store'

export default function RootLayout() {
  const init = useAuthStore((s) => s.init)
  const initBrand = useBrandStore((s) => s.init)

  useEffect(() => {
    init()
    initBrand()
  }, [init, initBrand])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="scan" options={{ presentation: 'modal', headerShown: true, title: 'Scan Table QR' }} />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(guest)" />
          <Stack.Screen name="(staff)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
