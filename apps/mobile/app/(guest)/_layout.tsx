import { Tabs } from 'expo-router'
import { Home, Receipt, CalendarDays, User } from 'lucide-react-native'
import { HeaderLogo } from '../../src/components/HeaderLogo'
import { order } from '../../src/theme/colors'

// Dark tab bar + headers throughout — mirrors the <ForceDark /> theme apps/web/app/menu,
// /menu/orders, and /account all use. Only the Menu tab hides the default header since it
// builds its own sticky brand+cart+category header, matching the web layout.
const darkHeader = {
  headerStyle: { backgroundColor: order.pageBg },
  headerTitleStyle: { color: order.textPrimary },
  headerTintColor: order.textPrimary,
}

export default function GuestLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: order.brand,
        tabBarInactiveTintColor: order.textMuted,
        tabBarStyle: { backgroundColor: order.cardBg, borderTopColor: order.border },
        ...darkHeader,
      }}
    >
      <Tabs.Screen
        name="menu/index"
        options={{ title: 'Menu', headerShown: false, tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="orders/index"
        options={{ title: 'My Orders', tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} />, headerLeft: () => <HeaderLogo color={order.textPrimary} /> }}
      />
      <Tabs.Screen
        name="book/index"
        options={{ title: 'Book', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />, headerLeft: () => <HeaderLogo color={order.textPrimary} /> }}
      />
      <Tabs.Screen
        name="account/index"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <User color={color} size={size} />, headerLeft: () => <HeaderLogo color={order.textPrimary} /> }}
      />
      {/* Registered as routes but not tabs — pushed on top of the tab stack */}
      <Tabs.Screen name="menu/item/[id]" options={{ href: null, title: 'Item', ...darkHeader }} />
      <Tabs.Screen name="cart" options={{ href: null, title: 'Cart', ...darkHeader }} />
      <Tabs.Screen name="checkout" options={{ href: null, title: 'Checkout', ...darkHeader }} />
      <Tabs.Screen name="orders/track/[orderId]" options={{ href: null, title: 'Order Status', ...darkHeader }} />
    </Tabs>
  )
}
