import { Tabs } from 'expo-router'
import { Home, Receipt, CalendarDays, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeaderLogo } from '../../src/components/HeaderLogo'
import { useBrandStore } from '../../src/stores/brand.store'
import { order } from '../../src/theme/colors'

// Dark headers throughout — mirrors the <ForceDark /> theme apps/web/app/menu, /menu/orders,
// and /account all use. Only the Menu tab hides the default header since it builds its own
// sticky brand+cart+category header, matching the web layout.
const darkHeader = {
  headerStyle: { backgroundColor: order.pageBg },
  headerTitleStyle: { color: order.textPrimary },
  headerTintColor: order.textPrimary,
}

// Floating pill tab bar, icon-only — a native mobile pattern (not a web layout carried over).
// Active tint reads live brandColor from the store on every render, never a static hex, so a
// restaurant changing its brand color in staff settings updates this instantly like everywhere
// else in the app.
export default function GuestLayout() {
  const brandColor = useBrandStore((s) => s.brandColor)
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: brandColor,
        tabBarInactiveTintColor: order.textFaint,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: insets.bottom + 12,
          left: 20,
          right: 20,
          height: 60,
          borderRadius: 30,
          backgroundColor: order.cardBg,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: order.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        },
        tabBarItemStyle: { paddingTop: 4 },
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
