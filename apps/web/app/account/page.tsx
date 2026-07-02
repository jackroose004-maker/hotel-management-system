'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  UtensilsCrossed, ShoppingBag, CalendarDays, LogOut,
  ChevronRight, Clock, CheckCircle2, XCircle,
  ArrowRight, Star, Utensils, Plus, Heart, User,
  Bell, Leaf, Edit3, Save, X, Phone, Mail,
  AlertTriangle, Check,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import { StatusBadge, bookingStatusVariant } from '@/components/ui/StatusBadge'
import toast from 'react-hot-toast'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

/* ── Status helpers ────────────────────────────────────────────────────────── */

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Order Received', ACCEPTED: 'Confirmed',
  PREPARING: 'Being Prepared', READY: 'Ready to Serve',
  DELIVERED: 'Served', CANCELLED: 'Cancelled',
}

const ORDER_STATUS_STYLE: Record<string, React.CSSProperties> = {
  PENDING:   { backgroundColor: 'var(--c-pending-bg)',  color: 'var(--c-pending-fg)' },
  ACCEPTED:  { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)' },
  PREPARING: { backgroundColor: 'var(--c-warning-bg)',  color: 'var(--c-warning-fg)' },
  READY:     { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)' },
  DELIVERED: { backgroundColor: 'var(--c-neutral-bg)',  color: 'var(--c-neutral-fg)' },
  CANCELLED: { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)' },
}

const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Upcoming', CONFIRMED: 'Confirmed', ARRIVED: 'Visited',
  NO_SHOW: 'No-show', CANCELLED: 'Cancelled',
}

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { id: 'vegan',      label: 'Vegan',      emoji: '🌱' },
  { id: 'halal',      label: 'Halal only', emoji: '☪️' },
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

/* ── Brand-colored small button ────────────────────────────────────────────── */
function BrandBtn({ children, onClick, className = '', small = false }: {
  children: React.ReactNode; onClick?: () => void; className?: string; small?: boolean
}) {
  return (
    <button onClick={onClick}
      style={{ backgroundColor: 'var(--brand)' }}
      className={`text-white font-bold rounded-xl transition-opacity hover:opacity-90 active:opacity-70 ${small ? 'text-xs px-3 py-1.5' : 'text-sm px-5 py-2.5'} ${className}`}>
      {children}
    </button>
  )
}

