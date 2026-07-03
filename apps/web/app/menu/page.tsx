'use client'
import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import {
  Plus, Minus, ShoppingCart, X, ArrowLeft, Clock,
  CheckCircle, ChefHat, Bike, UtensilsCrossed,
  Loader2, Lock, Banknote, Moon, Sun, Heart, Table2, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { requestNotifyPermission, notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import StripePaymentForm from '@/components/StripePaymentForm'
import ForceDark from '@/components/ForceDark'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

async function toggleFavOnServer(menuItemId: string): Promise<'added' | 'removed' | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (!token) return null
  try {
    const r = await api.post(`/auth/favorites/${menuItemId}`)
    return r.data?.action ?? null
  } catch { return null }
}

type View = 'menu' | 'cart' | 'payment' | 'tracking'

interface ModifierOption {
  id: string; name: string; priceAdd: number; isDefault: boolean
}
interface ModifierGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number
  options: ModifierOption[]
}
interface MenuItem {
  id: string; name: string; description?: string
  price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string
  modifierGroups?: ModifierGroup[]
}
interface Category { id: string; name: string; items: MenuItem[] }
interface Order {
  id: string; status: string; tokenNumber?: number; total: number
  vatAmount: number; subtotal: number; type: string; paymentStatus: string
  userId?: string | null
  items: { quantity: number; menuItem: { name: string } }[]
}

const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }
const STEPS = [
  { label: 'Order Received', icon: Clock },
  { label: 'Confirmed', icon: CheckCircle },
  { label: 'Being Prepared', icon: ChefHat },
  { label: 'Ready to Serve', icon: Bike },
]

const fadeUp = 'opacity-0 translate-y-4 animate-[fadeUp_0.4s_ease_forwards]'

function FoodImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center`} style={{ background: 'linear-gradient(135deg, #1a1208, #111)' }}>
        <UtensilsCrossed size={28} style={{ color: '#2a2a2a' }} />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`${className} object-cover`} onError={() => setFailed(true)} />
  )
}

function MenuPageInner() {
  const searchParams = useSearchParams()
  // When coming from book page: tableId + bookingId pre-set, card-only
  const urlTableId   = searchParams.get('tableId')   ?? ''
  const urlBookingId = searchParams.get('bookingId') ?? ''
  const urlQr        = searchParams.get('qr')        ?? ''   // from QR scan
  const fromBooking  = !!urlTableId && !!urlBookingId
  const fromQr       = !!urlQr

  const [view, setView] = useState<View>('menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [placing, setPlacing] = useState(false)
  const [notesOpen, setNotesOpen] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [favs, setFavs] = useState<string[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [contactPhone, setContactPhone] = useState('')
  const [guestOrderCount, setGuestOrderCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem('almanzil_guest_order_count') || '0')
  })
  // Item drawer state
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})  // groupId → optionId
  const [drawerNotes, setDrawerNotes] = useState('')
  const [showCashConfirm, setShowCashConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Dine-in table selection
  const [allTables, setAllTables]     = useState<{id:string; tableNumber:number; name:string|null; capacity:number; status:string}[]>([])
  const [tableInput, setTableInput]   = useState('')
  const [tableId, setTableId]         = useState(urlTableId)
  const [tableNum, setTableNum]       = useState<number | null>(null)
  const [tableError, setTableError]   = useState('')
  const [qrTableName, setQrTableName] = useState('')
  const [qrTableStatus, setQrTableStatus] = useState('')

  const cart = useCartStore()
  const { user: authUser } = useAuthStore()
  const { dark, toggle } = useThemeStore()

  // One UUID per device per browser session = this person's personal tab at the table.
  // sessionStorage means it resets if they close the tab (new visit = new tab/bill).
  const [guestTabToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const existing = sessionStorage.getItem('almanzil_tab_token')
      if (existing) return existing
      // crypto.randomUUID needs HTTPS — use a safe fallback for HTTP dev environments
      const token = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('almanzil_tab_token', token)
      return token
    } catch {
      return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    }
  })

  useEffect(() => {
    setMounted(true)
    requestNotifyPermission()
    if (fromBooking || fromQr) {
      cart.setOrderType('DINE_IN')
    } else {
      cart.setOrderType('TAKEAWAY')
    }
    // Favourites: customers (logged-in) only — guests don't get this feature
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (authToken) {
      setIsLoggedIn(true)
      api.get('/auth/favorites').then(r => {
        const items: { id: string }[] = r.data ?? []
        setFavs(items.map(i => i.id))
      }).catch(() => {})
    }
    api.get('/menu/categories').then(r => {
      setCategories(r.data)
      if (r.data[0]) setActiveCategory(r.data[0].id)
    })
    api.get('/tables').then(r => {
      setAllTables(r.data ?? [])
      // If coming from booking, resolve tableId → tableNumber
      if (urlTableId) {
        const t = (r.data ?? []).find((x: any) => x.id === urlTableId)
        if (t) { setTableNum(t.tableNumber); setTableInput(String(t.tableNumber)) }
      }
    })
    // If coming from QR scan, resolve qrCode → table UUID
    if (urlQr) {
      api.get(`/tables/qr/${urlQr}`).then(r => {
        if (r.data) {
          setTableId(r.data.id)
          setTableNum(r.data.tableNumber)
          setQrTableName(r.data.name ?? `Table ${r.data.tableNumber}`)
          setQrTableStatus(r.data.status ?? '')
          cart.setTableId(r.data.id)
        }
      }).catch(() => {})
    }
    // Restore in-progress order — clear if >4h old or terminal status
    const savedOrderId = sessionStorage.getItem('activeOrderId')
    const savedOrderTs = sessionStorage.getItem('activeOrderTs')
    const isStale = savedOrderTs && (Date.now() - parseInt(savedOrderTs)) > 4 * 60 * 60 * 1000
    if (savedOrderId && !isStale) {
      api.get(`/orders/${savedOrderId}`).then(r => {
        const o = r.data
        const isDone = !o || o.status === 'CANCELLED' || o.paymentStatus === 'PAID'
        if (!isDone) {
          setOrder(o)
          setView('tracking')
        } else {
          sessionStorage.removeItem('activeOrderId')
          sessionStorage.removeItem('activeOrderTs')
        }
      }).catch(() => {
        sessionStorage.removeItem('activeOrderId')
        sessionStorage.removeItem('activeOrderTs')
      })
    } else if (isStale) {
      sessionStorage.removeItem('activeOrderId')
      sessionStorage.removeItem('activeOrderTs')
    }
  }, [])

  function resolveTable(num: string) {
    setTableInput(num)
    setTableError('')
    setTableId('')
    setTableNum(null)
    const n = parseInt(num)
    if (!n) return
    const found = allTables.find(t => t.tableNumber === n)
    if (!found) { setTableError(`Table ${n} not found`) }
    else { setTableId(found.id); setTableNum(found.tableNumber); setTableError('') }
  }

  useEffect(() => {
    if (!order) return
    const socket = getSocket()
    const handler = (updated: Order) => {
      if (updated.id !== order.id) return
      setOrder(updated)
      if (updated.status === 'ACCEPTED' && order.status === 'PENDING')
        notify.order.accepted('Your order')
      if (updated.status === 'PREPARING')
        notify.order.preparing('Your order')
      if (updated.status === 'READY')
        notify.order.readyGuest()
      if (updated.status === 'CANCELLED')
        notify.order.cancelled()
      // Clear session only when fully paid or cancelled — cash orders stay open until paid
      if (updated.status === 'CANCELLED' || updated.paymentStatus === 'PAID') {
        sessionStorage.removeItem('activeOrderId')
        sessionStorage.removeItem('activeOrderTs')
      }
    }
    socket.on('order:updated', handler)
    socket.on('order:ready', handler)
    return () => { socket.off('order:updated', handler); socket.off('order:ready', handler) }
  }, [order?.id, order?.status])

  const placeOrder = async (payWithCard: boolean) => {
    if (cart.items.length === 0) return
    // Dine-in requires a valid table
    if (cart.orderType === 'DINE_IN' && !tableId) {
      notify.error('Please enter your table number first')
      return
    }
    // Takeaway requires card payment (no cash at counter for takeaway)
    if (cart.orderType === 'TAKEAWAY' && !payWithCard) {
      notify.error('Takeaway orders require card payment')
      return
    }
    setPlacing(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const { data: newOrder } = await api.post('/orders', {
        type: cart.orderType,
        tableId: cart.orderType === 'DINE_IN' ? tableId : undefined,
        ...(!token && cart.orderType === 'DINE_IN' ? { guestTabToken } : {}),
        ...(cart.orderType === 'TAKEAWAY' && contactPhone ? { contactPhone } : {}),
        // Dietary tags flow to kitchen as order-level notes
        ...(() => {
          const tags = (authUser as any)?.dietaryTags
          return tags ? { notes: `[Dietary: ${tags.replace(/,/g, ', ')}]` } : {}
        })(),
        items: cart.items.map(i => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          notes: [
            (i.modifiers ?? []).length > 0 ? `[${(i.modifiers ?? []).map(m => `${m.groupName}: ${m.name}`).join(', ')}]` : '',
            i.notes || '',
          ].filter(Boolean).join(' ') || undefined,
        })),
      })
      setOrder(newOrder)
      sessionStorage.setItem('activeOrderId', newOrder.id)
      sessionStorage.setItem('activeOrderTs', String(Date.now()))
      // Persist order ID for account history and for claim-on-signin (Option B)
      try {
        const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
        if (!ids.includes(newOrder.id)) ids.unshift(newOrder.id)
        localStorage.setItem('almanzil_order_ids', JSON.stringify(ids.slice(0, 30)))
        // Track guest order count for signup nudge (only for non-logged-in users)
        if (!token) {
          const count = parseInt(localStorage.getItem('almanzil_guest_order_count') || '0') + 1
          localStorage.setItem('almanzil_guest_order_count', String(count))
          setGuestOrderCount(count)
        }
      } catch {}
      cart.clear()

      if (payWithCard) {
        const { data } = await api.post(`/payments/create-intent/${newOrder.id}`)
        setClientSecret(data.clientSecret)
        setView('payment')
      } else {
        const { data: cashOrder } = await api.post(`/payments/cash/${newOrder.id}`)
        setOrder(cashOrder)
        setView('tracking')
        notify.success('Order placed!', 'Order Placed — A staff member will confirm shortly')
      }
    } catch {
      notify.error('Could not place order. Try again.')
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async () => {
    if (!order) return
    setCancelling(true)
    try {
      await api.post(`/orders/${order.id}/cancel`)
      setShowCancelConfirm(false)
      sessionStorage.removeItem('activeOrderId')
      sessionStorage.removeItem('activeOrderTs')
      setOrder(null)
      setView('menu')
      notify.info('Order cancelled')
    } catch {
      notify.error('Could not cancel — please ask a staff member')
    } finally {
      setCancelling(false)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!order) return
    try {
      const { data } = await api.post(`/payments/confirm/${order.id}`, { paymentIntentId })
      setOrder(data.order)
      setClientSecret(null)
      setView('tracking')
      notify.success('Payment confirmed! 🎉', '💳 Payment Confirmed')
    } catch {
      notify.error('Payment went through but confirmation failed. Show this screen to staff.')
      setView('tracking')
    }
  }

  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0)
  const stepIdx = order ? (STATUS_STEP[order.status] ?? 0) : 0

  const FAV_ID = '__favorites__'

  // ─── REFS & SCROLL HOOKS (must be above any early returns) ────────────────
  const mainRef = useRef<HTMLElement>(null)
  const catTabsRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const scrollingProgrammatically = useRef(false)

  // Scroll-spy: watch all category sections, update active pill
  // root: null = viewport (window scrolls, not the <main> element)
  useEffect(() => {
    if (categories.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        if (scrollingProgrammatically.current) return
        // Pick the topmost intersecting section
        let topEntry: IntersectionObserverEntry | null = null
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!topEntry || e.boundingClientRect.top < topEntry.boundingClientRect.top) topEntry = e
          }
        }
        if (topEntry) setActiveCategory(topEntry.target.id.replace('cat-', ''))
      },
      { root: null, rootMargin: '-25% 0px -60% 0px', threshold: 0 }
    )
    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [categories])

  // Auto-scroll the category pill into view when activeCategory changes
  useEffect(() => {
    const pill = catTabsRef.current?.querySelector(`[data-cat="${activeCategory}"]`) as HTMLElement | null
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeCategory])

  const scrollToCategory = useCallback((id: string) => {
    setActiveCategory(id)
    const el = sectionRefs.current[id]
    if (!el) return
    // Header is ~112px (brand row 56px + pill rail ~56px)
    const headerOffset = 120
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset
    scrollingProgrammatically.current = true
    window.scrollTo({ top, behavior: 'smooth' })
    setTimeout(() => { scrollingProgrammatically.current = false }, 800)
  }, [])

  // ─── PAYMENT VIEW ─────────────────────────────────────────────────────────
  if (view === 'payment' && clientSecret && order) {
    return (
      <div className="min-h-screen flex flex-col animate-[fadeIn_0.3s_ease_forwards]" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        <div className="border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10" style={{ backgroundColor: '#0d0d0d', borderColor: '#1a1a1a' }}>
          <button onClick={() => setView('cart')} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={20} />
          </button>
          <Lock size={16} className="text-green-500" />
          <span className="font-semibold text-sm dark:text-white">Secure Payment</span>
        </div>
        <div className="flex-1 max-w-md mx-auto w-full px-4 py-6">
          <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Order Summary</div>
            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-400">
                  <span>{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="pt-3 space-y-1" style={{ borderTop: '1px solid #1e1e1e' }}>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Net (excl. VAT)</span><span>AED {Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>VAT (5%)</span><span>AED {Number(order.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-white">
                <span>Total</span><span style={{ color: '#f59e0b' }}>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: dark ? 'night' : 'stripe', variables: { colorPrimary: '#f97316' } } }}>
            <StripePaymentForm
              orderId={order.id}
              total={Number(order.total)}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setView('cart')}
            />
          </Elements>
          <p className="text-center text-xs text-gray-300 mt-4">
            Test card: 4242 4242 4242 4242 · Any future date · Any CVC
          </p>
        </div>
      </div>
    )
  }

  // ─── TRACKING VIEW ────────────────────────────────────────────────────────
  if (view === 'tracking' && order) {
    return (
      <div className="min-h-screen flex flex-col animate-[fadeIn_0.3s_ease_forwards]" style={{ backgroundColor: '#080808', position: 'relative', overflow: 'hidden' }}>
        <ForceDark />

        {/* Animated background orbs */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{
            position: 'absolute', top: '10%', left: '20%', width: 300, height: 300,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
            animation: 'pulseGlow 6s ease-in-out infinite, orbitDrift 18s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', bottom: '15%', right: '15%', width: 250, height: 250,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
            animation: 'pulseGlow 8s ease-in-out infinite 3s, orbitDrift 22s ease-in-out infinite reverse',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '60%', width: 180, height: 180,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
            animation: 'pulseGlow 10s ease-in-out infinite 1.5s',
          }} />
          {/* Grain texture */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }} />
          {/* Top gold line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.4) 30%, rgba(245,158,11,0.4) 70%, transparent)',
          }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div className="border-b px-4 h-14 flex items-center justify-between" style={{ backgroundColor: 'rgba(13,13,13,0.8)', borderColor: '#1a1a1a', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-amber-500" />
            <span className="font-bold text-sm text-white">Al Manzil</span>
          </div>
          <div className="text-sm text-gray-400">
            {order.tokenNumber ? `Token #${order.tokenNumber}` : ''}
          </div>
        </div>
        <div className="flex-1 max-w-md mx-auto w-full px-4 py-8">
          <div className="text-center mb-8">
            <div className={`text-6xl mb-4 transition-all duration-500 ${order.status === 'READY' ? 'animate-bounce' : order.status !== 'CANCELLED' ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}`}>
              {order.status === 'PENDING' && '📋'}
              {order.status === 'ACCEPTED' && '✅'}
              {order.status === 'PREPARING' && '👨‍🍳'}
              {order.status === 'READY' && '🎉'}
              {order.status === 'DELIVERED' && '😊'}
              {order.status === 'CANCELLED' && '❌'}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {order.status === 'PENDING' && 'Order Received'}
              {order.status === 'ACCEPTED' && 'Order Confirmed'}
              {order.status === 'PREPARING' && 'Being Prepared'}
              {order.status === 'READY' && 'Ready to Serve!'}
              {order.status === 'DELIVERED' && 'Enjoy Your Meal!'}
              {order.status === 'CANCELLED' && 'Order Cancelled'}
            </h1>
            <p className="text-gray-400 text-sm">
              {order.status === 'PENDING' && (order.paymentStatus === 'UNPAID' ? 'Awaiting staff approval — cash at checkout' : 'Sending to kitchen...')}
              {order.status === 'ACCEPTED' && 'Your order is in the kitchen queue'}
              {order.status === 'PREPARING' && "Our chef is on it — won't be long!"}
              {order.status === 'READY' && 'Your waiter is on the way'}
              {order.status === 'DELIVERED' && 'Thank you for dining with us'}
              {order.status === 'CANCELLED' && 'Please speak to a staff member at the counter'}
            </p>
            {order.paymentStatus === 'PAID' && (
              <span className="inline-block mt-3 text-green-600 text-xs font-bold bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-3 py-1.5 rounded-full">✓ Payment Confirmed</span>
            )}
            {order.paymentStatus === 'UNPAID' && order.status !== 'PENDING' && (
              <span className="inline-block mt-3 text-amber-600 text-xs font-bold bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-full">💵 Pay Cash at Checkout</span>
            )}
          </div>

          <div className="relative mb-8 px-2">
            <div className="flex justify-between relative z-10">
              {STEPS.map((step, i) => {
                const Icon = step.icon
                const done = i <= stepIdx
                const active = i === stepIdx
                return (
                  <div key={step.label} className="flex flex-col items-center gap-1.5 w-16">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${active ? 'ring-4 ring-amber-500/25' : ''}`}
                      style={{ backgroundColor: done ? '#f59e0b' : '#1a1a1a', borderColor: done ? '#f59e0b' : '#2a2a2a' }}>
                      <Icon size={18} style={{ color: done ? '#000' : '#555' }} />
                    </div>
                    <span className={`text-xs text-center leading-tight font-medium ${done ? 'text-amber-400' : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-200 dark:bg-gray-700 z-0">
              <div className="h-full transition-all duration-700" style={{ width: `${Math.min((stepIdx / 3) * 100, 100)}%`, backgroundColor: '#f59e0b', boxShadow: '0 0 8px rgba(245,158,11,0.5)' }} />
            </div>
          </div>

          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-white">Your Order</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {order.paymentStatus === 'PAID' ? '✓ Paid' : 'Cash'}
              </span>
            </div>
            <div className="space-y-1.5 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-400">{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="pt-3 space-y-1" style={{ borderTop: '1px solid #1e1e1e' }}>
              <div className="flex justify-between text-xs text-gray-500"><span>Net (excl. VAT)</span><span>AED {Number(order.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>VAT (5%)</span><span>AED {Number(order.vatAmount).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-white"><span>Total</span><span style={{ color: '#f59e0b' }}>AED {Number(order.total).toFixed(2)}</span></div>
            </div>
          </div>

          {/* "Order More" — only show for dine-in so they know it adds to their same bill */}
          {order.type === 'DINE_IN' && (
            <div className="rounded-2xl p-4 mb-3" style={{ border: '1px solid rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.05)' }}>
              <p className="text-xs font-semibold text-amber-400 mb-0.5">Want to order something else?</p>
              <p className="text-xs text-amber-400/60 mb-3">
                Any new items will be added to <strong>your personal bill</strong> for this table — not a new separate order.
              </p>
              <button onClick={() => {
                setView('menu')
                setOrder(null)
                sessionStorage.removeItem('activeOrderId')
                sessionStorage.removeItem('activeOrderTs')
              }}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                + Order More Items
              </button>
            </div>
          )}
          {order.type === 'TAKEAWAY' && (
            <button onClick={() => {
              setView('menu')
              setOrder(null)
              sessionStorage.removeItem('activeOrderId')
              sessionStorage.removeItem('activeOrderTs')
            }}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              style={{ border: '1px solid #2a2a2a' }}>
              + Order More
            </button>
          )}

          {/* Cancel order — only while PENDING */}
          {order.status === 'PENDING' && (
            <button onClick={() => setShowCancelConfirm(true)}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-600 hover:text-red-400 transition-colors mt-2"
              style={{ border: '1px solid #1e1e1e' }}>
              Cancel Order
            </button>
          )}

          {/* Signup nudge — shown to guests after their 2nd order */}
          {guestOrderCount >= 2 && !order?.userId && (
            <div className="rounded-2xl p-4 mt-3" style={{ border: '1px solid rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.05)' }}>
              <p className="text-sm font-bold text-amber-400 mb-1">Save your order history</p>
              <p className="text-xs text-amber-400/60 mb-1">
                Create a free account to track past orders and check out faster.
              </p>
              <p className="text-[10px] text-amber-400/40 mb-3">
                You'll be brought back here to continue tracking this order.
              </p>
              <div className="flex gap-2">
                <Link href="/login?redirect=/menu" className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center transition-colors"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                  Sign Up Free
                </Link>
                <Link href="/login?redirect=/menu" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-colors"
                  style={{ border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                  Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    )
  }

  // ─── CART VIEW ────────────────────────────────────────────────────────────
  if (view === 'cart') {
    // QR guests: block until table resolves; direct guests: need explicit table pick
    const canOrder = cart.orderType === 'TAKEAWAY' || !!tableId
    return (
      <div className="min-h-screen flex flex-col animate-[fadeIn_0.3s_ease_forwards]" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        <div className="border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10" style={{ backgroundColor: '#0d0d0d', borderColor: '#1a1a1a' }}>
          <button onClick={() => setView('menu')} className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <span className="font-semibold text-white">Review Order</span>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4">

          {/* Order type toggle */}
          <div className="rounded-2xl p-4 mb-4 animate-[fadeUp_0.35s_ease_forwards]" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">How would you like it?</div>
            {fromBooking ? (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
                <Table2 size={14} className="text-amber-400 flex-shrink-0" />
                <span className="text-sm text-white font-semibold">Dine In — {allTables.find(t => t.id === tableId)?.name ?? `Table ${tableNum}`}</span>
                <span className="text-xs text-gray-500 ml-auto">from booking</span>
              </div>
            ) : (
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
                {(['DINE_IN', 'TAKEAWAY'] as const).map(type => (
                  <button key={type} onClick={() => { cart.setOrderType(type); if (type === 'TAKEAWAY') { setTableId(''); setTableNum(null); setTableInput('') } }}
                    style={cart.orderType === type ? { backgroundColor: '#f59e0b', color: '#000' } : { backgroundColor: '#1a1a1a', color: '#888' }}
                    className="flex-1 py-3 text-sm font-semibold transition-colors">
                    {type === 'DINE_IN' ? '🍽  Dine In' : '📦  Takeaway'}
                  </button>
                ))}
              </div>
            )}

            {/* Table: QR scan locks to that table — no picker needed */}
            {cart.orderType === 'DINE_IN' && !fromBooking && fromQr && (
              <div className="mt-3">
                {tableId ? (
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2.5">
                    <Table2 size={14} className="text-green-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-green-400">{qrTableName || `Table ${tableNum}`}</span>
                    <span className="text-xs text-gray-400 ml-auto">from QR scan</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: '#1a1a1a' }}>
                    <Loader2 size={14} className="text-gray-400 animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400">Resolving table…</span>
                  </div>
                )}
              </div>
            )}

            {/* Table picker — for guests who browsed directly (no QR, no booking) */}
            {cart.orderType === 'DINE_IN' && !fromBooking && !fromQr && (
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <Table2 size={11} /> Select your table
                </div>
                {allTables.filter(t => t.status === 'EMPTY').length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                    No vacant tables right now. Please ask a staff member.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {allTables.filter(t => t.status === 'EMPTY').map(t => (
                      <button key={t.id} onClick={() => { setTableId(t.id); setTableNum(t.tableNumber) }}
                          style={tableId === t.id
                          ? { backgroundColor: '#f59e0b', border: '1px solid #f59e0b', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }
                          : { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        className="rounded-xl py-3 px-2 text-center transition-all">
                        <div className={`font-bold text-sm ${tableId === t.id ? 'text-black' : 'text-white'}`}>
                          {t.name ?? `T${t.tableNumber}`}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${tableId === t.id ? 'text-amber-100' : 'text-gray-400'}`}>
                          {t.capacity} seats
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {tableId && (
                  <p className="text-green-500 text-xs mt-2 flex items-center gap-1">
                    ✓ {allTables.find(t => t.id === tableId)?.name} selected
                  </p>
                )}
              </div>
            )}

            {!fromBooking && cart.orderType === 'TAKEAWAY' && (
              <p className="text-xs text-gray-400 mt-2 text-center">Token number given · Collect at counter when ready</p>
            )}
          </div>

          {/* Cart items */}
          <div className="rounded-2xl mb-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            {cart.items.length === 0 && <div className="text-center py-10 text-gray-500 text-sm">Your cart is empty</div>}
            {cart.items.map((item, idx) => (
              <div key={item.menuItemId} className="p-4" style={idx > 0 ? { borderTop: '1px solid #1e1e1e' } : {}}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    {(item.modifiers ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(item.modifiers ?? []).map(m => (
                          <span key={m.optionId} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">AED {item.price.toFixed(2)} each · incl. VAT</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => cart.updateQty(item.cartKey, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#222' }}>
                      <Minus size={12} className="text-gray-300" />
                    </button>
                    <span className="text-sm font-bold w-5 text-center text-white">{item.quantity}</span>
                    <button onClick={() => cart.updateQty(item.cartKey, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f59e0b' }}>
                      <Plus size={12} style={{ color: '#000' }} />
                    </button>
                    <button onClick={() => cart.removeItem(item.cartKey)} className="ml-1 text-gray-600 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <button onClick={() => setNotesOpen(notesOpen === item.cartKey ? null : item.cartKey)}
                  className="text-xs text-amber-500 hover:underline">
                  {item.notes ? `📝 ${item.notes}` : '+ Add note (spice, allergies...)'}
                </button>
                {notesOpen === item.cartKey && (
                  <input autoFocus type="text" placeholder="e.g. No onion, less spicy, extra chutney..."
                    value={item.notes || ''}
                    onChange={e => cart.updateNotes(item.cartKey, e.target.value)}
                    className="mt-2 w-full text-xs rounded-lg px-3 py-2 focus:outline-none text-white placeholder-gray-600"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  />
                )}
                <div className="text-xs font-bold text-white mt-2">
                  AED {(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          {cart.items.length > 0 && (
            <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
              <div className="flex justify-between text-base font-bold text-white mb-2">
                <span>Total (incl. VAT)</span><span style={{ color: '#f59e0b' }}>AED {cart.total().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Dish prices (net)</span><span>AED {(cart.total() - cart.vatPortion()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pb-2 mb-2" style={{ borderBottom: '1px solid #1e1e1e' }}>
                <span>VAT included (5%)</span><span>AED {cart.vatPortion().toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <Clock size={11} /> Est. prep: ~{cart.maxPrepTime()}–{cart.maxPrepTime() + 5} mins
              </div>
            </div>
          )}

          {/* Phone number — takeaway only */}
          {cart.orderType === 'TAKEAWAY' && cart.items.length > 0 && (
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact Number</div>
              <input
                type="tel"
                placeholder="+971 50 000 0000"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              />
              <p className="text-[11px] text-gray-500 mt-1.5">We'll call/SMS you when your order is ready for pickup</p>
            </div>
          )}

          {/* Payment buttons */}
          {cart.items.length > 0 && (
            <div className="space-y-3">
              {cart.orderType === 'DINE_IN' && !tableId && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
                  <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300 text-sm">Select a table above to continue</span>
                </div>
              )}
              {/* Card — always. Takeaway ONLY card (already paid = auto-accepted, no staff approval needed) */}
              <button onClick={() => placeOrder(true)}
                disabled={placing || !canOrder}
                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                {placing ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                {cart.orderType === 'TAKEAWAY' ? `Pay & Order · AED ${cart.total().toFixed(2)}` : `Pay by Card · AED ${cart.total().toFixed(2)}`}
              </button>
              {/* Cash — dine-in only (pay when leaving); hidden for takeaway */}
              {!fromBooking && cart.orderType === 'DINE_IN' && (
                <button onClick={() => setShowCashConfirm(true)}
                  disabled={placing || !canOrder}
                  className="w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-gray-300 hover:text-white"
                  style={{ border: '2px solid #2a2a2a', backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1a1a')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <Banknote size={16} className="text-green-500" />
                  Pay Cash When Leaving
                </button>
              )}
              {fromBooking && (
                <p className="text-center text-xs text-gray-600">Pre-order with your booking — card payment required</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── FOOD CARD ─────────────────────────────────────────────────────────────
  function FoodCard({ item, index }: { item: MenuItem; index: number }) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
      const el = cardRef.current
      if (!el) return
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
      }, { threshold: 0.1 })
      obs.observe(el)
      return () => obs.disconnect()
    }, [])

    const qty = cart.items.filter(i => i.menuItemId === item.id).reduce((s, i) => s + i.quantity, 0)
    const isFav = favs.includes(item.id)
    const vatInclusivePrice = Number(item.price) * 1.05
    const openDrawer = () => {
      if (!item.isAvailable) return
      const defaults: Record<string, string> = {}
      item.modifierGroups?.forEach(g => {
        const def = g.options.find(o => o.isDefault) ?? g.options[0]
        if (def) defaults[g.id] = def.id
      })
      setDrawerItem(item)
      setSelectedOptions(defaults)
      setDrawerNotes('')
    }
    return (
      <div
        ref={cardRef}
        onClick={openDrawer}
        className="rounded-2xl overflow-hidden flex flex-col cursor-pointer"
        style={{
          transition: 'opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)',
          transitionDelay: `${index * 50}ms`,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          backgroundColor: qty > 0 ? 'rgba(245,158,11,0.06)' : '#111',
          border: qty > 0 ? '1px solid rgba(245,158,11,0.4)' : '1px solid #1e1e1e',
          boxShadow: qty > 0 ? '0 0 24px rgba(245,158,11,0.08)' : 'none',
        }}>
        {/* Image */}
        <div className="relative h-40 w-full overflow-hidden flex-shrink-0">
          <FoodImage src={item.imageUrl} alt={item.name} className="w-full h-full transition-transform duration-500 hover:scale-105" />
          {isLoggedIn && (
            <button onClick={e => {
              e.stopPropagation()
              setFavs(prev => {
                const next = prev.includes(item.id) ? prev.filter(f => f !== item.id) : [...prev, item.id]
                toggleFavOnServer(item.id)
                return next
              })
            }}
              className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-transform active:scale-90">
              <Heart size={13} className={isFav ? 'text-red-400 fill-red-400' : 'text-white'} />
            </button>
          )}
          {qty > 0 && (
            <div className="absolute top-2 right-2 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-lg"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}>
              {qty} in cart
            </div>
          )}
          {!item.isAvailable && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-500/90 px-3 py-1 rounded-full">Unavailable</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-2 px-3">
            <div className="flex items-end justify-between">
              <span className="font-black text-base" style={{ color: '#f59e0b' }}>
                AED {vatInclusivePrice.toFixed(0)}
                <span className="text-[9px] text-amber-300/70 font-normal ml-1">incl. VAT</span>
              </span>
              <span className="text-white/60 text-[10px] flex items-center gap-0.5">
                <Clock size={9} /> {item.prepTimeMins}m
              </span>
            </div>
          </div>
        </div>
        {/* Info */}
        <div className="p-3 flex flex-col flex-1">
          <div className="font-bold text-white text-sm leading-snug mb-1">{item.name}</div>
          {item.description && (
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2 flex-1">{item.description}</p>
          )}
          <div className="flex items-center justify-between mt-auto pt-1">
            {item.modifierGroups && item.modifierGroups.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {item.modifierGroups[0].options.slice(0, 4).map(o => (
                  <span key={o.id} className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ backgroundColor: '#1a1a1a', color: '#666' }}>
                    {o.name}
                  </span>
                ))}
                {item.modifierGroups[0].options.length > 4 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: '#1a1a1a', color: '#555' }}>
                    +{item.modifierGroups[0].options.length - 4}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[9px] text-gray-600">Single size</div>
            )}
            <div className="text-[10px] text-amber-500/70 font-semibold">Tap →</div>
          </div>
        </div>
      </div>
    )
  }

  // ─── ITEM DRAWER ─────────────────────────────────────────────────────────
  // Compute selected modifiers list from selectedOptions map
  const drawerModifiers = drawerItem
    ? (drawerItem.modifierGroups ?? []).flatMap(g => {
        const optId = selectedOptions[g.id]
        const opt = g.options.find(o => o.id === optId)
        return opt ? [{ optionId: opt.id, groupName: g.name, name: opt.name, priceAdd: Number(opt.priceAdd) }] : []
      })
    : []
  const drawerBasePrice = drawerItem ? Number(drawerItem.price) : 0
  const drawerModExtra = drawerModifiers.reduce((s, m) => s + m.priceAdd, 0)
  const drawerVatPrice = Math.round((drawerBasePrice + drawerModExtra) * 1.05 * 100) / 100
  // Check required groups satisfied
  const requiredUnsatisfied = drawerItem
    ? (drawerItem.modifierGroups ?? []).filter(g => g.required && !selectedOptions[g.id])
    : []

  const ItemDrawer = drawerItem ? (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerItem(null)}
        style={{ animation: 'fadeIn 0.2s ease forwards' }} />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto rounded-t-3xl overflow-hidden"
        style={{ backgroundColor: '#0f0f0f', border: '1px solid #222', animation: 'slideUp 0.35s cubic-bezier(0.22,1,0.36,1) forwards', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#333' }} />
        </div>
        {/* Image */}
        <div className="relative h-44 mx-4 mb-4 rounded-2xl overflow-hidden flex-shrink-0">
          <FoodImage src={drawerItem.imageUrl} alt={drawerItem.name} className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute bottom-3 left-4 right-14">
            <div className="text-lg font-black text-white leading-tight">{drawerItem.name}</div>
            {drawerItem.description && <div className="text-xs text-gray-300 mt-0.5 line-clamp-2">{drawerItem.description}</div>}
          </div>
          <div className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-xl"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#f59e0b', backdropFilter: 'blur(4px)' }}>
            <Clock size={10} className="inline mr-1" />{drawerItem.prepTimeMins}m
          </div>
        </div>

        <div className="px-4 pb-6">
          {/* Base price row */}
          <div className="flex justify-between items-center mb-4 pb-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
            <div className="text-xs text-gray-500">Base price</div>
            <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>AED {(drawerBasePrice * 1.05).toFixed(2)} <span className="text-[10px] text-gray-600 font-normal">incl. VAT</span></div>
          </div>

          {/* Modifier groups */}
          {(drawerItem.modifierGroups ?? []).map(group => (
            <div key={group.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-bold text-white uppercase tracking-wide">{group.name}</div>
                {group.required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f59e0b22', color: '#f59e0b' }}>Required</span>}
              </div>
              <div className="space-y-2">
                {group.options.map(opt => {
                  const isActive = selectedOptions[group.id] === opt.id
                  const finalP = (drawerBasePrice + Number(opt.priceAdd)) * 1.05
                  return (
                    <button key={opt.id} onClick={() => setSelectedOptions(p => ({ ...p, [group.id]: opt.id }))}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={isActive
                        ? { backgroundColor: 'rgba(245,158,11,0.1)', border: '1.5px solid #f59e0b' }
                        : { backgroundColor: '#161616', border: '1px solid #2a2a2a' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: isActive ? '#f59e0b' : '#444' }}>
                          {isActive && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />}
                        </div>
                        <span className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>{opt.name}</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isActive ? 'text-amber-400' : 'text-gray-500'}`}>
                          AED {finalP.toFixed(2)}
                        </div>
                        {Number(opt.priceAdd) > 0 && (
                          <div className="text-[9px] text-gray-600">+{Number(opt.priceAdd).toFixed(2)} extra</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Notes */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Special Instructions</div>
            <input
              type="text"
              placeholder="e.g. No onion, extra spicy, less sauce..."
              value={drawerNotes}
              onChange={e => setDrawerNotes(e.target.value)}
              className="w-full text-sm text-white placeholder-gray-600 rounded-xl px-3 py-2.5 focus:outline-none"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            />
          </div>

          {/* Add button */}
          {requiredUnsatisfied.length > 0 ? (
            <div className="w-full py-4 rounded-2xl text-center text-sm font-semibold" style={{ backgroundColor: '#1a1a1a', color: '#555' }}>
              Please choose: {requiredUnsatisfied.map(g => g.name).join(', ')}
            </div>
          ) : (
            <button
              onClick={() => {
                const modLabel = drawerModifiers.length > 0 ? ` (${drawerModifiers.map(m => m.name).join(', ')})` : ''
                cart.addItem({
                  menuItemId: drawerItem.id,
                  name: drawerItem.name,
                  basePrice: drawerBasePrice,
                  modifiers: drawerModifiers,
                  prepTimeMins: drawerItem.prepTimeMins,
                  notes: drawerNotes || undefined,
                })
                toast.success(`${drawerItem.name}${modLabel} added!`, { duration: 1400, position: 'bottom-center' })
                setDrawerItem(null)
              }}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}>
              <Plus size={18} />
              Add to Order · AED {drawerVatPrice.toFixed(2)}
            </button>
          )}
        </div>
      </div>
    </>
  ) : null

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  const favItems = categories.flatMap(c => c.items).filter(item => favs.includes(item.id))

  const allCatPills = [
    ...(isLoggedIn && favItems.length > 0 ? [{ id: FAV_ID, name: '♥ Favourites' }] : []),
    ...categories.map(c => ({ id: c.id, name: c.name })),
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808' }}>
      <ForceDark />

      {/* ── Sticky header: brand + category rail ── */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Brand + cart row — compact on mobile */}
        <div className="px-4 sm:px-8 flex items-center gap-3 h-12 sm:h-14">
          <Link href="/" className="text-gray-600 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm text-white tracking-wide leading-none">AL MANZIL</div>
            <div className="text-[9px] tracking-widest uppercase truncate" style={{ color: '#f59e0b' }}>
              {qrTableName || 'Kerala & South Indian Cuisine'}
            </div>
          </div>
          {/* Cart button — always visible, shows icon only when empty */}
          <button onClick={() => setView('cart')} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
            style={totalQty > 0
              ? { backgroundColor: '#f59e0b', color: '#000' }
              : { backgroundColor: '#1a1a1a', color: '#666', border: '1px solid #2a2a2a' }}>
            <ShoppingCart size={15} />
            {totalQty > 0 && <span className="text-xs font-black whitespace-nowrap">{totalQty} · AED {cart.total().toFixed(0)}</span>}
          </button>
        </div>

        {/* Category pill rail */}
        <div ref={catTabsRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 sm:px-8 pb-2.5">
          {allCatPills.map(c => (
            <button key={c.id} data-cat={c.id} onClick={() => scrollToCategory(c.id)}
              className="flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap"
              style={activeCategory === c.id
                ? { backgroundColor: '#f59e0b', color: '#000' }
                : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#777' }}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table notice */}
      {fromQr && (qrTableStatus === 'DIRTY' || qrTableStatus === 'BILL_PENDING') && (
        <div className="px-5 py-2.5 text-xs font-semibold flex items-center gap-2"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          <span>{qrTableStatus === 'DIRTY' ? '🧹' : '🧾'}</span>
          {qrTableStatus === 'DIRTY'
            ? 'Our team is setting up your table. You can browse and order now.'
            : 'Previous guests are checking out. Feel free to browse and order.'}
        </div>
      )}

      {/* ── Main scroll area ── */}
      <main ref={mainRef} className="overflow-y-auto pb-28 sm:pb-16">
        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <div className="w-12 h-12 rounded-full animate-pulse" style={{ backgroundColor: '#1a1a1a' }} />
            <div className="text-gray-600 text-sm">Loading menu…</div>
          </div>
        )}

        {/* Favourites */}
        {isLoggedIn && favItems.length > 0 && (
          <section ref={el => { sectionRefs.current[FAV_ID] = el }} id={`cat-${FAV_ID}`} className="pt-10 px-5 sm:px-8">
            <div className="flex items-center gap-3 mb-6">
              <Heart size={14} className="text-red-400 fill-red-400 flex-shrink-0" />
              <h2 className="text-2xl font-black text-white tracking-tight">Favourites</h2>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(245,158,11,0.4), transparent)' }} />
              <span className="text-xs text-gray-600">{favItems.length} items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {favItems.map((item, i) => <FoodCard key={item.id} item={item} index={i} />)}
            </div>
          </section>
        )}

        {/* All categories */}
        {categories.map((cat) => (
          <section key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }} id={`cat-${cat.id}`}
            className="pt-10 px-5 sm:px-8">
            {/* Section header */}
            <div className="flex items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">{cat.name}</h2>
                <div className="text-xs text-gray-600 mt-0.5">{cat.items.length} {cat.items.length === 1 ? 'dish' : 'dishes'}</div>
              </div>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(245,158,11,0.35), transparent)' }} />
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {cat.items.map((item, i) => <FoodCard key={item.id} item={item} index={i} />)}
            </div>
          </section>
        ))}

        <div className="h-8" />
      </main>

      {/* Floating review-order pill — shown only when cart has items, gives bigger tap target on mobile */}
      {totalQty > 0 && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-72 z-30" style={{ animation: 'fadeUp 0.3s ease both' }}>
          <button onClick={() => setView('cart')}
            className="w-full flex items-center justify-between gap-4 py-3.5 px-5 rounded-2xl font-bold transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#f59e0b', color: '#000', boxShadow: '0 8px 30px rgba(245,158,11,0.4)' }}>
            <span className="text-sm w-7 h-7 rounded-full flex items-center justify-center font-black bg-black/20">{totalQty}</span>
            <span className="flex-1 text-center text-sm font-black">Review Order</span>
            <span className="text-sm font-black">AED {cart.total().toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* Item drawer portal */}
      {ItemDrawer}

      {/* ── Cash confirmation sheet ── */}
      {showCashConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowCashConfirm(false)}>
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-5"
            style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
            onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-3">💵</div>
              <h2 className="text-xl font-black text-white mb-1">Pay Cash When Leaving</h2>
              <p className="text-sm text-gray-500">Your order will be sent to the kitchen now. Please pay at the counter before you leave.</p>
            </div>
            {/* Order summary */}
            <div className="rounded-2xl divide-y" style={{ backgroundColor: '#0d0d0d', borderColor: '#1e1e1e', border: '1px solid #1e1e1e' }}>
              {cart.items.map(item => (
                <div key={item.cartKey} className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-gray-300">{item.quantity}× {item.name}</span>
                  <span className="text-white font-semibold">AED {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3">
                <span className="font-black text-white">Total</span>
                <span className="font-black text-lg" style={{ color: '#f59e0b' }}>AED {cart.total().toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 text-center">Prices include 5% VAT</p>
            <button onClick={() => { setShowCashConfirm(false); placeOrder(false) }}
              disabled={placing}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
              {placing ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
              Confirm — I'll Pay on Exit
            </button>
            <button onClick={() => setShowCashConfirm(false)}
              className="w-full py-3 rounded-2xl text-sm text-gray-500 hover:text-white transition-colors"
              style={{ border: '1px solid #1e1e1e' }}>
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* ── Cancel order confirmation sheet ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowCancelConfirm(false)}>
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
            style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
            onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-black text-white mb-1">Cancel This Order?</h2>
              <p className="text-sm text-gray-500">This can only be done while your order is still pending. Once the kitchen starts, cancellation must go through staff.</p>
            </div>
            <button onClick={cancelOrder} disabled={cancelling}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ backgroundColor: '#dc2626', color: '#fff' }}>
              {cancelling ? <Loader2 size={18} className="animate-spin" /> : null}
              Yes, Cancel Order
            </button>
            <button onClick={() => setShowCancelConfirm(false)}
              className="w-full py-3 rounded-2xl text-sm text-gray-400 hover:text-white transition-colors"
              style={{ border: '1px solid #1e1e1e' }}>
              Keep My Order
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MenuPage() {
  return <Suspense><MenuPageInner /></Suspense>
}
