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
import { useThemeStore } from '@/store/theme'
import StripePaymentForm from '@/components/StripePaymentForm'

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

interface MenuItem {
  id: string; name: string; description?: string
  price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string
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
      <div className={`${className} bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center`}>
        <UtensilsCrossed size={28} className="text-orange-200" />
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

  // Dine-in table selection
  const [allTables, setAllTables]     = useState<{id:string; tableNumber:number; name:string|null; capacity:number; status:string}[]>([])
  const [tableInput, setTableInput]   = useState('')
  const [tableId, setTableId]         = useState(urlTableId)
  const [tableNum, setTableNum]       = useState<number | null>(null)
  const [tableError, setTableError]   = useState('')
  const [qrTableName, setQrTableName] = useState('')
  const [qrTableStatus, setQrTableStatus] = useState('')

  const cart = useCartStore()
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
    // Restore in-progress order on page refresh
    const savedOrderId = sessionStorage.getItem('activeOrderId')
    if (savedOrderId) {
      api.get(`/orders/${savedOrderId}`).then(r => {
        if (r.data && !['DELIVERED','CANCELLED'].includes(r.data.status)) {
          setOrder(r.data)
          setView('tracking')
        } else {
          sessionStorage.removeItem('activeOrderId')
        }
      }).catch(() => sessionStorage.removeItem('activeOrderId'))
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
        items: cart.items.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
      })
      setOrder(newOrder)
      sessionStorage.setItem('activeOrderId', newOrder.id)
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
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollingProgrammatically = useRef(false)

  // Scroll-spy: watch all category sections, update active pill
  useEffect(() => {
    if (categories.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        if (scrollingProgrammatically.current) return
        let topEntry: IntersectionObserverEntry | null = null
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!topEntry || e.boundingClientRect.top < topEntry.boundingClientRect.top) topEntry = e
          }
        }
        if (topEntry) setActiveCategory(topEntry.target.id.replace('cat-', ''))
      },
      { root: mainRef.current, rootMargin: '-20% 0px -60% 0px', threshold: 0 }
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
    const el = id === FAV_ID
      ? sectionRefs.current[FAV_ID]
      : sectionRefs.current[id]
    if (!el || !mainRef.current) return
    scrollingProgrammatically.current = true
    mainRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
    setTimeout(() => { scrollingProgrammatically.current = false }, 800)
  }, [])

  // ─── PAYMENT VIEW ─────────────────────────────────────────────────────────
  if (view === 'payment' && clientSecret && order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col animate-[fadeIn_0.3s_ease_forwards]">
        <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setView('cart')} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={20} />
          </button>
          <Lock size={16} className="text-green-500" />
          <span className="font-semibold text-sm dark:text-white">Secure Payment</span>
        </div>
        <div className="flex-1 max-w-md mx-auto w-full px-4 py-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 p-4 mb-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Summary</div>
            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                  <span>{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t dark:border-gray-700 pt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal</span><span>AED {Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT 5%</span><span>AED {Number(order.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-white">
                <span>Total</span><span className="text-orange-600">AED {Number(order.total).toFixed(2)}</span>
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col animate-[fadeIn_0.3s_ease_forwards]">
        <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-orange-500" />
            <span className="font-bold text-sm dark:text-white">Al Manzil</span>
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
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
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500
                      ${done ? 'bg-orange-500 border-orange-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}
                      ${active ? 'ring-4 ring-orange-100 dark:ring-orange-900' : ''}`}>
                      <Icon size={18} className={done ? 'text-white' : 'text-gray-300'} />
                    </div>
                    <span className={`text-xs text-center leading-tight ${done ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-200 dark:bg-gray-700 z-0">
              <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${Math.min((stepIdx / 3) * 100, 100)}%` }} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-800 dark:text-white">Your Order</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {order.paymentStatus === 'PAID' ? '✓ Paid' : 'Cash'}
              </span>
            </div>
            <div className="space-y-1.5 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t dark:border-gray-700 pt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>AED {Number(order.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-gray-400"><span>VAT (5%)</span><span>AED {Number(order.vatAmount).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-white"><span>Total</span><span>AED {Number(order.total).toFixed(2)}</span></div>
            </div>
          </div>

          {/* "Order More" — only show for dine-in so they know it adds to their same bill */}
          {order.type === 'DINE_IN' && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 mb-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Want to order something else?</p>
              <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mb-3">
                Any new items will be added to <strong>your personal bill</strong> for this table — not a new separate order.
              </p>
              <button onClick={() => { setView('menu'); setOrder(null); sessionStorage.removeItem('activeOrderId') }}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                + Order More Items
              </button>
            </div>
          )}
          {order.type === 'TAKEAWAY' && (
            <button onClick={() => { setView('menu'); setOrder(null); sessionStorage.removeItem('activeOrderId') }}
              className="w-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 py-3 rounded-2xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
              + Order More
            </button>
          )}

          {/* Signup nudge — shown to guests after their 2nd order */}
          {guestOrderCount >= 2 && !order?.userId && (
            <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-4">
              <p className="text-sm font-bold text-orange-800 dark:text-orange-300 mb-1">Create a free account</p>
              <p className="text-xs text-orange-700/70 dark:text-orange-400/70 mb-3">
                Sign up to save your order history, earn rewards, and check out faster next time.
              </p>
              <div className="flex gap-2">
                <Link href="/auth/register" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold text-center transition-colors">
                  Sign Up Free
                </Link>
                <Link href="/auth/login" className="flex-1 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 py-2.5 rounded-xl text-sm font-semibold text-center hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
                  Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── CART VIEW ────────────────────────────────────────────────────────────
  if (view === 'cart') {
    // QR guests: block until table resolves; direct guests: need explicit table pick
    const canOrder = cart.orderType === 'TAKEAWAY' || !!tableId
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col animate-[fadeIn_0.3s_ease_forwards]">
        <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setView('menu')} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={20} />
          </button>
          <span className="font-semibold dark:text-white">Review Order</span>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4">

          {/* Order type toggle */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 p-4 mb-4 animate-[fadeUp_0.35s_ease_forwards]">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">How would you like it?</div>
            {fromBooking ? (
              <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2.5">
                <Table2 size={14} className="text-orange-400 flex-shrink-0" />
                <span className="text-sm text-white font-semibold">Dine In — {allTables.find(t => t.id === tableId)?.name ?? `Table ${tableNum}`}</span>
                <span className="text-xs text-gray-500 ml-auto">from booking</span>
              </div>
            ) : (
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {(['DINE_IN', 'TAKEAWAY'] as const).map(type => (
                  <button key={type} onClick={() => { cart.setOrderType(type); if (type === 'TAKEAWAY') { setTableId(''); setTableNum(null); setTableInput('') } }}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${cart.orderType === type ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}>
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
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2.5">
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
                        className={`rounded-xl border py-3 px-2 text-center transition-all ${
                          tableId === t.id
                            ? 'bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                        }`}>
                        <div className={`font-bold text-sm ${tableId === t.id ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                          {t.name ?? `T${t.tableNumber}`}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${tableId === t.id ? 'text-orange-100' : 'text-gray-400'}`}>
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 divide-y dark:divide-gray-800 mb-4">
            {cart.items.length === 0 && <div className="text-center py-10 text-gray-300 text-sm">Your cart is empty</div>}
            {cart.items.map(item => (
              <div key={item.menuItemId} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</div>
                    <div className="text-xs text-gray-400">AED {item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => cart.updateQty(item.menuItemId, -1)} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Minus size={12} className="dark:text-gray-300" />
                    </button>
                    <span className="text-sm font-bold w-5 text-center dark:text-white">{item.quantity}</span>
                    <button onClick={() => cart.updateQty(item.menuItemId, 1)} className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                      <Plus size={12} className="text-orange-600" />
                    </button>
                    <button onClick={() => cart.removeItem(item.menuItemId)} className="ml-1 text-gray-200 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <button onClick={() => setNotesOpen(notesOpen === item.menuItemId ? null : item.menuItemId)}
                  className="text-xs text-orange-500 hover:underline">
                  {item.notes ? `📝 ${item.notes}` : '+ Add note (spice, allergies...)'}
                </button>
                {notesOpen === item.menuItemId && (
                  <input autoFocus type="text" placeholder="e.g. No onion, less spicy, extra chutney..."
                    value={item.notes || ''}
                    onChange={e => cart.updateNotes(item.menuItemId, e.target.value)}
                    className="mt-2 w-full text-xs border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                  />
                )}
                <div className="text-xs font-bold text-gray-800 dark:text-white mt-2">
                  AED {(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          {cart.items.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 p-4 mb-5">
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                <span>Subtotal</span><span>AED {cart.subtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-3">
                <span>VAT (5%)</span><span>AED {cart.vat().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t dark:border-gray-700 pt-3">
                <span>Total</span><span className="text-orange-600">AED {cart.total().toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> Est. prep: ~{cart.maxPrepTime()}–{cart.maxPrepTime() + 5} mins
              </div>
            </div>
          )}

          {/* Phone number — takeaway only */}
          {cart.orderType === 'TAKEAWAY' && cart.items.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 p-4 mb-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact Number</div>
              <input
                type="tel"
                placeholder="+971 50 000 0000"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-orange-400"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">We'll call/SMS you when your order is ready for pickup</p>
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
                className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors disabled:opacity-40">
                {placing ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                {cart.orderType === 'TAKEAWAY' ? `Pay & Order · AED ${cart.total().toFixed(2)}` : `Pay by Card · AED ${cart.total().toFixed(2)}`}
              </button>
              {/* Cash — dine-in only (pay when leaving); hidden for takeaway */}
              {!fromBooking && cart.orderType === 'DINE_IN' && (
                <button onClick={() => placeOrder(false)}
                  disabled={placing || !canOrder}
                  className="w-full border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                  <Banknote size={16} className="text-green-600" />
                  Pay Cash When Leaving
                </button>
              )}
              {fromBooking && (
                <p className="text-center text-xs text-gray-500">Pre-order with your booking — card payment required</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── FOOD CARD ─────────────────────────────────────────────────────────────
  function FoodCard({ item, index }: { item: MenuItem; index: number }) {
    const qty = cart.items.find(i => i.menuItemId === item.id)?.quantity ?? 0
    const isFav = favs.includes(item.id)
    const [justAdded, setJustAdded] = useState(false)
    const addToCart = () => {
      if (!item.isAvailable) return
      cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 600)
      toast.success(`${item.name} added!`, { duration: 1200, position: 'bottom-center' })
    }
    return (
      <div
        style={{ animationDelay: `${index * 60}ms` }}
        className={`rounded-2xl border overflow-hidden transition-all duration-300 flex flex-col
        animate-[fadeUp_0.5s_ease_forwards] opacity-0
        ${justAdded ? 'scale-[0.97]' : 'scale-100'}
        ${!item.isAvailable
          ? 'opacity-40 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
          : qty > 0
            ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-400 dark:border-orange-600 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
            : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-lg hover:-translate-y-0.5'
        }`}>
        {/* Image — tappable */}
        <div className="relative h-40 w-full overflow-hidden cursor-pointer flex-shrink-0" onClick={addToCart}>
          <FoodImage src={item.imageUrl} alt={item.name} className="w-full h-full" />
          {isLoggedIn && (
            <button onClick={e => {
              e.stopPropagation()
              setFavs(prev => {
                const next = prev.includes(item.id) ? prev.filter(f => f !== item.id) : [...prev, item.id]
                toggleFavOnServer(item.id)
                return next
              })
            }}
              className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <Heart size={13} className={isFav ? 'text-red-400 fill-red-400' : 'text-white'} />
            </button>
          )}
          {qty > 0 && (
            <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-lg">
              {qty} in cart
            </div>
          )}
          {!item.isAvailable && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-500 px-3 py-1 rounded-full">Unavailable</span>
            </div>
          )}
          {item.isAvailable && qty === 0 && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent py-2 px-3">
              <span className="text-white text-[10px] font-semibold">Tap to add</span>
            </div>
          )}
        </div>
        {/* Info */}
        <div className="p-3 flex flex-col flex-1">
          <div className="font-bold text-gray-900 dark:text-white text-sm leading-snug mb-1 flex items-start gap-1.5">
            <span className="flex-1">{item.name}</span>
          </div>
          {item.description && (
            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-2 flex-1">{item.description}</p>
          )}
          <div className="flex items-center justify-between mt-auto pt-2">
            <div>
              <span className="font-black text-orange-500 text-base">AED {Number(item.price).toFixed(0)}</span>
              <span className="text-gray-400 text-[10px] ml-1.5 inline-flex items-center gap-0.5">
                <Clock size={9} /> {item.prepTimeMins}m
              </span>
            </div>
            {!item.isAvailable ? null : qty === 0 ? (
              <button onClick={addToCart}
                className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors active:scale-95">
                <Plus size={12} /> Add
              </button>
            ) : (
              <div className="flex items-center bg-orange-500 rounded-xl overflow-hidden">
                <button onClick={() => cart.updateQty(item.id, -1)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-orange-600 transition-colors">
                  <Minus size={12} className="text-white" />
                </button>
                <span className="text-sm font-black text-white w-5 text-center">{qty}</span>
                <button onClick={() => cart.updateQty(item.id, 1)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-orange-600 transition-colors">
                  <Plus size={12} className="text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  const favItems = categories.flatMap(c => c.items).filter(item => favs.includes(item.id))

  const allCatPills = [
    ...(isLoggedIn && favItems.length > 0 ? [{ id: FAV_ID, name: '♥ Favourites' }] : []),
    ...categories.map(c => ({ id: c.id, name: c.name })),
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 sticky top-0 z-20 shadow-sm animate-[slideDown_0.4s_ease_forwards]">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between w-full">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="font-bold text-sm leading-none dark:text-white">Al Manzil</div>
              {qrTableName
                ? <div className="text-xs text-orange-500 font-semibold leading-none mt-0.5">{qrTableName}</div>
                : <div className="text-xs text-gray-400 leading-none mt-0.5 hidden sm:block">Kerala & South Indian Cuisine</div>
              }
            </div>
          </div>

          {/* Category pills — scroll-spy driven */}
          <div ref={catTabsRef} className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 mx-3">
            {allCatPills.map(c => (
              <button key={c.id} data-cat={c.id} onClick={() => scrollToCategory(c.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap
                  ${activeCategory === c.id
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-200 dark:shadow-none scale-105'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={toggle} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {dark ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} className="text-gray-500" />}
            </button>
            <button onClick={() => setView('cart')} className="relative p-1.5">
              <ShoppingCart size={22} className="text-gray-700 dark:text-gray-300" />
              {totalQty > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {totalQty}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Table being cleared / awaiting bill notice */}
      {fromQr && (qrTableStatus === 'DIRTY' || qrTableStatus === 'BILL_PENDING') && (
        <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
          qrTableStatus === 'DIRTY'
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        }`}>
          <span>{qrTableStatus === 'DIRTY' ? '🧹' : '🧾'}</span>
          {qrTableStatus === 'DIRTY'
            ? 'Our team is setting up your table. You can browse and order now — your order will be ready shortly.'
            : 'Previous guests are checking out. Feel free to order — our staff will sort the table for you.'}
        </div>
      )}

      {/* ── Body: sidebar + scrollable sections ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop left sidebar */}
        <aside className="hidden md:flex flex-col w-52 lg:w-60 border-r dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Menu</p>
            {allCatPills.map(c => {
              const inCart = c.id === FAV_ID
                ? cart.items.filter(ci => favItems.some(f => f.id === ci.menuItemId)).reduce((s, ci) => s + ci.quantity, 0)
                : cart.items.filter(ci => categories.find(cat => cat.id === c.id)?.items.some(item => item.id === ci.menuItemId)).reduce((s, ci) => s + ci.quantity, 0)
              return (
                <button key={c.id} onClick={() => scrollToCategory(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 flex items-center justify-between
                    ${activeCategory === c.id
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  <span>{c.name}</span>
                  {inCart > 0 && (
                    <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                      ${activeCategory === c.id ? 'bg-white/30 text-white' : 'bg-orange-500 text-white'}`}>
                      {inCart}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {totalQty > 0 && (
            <div className="mt-auto p-4 border-t dark:border-gray-800">
              <button onClick={() => setView('cart')}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-between px-4">
                <span className="bg-orange-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{totalQty}</span>
                <span>Review Order</span>
                <span className="text-orange-100 text-xs">AED {cart.total().toFixed(0)}</span>
              </button>
            </div>
          )}
        </aside>

        {/* Main scroll area — all categories stacked */}
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-28 md:pb-8">
          {categories.length === 0 && (
            <div className="text-center py-20 text-gray-400">Loading menu...</div>
          )}

          <div className="p-4 sm:p-6 space-y-10">
            {/* Favourites section — customers only */}
            {isLoggedIn && favItems.length > 0 && (
              <div ref={el => { sectionRefs.current[FAV_ID] = el }} id={`cat-${FAV_ID}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Heart size={16} className="text-red-400 fill-red-400" />
                  <h2 className="font-bold text-gray-800 dark:text-white text-lg">Favourites</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{favItems.length} items</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {favItems.map((item, i) => <FoodCard key={item.id} item={item} index={i} />)}
                </div>
              </div>
            )}

            {/* All categories */}
            {categories.map(cat => (
              <div key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }} id={`cat-${cat.id}`}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="font-bold text-gray-800 dark:text-white text-lg">{cat.name}</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{cat.items.length} items</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {cat.items.map((item, i) => <FoodCard key={item.id} item={item} index={i} />)}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Mobile sticky cart bar */}
      {totalQty > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 px-4 pb-6 pt-2 bg-gradient-to-t from-gray-50 dark:from-gray-950 via-gray-50/80 dark:via-gray-950/80 to-transparent z-30 animate-[fadeUp_0.3s_ease_forwards]">
          <button onClick={() => setView('cart')}
            className="w-full flex bg-orange-500 text-white py-4 rounded-2xl font-bold items-center justify-between px-5 shadow-xl shadow-orange-500/30 hover:bg-orange-600 transition-all active:scale-[0.98]">
            <span className="bg-orange-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">{totalQty}</span>
            <span>Review Order</span>
            <span>AED {cart.total().toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function MenuPage() {
  return <Suspense><MenuPageInner /></Suspense>
}
