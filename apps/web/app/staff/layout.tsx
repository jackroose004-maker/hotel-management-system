'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, ChefHat, BookOpen, Table2, LogOut, UtensilsCrossed } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

const NAV = [
  { href: '/staff/orders', icon: LayoutDashboard, label: 'Orders' },
  { href: '/staff/kitchen', icon: ChefHat, label: 'Kitchen' },
  { href: '/staff/menu', icon: BookOpen, label: 'Menu' },
  { href: '/staff/tables', icon: Table2, label: 'Tables' },
]

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, token, init, logout } = useAuthStore()

  useEffect(() => { init() }, [])

  // Allow login page without auth
  if (pathname === '/staff/login') return <>{children}</>

  if (!token) {
    if (typeof window !== 'undefined') router.replace('/staff/login')
    return null
  }

  const handleLogout = () => { logout(); router.push('/staff/login') }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <UtensilsCrossed size={18} className="text-orange-400" />
          <div>
            <div className="font-bold text-sm">Al Manzil</div>
            <div className="text-xs text-gray-400">Staff Portal</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === href ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <div className="text-xs text-gray-400 mb-2 px-3">{user?.name}<br /><span className="text-gray-600">{user?.role}</span></div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white w-full transition-colors">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
