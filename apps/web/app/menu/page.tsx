'use client'
import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Stripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import {
  Plus, Minus, ShoppingCart, X, ArrowLeft, ArrowRight, Clock,
  CheckCircle, UtensilsCrossed,
  Loader2, Lock, Banknote, Moon, Sun, Heart, Table2, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { requestNotifyPermission, notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { useBrandStore } from '@/store/brand'
import { useLangStore, applyLangDir, t, type Lang } from '@/store/lang'
import StripePaymentForm from '@/components/StripePaymentForm'
import ForceDark from '@/components/ForceDark'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

const ITEMS_PAGE_SIZE = 12

async function toggleFavOnServer(menuItemId: string): Promise<'added' | 'removed' | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (!token) return null
  try {
    const r = await api.post(`/auth/favorites/${menuItemId}`)
    return r.data?.action ?? null
  } catch { return null }
}

type View = 'menu' | 'cart' | 'payment' | 'confirmed'

interface ModifierOption {
  id: string; name: string; priceAdd: number; isDefault: boolean
}
interface ModifierGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number
  options: ModifierOption[]
}
interface MenuItem {
  id: string; name: string; description?: string; categoryId?: string
  price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string; videoUrl?: string
  modifierGroups?: ModifierGroup[]
}
interface Category { id: string; name: string; nameAr?: string; itemCount: number; items: MenuItem[] }
interface CategoryPageState {
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
  loaded: boolean
}
// ─── FEEDBACK MODAL (removed — lives in /menu/orders) ────────────────────────
// ─── GUEST CANCEL MODAL (removed — lives in /menu/orders) ────────────────────
// ─── ORDER TRACK CARD (removed — lives in /menu/orders) ──────────────────────

// ─── ORDER INTERFACE (shared with payment flow) ───────────────────────────────
interface Order {
  id: string; status: string; tokenNumber?: number; total: number
  vatAmount: number; subtotal: number; type: string; paymentStatus: string
  paymentMethod?: string | null; stripeIntentId?: string | null; userId?: string | null
  expectedReadyAt?: string | null
  table?: { id: string; name: string | null; tableNumber: number } | null
  items: { quantity: number; notes?: string | null; unitPrice: number; menuItem: { name: string } }[]
}

function StripeCheckout({ clientSecret, order, brandColor, onSuccess, onCancel }: {
  clientSecret: string
  order: Order
  brandColor: string
  onSuccess: (paymentIntentId: string) => void
  onCancel: () => void
}) {
  const [stripe, setStripe] = useState<Stripe | null | undefined>(undefined)
  useEffect(() => { getStripe().then(s => setStripe(s)) }, [])

  const appearance: import('@stripe/stripe-js').Appearance = {
    theme: 'night',
    variables: {
      colorPrimary:          brandColor,
      colorBackground:       '#111111',
      colorText:             '#ededed',
      colorTextSecondary:    '#888888',
      colorTextPlaceholder:  '#555555',
      colorDanger:           '#f87171',
      colorIconTab:          '#888888',
      colorIconTabSelected:  brandColor,
      fontFamily:            'system-ui, -apple-system, sans-serif',
      fontSizeBase:          '14px',
      borderRadius:          '10px',
      spacingUnit:           '4px',
    },
    rules: {
      '.Input': {
        backgroundColor: '#0d0d0d',
        border:          '1px solid #2a2a2a',
        boxShadow:       'none',
        color:           '#ededed',
        padding:         '12px 14px',
      },
      '.Input:focus': {
        border:     `1px solid ${brandColor}`,
        boxShadow:  'none',
        outline:    'none',
      },
      '.Input--invalid': {
        border: '1px solid rgba(248,113,113,0.6)',
      },
      '.Label': {
        color:          '#666666',
        fontSize:       '11px',
        fontWeight:     '600',
        textTransform:  'uppercase',
        letterSpacing:  '0.06em',
        marginBottom:   '6px',
      },
      '.Error': {
        color:     '#f87171',
        fontSize:  '12px',
      },
      '.Tab': {
        backgroundColor: '#0d0d0d',
        border:          '1px solid #2a2a2a',
        boxShadow:       'none',
      },
      '.Tab:hover': {
        backgroundColor: '#161616',
      },
      '.Tab--selected': {
        backgroundColor: '#161616',
        border:          `1px solid ${brandColor}`,
        boxShadow:       'none',
      },
      '.Block': {
        backgroundColor: '#0d0d0d',
        border:          '1px solid #2a2a2a',
      },
      '.CheckboxInput': {
        backgroundColor: '#0d0d0d',
        border:          '1px solid #2a2a2a',
      },
    },
  }

  if (stripe === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={24} className="animate-spin" style={{ color: brandColor }} />
      </div>
    )
  }
  if (!stripe) {
    return (
      <p className="text-center text-sm text-red-400 py-4">
        Card payments are not configured. Please ask staff or pay cash when leaving.
      </p>
    )
  }
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance }}>
      <StripePaymentForm
        orderId={order.id}
        total={Number(order.total)}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  )
}

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

// ─── FOOD CARD — defined outside MenuPageInner so React doesn't recreate the
// component type on every render (which would remount all cards and replay animations)
function VideoModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {/* Title */}
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-white text-sm">{item.name}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#aaa' }}>✕</button>
        </div>
        {/* Video player */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#000', border: '1px solid #222', aspectRatio: '9/16' }}>
          <video
            src={item.videoUrl}
            autoPlay
            loop
            playsInline
            controls
            className="w-full h-full object-cover"
          />
        </div>
        {/* Price hint */}
        <p className="text-center text-xs mt-3 font-semibold" style={{ color: 'var(--brand)' }}>
          AED {(item.price * 1.05).toFixed(2)} · incl. VAT
        </p>
      </div>
    </div>
  )
}

