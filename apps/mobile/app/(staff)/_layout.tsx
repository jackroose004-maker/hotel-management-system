import { Drawer } from 'expo-router/drawer'
import { Redirect, useRouter } from 'expo-router'
import { LayoutDashboard, ChefHat, ClipboardList, Table2, CalendarDays, Receipt, Users, LogOut } from 'lucide-react-native'
import { Alert, Pressable, Text } from 'react-native'
import { useAuthStore } from '../../src/stores/auth.store'
import { useBrandStore, hexToRgbString } from '../../src/stores/brand.store'
import { isStaffRole } from '../../src/navigation/roleGuard'
import { colors } from '../../src/theme/colors'

// Hamburger drawer mirrors the web staff portal's own mobile pattern (collapsible sidebar
// on desktop, slide-in drawer overlay on mobile — apps/web/app/staff/layout.tsx). A bottom
// tab bar would be cramped with 6+ sections; the drawer matches the web mental model and
// scales better as Team/Analytics/Settings get added later. Uses expo-router's own Drawer
// default content (not @react-navigation/drawer directly — expo-router SDK 56+ forbids
// that import to avoid duplicate navigation instances); logout lives in the header instead.
function LogoutButton() {
  const logout = useAuthStore((s) => s.logout)
  return (
    <Pressable
      onPress={() => Alert.alert('Log out?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log Out', onPress: () => logout() }])}
      style={{ marginRight: 16 }}
    >
      <LogOut size={20} color={colors.status.danger.fg} />
    </Pressable>
  )
}

// The hamburger menu toggle already occupies headerLeft (can't be replaced without
// breaking drawer access), so the tappable brand mark lives next to Logout on the right
// instead — still satisfies "tap the logo to go to the hero page" without losing drawer nav.
function HeaderRight() {
  const router = useRouter()
  const name = useBrandStore((s) => s.name)
  return (
    <>
      <Pressable onPress={() => router.push('/')} style={{ marginRight: 14 }} hitSlop={10}>
        <Text style={{ fontWeight: '900', fontSize: 12, color: colors.textMuted }}>{name.toUpperCase()}</Text>
      </Pressable>
      <LogoutButton />
    </>
  )
}

export default function StaffLayout() {
  const { user, token } = useAuthStore()
  const brandColor = useBrandStore((s) => s.brandColor)

  // UX convenience only, not a security boundary — see src/navigation/roleGuard.ts.
  // The real enforcement is server-side (JwtAuthGuard + RolesGuard + @Roles()).
  if (!token || !isStaffRole(user?.role)) {
    return <Redirect href="/(auth)/staff-login" />
  }

  const isOwner = user?.role === 'OWNER'

  return (
    <Drawer
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.textPrimary,
        headerRight: () => <HeaderRight />,
        drawerActiveTintColor: brandColor,
        drawerInactiveTintColor: colors.textMuted,
        drawerActiveBackgroundColor: `rgba(${hexToRgbString(brandColor)},0.1)`,
      }}
    >
      <Drawer.Screen
        name="dashboard"
        options={{ title: 'Dashboard', drawerIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="kitchen/index"
        options={{ title: 'Kitchen', drawerIcon: ({ color, size }) => <ChefHat color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="orders/index"
        options={{ title: 'Orders', drawerIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="tables/index"
        options={{ title: 'Tables', drawerIcon: ({ color, size }) => <Table2 color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="bookings/index"
        options={{ title: 'Bookings', drawerIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="bills/index"
        options={{ title: 'Bills', drawerIcon: ({ color, size }) => <Receipt color={color} size={size} /> }}
      />
      <Drawer.Screen
        name="team/index"
        options={{
          title: 'Team',
          drawerItemStyle: isOwner ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
    </Drawer>
  )
}
