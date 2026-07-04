'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  UtensilsCrossed, ShoppingBag, CalendarDays, LogOut, Home,
  ChevronRight, Clock, ArrowRight, Star, Utensils, Plus, Heart, User,
  Bell, Leaf, Edit3, Save, X, Mail, AlertTriangle, Check,
  Loader2, Package,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import { StatusBadge, bookingStatusVariant } from '@/components/ui/StatusBadge'
import toast from 'react-hot-toast'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

// ── helpers ──────────────────────────────────────────────────────────────────
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Order Received', ACCEPTED: 'Confirmed',
  PREPARING: 'Being Prepared', READY: 'Ready to Serve',
  DELIVERED: 'Served', CANCELLED: 'Cancelled',
}
const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Upcoming', CONFIRMED: 'Confirmed', ARRIVED: 'Visited',
  NO_SHOW: 'No-show', CANCELLED: 'Cancelled',
}
const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { id: 'vegan',      label: 'Vegan',      emoji: '🌱' },
  { id: 'halal',      label: 'Halal only', emoji: '☪️'  },
  { id: 'gluten',     label: 'Gluten-free',emoji: '🌾' },
  { id: 'dairy',      label: 'Dairy-free', emoji: '🥛' },
  { id: 'nut',        label: 'Nut allergy',emoji: '🥜' },
  { id: 'seafood',    label: 'No seafood', emoji: '🦐' },
  { id: 'spicy',      label: 'Mild spice', emoji: '🌶️' },
]

function slotLabel(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(dateStr).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
}

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hov, setHov] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button key={i} disabled={!onChange}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(0)}
          onClick={() => onChange?.(i)} className="p-0.5 disabled:cursor-default">
          <Star size={16} className={`transition-colors ${(hov || value) >= i ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'}`} />
        </button>
      ))}
    </div>
  )
}