function FoodCard({ item, index, qty, isFav, isLoggedIn: loggedIn, lang, onToggleFav, onOpen }: {
  item: MenuItem; index: number; qty: number; isFav: boolean; isLoggedIn: boolean; lang: 'en' | 'ar'
  onToggleFav: () => void; onOpen: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const vatInclusivePrice = Number(item.price) * 1.05
  return (
    <>
    <div
      ref={cardRef}
      onClick={onOpen}
      className="rounded-2xl overflow-hidden flex flex-col cursor-pointer"
      style={{
        transition: 'opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)',
        transitionDelay: `${index * 50}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
        backgroundColor: qty > 0 ? 'rgba(var(--brand-rgb),0.06)' : '#111',
        border: qty > 0 ? '1px solid rgba(var(--brand-rgb),0.4)' : '1px solid #1e1e1e',
        boxShadow: qty > 0 ? '0 0 24px rgba(var(--brand-rgb),0.08)' : 'none',
      }}>
      <div className="relative h-40 w-full overflow-hidden flex-shrink-0">
        {/* If video exists show it as muted preview, else fall back to image */}
        {item.videoUrl ? (
          <video
            src={item.videoUrl}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <FoodImage src={item.imageUrl} alt={item.name} className="w-full h-full transition-transform duration-500 hover:scale-105" />
        )}
        {loggedIn && (
          <button onClick={e => { e.stopPropagation(); onToggleFav() }}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-transform active:scale-90">
            <Heart size={13} className={isFav ? 'text-red-400 fill-red-400' : 'text-white'} />
          </button>
        )}
        {item.videoUrl && (
          <button onClick={e => { e.stopPropagation(); setShowVideo(true) }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span className="text-white text-[10px]">⛶</span>
          </button>
        )}
        {qty > 0 && (
          <div className={`absolute ${item.videoUrl ? 'top-12' : 'top-2'} right-2 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-lg`}
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
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
            <span className="font-black text-base" style={{ color: 'var(--brand)' }}>
              AED {vatInclusivePrice.toFixed(2)}
              <span className="text-[9px] text-amber-300/70 font-normal ml-1">{t(lang, 'menu.inclVat')}</span>
            </span>
            <span className="text-white/60 text-[10px] flex items-center gap-0.5">
              <Clock size={9} /> {item.prepTimeMins}m
            </span>
          </div>
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <div className="font-bold text-white text-sm leading-snug mb-1">
          {lang === 'ar' && (item as any).nameAr ? (item as any).nameAr : item.name}
        </div>
        {(lang === 'ar' ? ((item as any).descriptionAr || item.description) : item.description) && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2 flex-1">
            {lang === 'ar' && (item as any).descriptionAr ? (item as any).descriptionAr : item.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          {item.modifierGroups && item.modifierGroups.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {item.modifierGroups[0].options.slice(0, 4).map(o => (
                <span key={o.id} className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: '#0d0d0d', color: '#888' }}>
                  {o.name}
                </span>
              ))}
              {item.modifierGroups[0].options.length > 4 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: '#0d0d0d', color: '#888' }}>
                  +{item.modifierGroups[0].options.length - 4}
                </span>
              )}
            </div>
          ) : (
            <div className="text-[9px] text-gray-600">{t(lang, 'menu.single')}</div>
          )}
          <div className="text-[10px] text-[var(--brand)]/70 font-semibold">{lang === 'ar' ? '← اضغط' : 'Tap →'}</div>
        </div>
      </div>
    </div>
    {showVideo && item.videoUrl && <VideoModal item={item} onClose={() => setShowVideo(false)} />}
    </>
  )
}

function MenuPageInner() {
  const searchParams = useSearchParams()
  // When coming from book page: tableId + bookingId pre-set, card-only
  const urlTableId   = searchParams.get('tableId')   ?? ''
  const urlBookingId = searchParams.get('bookingId') ?? ''
  const urlQr        = searchParams.get('qr')        ?? ''   // from QR scan
  const urlOpenItem  = searchParams.get('open')      ?? ''   // from signature dish click
  const urlTrack     = searchParams.get('track')     === '1' // from account page Track button
  const urlNew       = searchParams.get('new')       === '1' // from hero "Order Now" — skip redirect
  const fromBooking  = !!urlTableId && !!urlBookingId
  const fromQr       = !!urlQr

  const router = useRouter()
  useEffect(() => { if (urlTrack) router.replace('/menu/orders') }, [urlTrack, router])
  const [view, setView] = useState<View>('menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryPages, setCategoryPages] = useState<Record<string, CategoryPageState>>({})
  const [activeCategory, setActiveCategory] = useState('')
  // Single order kept for payment flow only; multi-order tracking uses activeOrders
  const [order, setOrder] = useState<Order | null>(null)
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [placingCash, setPlacingCash] = useState(false)
  const [placingCard, setPlacingCard] = useState(false)
  const [notesOpen, setNotesOpen] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [favs, setFavs] = useState<string[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  // true while we check localStorage for live orders — prevents menu flash before redirect
  const hasStoredOrders = typeof window !== 'undefined' && (() => {
    try { return JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]').length > 0 } catch { return false }
  })()
  const [checkingOrders, setCheckingOrders] = useState(!urlQr && !urlNew && hasStoredOrders)
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

  // Dine-in table selection
  const [allTables, setAllTables]     = useState<{id:string; tableNumber:number; name:string|null; capacity:number; status:string}[]>([])
  const [tableInput, setTableInput]   = useState('')
  const [tableId, setTableId]         = useState(urlTableId)
  const [tableNum, setTableNum]       = useState<number | null>(null)
  const [tableError, setTableError]   = useState('')
  const [qrTableName, setQrTableName] = useState('')
  const [qrTableStatus, setQrTableStatus] = useState('')

  // Staff session picker — when staff orders for a table that has multiple guests
  const [tableSessions, setTableSessions] = useState<{ sessionId: string; label: string; orderCount: number; itemCount: number; total: number; itemSummary: string[]; firstOrderAt: string | null }[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null) // null = new session
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const cart = useCartStore()
  const { user: authUser } = useAuthStore()
  const { dark, toggle } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const ar = mounted && lang === 'ar'
  // Helper: pick Arabic field if available and Arabic is active
  const dn = (en: string, arText?: string | null) => (ar && arText) ? arText : en
  const brandLogoUrl    = useBrandStore(s => s.logoUrl)
  const brandName       = useBrandStore(s => s.restaurantName)
  const brandNameAr     = useBrandStore(s => s.restaurantNameAr)
  const brandTagline    = useBrandStore(s => s.tagline)
  const brandTaglineAr  = useBrandStore(s => s.taglineAr)
  const brandColor      = useBrandStore(s => s.brandColor)
  const isStaff = !!(authUser && ['STAFF', 'MANAGER', 'OWNER'].includes(authUser.role))

  // When staff selects a table, load existing guest sessions so they can pick who they're ordering for
  useEffect(() => {
    if (!isStaff || !tableId || cart.orderType !== 'DINE_IN') {
      setTableSessions([])
      setSelectedSessionId(null)
      return
    }
    setSessionsLoading(true)
    api.get(`/orders/table/${tableId}/sessions`)
      .then(r => {
        setTableSessions(r.data ?? [])
        setSelectedSessionId(null)  // force staff to consciously pick
      })
      .catch(() => setTableSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [isStaff, tableId, cart.orderType])

  const loadCategoryItems = useCallback(async (categoryId: string, cursor?: string) => {
    setCategoryPages(prev => ({
      ...prev,
      [categoryId]: {
        nextCursor: prev[categoryId]?.nextCursor ?? null,
        hasMore: prev[categoryId]?.hasMore ?? true,
        loading: true,
        loaded: prev[categoryId]?.loaded ?? false,
      },
    }))
    try {
      const params = new URLSearchParams({ categoryId, limit: String(ITEMS_PAGE_SIZE) })
      if (cursor) params.set('cursor', cursor)
      const r = await api.get(`/menu/items?${params}`)
      const { items, nextCursor, hasMore } = r.data as {
        items: MenuItem[]
        nextCursor: string | null
        hasMore: boolean
      }
      setCategories(prev => prev.map(c =>
        c.id === categoryId
          ? { ...c, items: cursor ? [...c.items, ...items] : items }
          : c,
      ))
      setCategoryPages(prev => ({
        ...prev,
        [categoryId]: { nextCursor, hasMore, loading: false, loaded: true },
      }))
    } catch {
      setCategoryPages(prev => ({
        ...prev,
        [categoryId]: {
          nextCursor: prev[categoryId]?.nextCursor ?? null,
          hasMore: prev[categoryId]?.hasMore ?? false,
          loading: false,
          loaded: prev[categoryId]?.loaded ?? false,
        },
      }))
    }
  }, [])

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
    applyLangDir(lang)
    requestNotifyPermission()
    if (fromBooking || fromQr) {
      cart.setOrderType('DINE_IN')
    } else {
      // Menu page is dine-in first — clear stale TAKEAWAY left in persisted cart
      cart.setOrderType('DINE_IN')
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
    api.get('/menu/categories').then(async r => {
      const cats: Category[] = (r.data ?? []).map((c: { id: string; name: string; nameAr?: string; itemCount?: number }) => ({
        id: c.id,
        name: c.name,
        nameAr: c.nameAr,
        itemCount: c.itemCount ?? 0,
        items: [],
      }))
      setCategories(cats)
      if (urlOpenItem) {
        // Find which category this item belongs to by fetching it directly
        try {
          const itemRes = await api.get(`/menu/items/${urlOpenItem}`)
          const item: MenuItem = itemRes.data
          const catId = item.categoryId ?? cats[0]?.id
          if (catId) {
            setActiveCategory(catId)
            await loadCategoryItems(catId)
            // Pre-select defaults then open drawer
            const defaults: Record<string, string> = {}
            item.modifierGroups?.forEach(g => {
              const def = g.options.find(x => x.isDefault) ?? g.options[0]
              if (def) defaults[g.id] = def.id
            })
            setDrawerItem(item)
            setSelectedOptions(defaults)
            setDrawerNotes('')
            setTimeout(() => scrollToCategory(catId), 200)
          }
        } catch {
          if (cats[0]) { setActiveCategory(cats[0].id); loadCategoryItems(cats[0].id) }
        }
      } else if (cats[0]) {
        setActiveCategory(cats[0].id)
        loadCategoryItems(cats[0].id)
      }
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
    // Restore in-progress orders from localStorage — survives refresh & back-navigation
    const storedIds: string[] = (() => {
      try { return JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]') } catch { return [] }
    })()
    if (!storedIds.length) setCheckingOrders(false)
    if (storedIds.length) {
      Promise.allSettled(storedIds.slice(0, 10).map(id => api.get(`/orders/${id}`))).then(results => {
        const live: Order[] = []
        const deadIds: string[] = []
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const o: Order = r.value.data
            // Treat as dead: cancelled, fully paid+delivered, OR abandoned card intent (no paymentMethod set = never completed)
            const isAbandoned = o.stripeIntentId && !o.paymentMethod && o.paymentStatus === 'UNPAID'
            const isDone = !o || o.status === 'CANCELLED' || (o.status === 'DELIVERED' && o.paymentStatus === 'PAID') || isAbandoned
            if (!isDone) live.push(o)
            else deadIds.push(storedIds[i])
          } else {
            deadIds.push(storedIds[i])
          }
        })
        if (deadIds.length) {
          const cleaned = storedIds.filter(id => !deadIds.includes(id))
          localStorage.setItem('almanzil_order_ids', JSON.stringify(cleaned))
          // If no more live orders, clear the saved table too
          if (!live.length) {
            localStorage.removeItem('almanzil_table_id')
            localStorage.removeItem('almanzil_table_num')
          }
        }
        setCheckingOrders(false)
        if (live.length) {
          setActiveOrders(live)
          // Auto-redirect to orders page unless the guest just scanned a QR to order more
          if (!urlQr && !urlTrack && !urlNew) router.push('/menu/orders')
          // Restore table so guest doesn't have to re-select when ordering again
          if (!urlTableId && !urlQr) {
            const storedTableId = localStorage.getItem('almanzil_table_id')
            const storedTableNum = localStorage.getItem('almanzil_table_num')
            if (storedTableId) {
              setTableId(storedTableId)
              if (storedTableNum) { setTableNum(parseInt(storedTableNum) || null); setTableInput(storedTableNum) }
            }
          }
        }
      })
    }

    // Also fetch any orders placed by staff on behalf of this guest's session
    // (those never land in localStorage but share the same tableSessionId = guestTabToken)
    const sessionToken = (() => {
      try { return sessionStorage.getItem('almanzil_tab_token') } catch { return null }
    })()
    if (sessionToken) {
      api.get(`/orders/by-session/${sessionToken}`).then(r => {
        const serverOrders: Order[] = r.data ?? []
        // Only care about orders that are still active (not paid+delivered)
        const liveServerOrders = serverOrders.filter(o =>
          !(o.status === 'DELIVERED' && o.paymentStatus === 'PAID') && o.status !== 'CANCELLED'
        )
        if (!liveServerOrders.length) return
        // Add any we don't already have in localStorage-loaded orders
        setActiveOrders(prev => {
          const existing = new Set(prev.map(o => o.id))
          const newOnes = liveServerOrders.filter(o => !existing.has(o.id))
          if (!newOnes.length) return prev
          return [...newOnes, ...prev]
        })
        if (!urlQr && !urlTrack && !urlNew) router.push('/menu/orders')
        // Restore table from the first server order if not already set
        if (!urlTableId && !urlQr) {
          const firstWithTable = serverOrders.find(o => o.table)
          if (firstWithTable?.table) {
            const tid = firstWithTable.table.id
            const tnum = firstWithTable.table.tableNumber
            setTableId(prev => prev || tid)
            setTableNum(prev => prev ?? tnum)
          }
        }
      }).catch(() => {})
    }

    // For logged-in users: fetch their active orders from the server
    // (these are never stored in localStorage so would otherwise be invisible on the tracking page)
    if (authToken) {
      api.get('/orders/mine').then(r => {
        const myOrders: Order[] = r.data ?? []
        const liveMyOrders = myOrders.filter(o =>
          !(o.status === 'DELIVERED' && o.paymentStatus === 'PAID') && o.status !== 'CANCELLED'
        )
        if (!liveMyOrders.length) return
        setActiveOrders(prev => {
          const existing = new Set(prev.map(o => o.id))
          const newOnes = liveMyOrders.filter(o => !existing.has(o.id))
          if (!newOnes.length) return prev
          return [...newOnes, ...prev]
        })
        if (!urlQr && !urlTrack && !urlNew) router.push('/menu/orders')
        if (!urlTableId && !urlQr) {
          const firstWithTable = liveMyOrders.find(o => o.table)
          if (firstWithTable?.table) {
            setTableId(prev => prev || firstWithTable.table!.id)
            setTableNum(prev => prev ?? firstWithTable.table!.tableNumber)
          }
        }
      }).catch(() => {})
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

  // Single WebSocket handler — covers both single-order (payment flow) and multi-order (tracking)
  // One listener only to avoid duplicate notifications
  useEffect(() => {
    const socket = getSocket()
    const handler = (updated: Order) => {
      // Keep payment-flow single order in sync
      setOrder(prev => (prev?.id === updated.id ? updated : prev))

      // Update active orders list + fire notifications (outside setState to avoid render-time setState)
      let statusChanged: { from: string; to: string; orderId: string } | null = null
      setActiveOrders(prev => {
        const idx = prev.findIndex(o => o.id === updated.id)
        if (idx < 0) return prev
        const old = prev[idx]
        if (old.status !== updated.status) {
          statusChanged = { from: old.status, to: updated.status, orderId: updated.id }
        }
        const next = [...prev]
        next[idx] = updated
        return next
      })

      // Notifications — run after state update, not during
      setTimeout(() => {
        if (!statusChanged) return
        const { from, to, orderId } = statusChanged
        if (to === 'ACCEPTED' && from === 'PENDING') notify.order.accepted('Your order')
        else if (to === 'PREPARING') notify.order.preparing('Your order')
        else if (to === 'READY') notify.order.readyGuest()
        else if (to === 'CANCELLED') notify.order.cancelled()
        if (to === 'DELIVERED' && from !== 'DELIVERED') { /* feedback shown on /menu/orders */ }
      }, 0)
    }
    socket.on('order:updated', handler)
    socket.on('order:ready', handler)
    return () => { socket.off('order:updated', handler); socket.off('order:ready', handler) }
  }, [])

  const placeOrder = async (payWithCard: boolean) => {
    if (cart.items.length === 0) return
    if (cart.orderType === 'DINE_IN' && !tableId) {
      notify.error('Please select your table first')
      return
    }
    if (isStaff && cart.orderType === 'DINE_IN' && tableSessions.length > 0 && !selectedSessionId) {
      notify.error('Please select which guest you are ordering for')
      return
    }
    if (payWithCard) setPlacingCard(true)
    else setPlacingCash(true)
    // Dine-in guest adding a takeaway: link to their table so staff knows who to give the bag to
    const hasDineInSession = cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const { data: newOrder } = await api.post('/orders', {
        type: cart.orderType,
        tableId: cart.orderType === 'DINE_IN' ? tableId : hasDineInSession ? tableId : undefined,
        // Staff ordering for a specific guest: pass their sessionId as guestTabToken
        // '__new__' = staff chose "new guest / separate bill" → no token → backend creates fresh session
        ...(isStaff && selectedSessionId && selectedSessionId !== '__new__'
          ? { guestTabToken: selectedSessionId }
          : (!isStaff && !token && cart.orderType === 'DINE_IN' ? { guestTabToken } : {})),
        ...(cart.orderType === 'TAKEAWAY' && contactPhone ? { contactPhone } : {}),
        ...(!payWithCard ? { paymentMethod: 'CASH' } : {}),
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
      // Persist order ID + tableId in localStorage so returning guests skip re-selection
      try {
        const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
        if (!ids.includes(newOrder.id)) ids.unshift(newOrder.id)
        localStorage.setItem('almanzil_order_ids', JSON.stringify(ids.slice(0, 30)))
        if (cart.orderType === 'DINE_IN' && tableId) {
          localStorage.setItem('almanzil_table_id', tableId)
          if (tableNum) localStorage.setItem('almanzil_table_num', String(tableNum))
        }
        if (!token) {
          const count = parseInt(localStorage.getItem('almanzil_guest_order_count') || '0') + 1
          localStorage.setItem('almanzil_guest_order_count', String(count))
          setGuestOrderCount(count)
        }
      } catch {}
      // Add to multi-order tracker
      setActiveOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev])

      if (payWithCard) {
        if (!isStripeConfigured()) {
          notify.error('Card payments are not set up. Your order was placed — pay cash when leaving.')
          cart.clear()
          setShowCashConfirm(false)
          router.push('/menu/orders')
          return
        }
        const { data } = await api.post(`/payments/create-intent/${newOrder.id}`)
        cart.clear()
        setShowCashConfirm(false)
        setClientSecret(data.clientSecret)
        setView('payment')
      } else {
        cart.clear()
        setShowCashConfirm(false)
        router.push('/menu/orders')
        toast.success(t(lang, 'menu.orderPlaced'), { duration: 4000, position: 'top-center' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not place order. Try again.'
      notify.error(msg)
    } finally {
      if (payWithCard) setPlacingCard(false)
      else setPlacingCash(false)
    }
  }

  // User abandons the Stripe form — cancel the order so it doesn't zombie in DB/localStorage
  const cancelPaymentAndGoBack = async () => {
    if (order) {
      try { await api.post(`/orders/${order.id}/cancel`, { cancelReason: 'Payment abandoned' }) } catch {}
      try {
        const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
        localStorage.setItem('almanzil_order_ids', JSON.stringify(ids.filter(id => id !== order.id)))
      } catch {}
    }
    setOrder(null)
    setClientSecret(null)
    setView('menu')
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!order) return
    try {
      const { data } = await api.post(`/payments/confirm/${order.id}`, { paymentIntentId })
      setOrder(data.order)
      setClientSecret(null)
      setView('confirmed')  // show payment confirmation screen
    } catch {
      notify.error('Payment went through but confirmation failed. Show this screen to staff.')
      router.push('/menu/orders')
    }
  }

  // Lock body scroll when drawer or modal is open
  useEffect(() => {
    const locked = !!drawerItem || showCashConfirm
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerItem, showCashConfirm])

  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0)

  // Auto-redirect to menu when cart is emptied
  useEffect(() => {
    if (view === 'cart' && cart.items.length === 0) setView('menu')
  }, [view, cart.items.length])

  const FAV_ID = '__favorites__'

  // ─── REFS & SCROLL HOOKS (must be above any early returns) ────────────────
  const mainRef = useRef<HTMLElement>(null)
  const catTabsRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const loadMoreRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollingProgrammatically = useRef(false)
  // Prevents the lazy-load observer from firing on mount (when all sentinels are at top)
  const scrollObserverReady = useRef(false)
  const categoryPagesRef = useRef(categoryPages)
  categoryPagesRef.current = categoryPages

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

  // Lazy-load + infinite scroll for category items
  useEffect(() => {
    if (categories.length === 0) return
    // Delay activating scroll-based loading so the initial explicit load (first category
    // or urlOpenItem category) isn't drowned out by all sentinels firing at mount time
    const t = setTimeout(() => { scrollObserverReady.current = true }, 800)
    const observer = new IntersectionObserver(
      entries => {
        if (!scrollObserverReady.current) return
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const catId = entry.target.getAttribute('data-cat-load')
          if (!catId) continue
          const state = categoryPagesRef.current[catId]
          if (state?.loading) continue
          if (state?.hasMore && state.nextCursor) {
            loadCategoryItems(catId, state.nextCursor)
          } else if (!state?.loaded) {
            loadCategoryItems(catId)
          }
        }
      },
      { root: null, rootMargin: '0px 0px 200px 0px', threshold: 0 },
    )
    categories.forEach(cat => {
      const el = loadMoreRefs.current[cat.id]
      if (el) observer.observe(el)
    })
    return () => { clearTimeout(t); observer.disconnect() }
  }, [categories, categoryPages, loadCategoryItems])

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
  // ─── PAYMENT CONFIRMED VIEW ───────────────────────────────────────────────
  if (view === 'confirmed' && order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        <div className="space-y-5 max-w-sm w-full">
          {/* Animated check */}
          <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
            style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.4)' }}>
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white mb-1">Payment Confirmed!</h1>
            <p className="text-gray-500 text-sm">AED {Number(order.total).toFixed(2)} charged · your order is in the kitchen</p>
          </div>

          {/* Receipt summary */}
          <div className="rounded-2xl p-4 text-left space-y-2" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm text-gray-400">
                <span>{item.quantity}× {item.menuItem.name}</span>
              </div>
            ))}
            <div className="pt-2 border-t flex justify-between text-sm font-bold text-white" style={{ borderColor: '#1e1e1e' }}>
              <span>Total</span>
              <span style={{ color: 'var(--brand)' }}>AED {Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          <button onClick={() => router.push('/menu/orders')}
            className="w-full py-4 rounded-2xl font-black text-base"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            Track My Order →
          </button>
        </div>

      </div>
    )
  }

  if (view === 'payment' && clientSecret && order) {
    return (
      <div className="min-h-screen flex flex-col animate-[fadeIn_0.3s_ease_forwards]" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        <div className="border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10" style={{ backgroundColor: '#0d0d0d', borderColor: '#1a1a1a' }}>
          <button onClick={cancelPaymentAndGoBack} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <Lock size={16} className="text-green-500" />
          <span className="font-semibold text-sm text-white">Secure Payment</span>
        </div>
        <div className="flex-1 max-w-md mx-auto w-full px-4 py-6">
          <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t(lang, 'menu.orderSummary')}</div>
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
                <span>Total</span><span style={{ color: 'var(--brand)' }}>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <StripeCheckout
            clientSecret={clientSecret}
            order={order}
            brandColor={brandColor}
            onSuccess={handlePaymentSuccess}
            onCancel={cancelPaymentAndGoBack}
          />
          <p className="text-center text-xs text-gray-300 mt-4">
            Test card: 4242 4242 4242 4242 · Any future date · Any CVC
          </p>
        </div>
      </div>
    )
  }

  // ─── CART VIEW ────────────────────────────────────────────────────────────
  if (view === 'cart') {
    // QR guests: block until table resolves; direct guests: need explicit table pick
    const canOrder = cart.orderType === 'TAKEAWAY' || !!tableId
    return (
      <>
      <div className="min-h-screen flex flex-col animate-[fadeIn_0.3s_ease_forwards]" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        <div className="border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10" style={{ backgroundColor: '#0d0d0d', borderColor: '#1a1a1a' }}>
          <button onClick={() => setView('menu')} className="text-gray-400 hover:text-white">
            {ar ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
          </button>
          <span className="font-semibold text-white">{t(lang, 'cart.reviewOrder')}</span>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4">

          {/* Order type toggle */}
          <div className="rounded-2xl p-4 mb-4 animate-[fadeUp_0.35s_ease_forwards]" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t(lang, 'cart.howWouldYouLikeIt')}</div>
            {fromBooking ? (
              <div className="flex items-center gap-2 bg-[var(--brand)]/10 border border-[var(--brand)]/30 rounded-xl px-3 py-2.5">
                <Table2 size={14} className="text-[var(--brand)] flex-shrink-0" />
                <span className="text-sm text-white font-semibold">Dine In — {allTables.find(t => t.id === tableId)?.name ?? `Table ${tableNum}`}</span>
                <span className="text-xs text-gray-500 ml-auto">{t(lang, 'cart.fromBooking')}</span>
              </div>
            ) : (
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
                {(['DINE_IN', 'TAKEAWAY'] as const).map(type => (
                  <button key={type} onClick={() => {
                    cart.setOrderType(type)
                    // Don't clear tableId — keep it so switching back to Dine-in restores the table
                  }}
                    style={cart.orderType === type ? { backgroundColor: 'var(--brand)', color: '#000' } : { backgroundColor: '#0d0d0d', color: '#888' }}
                    className="flex-1 py-3 text-sm font-semibold transition-colors">
                    {type === 'DINE_IN' ? t(lang, 'cart.dineIn') : t(lang, 'cart.takeaway')}
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
                    <span className="text-xs text-gray-400 ml-auto">{t(lang, 'cart.fromQr')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: '#0d0d0d' }}>
                    <Loader2 size={14} className="text-gray-400 animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400">{t(lang, 'cart.resolvingTable')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Table selected — locked tile with change option */}
            {cart.orderType === 'DINE_IN' && !fromBooking && !fromQr && tableId && (
              <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', border: '1.5px solid rgba(var(--brand-rgb),0.5)' }}>
                <Table2 size={14} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>
                  {allTables.find(tb => tb.id === tableId)?.name ?? `Table ${tableNum}`}
                </span>
                <span className="text-[10px] text-green-400 ml-1">{t(lang, 'cart.selected')}</span>
                <button onClick={() => { setTableId(''); setTableNum(null); setTableInput('') }}
                  className="ml-auto text-[10px] text-gray-500 underline">{t(lang, 'cart.change')}</button>
              </div>
            )}

            {/* Table picker — guests can pick any table except ones being cleaned */}
            {cart.orderType === 'DINE_IN' && !fromBooking && !fromQr && !tableId && (() => {
              const selectable = allTables.filter(t => t.status !== 'DIRTY')
              return (
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <Table2 size={11} /> {t(lang, 'cart.selectTable')}
                </div>
                {selectable.length === 0 ? (
                  <p className="text-xs text-[var(--brand)] bg-[var(--brand)]/10 border border-[var(--brand)]/20 rounded-xl px-3 py-2.5">
                    {t(lang, 'cart.noTablesAvailable')}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {selectable.map(tbl => (
                      <button key={tbl.id} onClick={() => { setTableId(tbl.id); setTableNum(tbl.tableNumber); cart.setTableId(tbl.id) }}
                          style={tableId === tbl.id
                          ? { backgroundColor: 'var(--brand)', border: '1px solid var(--brand)', boxShadow: '0 4px 12px rgba(var(--brand-rgb),0.2)' }
                          : { backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}
                        className="rounded-xl py-3 px-2 text-center transition-all">
                        <div className={`font-bold text-sm ${tableId === tbl.id ? 'text-black' : 'text-white'}`}>
                          {tbl.name ?? `T${tbl.tableNumber}`}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${tableId === tbl.id ? 'text-amber-100' : 'text-gray-400'}`}>
                          {tbl.status === 'EMPTY' ? `${tbl.capacity} ${t(lang, 'cart.seats')}` : tbl.status === 'OCCUPIED' ? t(lang, 'cart.seated') : t(lang, 'cart.billing')}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {tableId && (
                  <p className="text-green-500 text-xs mt-2 flex items-center gap-1">
                    ✓ {allTables.find(t => t.id === tableId)?.name ?? `Table ${tableNum}`} selected
                  </p>
                )}
              </div>
              )
            })()}

            {!fromBooking && cart.orderType === 'TAKEAWAY' && (
              <p className="text-xs text-gray-400 mt-2 text-center">{t(lang, 'cart.tokenGiven')}</p>
            )}

            {/* ── Staff session picker ── shown only when staff has selected a table with existing guests */}
            {isStaff && tableId && cart.orderType === 'DINE_IN' && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: '#2a2a2a' }}>
                <div className="text-xs text-[var(--brand)] font-semibold mb-2 flex items-center gap-1.5">
                  <span>👤</span> Who are you ordering for?
                </div>
                {sessionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                    <Loader2 size={12} className="animate-spin" /> Loading guests at this table…
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {tableSessions.map(s => {
                      const selected = selectedSessionId === s.sessionId
                      const time = s.firstOrderAt
                        ? new Date(s.firstOrderAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : null
                      return (
                        <button key={s.sessionId} onClick={() => setSelectedSessionId(s.sessionId)}
                          className="w-full px-3 py-2.5 rounded-xl text-left transition-all"
                          style={selected
                            ? { backgroundColor: 'rgba(var(--brand-rgb),0.12)', border: '1.5px solid rgba(var(--brand-rgb),0.5)' }
                            : { backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-bold" style={{ color: selected ? 'var(--brand)' : '#ccc' }}>
                              {s.label}
                              {time && <span className="font-normal text-gray-500 ml-1.5">· {time}</span>}
                            </p>
                            {selected && <span className="text-[10px] font-bold" style={{ color: 'var(--brand)' }}>✓ Selected</span>}
                          </div>
                          <p className="text-[10px] text-gray-500 leading-relaxed">
                            {s.itemSummary.length > 0
                              ? s.itemSummary.join(', ')
                              : `${s.itemCount} item${s.itemCount !== 1 ? 's' : ''}`}
                          </p>
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: selected ? 'var(--brand)' : '#555' }}>
                            AED {s.total.toFixed(2)}
                          </p>
                        </button>
                      )
                    })}
                    {/* New guest / separate bill */}
                    <button onClick={() => setSelectedSessionId('__new__')}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={selectedSessionId === '__new__'
                        ? { backgroundColor: 'rgba(var(--brand-rgb),0.12)', border: '1.5px solid rgba(var(--brand-rgb),0.5)' }
                        : { backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e', borderStyle: 'dashed' }}>
                      <span className="text-xs font-bold" style={{ color: selectedSessionId === '__new__' ? 'var(--brand)' : '#666' }}>
                        + New Guest (separate bill)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="rounded-2xl mb-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            {cart.items.length === 0 && <div className="text-center py-10 text-gray-500 text-sm">{t(lang, 'menu.emptyCart')}</div>}
            {cart.items.map((item, idx) => (
              <div key={item.menuItemId} className="p-4" style={idx > 0 ? { borderTop: '1px solid #1e1e1e' } : {}}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    {(item.modifiers ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(item.modifiers ?? []).map(m => (
                          <span key={m.optionId} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">AED {item.price.toFixed(2)} {t(lang, 'cart.eachInclVat')}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => cart.updateQty(item.cartKey, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
                      <Minus size={12} className="text-gray-300" />
                    </button>
                    <span className="text-sm font-bold w-5 text-center text-white">{item.quantity}</span>
                    <button onClick={() => cart.updateQty(item.cartKey, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
                      <Plus size={12} style={{ color: '#000' }} />
                    </button>
                    <button onClick={() => cart.removeItem(item.cartKey)} className="ml-1 text-gray-600 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <button onClick={() => setNotesOpen(notesOpen === item.cartKey ? null : item.cartKey)}
                  className="text-xs text-[var(--brand)] hover:underline">
                  {item.notes ? `📝 ${item.notes}` : t(lang, 'cart.addNote')}
                </button>
                {notesOpen === item.cartKey && (
                  <input autoFocus type="text" placeholder={t(lang, 'cart.notePlaceholder')}
                    value={item.notes || ''}
                    onChange={e => cart.updateNotes(item.cartKey, e.target.value)}
                    className="mt-2 w-full text-xs rounded-lg px-3 py-2 focus:outline-none text-white placeholder-gray-600"
                    style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}
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
                <span>{t(lang, 'cart.totalInclVat')}</span><span style={{ color: 'var(--brand)' }}>AED {cart.total().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{t(lang, 'cart.dishPricesNet')}</span><span>AED {(cart.total() - cart.vatPortion()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pb-2 mb-2" style={{ borderBottom: '1px solid #1e1e1e' }}>
                <span>{t(lang, 'cart.vatIncluded')}</span><span>AED {cart.vatPortion().toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <Clock size={11} /> {t(lang, 'cart.estPrep')}{cart.maxPrepTime()}–{cart.maxPrepTime() + 5} {t(lang, 'cart.mins')}
              </div>
            </div>
          )}

          {/* Phone number — takeaway only */}
          {cart.orderType === 'TAKEAWAY' && cart.items.length > 0 && (
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t(lang, 'cart.contactNumber')}</div>
              <input
                type="tel"
                placeholder="+971 50 000 0000"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
                style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}
              />
              <p className="text-[11px] text-gray-500 mt-1.5">We'll call/SMS you when your order is ready for pickup</p>
            </div>
          )}

          {/* Payment buttons */}
          {cart.items.length > 0 && (
            <div className="space-y-3">
              {cart.orderType === 'DINE_IN' && !tableId && (
                <div className="flex items-center gap-2 bg-[var(--brand)]/10 border border-[var(--brand)]/30 rounded-2xl px-4 py-3">
                  <AlertCircle size={15} className="text-[var(--brand)] flex-shrink-0" />
                  <span className="text-amber-300 text-sm">{t(lang, 'cart.selectTableToContinue')}</span>
                </div>
              )}
              {/* Cash / counter payment option.
                  DINE_IN:   guest orders food, pays cash at the counter when leaving (tab system).
                             If they already have an active dine-in order, "Add to My Order" skips the confirm dialog.
                  TAKEAWAY:  walk-in customer picks up at counter and pays there — shown as "Pay at Counter".
                             If the same guest also has a dine-in session on a table, the takeaway is added to
                             their table bill instead ("Add to My Table Bill").
                  Booking pre-orders are excluded — those require card payment (see fromBooking guard). */}
              {!fromBooking && (() => {
                const hasDineInSession = cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                const isReturningDineIn = cart.orderType === 'DINE_IN' && activeOrders.some(o => o.type === 'DINE_IN')
                if (cart.orderType === 'DINE_IN') {
                  return (
                    <button onClick={() => isReturningDineIn ? placeOrder(false) : setShowCashConfirm(true)}
                      disabled={placingCash || placingCard || !canOrder}
                      className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                      {placingCash ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={16} />}
                      {isReturningDineIn ? `${t(lang,'cart.addToMyOrder')} · AED ${cart.total().toFixed(2)}` : `${t(lang,'cart.payCashLeaving')} · AED ${cart.total().toFixed(2)}`}
                    </button>
                  )
                }
                if (cart.orderType === 'TAKEAWAY') {
                  const cashLabel = hasDineInSession
                    ? `Add to My Table Bill · AED ${cart.total().toFixed(2)}`
                    : `${t(lang,'cart.payAtCounter')} · AED ${cart.total().toFixed(2)}`
                  return (
                    <button onClick={() => setShowCashConfirm(true)}
                      disabled={placingCash || placingCard || !canOrder}
                      className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                      {placingCash ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={16} />}
                      {cashLabel}
                    </button>
                  )
                }
              })()}
              {/* Card payment */}
              <button onClick={() => placeOrder(true)}
                disabled={placingCash || placingCard || !canOrder}
                className="w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 text-gray-300 hover:text-white"
                style={{ border: '2px solid #2a2a2a', backgroundColor: 'transparent' }}>
                {placingCard ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                {t(lang,'cart.payByCard')} · AED {cart.total().toFixed(2)}
              </button>
              {!fromBooking && cart.orderType === 'DINE_IN' && (
                <p className="text-center text-[11px] text-gray-600">{t(lang, 'cart.mostGuestsPay')}</p>
              )}
              {!fromBooking && cart.orderType === 'TAKEAWAY' && (
                <p className="text-center text-[11px] text-gray-600">
                  {activeOrders.some(o => o.type === 'DINE_IN') && tableId
                    ? t(lang, 'cart.bagReadyLeaving')
                    : t(lang, 'cart.payAtCounterCollect')}
                </p>
              )}
              {fromBooking && (
                <p className="text-center text-xs text-gray-600">{t(lang, 'cart.preOrderBooking')}</p>
              )}

              {/* Account nudge for guests */}
              {!isLoggedIn && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <span className="text-[11px]" style={{ color: '#444' }}>
                    {lang === 'ar' ? 'لديك حساب؟' : 'Have an account?'}
                  </span>
                  <a href="/login?redirect=/menu/orders"
                    className="text-[11px] font-semibold underline"
                    style={{ color: 'var(--brand)' }}>
                    {lang === 'ar' ? 'سجّل دخولك وتتبّع طلباتك' : 'Sign in to track your orders'}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Cash confirmation sheet ── */}
      {showCashConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowCashConfirm(false)}>
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-5"
            style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
            onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-3">
                {cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId ? '🛍' : cart.orderType === 'TAKEAWAY' ? '📦' : '💵'}
              </div>
              <h2 className="text-xl font-black text-white mb-1">
                {cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                  ? t(lang, 'menu.addToBill')
                  : cart.orderType === 'TAKEAWAY'
                  ? t(lang, 'menu.payAtCounter')
                  : t(lang, 'menu.payCashLeaving')}
              </h2>
              <p className="text-sm text-gray-500">
                {cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                  ? t(lang, 'cart.cashConfirmSubAddBill')
                  : cart.orderType === 'TAKEAWAY'
                  ? t(lang, 'cart.cashConfirmSubTakeaway')
                  : t(lang, 'cart.cashConfirmSubDineIn')}
              </p>
            </div>
            <div className="rounded-2xl divide-y" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
              {cart.items.map(item => (
                <div key={item.cartKey} className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-gray-300">{item.quantity}× {item.name}</span>
                  <span className="text-white font-semibold">AED {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3">
                <span className="font-black text-white">{t(lang, 'cart.totalLabel')}</span>
                <span className="font-black text-lg" style={{ color: 'var(--brand)' }}>AED {cart.total().toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 text-center">{t(lang, 'cart.pricesIncludeVat')}</p>
            <button onClick={() => placeOrder(false)}
              disabled={placingCash || placingCard}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
              {placingCash ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
              {placingCash ? t(lang, 'cart.placingOrder')
                : cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                ? t(lang, 'cart.confirmAddToMyBill')
                : cart.orderType === 'TAKEAWAY'
                ? t(lang, 'cart.confirmPayAtCounter')
                : t(lang, 'cart.confirmPayOnExit')}
            </button>
            <button onClick={() => setShowCashConfirm(false)} disabled={placingCash || placingCard}
              className="w-full py-3 rounded-2xl text-sm text-gray-500 hover:text-white transition-colors"
              style={{ border: '1px solid #1e1e1e' }}>
              {t(lang, 'cart.goBack')}
            </button>
          </div>
        </div>
      )}
      </>
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
            <div className="text-lg font-black text-white leading-tight">
              {ar && (drawerItem as any).nameAr ? (drawerItem as any).nameAr : drawerItem.name}
            </div>
            {(ar ? ((drawerItem as any).descriptionAr || drawerItem.description) : drawerItem.description) && (
              <div className="text-xs text-gray-300 mt-0.5 line-clamp-2">
                {ar && (drawerItem as any).descriptionAr ? (drawerItem as any).descriptionAr : drawerItem.description}
              </div>
            )}
          </div>
          <div className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-xl"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--brand)', backdropFilter: 'blur(4px)' }}>
            <Clock size={10} className="inline mr-1" />{drawerItem.prepTimeMins}m
          </div>
        </div>

        <div className="px-4 pb-6">
          {/* Base price row */}
          <div className="flex justify-between items-center mb-4 pb-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
            <div className="text-xs text-gray-500">{t(lang, 'menu.basePrice')}</div>
            <div className="text-sm font-bold" style={{ color: 'var(--brand)' }}>AED {(drawerBasePrice * 1.05).toFixed(2)} <span className="text-[10px] text-gray-600 font-normal">{t(lang, 'menu.inclVat')}</span></div>
          </div>

          {/* Modifier groups */}
          {(drawerItem.modifierGroups ?? []).map(group => (
            <div key={group.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-bold text-white uppercase tracking-wide">{ar && (group as any).nameAr ? (group as any).nameAr : group.name}</div>
                {group.required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--brand)22', color: 'var(--brand)' }}>{t(lang, 'menu.required')}</span>}
              </div>
              <div className="space-y-2">
                {group.options.map(opt => {
                  const isActive = selectedOptions[group.id] === opt.id
                  const finalP = (drawerBasePrice + Number(opt.priceAdd)) * 1.05
                  return (
                    <button key={opt.id} onClick={() => setSelectedOptions(p => ({ ...p, [group.id]: opt.id }))}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={isActive
                        ? { backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1.5px solid var(--brand)' }
                        : { backgroundColor: '#161616', border: '1px solid #1e1e1e' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: isActive ? 'var(--brand)' : '#444' }}>
                          {isActive && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand)' }} />}
                        </div>
                        <span className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>{opt.name}</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isActive ? 'text-[var(--brand)]' : 'text-gray-500'}`}>
                          AED {finalP.toFixed(2)}
                        </div>
                        {Number(opt.priceAdd) > 0 && (
                          <div className="text-[9px] text-gray-600">+{Number(opt.priceAdd).toFixed(2)} {t(lang, 'menu.extra')}</div>
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
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">{t(lang, 'menu.specialInstructionsLabel')}</div>
            <input
              type="text"
              placeholder={t(lang, 'menu.specialInstructionsPlaceholder')}
              value={drawerNotes}
              onChange={e => setDrawerNotes(e.target.value)}
              className="w-full text-sm text-white placeholder-gray-600 rounded-xl px-3 py-2.5 focus:outline-none"
              style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}
            />
          </div>

          {/* Add button */}
          {requiredUnsatisfied.length > 0 ? (
            <div className="w-full py-4 rounded-2xl text-center text-sm font-semibold" style={{ backgroundColor: '#0d0d0d', color: '#888' }}>
              {t(lang, 'menu.pleaseChoose')} {requiredUnsatisfied.map(g => ar && (g as any).nameAr ? (g as any).nameAr : g.name).join(', ')}
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
                toast.success(`${ar && (drawerItem as any).nameAr ? (drawerItem as any).nameAr : drawerItem.name}${modLabel} ${t(lang, 'cart.addedToCart')}`, { duration: 1400, position: 'bottom-center' })
                setDrawerItem(null)
              }}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              <Plus size={18} />
              {t(lang, 'menu.addToOrder')} {drawerVatPrice.toFixed(2)}
            </button>
          )}
        </div>
      </div>
    </>
  ) : null

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  const favItems = categories.flatMap(c => c.items).filter(item => favs.includes(item.id))

  const allCatPills = [
    ...(isLoggedIn && favItems.length > 0 ? [{ id: FAV_ID, name: t(lang, 'menu.favourites') }] : []),
    ...categories.map(c => ({ id: c.id, name: c.name, nameAr: c.nameAr })),
  ]

  if (!mounted || checkingOrders) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808' }}>
      <ForceDark />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808' }}>
      <ForceDark />

      {/* ── Sticky header: brand + category rail ── */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Brand + cart row — dir="ltr" so DOM order controls position regardless of html dir */}
        <div dir="ltr" className="px-4 sm:px-8 flex items-center gap-3 h-12 sm:h-14">
          {(() => {
            const backBtn = (
              <Link href="/" className="text-gray-600 hover:text-white transition-colors flex-shrink-0">
                {ar ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
              </Link>
            )
            const logoEl = brandLogoUrl ? (
              <Link href="/" className="flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brandLogoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover" />
              </Link>
            ) : null
            const tableLabel = qrTableName || (tableNum ? `🪑 Table ${tableNum}` : null)
            const nameEl = (
              <Link href="/" className="flex-1 min-w-0">
                <div className={`font-black text-sm text-white tracking-wide leading-none ${ar ? 'text-right' : ''}`}>{(ar && brandNameAr) ? brandNameAr : (brandName || 'AL MANZIL')}</div>
                <div className={`text-[9px] tracking-widest uppercase truncate ${ar ? 'text-right' : ''}`} style={{ color: tableLabel ? 'var(--brand)' : 'var(--brand)' }}>
                  {tableLabel || ((ar && brandTaglineAr) ? brandTaglineAr : (brandTagline || 'Restaurant'))}
                </div>
              </Link>
            )
            const langBtn = (
              <button onClick={() => setLang(ar ? 'en' : 'ar')}
                className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all"
                style={{ backgroundColor: '#0d0d0d', color: ar ? 'var(--brand)' : '#555', border: '1px solid #1e1e1e' }}>
                {ar ? 'EN' : 'ع'}
              </button>
            )
            const cartBtn = (
              <button onClick={() => setView('cart')} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
                style={totalQty > 0
                  ? { backgroundColor: 'var(--brand)', color: '#000' }
                  : { backgroundColor: '#0d0d0d', color: '#888', border: '1px solid #1e1e1e' }}>
                <ShoppingCart size={15} />
                {totalQty > 0 && <span className="text-xs font-black whitespace-nowrap">{totalQty} · AED {cart.total().toFixed(0)}</span>}
              </button>
            )
            return ar
              ? <>{cartBtn}{langBtn}{nameEl}{logoEl}{backBtn}</>
              : <>{backBtn}{logoEl}{nameEl}{langBtn}{cartBtn}</>
          })()}
        </div>

        {/* Category pill rail */}
        <div ref={catTabsRef} dir={ar ? 'rtl' : 'ltr'} className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 sm:px-8 pb-2.5">
          {allCatPills.map(c => (
            <button key={c.id} data-cat={c.id} onClick={() => scrollToCategory(c.id)}
              className="flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap"
              style={activeCategory === c.id
                ? { backgroundColor: 'var(--brand)', color: '#000' }
                : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#888' }}>
              {ar && (c as any).nameAr ? (c as any).nameAr : c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table notice */}
      {fromQr && (qrTableStatus === 'DIRTY' || qrTableStatus === 'BILL_PENDING') && (
        <div className="px-5 py-2.5 text-xs font-semibold flex items-center gap-2"
          style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', borderBottom: '1px solid rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
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
            <div className="w-12 h-12 rounded-full animate-pulse" style={{ backgroundColor: '#0d0d0d' }} />
            <div className="text-gray-600 text-sm">Loading menu…</div>
          </div>
        )}

        {/* Favourites */}
        {isLoggedIn && favItems.length > 0 && (
          <section ref={el => { sectionRefs.current[FAV_ID] = el }} id={`cat-${FAV_ID}`} className="pt-10 px-5 sm:px-8">
            <div className="flex items-center gap-3 mb-6">
              <Heart size={14} className="text-red-400 fill-red-400 flex-shrink-0" />
              <h2 className="text-2xl font-black text-white tracking-tight">Favourites</h2>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(var(--brand-rgb),0.4), transparent)' }} />
              <span className="text-xs text-gray-600">{favItems.length} items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {favItems.map((item, i) => (
                <FoodCard key={item.id} item={item} index={i} lang={lang}
                  qty={cart.items.filter(ci => ci.menuItemId === item.id).reduce((s, ci) => s + ci.quantity, 0)}
                  isFav={favs.includes(item.id)} isLoggedIn={isLoggedIn}
                  onToggleFav={() => { setFavs(prev => prev.includes(item.id) ? prev.filter(f => f !== item.id) : [...prev, item.id]); toggleFavOnServer(item.id) }}
                  onOpen={() => { if (!item.isAvailable) return; const d: Record<string,string> = {}; item.modifierGroups?.forEach(g => { const o = g.options.find(x => x.isDefault) ?? g.options[0]; if (o) d[g.id] = o.id }); setDrawerItem(item); setSelectedOptions(d); setDrawerNotes('') }}
                />
              ))}
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
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {ar && cat.nameAr ? cat.nameAr : cat.name}
                </h2>
                <div className="text-xs text-gray-600 mt-0.5">{cat.itemCount ?? cat.items.length} {(cat.itemCount ?? cat.items.length) === 1 ? t(lang, 'menu.dish') : t(lang, 'menu.dishes')}</div>
              </div>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(var(--brand-rgb),0.35), transparent)' }} />
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {cat.items.map((item, i) => (
                <FoodCard key={item.id} item={item} index={i} lang={lang}
                  qty={cart.items.filter(ci => ci.menuItemId === item.id).reduce((s, ci) => s + ci.quantity, 0)}
                  isFav={favs.includes(item.id)} isLoggedIn={isLoggedIn}
                  onToggleFav={() => { setFavs(prev => prev.includes(item.id) ? prev.filter(f => f !== item.id) : [...prev, item.id]); toggleFavOnServer(item.id) }}
                  onOpen={() => { if (!item.isAvailable) return; const d: Record<string,string> = {}; item.modifierGroups?.forEach(g => { const o = g.options.find(x => x.isDefault) ?? g.options[0]; if (o) d[g.id] = o.id }); setDrawerItem(item); setSelectedOptions(d); setDrawerNotes('') }}
                />
              ))}
            </div>
            <div
              ref={el => { loadMoreRefs.current[cat.id] = el }}
              data-cat-load={cat.id}
              className="flex justify-center py-6 min-h-[48px]"
            >
              {categoryPages[cat.id]?.loading && (
                <Loader2 size={20} className="animate-spin text-[var(--brand)]/60" />
              )}
            </div>
          </section>
        ))}

        <div className="h-8" />
      </main>

      {/* Floating review-order pill — shown only when cart has items, gives bigger tap target on mobile */}
      {/* Track active orders pill — shown when orders exist but cart is empty */}
      {activeOrders.length > 0 && totalQty === 0 && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-72 z-30" style={{ animation: 'fadeUp 0.3s ease both' }}>
          <button onClick={() => router.push('/menu/orders')}
            className="w-full flex items-center justify-between gap-4 py-3.5 px-5 rounded-2xl font-bold transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(var(--brand-rgb),0.4)', color: 'var(--brand)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            <span className="text-sm w-7 h-7 rounded-full flex items-center justify-center font-black"
              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>
              {activeOrders.filter(o => o.status === 'READY').length > 0 ? '🎉' : activeOrders.length}
            </span>
            <span className="flex-1 text-center text-sm font-black">
              {activeOrders.some(o => o.status === 'READY') ? 'Your order is ready!' : `Track your order${activeOrders.length > 1 ? 's' : ''}`}
            </span>
            <span className="text-xs opacity-60">→</span>
          </button>
        </div>
      )}

      {totalQty > 0 && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-72 z-30" style={{ animation: 'fadeUp 0.3s ease both' }}>
          <button onClick={() => setView('cart')}
            className="w-full flex items-center justify-between gap-4 py-3.5 px-5 rounded-2xl font-bold transition-all active:scale-[0.98]"
            style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 8px 30px rgba(var(--brand-rgb),0.4)' }}>
            <span className="text-sm w-7 h-7 rounded-full flex items-center justify-center font-black bg-black/20">{totalQty}</span>
            <span className="flex-1 text-center text-sm font-black">Review Order</span>
            <span className="text-sm font-black">AED {cart.total().toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* Item drawer portal */}
      {ItemDrawer}

      {/* ── Cancel order confirmation sheet ── */}
    </div>
  )
}

export default function MenuPage() {
  return <Suspense><MenuPageInner /></Suspense>
}
