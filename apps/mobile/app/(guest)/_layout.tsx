import { Tabs } from 'expo-router'
import { colors } from '../../src/theme/colors'

export default function GuestLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="menu/index" options={{ title: 'Menu' }} />
      <Tabs.Screen name="orders/index" options={{ title: 'My Orders' }} />
      <Tabs.Screen name="account/index" options={{ title: 'Account' }} />
      {/* Registered as routes but not tabs — pushed on top of the tab stack */}
      <Tabs.Screen name="menu/item/[id]" options={{ href: null, headerShown: true, title: 'Item' }} />
      <Tabs.Screen name="cart" options={{ href: null, headerShown: true, title: 'Cart' }} />
      <Tabs.Screen name="checkout" options={{ href: null, headerShown: true, title: 'Checkout' }} />
      <Tabs.Screen name="orders/track/[orderId]" options={{ href: null, headerShown: true, title: 'Order Status' }} />
    </Tabs>
  )
}