/* ── Star rating widget ────────────────────────────────────────────────────── */
function StarRating({ value, onChange, readonly = false }: {
  value: number; onChange?: (v: number) => void; readonly?: boolean
}) {
  const [hov, setHov] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button key={i}
          disabled={readonly}
          onMouseEnter={() => !readonly && setHov(i)}
          onMouseLeave={() => !readonly && setHov(0)}
          onClick={() => onChange?.(i)}
          className="p-0.5 disabled:cursor-default">
          <Star size={16}
            className={`transition-colors ${(hov || value) >= i ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
        </button>
      ))}
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

function AccountContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token, logout, init } = useAuthStore()
  const cart = useCartStore()

  const [tab, setTab] = useState<'home' | 'orders' | 'bookings' | 'favourites' | 'profile'>('home')
  const [orders, setOrders] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [featuredItems, setFeaturedItems] = useState<any[]>([])
  const [favItems, setFavItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // Feedback state: orderId → { rating, comment, submitting, done }
  const [feedback, setFeedback] = useState<Record<string, { rating: number; comment: string; submitting: boolean; done: boolean }>>({})

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Dietary & notif prefs (DB-backed, seeded from user object)
  const [dietary, setDietary] = useState<string[]>([])
  const [notifyOrder, setNotifyOrder] = useState(true)
  const [notifyBooking, setNotifyBooking] = useState(true)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!token) { router.replace('/login?redirect=/account'); return }
    loadData()
    if (searchParams.get('slot') || searchParams.get('tab') === 'bookings') setTab('bookings')
  }, [token])

  useEffect(() => {
    if (user) {
      setProfileName(user.name ?? '')
      setProfilePhone((user as any).phone ?? '')
      // Seed dietary/notif prefs from the DB user object
      const tags = (user as any).dietaryTags ?? ''
      setDietary(tags ? tags.split(',').filter(Boolean) : [])
      setNotifyOrder((user as any).notifOrderUpdates ?? true)
      setNotifyBooking((user as any).notifBookingReminders ?? true)
    }
  }, [user])

  async function loadData() {
    setLoading(true)
    try {
      const [oRes, bRes, mRes] = await Promise.all([
        fetch(`${API}/orders/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/bookings/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/menu/items`),
      ])
      const [oJson, bJson, mJson] = await Promise.all([oRes.json(), bRes.json(), mRes.json()])
      const oData = oJson?.data ?? oJson
      const bData = bJson?.data ?? bJson
      const mData = mJson?.data ?? mJson

      let userOrders: any[] = Array.isArray(oData) ? oData : []

      try {
        const guestIds: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
        const knownIds = new Set(userOrders.map((o: any) => o.id))
        const missing = guestIds.filter(id => !knownIds.has(id))
        if (missing.length > 0) {
          const guestFetches = await Promise.allSettled(
            missing.map(id => fetch(`${API}/orders/${id}`).then(r => r.json()))
          )
          for (const result of guestFetches) {
            if (result.status === 'fulfilled') {
              const d = result.value?.data ?? result.value
              if (d?.id) userOrders.push(d)
            }
          }
          userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        }
      } catch {}

      setOrders(userOrders)
      setBookings(Array.isArray(bData) ? bData : [])

      const allItems: any[] = Array.isArray(mData) ? mData : []
      setFeaturedItems(allItems.filter(i => i.imageUrl).slice(0, 4))

      // Favorites from DB (logged-in user)
      try {
        const favRes = await fetch(`${API}/auth/favorites`, { headers: { Authorization: `Bearer ${token}` } })
        if (favRes.ok) {
          const favJson = await favRes.json()
          setFavItems(Array.isArray(favJson?.data ?? favJson) ? (favJson?.data ?? favJson) : [])
        }
      } catch { setFavItems([]) }
    } finally { setLoading(false) }
  }

  async function removeFav(itemId: string) {
    // Optimistic update
    setFavItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await fetch(`${API}/auth/favorites/${itemId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      toast.success('Removed from favourites')
    } catch {
      toast.error('Failed to remove — try again')
      loadData() // revert
    }
  }

  async function cancelBooking(id: string) {
    setCancellingId(id)
    try {
      const r = await fetch(`${API}/bookings/${id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) { const d = await r.json(); toast.error((d?.data ?? d)?.message ?? 'Cannot cancel') }
      else { toast.success('Booking cancelled'); loadData() }
    } finally { setCancellingId(null) }
  }

  async function submitFeedback(orderId: string) {
    const fb = feedback[orderId]
    if (!fb || fb.rating === 0) return toast.error('Please select a rating')
    setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: true } }))
    try {
      await fetch(`${API}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, rating: fb.rating, comment: fb.comment }),
      })
      setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: false, done: true } }))
      toast.success('Thank you for your feedback!')
    } catch {
      setFeedback(prev => ({ ...prev, [orderId]: { ...prev[orderId], submitting: false } }))
    }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const r = await fetch(`${API}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profileName }),
      })
      if (r.ok) { toast.success('Profile updated'); setEditingProfile(false) }
      else toast.error('Could not save — try again')
    } finally { setSavingProfile(false) }
  }

  async function toggleDietary(id: string) {
    const next = dietary.includes(id) ? dietary.filter(d => d !== id) : [...dietary, id]
    setDietary(next)
    try {
      await fetch(`${API}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dietaryTags: next.join(',') }),
      })
      toast.success(dietary.includes(id) ? 'Preference removed' : 'Preference saved', { duration: 1200 })
    } catch { toast.error('Could not save preference') }
  }

  async function saveNotifPrefs(order: boolean, booking: boolean) {
    setNotifyOrder(order)
    setNotifyBooking(booking)
    try {
      await fetch(`${API}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notifOrderUpdates: order, notifBookingReminders: booking }),
      })
      toast.success('Preferences saved', { duration: 1200 })
    } catch { toast.error('Could not save preferences') }
  }

  if (!user) return null

  const activeOrders  = orders.filter(o => !['DELIVERED','CANCELLED'].includes(o.status))
  const deliveredOrders = orders.filter(o => o.status === 'DELIVERED')
  const upcomingBooks = bookings.filter(b => ['PENDING','CONFIRMED'].includes(b.status))
  const totalSpent    = orders.reduce((s: number, o: any) => s + Number(o.total), 0)
  const visits        = bookings.filter(b => b.status === 'ARRIVED').length
  const firstName     = user.name.split(' ')[0]

  const TABS = [
    { id: 'home',       label: 'Home',       badge: 0 },
    { id: 'orders',     label: 'Orders',     badge: activeOrders.length },
    { id: 'bookings',   label: 'Bookings',   badge: upcomingBooks.length },
    { id: 'favourites', label: 'Saved',      badge: 0 },
    { id: 'profile',    label: 'Profile',    badge: 0 },
  ] as const

  return (
    <div className="min-h-screen bg-gray-950">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=70"
            alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/30 to-gray-950" />
        </div>

        <div className="relative px-4 sm:px-8 lg:px-16 pt-5 pb-6">
          <div className="flex items-center justify-between mb-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
                <UtensilsCrossed size={15} className="text-white" />
              </div>
              <span className="font-bold text-white text-sm">Al Manzil</span>
            </Link>
            <button onClick={() => { logout(); router.push('/') }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={12} /> Sign out
            </button>
          </div>

          <div className="flex items-center gap-4">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name}
                  className="w-14 h-14 rounded-2xl object-cover"
                  style={{ outline: '2px solid var(--brand)', outlineOffset: '2px' }}
                  referrerPolicy="no-referrer" />
              : <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg"
                  style={{ background: `linear-gradient(135deg, var(--brand), var(--brand-dark))` }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
            }
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Welcome back</p>
              <h1 className="text-xl font-black text-white">{firstName}</h1>
              <p className="text-gray-500 text-xs">{user.email}</p>
            </div>
          </div>

          {!loading && (
            <div className="flex gap-3 mt-5">
              {[
                { label: 'Orders',    value: orders.length },
                { label: 'Total',     value: `AED ${totalSpent.toFixed(0)}` },
                { label: 'Visits',    value: visits },
                { label: 'Saved',     value: favItems.length },
              ].map(s => (
                <div key={s.label} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-center">
                  <div className="font-black text-white text-base">{s.value}</div>
                  <div className="text-gray-500 text-[10px] mt-0.5 truncate">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="px-4 sm:px-8 lg:px-16">
        <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1 gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={tab === t.id ? { backgroundColor: 'var(--brand)' } : {}}
              className={`flex-1 relative py-2.5 px-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                tab === t.id ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {t.label}
              {t.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-white text-[9px] font-black rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--c-success-fg)' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-8 lg:px-16 py-5 pb-12">

        {/* ── HOME TAB ── */}
        {tab === 'home' && (
          <div className="space-y-5">
            {activeOrders.length > 0 && (
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--brand-light)', border: '1px solid var(--brand-dark)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand)' }} />
                    <span className="font-bold text-sm" style={{ color: 'var(--brand-dark)' }}>Order in progress</span>
                  </div>
                  <button onClick={() => setTab('orders')}
                    style={{ color: 'var(--brand-dark)' }}
                    className="text-xs flex items-center gap-1 hover:opacity-70">
                    Track <ArrowRight size={12} />
                  </button>
                </div>
                {activeOrders.slice(0, 1).map(o => (
                  <div key={o.id} className="text-xs text-gray-600">
                    <span className="font-bold" style={{ color: 'var(--brand-dark)' }}>
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    {' · '}
                    {o.items.slice(0, 2).map((i: any) => i.menuItem.name).join(', ')}
                    {o.items.length > 2 && ` +${o.items.length - 2} more`}
                  </div>
                ))}
              </div>
            )}

            {upcomingBooks.length > 0 && (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--c-info-bg)', border: '1px solid var(--c-info-bdr)' }}>
                <CalendarDays size={20} style={{ color: 'var(--c-info-fg)' }} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: 'var(--c-info-fg)' }}>Upcoming reservation</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(upcomingBooks[0].slotDate).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' at '}{slotLabel(upcomingBooks[0].slotTime)} · {upcomingBooks[0].partySize} guests
                  </div>
                </div>
                <button onClick={() => setTab('bookings')} style={{ color: 'var(--c-info-fg)' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Dietary prefs reminder if not set */}
            {dietary.length === 0 && (
              <button onClick={() => setTab('profile')}
                className="w-full rounded-2xl p-3.5 flex items-center gap-3 bg-gray-900 border border-dashed border-gray-700 hover:border-gray-500 transition-colors text-left">
                <Leaf size={16} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">Set dietary preferences</div>
                  <div className="text-xs text-gray-500 mt-0.5">Helps the kitchen prepare your orders correctly</div>
                </div>
                <ChevronRight size={14} className="text-gray-600" />
              </button>
            )}

            {favItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Heart size={11} className="text-red-400 fill-red-400" /> Your Saved
                  </h2>
                  <button onClick={() => setTab('favourites')} style={{ color: 'var(--brand)' }} className="text-xs flex items-center gap-1 hover:opacity-70">
                    See all <ArrowRight size={11} />
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {favItems.slice(0, 6).map((item: any) => (
                    <div key={item.id}
                      className="flex-shrink-0 w-28 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-gray-600"
                      onClick={() => {
                        cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })
                        toast.success(`${item.name} added to cart!`, { position: 'bottom-center', duration: 1500 })
                        router.push('/menu')
                      }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-20 object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        : <div className="w-full h-20 bg-gray-800 flex items-center justify-center text-2xl">🍽️</div>
                      }
                      <div className="p-2">
                        <div className="text-white text-[10px] font-semibold truncate">{item.name}</div>
                        <div className="text-[10px] font-black mt-0.5" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/menu"
                  style={{ backgroundColor: 'var(--brand)' }}
                  className="rounded-2xl p-4 flex flex-col gap-3 transition-opacity hover:opacity-90 shadow-lg">
                  <Utensils size={22} className="text-white" />
                  <div>
                    <div className="font-bold text-white text-sm">Order Food</div>
                    <div className="text-white/60 text-xs">Browse full menu</div>
                  </div>
                </Link>
                <Link href="/book"
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:border-gray-600">
                  <CalendarDays size={22} style={{ color: 'var(--brand)' }} />
                  <div>
                    <div className="font-bold text-white text-sm">Reserve Table</div>
                    <div className="text-gray-500 text-xs">Pick date &amp; time</div>
                  </div>
                </Link>
              </div>
            </div>

            {featuredItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Must Try</h2>
                  <Link href="/menu" style={{ color: 'var(--brand)' }} className="text-xs flex items-center gap-1 hover:opacity-70">
                    View all <ArrowRight size={11} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {featuredItems.map((item: any) => (
                    <div key={item.id}
                      className="group bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition-all hover:border-gray-600 cursor-pointer"
                      onClick={() => {
                        cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })
                        toast.success(`${item.name} added!`, { position: 'bottom-center', duration: 1500 })
                        router.push('/menu')
                      }}>
                      <div className="h-28 overflow-hidden relative">
                        <img src={item.imageUrl} alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                          <div className="rounded-full w-9 h-9 flex items-center justify-center shadow-lg" style={{ backgroundColor: 'var(--brand)' }}>
                            <Plus size={16} className="text-white" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="font-semibold text-white text-xs truncate">{item.name}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-black text-sm" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(0)}</span>
                          <span className="text-gray-600 text-[10px] flex items-center gap-0.5">
                            <Clock size={9} /> {item.prepTimeMins}m
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-5">
              <div className="flex gap-0.5 mb-2">
                {[1,2,3,4,5].map(i => <Star key={i} size={12} className="text-yellow-400 fill-yellow-400" />)}
              </div>
              <p className="text-white text-sm font-semibold leading-snug mb-1">
                &ldquo;The Malabar Biriyani is unlike anything else in Dubai.&rdquo;
              </p>
              <p className="text-gray-500 text-xs">— Mohammed A., verified guest</p>
            </div>
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-900 rounded-2xl animate-pulse" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag size={28} className="text-gray-700" />
                </div>
                <p className="text-white font-semibold mb-1">No orders yet</p>
                <p className="text-gray-500 text-sm mb-5">Ready to try something amazing?</p>
                <Link href="/menu"
                  style={{ backgroundColor: 'var(--brand)' }}
                  className="inline-flex items-center gap-2 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-opacity hover:opacity-90">
                  <Utensils size={15} /> Browse Menu
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {activeOrders.length > 0 && (
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Active</div>
                )}
                {orders.map(order => {
                  const isActive = !['DELIVERED','CANCELLED'].includes(order.status)
                  const statusStyle = ORDER_STATUS_STYLE[order.status] ?? ORDER_STATUS_STYLE.PENDING
                  const fb = feedback[order.id]
                  const hasFeedback = (order as any).feedback
                  return (
                    <div key={order.id}
                      className={`rounded-2xl border p-4 transition-all ${isActive ? 'bg-gray-900' : 'bg-gray-900/50 border-gray-800'}`}
                      style={isActive ? { borderColor: 'var(--brand-dark)' } : {}}>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5"
                            style={statusStyle}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'currentColor' }} />
                            {ORDER_STATUS_LABEL[order.status] ?? order.status}
                          </span>
                          <span className="text-gray-700 text-xs font-mono">#{order.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <span className="text-gray-600 text-[10px]">{timeAgo(order.createdAt)}</span>
                      </div>

                      <div className="text-gray-400 text-xs mb-3 leading-relaxed">
                        {order.items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.menuItem.name}`).join(', ')}
                        {order.items.length > 3 && <span className="text-gray-600"> +{order.items.length - 3} more</span>}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-black text-white text-base">AED {Number(order.total).toFixed(2)}</span>
                          <span className="text-gray-600 text-xs ml-2">
                            {order.type === 'TAKEAWAY' ? `Token #${order.tokenNumber}` : order.table ? `Table ${order.table.tableNumber}` : 'Dine-in'}
                          </span>
                        </div>
                        {isActive && (
                          <Link href="/menu"
                            style={{ color: 'var(--brand)', borderColor: 'var(--brand-dark)' }}
                            className="flex items-center gap-1 text-xs font-semibold border px-3 py-1.5 rounded-xl hover:opacity-70">
                            Track <ChevronRight size={12} />
                          </Link>
                        )}
                      </div>

                      {/* Feedback prompt for delivered orders */}
                      {order.status === 'DELIVERED' && !hasFeedback && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          {fb?.done ? (
                            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-success-fg)' }}>
                              <Check size={13} /> Thanks for your feedback!
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Rate this order</div>
                              <div className="flex items-center gap-3">
                                <StarRating
                                  value={fb?.rating ?? 0}
                                  onChange={rating => setFeedback(prev => ({ ...prev, [order.id]: { rating, comment: prev[order.id]?.comment ?? '', submitting: false, done: false } }))}
                                />
                                {fb?.rating > 0 && (
                                  <>
                                    <input
                                      value={fb?.comment ?? ''}
                                      onChange={e => setFeedback(prev => ({ ...prev, [order.id]: { ...prev[order.id], comment: e.target.value } }))}
                                      placeholder="Any comments? (optional)"
                                      className="flex-1 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none placeholder-gray-600"
                                    />
                                    <button onClick={() => submitFeedback(order.id)}
                                      disabled={fb?.submitting}
                                      style={{ backgroundColor: 'var(--brand)' }}
                                      className="text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 flex-shrink-0">
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
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BOOKINGS TAB ── */}
        {tab === 'bookings' && (
          <div className="space-y-5">
            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-24 bg-gray-900 rounded-2xl animate-pulse" />)}
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CalendarDays size={28} className="text-gray-700" />
                </div>
                <p className="text-white font-semibold mb-1">No reservations yet</p>
                <p className="text-gray-500 text-sm mb-5">Reserve your table in seconds</p>
                <Link href="/book"
                  style={{ backgroundColor: 'var(--brand)' }}
                  className="inline-flex items-center gap-2 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-opacity hover:opacity-90">
                  <CalendarDays size={15} /> Book a Table
                </Link>
              </div>
            ) : (
              <>
                {upcomingBooks.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Upcoming</div>
                    <div className="space-y-3">
                      {upcomingBooks.map(b => (
                        <div key={b.id} className="bg-gray-900 rounded-2xl p-4" style={{ border: '1px solid var(--c-info-bdr)' }}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="font-bold text-white text-sm">
                                {new Date(b.slotDate).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'short' })}
                              </div>
                              <div className="font-semibold text-sm mt-0.5" style={{ color: 'var(--brand)' }}>{slotLabel(b.slotTime)}</div>
                            </div>
                            <StatusBadge variant={bookingStatusVariant(b.status)} label={BOOKING_STATUS_LABEL[b.status] ?? b.status} size="sm" />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                            <span>Table {b.table?.tableNumber ?? '—'}</span>
                            <span>·</span>
                            <span>{b.partySize} {b.partySize === 1 ? 'guest' : 'guests'}</span>
                            {b.notes && <><span>·</span><span className="truncate text-gray-600">{b.notes}</span></>}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg"
                              style={{ backgroundColor: 'var(--c-warning-bg)', color: 'var(--c-warning-fg)', border: '1px solid var(--c-warning-bdr)' }}>
                              <Clock size={10} /> Arrive within 15 min
                            </div>
                            <button onClick={() => cancelBooking(b.id)} disabled={cancellingId === b.id}
                              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 font-medium">
                              {cancellingId === b.id ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bookings.filter(b => !['PENDING','CONFIRMED'].includes(b.status)).length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">History</div>
                    <div className="space-y-2">
                      {bookings.filter(b => !['PENDING','CONFIRMED'].includes(b.status)).map(b => (
                        <div key={b.id} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-3.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-300 truncate">
                              {new Date(b.slotDate).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' · '}{slotLabel(b.slotTime)}
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">{b.partySize} guests</div>
                          </div>
                          <StatusBadge variant={bookingStatusVariant(b.status)} label={BOOKING_STATUS_LABEL[b.status] ?? b.status} size="xs" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Link href="/book"
                  style={{ borderColor: 'var(--brand-dark)', color: 'var(--brand)' }}
                  className="flex items-center justify-center gap-2 border py-3.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-70">
                  <CalendarDays size={15} /> Make another reservation
                </Link>
              </>
            )}
          </div>
        )}

        {/* ── FAVOURITES TAB ── */}
        {tab === 'favourites' && (
          <div>
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-44 bg-gray-900 rounded-2xl animate-pulse" />)}
              </div>
            ) : favItems.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Heart size={28} className="text-gray-700" />
                </div>
                <p className="text-white font-semibold mb-1">No saved items yet</p>
                <p className="text-gray-500 text-sm mb-5">Tap ♡ on any dish to save it here</p>
                <Link href="/menu"
                  style={{ backgroundColor: 'var(--brand)' }}
                  className="inline-flex items-center gap-2 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-opacity hover:opacity-90">
                  <Utensils size={15} /> Browse Menu
                </Link>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-4">{favItems.length} saved dish{favItems.length !== 1 ? 'es' : ''}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {favItems.map((item: any) => (
                    <div key={item.id}
                      className="group bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl overflow-hidden transition-all">
                      <div className="relative h-32 overflow-hidden">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-4xl">🍽️</div>
                        }
                        <button onClick={() => removeFav(item.id)}
                          className="absolute top-2 right-2 w-7 h-7 bg-gray-950/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors">
                          <Heart size={13} className="text-red-400 fill-red-400" />
                        </button>
                      </div>
                      <div className="p-3">
                        <div className="font-semibold text-white text-xs truncate mb-1">{item.name}</div>
                        {item.description && (
                          <div className="text-gray-600 text-[10px] line-clamp-2 mb-2">{item.description}</div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(0)}</span>
                          <button
                            onClick={() => {
                              cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })
                              toast.success(`${item.name} added!`, { position: 'bottom-center', duration: 1500 })
                              router.push('/menu')
                            }}
                            style={{ backgroundColor: 'var(--brand)' }}
                            className="flex items-center gap-1 text-[10px] font-bold text-white px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80">
                            <Plus size={10} /> Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div className="space-y-6">

            {/* Profile info */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <User size={15} style={{ color: 'var(--brand)' }} /> Personal Info
                </h2>
                {!editingProfile
                  ? <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                      <Edit3 size={12} /> Edit
                    </button>
                  : <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingProfile(false); setProfileName(user.name) }}
                        className="text-xs text-gray-500 hover:text-white flex items-center gap-1">
                        <X size={12} /> Cancel
                      </button>
                      <button onClick={saveProfile} disabled={savingProfile}
                        style={{ backgroundColor: 'var(--brand)' }}
                        className="text-xs text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50">
                        <Save size={11} /> {savingProfile ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                }
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 block">Name</label>
                  {editingProfile
                    ? <input value={profileName} onChange={e => setProfileName(e.target.value)}
                        className="w-full bg-gray-800 text-white text-sm px-3.5 py-2.5 rounded-xl border border-gray-700 focus:outline-none focus:border-gray-500"
                        placeholder="Your name" />
                    : <div className="text-sm text-white">{user.name}</div>
                  }
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 block">Email</label>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <Mail size={13} className="text-gray-600" /> {user.email}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>Verified</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 block">Member since</label>
                  <div className="text-sm text-gray-400">
                    {(user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Dietary preferences */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <Leaf size={15} className="text-green-500" /> Dietary Preferences
              </h2>
              <p className="text-xs text-gray-500 mb-4">Select all that apply — visible to kitchen when you order</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIETARY_OPTIONS.map(opt => {
                  const active = dietary.includes(opt.id)
                  return (
                    <button key={opt.id} onClick={() => toggleDietary(opt.id)}
                      style={active ? { backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)', border: '1px solid var(--c-success-bdr)' } : {}}
                      className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold transition-all ${
                        active ? '' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                      }`}>
                      <span>{opt.emoji}</span>
                      <span className="truncate">{opt.label}</span>
                      {active && <Check size={12} className="ml-auto flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
              {dietary.length > 0 && (
                <p className="text-[10px] text-gray-500 mt-3">
                  {dietary.length} preference{dietary.length !== 1 ? 's' : ''} saved. These will be shown as a note with your orders.
                </p>
              )}
            </div>

            {/* Notification preferences */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                <Bell size={15} style={{ color: 'var(--brand)' }} /> Notifications
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Order updates', sub: 'When your order status changes', value: notifyOrder, key: 'order' as const },
                  { label: 'Booking reminders', sub: '2 hours before your reservation', value: notifyBooking, key: 'booking' as const },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-white font-medium">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.sub}</div>
                    </div>
                    <button
                      onClick={() => saveNotifPrefs(
                        item.key === 'order' ? !notifyOrder : notifyOrder,
                        item.key === 'booking' ? !notifyBooking : notifyBooking,
                      )}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${item.value ? '' : 'bg-gray-700'}`}
                      style={item.value ? { backgroundColor: 'var(--brand)' } : {}}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${item.value ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div className="border border-red-900/40 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-3">
                <AlertTriangle size={14} /> Account
              </h2>
              <button onClick={() => { logout(); router.push('/') }}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-medium transition-colors">
                <LogOut size={14} /> Sign out of all devices
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountContent />
    </Suspense>
  )
}
