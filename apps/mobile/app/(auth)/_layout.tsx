import { Stack } from 'expo-router'

// Transparent dark header so the back button floats over the hero background image
// instead of sitting on a default white bar — matches the immersive look of
// apps/web/app/login/page.tsx's fixed top bar (back link + logo over the photo).
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitle: '',
        headerTintColor: '#fff',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="staff-login" />
    </Stack>
  )
}