// ── Animated section wrapper ──────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div ref={ref} className={className}
      style={{
        transition: `opacity 0.45s ease, transform 0.45s ease`,
        transitionDelay: `${delay}ms`,
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(18px)',
      }}>
      {children}
    </div>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-2xl animate-pulse bg-white/5 ${className}`} />
}

// ── Main ─────────────────────────────────────────────────────────────────────
type TabId = 'home' | 'orders' | 'bookings' | 'favourites' | 'profile'

function AccountContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token, logout, init } = useAuthStore()
  const cart = useCartStore()

  const [tab, setTab] = useState<TabId>('home')

  // Per-tab data
  const [orders,       setOrders]       = useState<any[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [ordersLoading,setOrdersLoading]= useState(false)

  const [bookings,       setBookings]       = useState<any[]>([])
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [bookingsLoading,setBookingsLoading]= useState(false)

  const [favItems,       setFavItems]       = useState<any[]>([])
  const [favsLoaded,     setFavsLoaded]     = useState(false)
  const [favsLoading,    setFavsLoading]    = useState(false)

  const [featuredItems,  setFeaturedItems]  = useState<any[]>([])
  const [homeLoaded,     setHomeLoaded]     = useState(false)

  // Feedback
  const [feedback, setFeedback] = useState<Record<string, { rating: number; comment: string; submitting: boolean; done: boolean }>>({})

  // Profile
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName,    setProfileName]    = useState('')
  const [savingProfile,  setSavingProfile]  = useState(false)
  const [cancellingId,   setCancellingId]   = useState<string | null>(null)

  // Profile prefs
  const [dietary,        setDietary]        = useState<string[]>([])
  const [notifyOrder,    setNotifyOrder]    = useState(true)
  const [notifyBooking,  setNotifyBooking]  = useState(true)

  // Aggregate stats (computed from what's loaded)
  const [totalSpent,  setTotalSpent]  = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [visits,      setVisits]      = useState(0)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!token) { router.replace('/login?redirect=/account'); return }
    if (searchParams.get('tab') === 'bookings') setTab('bookings')
    loadHome()
  }, [token])

  useEffect(() => {
    if (user) {
      setProfileName(user.name ?? '')
      const tags = (user as any).dietaryTags ?? ''
      setDietary(tags ? tags.split(',').filter(Boolean) : [])
      setNotifyOrder((user as any).notifOrderUpdates ?? true)
      setNotifyBooking((user as any).notifBookingReminders ?? true)
    }
  }, [user])

  // ── Lazy-load per tab ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'orders'     && !ordersLoaded)     loadOrders()
    if (tab === 'bookings'   && !bookingsLoaded)   loadBookings()
    if (tab === 'favourites' && !favsLoaded)       loadFavourites()
  }, [tab])

  async function authFetch(url: string, opts: RequestInit = {}) {
    return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) } })
  }

  async function loadHome() {
    try {
      const mRes = await fetch(`${API}/menu/items`)
      const mJson = await mRes.json()
      const mData = mJson?.data ?? mJson
      const allItems: any[] = Array.isArray(mData) ? mData : []
      setFeaturedItems(allItems.filter(i => i.imageUrl).slice(0, 4))

      // Quick stats — load orders count & total spent without full data
      const oRes = await authFetch(`${API}/orders/mine`)
      if (oRes.ok) {
        const oJson = await oRes.json()
        const oData: any[] = Array.isArray(oJson?.data ?? oJson) ? (oJson?.data ?? oJson) : []
        setTotalOrders(oData.length)
        setTotalSpent(oData.reduce((s: number, o: any) => s + Number(o.total), 0))
        setOrders(oData)
        setOrdersLoaded(true)
      }
      // visits from bookings
      const bRes = await authFetch(`${API}/bookings/mine`)
      if (bRes.ok) {
        const bJson = await bRes.json()
        const bData: any[] = Array.isArray(bJson?.data ?? bJson) ? (bJson?.data ?? bJson) : []
        setVisits(bData.filter((b: any) => b.status === 'ARRIVED').length)
        setBookings(bData)
        setBookingsLoaded(true)
      }
      // fav count
      const fRes = await authFetch(`${API}/auth/favorites`)
      if (fRes.ok) {
        const fJson = await fRes.json()
        const fData: any[] = Array.isArray(fJson?.data ?? fJson) ? (fJson?.data ?? fJson) : []
        setFavItems(fData)
        setFavsLoaded(true)
      }
    } finally { setHomeLoaded(true) }
  }

  async function loadOrders() {
    if (ordersLoaded) return
    setOrdersLoading(true)
    try {
      const res = await authFetch(`${API}/orders/mine`)
      if (res.ok) {
        const json = await res.json()
        const data: any[] = Array.isArray(json?.data ?? json) ? (json?.data ?? json) : []
        // merge guest orders
        try {
          const guestIds: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
          const knownIds = new Set(data.map((o: any) => o.id))
          const missing = guestIds.filter(id => !knownIds.has(id))
          if (missing.length > 0) {
            const results = await Promise.allSettled(missing.map(id => fetch(`${API}/orders/${id}`).then(r => r.json())))
            for (const r of results) {
              if (r.status === 'fulfilled') { const d = r.value?.data ?? r.value; if (d?.id) data.push(d) }
            }
            data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          }
        } catch {}
        setOrders(data)
        setTotalOrders(data.length)
        setTotalSpent(data.reduce((s: number, o: any) => s + Number(o.total), 0))
        setOrdersLoaded(true)
      }
    } finally { setOrdersLoading(false) }
  }

  async function loadBookings() {
    if (bookingsLoaded) return
    setBookingsLoading(true)
    try {
      const res = await authFetch(`${API}/bookings/mine`)
      if (res.ok) {
        const json = await res.json()
        const data: any[] = Array.isArray(json?.data ?? json) ? (json?.data ?? json) : []
        setBookings(data)
        setVisits(data.filter((b: any) => b.status === 'ARRIVED').length)
        setBookingsLoaded(true)
      }
    } finally { setBookingsLoading(false) }
  }

  async function loadFavourites() {
    if (favsLoaded) return
    setFavsLoading(true)
    try {
      const res = await authFetch(`${API}/auth/favorites`)
      if (res.ok) {
        const json = await res.json()
        const data: any[] = Array.isArray(json?.data ?? json) ? (json?.data ?? json) : []
        setFavItems(data)
        setFavsLoaded(true)
      }
    } finally { setFavsLoading(false) }
  }

  async function removeFav(itemId: string) {
    setFavItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await authFetch(`${API}/auth/favorites/${itemId}`, { method: 'POST' })
      toast.success('Removed from favourites')
    } catch { toast.error('Failed — try again'); loadFavourites() }
  }

  async function cancelBooking(id: string) {
    setCancellingId(id)
    try {
      const r = await authFetch(`${API}/bookings/${id}/cancel`, { method: 'POST' })
      if (!r.ok) { const d = await r.json(); toast.error((d?.data ?? d)?.message ?? 'Cannot cancel') }
      else { toast.success('Booking cancelled'); setBookingsLoaded(false); loadBookings() }
    } finally { setCancellingId(null) }
  }

  async function submitFeedback(orderId: string) {
    const fb = feedback[orderId]
    if (!fb || fb.rating === 0) return toast.error('Please select a rating')
    setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: true } }))
    try {
      await authFetch(`${API}/orders/${orderId}/feedback`, { method: 'POST', body: JSON.stringify({ rating: fb.rating, comment: fb.comment }) })
      setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: false, done: true } }))
      toast.success('Thank you for your feedback!')
    } catch { setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: false } })) }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const r = await authFetch(`${API}/auth/me`, { method: 'PATCH', body: JSON.stringify({ name: profileName }) })
      if (r.ok) { toast.success('Profile updated'); setEditingProfile(false) }
      else toast.error('Could not save — try again')
    } finally { setSavingProfile(false) }
  }

  async function toggleDietary(id: string) {
    const next = dietary.includes(id) ? dietary.filter(d => d !== id) : [...dietary, id]
    setDietary(next)
    try {
      await authFetch(`${API}/auth/me`, { method: 'PATCH', body: JSON.stringify({ dietaryTags: next.join(',') }) })
      toast.success(dietary.includes(id) ? 'Preference removed' : 'Preference saved ✓', { duration: 1200 })
    } catch { toast.error('Could not save') }
  }

  async function saveNotifPrefs(order: boolean, booking: boolean) {
    setNotifyOrder(order); setNotifyBooking(booking)
    try {
      await authFetch(`${API}/auth/me`, { method: 'PATCH', body: JSON.stringify({ notifOrderUpdates: order, notifBookingReminders: booking }) })
      toast.success('Saved', { duration: 1200 })
    } catch { toast.error('Could not save') }
  }

  if (!user) return null

  const firstName      = user.name.split(' ')[0]
  const activeOrders   = orders.filter(o => !['DELIVERED','CANCELLED'].includes(o.status))
  const upcomingBooks  = bookings.filter(b => ['PENDING','CONFIRMED'].includes(b.status))

  const TABS: { id: TabId; label: string; Icon: any; badge?: number }[] = [
    { id: 'home',       label: 'Home',        Icon: Home,        badge: 0 },
    { id: 'orders',     label: 'Orders',      Icon: ShoppingBag, badge: activeOrders.length },
    { id: 'bookings',   label: 'Bookings',    Icon: CalendarDays,badge: upcomingBooks.length },
    { id: 'favourites', label: 'Favourites',  Icon: Heart,       badge: 0 },
    { id: 'profile',    label: 'Profile',     Icon: User,        badge: 0 },
  ]

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808', color: 'white' }}>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, transparent 60%)' }} />
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(245,158,11,0.06)', transform: 'translate(30%,-30%)' }} />
        </div>

        <div className="relative px-5 sm:px-8 lg:px-16 pt-5 pb-5 max-w-5xl mx-auto">
          {/* Nav row */}
          <div className="flex items-center justify-between mb-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f59e0b' }}>
                <UtensilsCrossed size={14} className="text-black" />
              </div>
              <span className="font-black text-sm text-white tracking-wide">AL MANZIL</span>
            </Link>
            <button onClick={() => { logout(); router.push('/') }}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors">
              <LogOut size={13} /> Sign out
            </button>
          </div>

          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-6" style={{ animation: 'fadeUp 0.5s ease both' }}>
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name}
                  className="w-16 h-16 rounded-2xl object-cover"
                  style={{ border: '2px solid #f59e0b' }} referrerPolicy="no-referrer" />
              : <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000' }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
            }
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Welcome back</p>
              <h1 className="text-2xl font-black text-white leading-none">{firstName}</h1>
              <p className="text-gray-600 text-xs mt-1">{user.email}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2" style={{ animation: 'fadeUp 0.5s 80ms ease both' }}>
            {[
              { label: 'Orders',     value: totalOrders || '—' },
              { label: 'Spent',      value: totalOrders ? `AED ${totalSpent.toFixed(0)}` : '—' },
              { label: 'Visits',     value: visits || '—' },
              { label: 'Favourites', value: favItems.length || '—', action: () => setTab('favourites') },
            ].map((s, i) => (
              <button key={s.label} onClick={s.action}
                className="rounded-2xl px-2 py-3 text-center transition-all"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                disabled={!s.action}>
                <div className="font-black text-white text-base leading-none">{s.value}</div>
                <div className="text-gray-600 text-[9px] mt-1 uppercase tracking-wide">{s.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-10 px-5 sm:px-8 py-2" style={{ backgroundColor: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex gap-1 rounded-2xl p-1" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          {TABS.map(({ id, label, Icon, badge }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 relative flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all"
              style={tab === id ? { backgroundColor: '#f59e0b', color: '#000' } : { color: '#555' }}>
              <Icon size={14} />
              <span className="hidden sm:block">{label}</span>
              {(badge ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[8px] font-black rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tab === id ? '#000' : '#f59e0b', color: tab === id ? '#f59e0b' : '#000' }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="px-5 sm:px-8 lg:px-16 py-5 pb-16 max-w-5xl mx-auto">

        {/* ═══ HOME ═══ */}
        {tab === 'home' && (
          <div className="space-y-5">
            {/* Active order banner */}
            {activeOrders.length > 0 && (
              <FadeIn delay={0}>
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: '#f59e0b' }}>Order in progress</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {ORDER_STATUS_LABEL[activeOrders[0].status]} · {activeOrders[0].items.slice(0,2).map((i: any) => i.menuItem.name).join(', ')}
                    </div>
                  </div>
                  <button onClick={() => setTab('orders')} style={{ color: '#f59e0b' }}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </FadeIn>
            )}

            {/* Upcoming booking */}
            {upcomingBooks.length > 0 && (
              <FadeIn delay={50}>
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <CalendarDays size={18} className="text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-blue-300">Upcoming reservation</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(upcomingBooks[0].slotDate).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' at '}{slotLabel(upcomingBooks[0].slotTime)} · {upcomingBooks[0].partySize} guests
                    </div>
                  </div>
                  <button onClick={() => setTab('bookings')} className="text-blue-400"><ChevronRight size={16} /></button>
                </div>
              </FadeIn>
            )}

            {/* Dietary reminder */}
            {dietary.length === 0 && (
              <FadeIn delay={80}>
                <button onClick={() => setTab('profile')}
                  className="w-full rounded-2xl p-4 flex items-center gap-3 text-left transition-all hover:border-gray-600"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px dashed #2a2a2a' }}>
                  <Leaf size={16} className="text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">Set dietary preferences</div>
                    <div className="text-xs text-gray-600 mt-0.5">Helps the kitchen prepare your meals correctly</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-700" />
                </button>
              </FadeIn>
            )}

            {/* Quick actions */}
            <FadeIn delay={100}>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Quick Actions</p>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/menu"
                  className="rounded-2xl p-4 flex flex-col gap-3 transition-all active:scale-[0.97]"
                  style={{ backgroundColor: '#f59e0b' }}>
                  <Utensils size={22} className="text-black" />
                  <div>
                    <div className="font-black text-black text-sm">Order Food</div>
                    <div className="text-black/60 text-xs">Browse full menu</div>
                  </div>
                </Link>
                <Link href="/book"
                  className="rounded-2xl p-4 flex flex-col gap-3 transition-all active:scale-[0.97]"
                  style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
                  <CalendarDays size={22} style={{ color: '#f59e0b' }} />
                  <div>
                    <div className="font-black text-white text-sm">Reserve Table</div>
                    <div className="text-gray-600 text-xs">Pick date &amp; time</div>
                  </div>
                </Link>
              </div>
            </FadeIn>

            {/* Favourites strip */}
            {favItems.length > 0 && (
              <FadeIn delay={130}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Heart size={10} className="text-red-400 fill-red-400" /> Favourites
                  </p>
                  <button onClick={() => setTab('favourites')} style={{ color: '#f59e0b' }} className="text-xs flex items-center gap-1">
                    See all <ArrowRight size={11} />
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {favItems.slice(0, 6).map((item: any) => (
                    <div key={item.id} className="flex-shrink-0 w-28 rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97]"
                      style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
                      onClick={() => {
                        cart.addItem({ menuItemId: item.id, name: item.name, basePrice: Number(item.price), modifiers: [], prepTimeMins: item.prepTimeMins })
                        toast.success(`${item.name} added!`, { position: 'bottom-center', duration: 1500 })
                        router.push('/menu')
                      }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-20 object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        : <div className="w-full h-20 flex items-center justify-center text-2xl" style={{ backgroundColor: '#1a1a1a' }}>🍽️</div>
                      }
                      <div className="p-2">
                        <div className="text-white text-[10px] font-semibold truncate">{item.name}</div>
                        <div className="text-[10px] font-black mt-0.5" style={{ color: '#f59e0b' }}>AED {Number(item.price).toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeIn>
            )}

            {/* Must try */}
            {featuredItems.length > 0 && (
              <FadeIn delay={160}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Must Try</p>
                  <Link href="/menu" style={{ color: '#f59e0b' }} className="text-xs flex items-center gap-1">
                    View all <ArrowRight size={11} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {featuredItems.map((item: any, i) => (
                    <div key={item.id}
                      className="group rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97]"
                      style={{ backgroundColor: '#111', border: '1px solid #1e1e1e', transitionDelay: `${i * 40}ms` }}
                      onClick={() => {
                        cart.addItem({ menuItemId: item.id, name: item.name, basePrice: Number(item.price), modifiers: [], prepTimeMins: item.prepTimeMins })
                        toast.success(`${item.name} added!`, { position: 'bottom-center', duration: 1500 })
                        router.push('/menu')
                      }}>
                      <div className="h-28 overflow-hidden relative">
                        <img src={item.imageUrl} alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f59e0b' }}>
                            <Plus size={16} className="text-black" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="font-semibold text-white text-xs truncate">{item.name}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-black text-sm" style={{ color: '#f59e0b' }}>AED {Number(item.price).toFixed(0)}</span>
                          <span className="text-gray-700 text-[10px] flex items-center gap-0.5"><Clock size={9} /> {item.prepTimeMins}m</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeIn>
            )}

            {/* Testimonial */}
            <FadeIn delay={200}>
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #111, #0d0d0d)', border: '1px solid #1e1e1e' }}>
                <div className="flex gap-0.5 mb-2">
                  {[1,2,3,4,5].map(i => <Star key={i} size={12} className="text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-white text-sm font-semibold leading-snug mb-2">
                  &ldquo;The Malabar Biriyani is unlike anything else in Dubai.&rdquo;
                </p>
                <p className="text-gray-600 text-xs">— Mohammed A., verified guest</p>
              </div>
            </FadeIn>
          </div>
        )}

        {/* ═══ ORDERS ═══ */}
        {tab === 'orders' && (
          <div>
            {ordersLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : orders.length === 0 ? (
              <FadeIn>
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#111' }}>
                    <ShoppingBag size={28} className="text-gray-700" />
                  </div>
                  <p className="text-white font-bold mb-1">No orders yet</p>
                  <p className="text-gray-600 text-sm mb-5">Ready to try something amazing?</p>
                  <Link href="/menu" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                    <Utensils size={15} /> Browse Menu
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <div className="space-y-3">
                {activeOrders.length > 0 && (
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Active</p>
                )}
                {orders.map((order, i) => {
                  const isActive = !['DELIVERED','CANCELLED'].includes(order.status)
                  const fb = feedback[order.id]
                  const hasFeedback = (order as any).feedback
                  return (
                    <FadeIn key={order.id} delay={i * 40}>
                      <div className="rounded-2xl p-4 transition-all"
                        style={{
                          backgroundColor: '#0d0d0d',
                          border: `1px solid ${isActive ? 'rgba(245,158,11,0.3)' : '#1e1e1e'}`,
                          boxShadow: isActive ? '0 0 20px rgba(245,158,11,0.05)' : 'none',
                        }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={isActive
                                ? { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                                : order.status === 'CANCELLED'
                                  ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }
                                  : { backgroundColor: '#1a1a1a', color: '#666' }}>
                              • {ORDER_STATUS_LABEL[order.status] ?? order.status}
                            </span>
                            <span className="text-gray-700 text-[10px] font-mono">#{order.id.slice(-6).toUpperCase()}</span>
                          </div>
                          <span className="text-gray-700 text-[10px]">{timeAgo(order.createdAt)}</span>
                        </div>

                        <div className="text-gray-500 text-xs mb-3 leading-relaxed">
                          {order.items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.menuItem.name}`).join(', ')}
                          {order.items.length > 3 && <span className="text-gray-700"> +{order.items.length - 3} more</span>}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-white text-base">AED {Number(order.total).toFixed(2)}</span>
                            <span className="text-gray-700 text-xs ml-2">
                              {order.type === 'TAKEAWAY' ? `Token #${order.tokenNumber}` : order.table ? `Table ${order.table.tableNumber}` : 'Dine-in'}
                            </span>
                          </div>
                          {isActive && (
                            <Link href="/menu?track=1" className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl"
                              style={{ border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                              Track <ChevronRight size={12} />
                            </Link>
                          )}
                        </div>

                        {order.status === 'DELIVERED' && (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #1e1e1e' }}>
                            {(hasFeedback || fb?.done) ? (
                              <div className="flex items-center gap-2 text-xs" style={{ color: '#f59e0b' }}>
                                {'★'.repeat(hasFeedback?.rating ?? fb?.rating ?? 5)}{'☆'.repeat(5 - (hasFeedback?.rating ?? fb?.rating ?? 5))}
                                <span style={{ color: '#555' }}>{hasFeedback?.comment || 'Thanks for your feedback!'}</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Rate this order</div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <StarRating value={fb?.rating ?? 0}
                                    onChange={rating => setFeedback(prev => ({ ...prev, [order.id]: { rating, comment: prev[order.id]?.comment ?? '', submitting: false, done: false } }))}
                                  />
                                  {(fb?.rating ?? 0) > 0 && (
                                    <>
                                      <input value={fb?.comment ?? ''}
                                        onChange={e => setFeedback(prev => ({ ...prev, [order.id]: { ...prev[order.id], comment: e.target.value } }))}
                                        placeholder="Any comments? (optional)"
                                        className="flex-1 min-w-0 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none placeholder-gray-700"
                                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                                      <button onClick={() => submitFeedback(order.id)} disabled={fb?.submitting}
                                        className="text-xs px-3 py-1.5 rounded-lg font-bold flex-shrink-0 disabled:opacity-50"
                                        style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                                        {fb?.submitting ? '…' : 'Submit'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </FadeIn>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ BOOKINGS ═══ */}
        {tab === 'bookings' && (
          <div className="space-y-5">
            {bookingsLoading ? (
              <div className="space-y-3">
                {[1,2].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : bookings.length === 0 ? (
              <FadeIn>
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#111' }}>
                    <CalendarDays size={28} className="text-gray-700" />
                  </div>
                  <p className="text-white font-bold mb-1">No reservations yet</p>
                  <p className="text-gray-600 text-sm mb-5">Reserve your table in seconds</p>
                  <Link href="/book" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                    <CalendarDays size={15} /> Book a Table
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <>
                {upcomingBooks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Upcoming</p>
                    <div className="space-y-3">
                      {upcomingBooks.map((b, i) => (
                        <FadeIn key={b.id} delay={i * 50}>
                          <div className="rounded-2xl p-4"
                            style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="font-bold text-white text-sm">
                                  {new Date(b.slotDate).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'short' })}
                                </div>
                                <div className="font-bold text-sm mt-0.5" style={{ color: '#f59e0b' }}>{slotLabel(b.slotTime)}</div>
                              </div>
                              <StatusBadge variant={bookingStatusVariant(b.status)} label={BOOKING_STATUS_LABEL[b.status] ?? b.status} size="sm" />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-600 mb-4">
                              <span>Table {b.table?.tableNumber ?? '—'}</span>
                              <span>·</span>
                              <span>{b.partySize} {b.partySize === 1 ? 'guest' : 'guests'}</span>
                              {b.notes && <><span>·</span><span className="truncate text-gray-700">{b.notes}</span></>}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg"
                                style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <Clock size={10} /> Arrive within 15 min of slot
                              </div>
                              <button onClick={() => cancelBooking(b.id)} disabled={cancellingId === b.id}
                                className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40 font-medium">
                                {cancellingId === b.id ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
                              </button>
                            </div>
                          </div>
                        </FadeIn>
                      ))}
                    </div>
                  </div>
                )}

                {bookings.filter(b => !['PENDING','CONFIRMED'].includes(b.status)).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">History</p>
                    <div className="space-y-2">
                      {bookings.filter(b => !['PENDING','CONFIRMED'].includes(b.status)).map((b, i) => (
                        <FadeIn key={b.id} delay={i * 40}>
                          <div className="rounded-2xl p-3.5 flex items-center gap-3"
                            style={{ backgroundColor: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-400 truncate">
                                {new Date(b.slotDate).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}{slotLabel(b.slotTime)}
                              </div>
                              <div className="text-xs text-gray-700 mt-0.5">{b.partySize} guests</div>
                            </div>
                            <StatusBadge variant={bookingStatusVariant(b.status)} label={BOOKING_STATUS_LABEL[b.status] ?? b.status} size="xs" />
                          </div>
                        </FadeIn>
                      ))}
                    </div>
                  </div>
                )}

                <FadeIn delay={100}>
                  <Link href="/book" className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
                    style={{ border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                    <CalendarDays size={15} /> Make another reservation
                  </Link>
                </FadeIn>
              </>
            )}
          </div>
        )}

        {/* ═══ FAVOURITES ═══ */}
        {tab === 'favourites' && (
          <div>
            {favsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-44" />)}
              </div>
            ) : favItems.length === 0 ? (
              <FadeIn>
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#111' }}>
                    <Heart size={28} className="text-gray-700" />
                  </div>
                  <p className="text-white font-bold mb-1">No favourites yet</p>
                  <p className="text-gray-600 text-sm mb-5">Tap ♡ on any dish while browsing the menu</p>
                  <Link href="/menu" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                    <Utensils size={15} /> Browse Menu
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <>
                <p className="text-xs text-gray-600 mb-4">{favItems.length} saved dish{favItems.length !== 1 ? 'es' : ''}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {favItems.map((item: any, i) => (
                    <FadeIn key={item.id} delay={i * 40}>
                      <div className="group rounded-2xl overflow-hidden transition-all"
                        style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                        <div className="relative h-32 overflow-hidden">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                            : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ backgroundColor: '#1a1a1a' }}>🍽️</div>
                          }
                          <button onClick={() => removeFav(item.id)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                            <Heart size={13} className="text-red-400 fill-red-400" />
                          </button>
                        </div>
                        <div className="p-3">
                          <div className="font-semibold text-white text-xs truncate mb-1">{item.name}</div>
                          {item.description && (
                            <div className="text-gray-700 text-[10px] line-clamp-2 mb-2">{item.description}</div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm" style={{ color: '#f59e0b' }}>AED {Number(item.price).toFixed(0)}</span>
                            <button
                              onClick={() => {
                                cart.addItem({ menuItemId: item.id, name: item.name, basePrice: Number(item.price), modifiers: [], prepTimeMins: item.prepTimeMins })
                                toast.success(`${item.name} added!`, { position: 'bottom-center', duration: 1500 })
                                router.push('/menu')
                              }}
                              className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg"
                              style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                              <Plus size={10} /> Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </FadeIn>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ PROFILE ═══ */}
        {tab === 'profile' && (
          <div className="space-y-4">

            {/* Personal info */}
            <FadeIn delay={0}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <User size={14} style={{ color: '#f59e0b' }} /> Personal Info
                  </h2>
                  {!editingProfile
                    ? <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-white transition-colors">
                        <Edit3 size={12} /> Edit
                      </button>
                    : <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingProfile(false); setProfileName(user.name) }}
                          className="text-xs text-gray-600 hover:text-white flex items-center gap-1">
                          <X size={12} /> Cancel
                        </button>
                        <button onClick={saveProfile} disabled={savingProfile}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50"
                          style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                          <Save size={11} /> {savingProfile ? '…' : 'Save'}
                        </button>
                      </div>
                  }
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 block">Name</label>
                    {editingProfile
                      ? <input value={profileName} onChange={e => setProfileName(e.target.value)}
                          className="w-full text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none"
                          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                          placeholder="Your name" />
                      : <div className="text-sm text-white">{user.name}</div>
                    }
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 block">Email</label>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Mail size={12} className="text-gray-700" /> {user.email}
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>Verified</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 block">Member since</label>
                    <div className="text-sm text-gray-500">
                      {(user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Dietary preferences */}
            <FadeIn delay={60}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Leaf size={14} className="text-green-500" /> Dietary Preferences
                </h2>
                <p className="text-xs text-gray-600 mb-4">
                  These are saved to your profile and automatically added as a note with every order you place, so the kitchen knows.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIETARY_OPTIONS.map(opt => {
                    const active = dietary.includes(opt.id)
                    return (
                      <button key={opt.id} onClick={() => toggleDietary(opt.id)}
                        className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold transition-all active:scale-95"
                        style={active
                          ? { backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                          : { backgroundColor: '#1a1a1a', color: '#666', border: '1px solid #2a2a2a' }}>
                        <span>{opt.emoji}</span>
                        <span className="truncate">{opt.label}</span>
                        {active && <Check size={11} className="ml-auto flex-shrink-0 text-green-400" />}
                      </button>
                    )
                  })}
                </div>
                {dietary.length > 0 && (
                  <p className="text-[10px] text-green-600 mt-3 flex items-center gap-1.5">
                    <Check size={10} />
                    {dietary.length} preference{dietary.length !== 1 ? 's' : ''} active — will appear in your order notes to the kitchen
                  </p>
                )}
              </div>
            </FadeIn>

            {/* Notifications */}
            <FadeIn delay={100}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Bell size={14} style={{ color: '#f59e0b' }} /> Notifications
                </h2>
                <p className="text-xs text-gray-600 mb-4">Preferences saved — in-app push notifications coming soon.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Order updates',     sub: 'When your order status changes',    value: notifyOrder,   key: 'order'   as const },
                    { label: 'Booking reminders', sub: '2 hours before your reservation',   value: notifyBooking, key: 'booking' as const },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm text-white font-medium">{item.label}</div>
                        <div className="text-xs text-gray-600">{item.sub}</div>
                      </div>
                      <button
                        onClick={() => saveNotifPrefs(
                          item.key === 'order' ? !notifyOrder : notifyOrder,
                          item.key === 'booking' ? !notifyBooking : notifyBooking,
                        )}
                        className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={item.value ? { backgroundColor: '#f59e0b' } : { backgroundColor: '#2a2a2a' }}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${item.value ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            {/* Danger */}
            <FadeIn delay={140}>
              <div className="rounded-2xl p-4" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
                <h2 className="text-sm font-bold text-red-500 flex items-center gap-2 mb-3">
                  <AlertTriangle size={13} /> Account
                </h2>
                <button onClick={() => { logout(); router.push('/') }}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 font-medium transition-colors">
                  <LogOut size={13} /> Sign out of all devices
                </button>
              </div>
            </FadeIn>

          </div>
        )}
      </div>
    </div>
  )
}

export default function AccountPage() {
  return <Suspense><AccountContent /></Suspense>
}
