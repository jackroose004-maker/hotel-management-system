'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Table2, ClipboardList, Receipt, CalendarDays,
  BookOpen, BarChart2, Settings, LogOut, LayoutGrid, Users,
  UtensilsCrossed, Sun, Moon, ChevronLeft, ChevronRight, Menu, X,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { initBrand, useBrandStore } from '@/store/brand'
import { requestNotifyPermission } from '@/lib/notify'

const NAV = [
  { href: '/staff',           icon: LayoutGrid,     label: 'Dashboard',   roles: ['OWNER','MANAGER','STAFF'], exact: true },
  { href: '/staff/orders',    icon: ClipboardList,  label: 'Orders',      roles: ['OWNER','MANAGER','STAFF'] },
  { href: '/staff/tables',    icon: Table2,         label: 'Tables',      roles: ['OWNER','MANAGER','STAFF'] },
  { href: '/staff/bookings',  icon: CalendarDays,   label: 'Bookings',    roles: ['OWNER','MANAGER','STAFF'] },
  { href: '/staff/bills',     icon: Receipt,        label: 'Bills',       roles: ['OWNER','MANAGER'] },
  { href: '/staff/menu',      icon: BookOpen,       label: 'Menu',        roles: ['OWNER','MANAGER'] },
  { href: '/staff/analytics', icon: BarChart2,      label: 'Analytics',   roles: ['OWNER','MANAGER'] },
  { href: '/staff/team',      icon: Users,          label: 'Team',        roles: ['OWNER','MANAGER'] },
  { href: '/staff/settings',  icon: Settings,       label: 'Settings',    roles: ['OWNER','MANAGER'] },
]

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, token, init, logout } = useAuthStore()
  const { dark, toggle }              = useThemeStore()
  const logoUrl    = useBrandStore(s => s.logoUrl)
  const brandName  = useBrandStore(s => s.restaurantName)
  const [collapsed, setCollapsed]     = useState(false)
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [ready, setReady]             = useState(false)
  const loggingOut                    = useRef(false)

  useEffect(() => {
    init()
    initBrand()
    requestNotifyPermission()
    setReady(true)
  }, [])

  useEffect(() => {
    if (loggingOut.current) return
    if (ready && pathname.startsWith('/staff') && pathname !== '/staff/login' && !token)
      router.replace('/staff/login')
  }, [ready, token, pathname])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  if (pathname === '/staff/login') return <>{children}</>
  if (!ready || !token) return null

  const handleLogout = () => { loggingOut.current = true; logout(); router.push('/') }
  const visibleNav = NAV.filter(n => n.roles.includes(user?.role ?? ''))

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {visibleNav.map(({ href, icon: Icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              title={!mobile && collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? 'text-white font-semibold'
                  : 'text-white/50 hover:bg-white/8 hover:text-white/90'
              } ${!mobile && collapsed ? 'justify-center px-0' : ''}`}
              style={active ? { backgroundColor: 'rgba(255,255,255,0.1)', borderLeft: '2px solid var(--brand)', paddingLeft: '10px' } : { borderLeft: '2px solid transparent' }}>
              <Icon size={17} className="flex-shrink-0" />
              {(mobile || !collapsed) && <span className="truncate font-medium">{label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-2 space-y-1">
        {(mobile || !collapsed) && (
          <div className="px-3 py-1.5">
            <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
            <div className="text-[10px] text-white/40 capitalize">{user?.role?.toLowerCase()}</div>
          </div>
        )}
        <button onClick={toggle}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/50 hover:bg-white/10 hover:text-white/90 w-full transition-colors ${!mobile && collapsed ? 'justify-center px-0' : ''}`}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
          {(mobile || !collapsed) && <span className="text-xs">{dark ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        <button onClick={handleLogout}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/30 hover:bg-red-500/20 hover:text-red-300 w-full transition-colors ${!mobile && collapsed ? 'justify-center px-0' : ''}`}>
          <LogOut size={15} />
          {(mobile || !collapsed) && <span className="text-xs">Logout</span>}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--background)' }}>

      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden md:flex ${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 text-white flex-col transition-all duration-200`}
        style={{ backgroundColor: '#1a1816' }}>
        <div className="h-14 flex items-center justify-between px-3 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              {logoUrl
                ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0 bg-white/20">
                    <UtensilsCrossed size={13} className="text-white" />
                  </div>
              }
              <div className="min-w-0">
                <div className="font-black text-sm truncate text-white">{brandName}</div>
                <div className="text-[10px] text-white/40 truncate">Staff Portal</div>
              </div>
            </div>
          )}
          {collapsed && (
            logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover mx-auto" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto bg-white/20">
                  <UtensilsCrossed size={13} className="text-white" />
                </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(v => !v)}
              className="p-1.5 rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70 transition-colors flex-shrink-0">
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(v => !v)}
            className="p-1.5 rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70 transition-colors mx-auto mt-2">
            <ChevronRight size={14} />
          </button>
        )}
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 text-white flex flex-col h-full shadow-2xl"
            style={{ backgroundColor: '#1a1816' }}>
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                {logoUrl
                  ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover" />
                  : <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/20">
                      <UtensilsCrossed size={13} className="text-white" />
                    </div>
                }
                <div>
                  <div className="font-black text-sm text-white">{brandName}</div>
                  <div className="text-[10px] text-white/40">Staff Portal</div>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70">
                <X size={16} />
              </button>
            </div>
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto min-w-0 flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
        {/* Mobile top bar */}
        <div className="md:hidden h-12 border-b flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-30"
          style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
          <button onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            <Menu size={18} />
          </button>
          {logoUrl
            ? <img src={logoUrl} alt={brandName} className="w-6 h-6 rounded-md object-cover" />
            : <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
                <UtensilsCrossed size={11} className="text-white" />
              </div>
          }
          <span className="font-black text-sm text-gray-800 dark:text-white">{brandName}</span>
          <div className="ml-auto">
            <button onClick={toggle} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
              {dark ? <Sun size={15} style={{ color: 'var(--brand)' }} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex flex-col">
          {children}
        </div>
      </main>
    </div>
  )
}
