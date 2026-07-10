'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  UtensilsCrossed, ShoppingBag, CalendarDays, LogOut, Home,
  ChevronRight, Clock, ArrowRight, Star, Utensils, Plus, Heart, User,
  Bell, Leaf, Edit3, Save, X, Mail, AlertTriangle, Check,
  Loader2, Package, Camera,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useCartStore } from '@/store/cart'
import { useBrandStore } from '@/store/brand'
import { useLangStore, applyLangDir, t } from '@/store/lang'
import { StatusBadge, bookingStatusVariant } from '@/components/ui/StatusBadge'
import toast from 'react-hot-toast'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

// ── helpers ──────────────────────────────────────────────────────────────────
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Order Received', ACCEPTED: 'Confirmed',
  PREPARING: 'Being Prepared', READY: 'Ready to Serve',
  DELIVERED: 'Served', CANCELLED: 'Cancelled',
}
const ORDER_STATUS_LABEL_AR: Record<string, string> = {
  PENDING: 'تم استلام الطلب', ACCEPTED: 'مؤكد',
  PREPARING: 'قيد التحضير', READY: 'جاهز للتقديم',
  DELIVERED: 'تم التقديم', CANCELLED: 'ملغى',
}
const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Upcoming', CONFIRMED: 'Confirmed', ARRIVED: 'Visited',
  NO_SHOW: 'No-show', CANCELLED: 'Cancelled',
}
const BOOKING_STATUS_LABEL_AR: Record<string, string> = {
  PENDING: 'قادم', CONFIRMED: 'مؤكد', ARRIVED: 'تمت الزيارة',
  NO_SHOW: 'لم يحضر', CANCELLED: 'ملغى',
}
const FALLBACK_TESTIMONIALS = [
  { quote: 'The Malabar Biriyani is unlike anything else in Dubai. Perfectly spiced, every single time.', name: 'Mohammed A.', tag: 'Verified guest' },
  { quote: 'Appam and coconut stew at midnight — felt like home. The service was warm and attentive.', name: 'Priya R.', tag: 'Verified guest' },
  { quote: 'Best Kerala fish curry I\'ve had outside of Kochi. The chefs really know their craft.', name: 'Rajan M.', tag: 'Verified guest' },
  { quote: 'The table booking was seamless and the food arrived exactly on time. Will definitely be back.', name: 'Sarah K.', tag: 'Verified guest' },
]

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian',  labelAr: 'نباتي',          emoji: '🥗' },
  { id: 'vegan',      label: 'Vegan',       labelAr: 'نباتي صرف',      emoji: '🌱' },
  { id: 'halal',      label: 'Halal only',  labelAr: 'حلال فقط',       emoji: '☪️'  },
  { id: 'gluten',     label: 'Gluten-free', labelAr: 'خالٍ من الغلوتين',emoji: '🌾' },
  { id: 'dairy',      label: 'Dairy-free',  labelAr: 'خالٍ من الألبان', emoji: '🥛' },
  { id: 'nut',        label: 'Nut allergy', labelAr: 'حساسية من المكسرات',emoji: '🥜' },
  { id: 'seafood',    label: 'No seafood',  labelAr: 'بدون مأكولات بحرية',emoji: '🦐' },
  { id: 'spicy',      label: 'Mild spice',  labelAr: 'تتبيل خفيف',     emoji: '🌶️' },
]


function slotLabel(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number)
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
  const logoUrl        = useBrandStore(s => s.logoUrl)
  const brandName      = useBrandStore(s => s.restaurantName)
  const brandNameAr    = useBrandStore(s => s.restaurantNameAr)
  const showLangToggle = useBrandStore(s => s.showLanguageToggle)
  const { lang, setLang } = useLangStore()
  const ar = lang === 'ar'
  useEffect(() => { applyLangDir(lang) }, [lang])

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
  const [mustTryPage,    setMustTryPage]    = useState(0)
  const [mustTryFading,  setMustTryFading]  = useState(false)
  const [testimonials,  setTestimonials]   = useState<{ quote: string; name: string; tag: string; rating?: number }[]>(FALLBACK_TESTIMONIALS)
  const [testimonialIdx, setTestimonialIdx] = useState(0)
  const [testimonialFading, setTestimonialFading] = useState(false)

  // Feedback
  const [feedback, setFeedback] = useState<Record<string, { rating: number; comment: string; submitting: boolean; done: boolean }>>({})

  // Profile
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName,    setProfileName]    = useState('')
  const [savingProfile,  setSavingProfile]  = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef  = useRef<HTMLInputElement>(null)
  const cropImgRef      = useRef<HTMLImageElement>(null)
  const [cropSrc,  setCropSrc]  = useState<string | null>(null)
  const [crop,     setCrop]     = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const [cancellingId,   setCancellingId]   = useState<string | null>(null)
  const [initialized,    setInitialized]    = useState(false)
  const homeStartedRef = useRef(false)

  // Profile prefs
  const [dietary,        setDietary]        = useState<string[]>([])
  const [notifyOrder,    setNotifyOrder]    = useState(true)
  const [notifyBooking,  setNotifyBooking]  = useState(true)

  // Aggregate stats (computed from what's loaded)
  const [totalSpent,  setTotalSpent]  = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [visits,      setVisits]      = useState(0)

  useEffect(() => { init(); setInitialized(true) }, [])

  useEffect(() => {
    // Wait for init() to read localStorage before deciding to redirect.
    // Without this, the effect fires with token=null on the very first render
    // (before init() runs), triggers router.replace('/login'), and that round-trip
    // causes a full remount — doubling every API call.
    if (!initialized) return
    if (!token) { router.replace('/login?redirect=/account'); return }
    if (user && ['STAFF', 'MANAGER', 'OWNER', 'CHEF'].includes(user.role)) {
      router.replace('/staff/orders')
      return
    }
    if (searchParams.get('tab') === 'bookings') setTab('bookings')
    if (homeStartedRef.current) return
    homeStartedRef.current = true
    loadHome()
  }, [initialized, token, user])

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

  useEffect(() => {
    if (featuredItems.length <= 4) return
    const pages = Math.ceil(featuredItems.length / 4)
    const t = setInterval(() => {
      setMustTryFading(true)
      setTimeout(() => { setMustTryPage(p => (p + 1) % pages); setMustTryFading(false) }, 400)
    }, 5000)
    return () => clearInterval(t)
  }, [featuredItems.length])

  useEffect(() => {
    if (testimonials.length < 2) return
    const t = setInterval(() => {
      setTestimonialFading(true)
      setTimeout(() => { setTestimonialIdx(i => (i + 1) % testimonials.length); setTestimonialFading(false) }, 350)
    }, 4000)
    return () => clearInterval(t)
  }, [testimonials.length])

  async function authFetch(url: string, opts: RequestInit = {}) {
    const isFormData = opts.body instanceof FormData
    return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(opts.headers ?? {}) } })
  }

  async function loadHome() {
    try {
      const [mRes, sRes] = await Promise.all([
        fetch(`${API}/menu/items?limit=20`),
        fetch(`${API}/settings`),
      ])
      const mJson = await mRes.json()
      const mData = mJson?.data ?? mJson
      const allItems: any[] = Array.isArray(mData) ? mData : []
      const withImg = allItems.filter(i => i.imageUrl || i.videoUrl)

      const sJson = sRes.ok ? await sRes.json() : null
      const pinnedIds: string[] | undefined = (sJson?.data ?? sJson)?.heroConfig?.signatureDishIds
      if (pinnedIds?.length) {
        const byId = Object.fromEntries(withImg.map(i => [i.id, i]))
        const pinned = pinnedIds.map(id => byId[id]).filter(Boolean).slice(0, 12)
        if (pinned.length) { setFeaturedItems(pinned); } else { setFeaturedItems(withImg.slice(0, 12)) }
      } else {
        setFeaturedItems(withImg.slice(0, 12))
      }

      // Load orders for stats + active-order banner on Home tab.
      // Do NOT set ordersLoaded so the Orders tab still runs the full merge (with localStorage guest orders).
      const oRes = await authFetch(`${API}/orders/mine`)
      if (oRes.ok) {
        const oJson = await oRes.json()
        const oData: any[] = Array.isArray(oJson?.data ?? oJson) ? (oJson?.data ?? oJson) : []
        setOrders(oData)  // populate for active-order banner and badge counts
        setTotalOrders(oData.length)
        setTotalSpent(oData.reduce((s: number, o: any) => s + Number(o.total), 0))
        // Visits = unique paid sessions (dine-in groups by tableSessionId, takeaway counts individually)
        const paid = oData.filter((o: any) => o.paymentStatus === 'PAID')
        const sessions = new Set<string>()
        let visitCount = 0
        for (const o of paid) {
          if (o.tableSessionId) { sessions.add(o.tableSessionId) }
          else { visitCount++ }
        }
        setVisits(sessions.size + visitCount)
      }
      const bRes = await authFetch(`${API}/bookings/mine`)
      if (bRes.ok) {
        const bJson = await bRes.json()
        const bData: any[] = Array.isArray(bJson?.data ?? bJson) ? (bJson?.data ?? bJson) : []
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
      // Live reviews
      const rRes = await fetch(`${API}/orders/reviews/public?limit=10`)
      if (rRes.ok) {
        const rJson = await rRes.json()
        const rData: { rating: number; comment: string; name: string }[] = rJson.data ?? rJson
        if (rData.length >= 2) {
          setTestimonials(rData.map(r => ({
            quote: r.comment,
            name: r.name,
            tag: r.rating === 5 ? '★ 5-star review' : '★★★★ 4-star review',
            rating: r.rating,
          })))
        }
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

  function openCropModal(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    setCrop(undefined)
  }

  function onCropImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    const c = centerCrop(makeAspectCrop({ unit: '%', width: 80 }, 1, w, h), w, h)
    setCrop(c); setCompletedCrop(c)
  }

  async function cropAndUpload() {
    if (!cropImgRef.current || !completedCrop) return
    const img    = cropImgRef.current
    const scaleX = img.naturalWidth  / img.width
    const scaleY = img.naturalHeight / img.height
    const canvas = document.createElement('canvas')
    const size   = 400
    canvas.width  = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, size, size,
    )
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92))
    setCropSrc(null)
    setUploadingAvatar(true)
    try {
      const fd = new FormData(); fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      const r = await authFetch(`${API}/auth/me/avatar`, { method: 'POST', body: fd })
      if (!r.ok) { toast.error('Upload failed — try again'); return }
      const meRes = await authFetch(`${API}/auth/me`)
      if (meRes.ok) {
        const me = await meRes.json()
        const meData = me?.data ?? me
        const { token } = useAuthStore.getState()
        useAuthStore.getState().setAuth(meData, token!)
      }
      toast.success('Profile photo updated')
    } finally { setUploadingAvatar(false) }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const r = await authFetch(`${API}/auth/me`, { method: 'PATCH', body: JSON.stringify({ name: profileName }) })
      if (r.ok) toast.success('Profile updated')
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
    { id: 'home',       label: ar ? 'الرئيسية' : 'Home',        Icon: Home,        badge: 0 },
    { id: 'orders',     label: ar ? 'طلباتي'   : 'Orders',      Icon: ShoppingBag, badge: activeOrders.length },
    { id: 'bookings',   label: ar ? 'حجوزاتي'  : 'Bookings',    Icon: CalendarDays,badge: upcomingBooks.length },
    { id: 'favourites', label: ar ? 'المفضلة'  : 'Favourites',  Icon: Heart,       badge: 0 },
    { id: 'profile',    label: ar ? 'الملف'    : 'Profile',     Icon: User,        badge: 0 },
  ]

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808', color: 'white' }}>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.12) 0%, transparent 60%)' }} />
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.06)', transform: 'translate(30%,-30%)' }} />
        </div>

        <div className="relative px-4 sm:px-8 pt-5 pb-6 max-w-6xl mx-auto">
          {/* Nav row */}
          <div className="flex items-center justify-between mb-6">
            <Link href="/" className="flex items-center gap-2">
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-xl object-cover" />
                : <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
                    <UtensilsCrossed size={14} className="text-black" />
                  </div>
              }
              <span className="font-black text-sm text-white tracking-wide">{ar ? (brandNameAr || brandName) : brandName}</span>
            </Link>
            <div className="flex items-center gap-2">
              {showLangToggle && (
                <button onClick={() => setLang(ar ? 'en' : 'ar')}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: ar ? 'var(--brand)' : '#555', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {ar ? 'EN' : 'ع'}
                </button>
              )}
              <button onClick={() => { logout(); router.push('/') }}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors">
                <LogOut size={13} /> {t(lang, 'nav.signOut')}
              </button>
            </div>
          </div>

          {/* Hero body: avatar+name left, stats right on desktop */}
          <div className="md:flex md:items-end md:justify-between md:gap-8">
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-5 md:mb-0" style={{ animation: 'fadeUp 0.5s ease both' }}>
              {/* Clickable avatar */}
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) openCropModal(f); e.target.value = '' }} />
              <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl flex-shrink-0 group overflow-hidden"
                style={{ border: '2px solid var(--brand)' }}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={user.name}
                      className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <div className="w-full h-full flex items-center justify-center font-black text-2xl md:text-3xl"
                      style={{ background: 'linear-gradient(135deg, var(--brand), #d97706)', color: '#000' }}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                }
                {/* overlay */}
                <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 rounded-2xl"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)', opacity: uploadingAvatar ? 1 : 0 }}
                  onMouseEnter={e => { if (!uploadingAvatar) (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={e => { if (!uploadingAvatar) (e.currentTarget as HTMLElement).style.opacity = '0' }}>
                  {uploadingAvatar
                    ? <Loader2 size={18} className="text-white animate-spin" />
                    : <Camera size={18} className="text-white" />}
                </div>
              </button>
              <div>
                <p className="text-gray-500 text-xs mb-0.5">{t(lang, 'account.welcomeBack')}</p>
                <h1 className="text-2xl md:text-3xl font-black text-white leading-none">{firstName}</h1>
                <p className="text-gray-600 text-xs mt-1">{user.email}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 md:gap-3" style={{ animation: 'fadeUp 0.5s 80ms ease both' }}>
            {[
              { label: t(lang, 'account.orders'),     value: totalOrders || '—' },
              { label: t(lang, 'account.spent'),      value: totalOrders ? `AED ${totalSpent.toFixed(0)}` : '—' },
              { label: t(lang, 'account.visits'),     value: visits || '—' },
              { label: t(lang, 'account.favourites'), value: favItems.length || '—', action: () => setTab('favourites') },
            ].map((s, i) => (
              <button key={s.label} onClick={s.action}
                className="rounded-2xl px-3 py-3 text-center transition-all"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 72 }}
                disabled={!s.action}>
                <div className="font-black text-white text-base leading-none">{s.value}</div>
                <div className="text-gray-600 text-[9px] mt-1 uppercase tracking-wide">{s.label}</div>
              </button>
            ))}
            </div>{/* end stats grid */}
          </div>{/* end hero body */}
        </div>
      </div>

      {/* ── Mobile tab bar (hidden on desktop) ── */}
      <div className="md:hidden sticky top-0 z-10 py-2 px-4" style={{ backgroundColor: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex gap-1 rounded-2xl p-1" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          {TABS.map(({ id, label, Icon, badge }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 relative flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all"
              style={tab === id ? { backgroundColor: 'var(--brand)', color: '#000' } : { color: '#555' }}>
              <Icon size={14} />
              <span>{label}</span>
              {(badge ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[8px] font-black rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tab === id ? '#000' : 'var(--brand)', color: tab === id ? 'var(--brand)' : '#000' }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop layout: sidebar + content ── */}
      <div className="max-w-6xl mx-auto md:flex md:gap-8 px-4 sm:px-8 py-6 pb-16">

        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="sticky top-6 space-y-1">
            {TABS.map(({ id, label, Icon, badge }) => (
              <button key={id} onClick={() => setTab(id)}
                className="w-full relative flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-left transition-all"
                style={tab === id
                  ? { backgroundColor: 'var(--brand)', color: '#000' }
                  : { color: '#666', backgroundColor: 'transparent' }}>
                <Icon size={16} />
                {label}
                {(badge ?? 0) > 0 && (
                  <span className="ml-auto w-5 h-5 text-[9px] font-black rounded-full flex items-center justify-center"
                    style={{ backgroundColor: tab === id ? 'rgba(0,0,0,0.2)' : 'var(--brand)', color: tab === id ? '#000' : '#000' }}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Tab Content ── */}
        <div className="flex-1 min-w-0">

        {/* ═══ HOME ═══ */}
        {tab === 'home' && (
          <div className="space-y-5">
            {/* Active order banner */}
            {activeOrders.length > 0 && (
              <FadeIn delay={0}>
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                  <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: 'var(--brand)' }}>{t(lang, 'account.orderInProgress')}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {(ar ? ORDER_STATUS_LABEL_AR : ORDER_STATUS_LABEL)[activeOrders[0].status]} · {activeOrders[0].items.slice(0,2).map((i: any) => ar && i.menuItem.nameAr ? i.menuItem.nameAr : i.menuItem.name).join('، ')}
                    </div>
                  </div>
                  <button onClick={() => setTab('orders')} style={{ color: 'var(--brand)' }}>
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
                    <div className="font-bold text-sm text-blue-300">{t(lang, 'account.upcomingReservation')}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(upcomingBooks[0].slotDate).toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {` ${t(lang, 'account.atTime')} `}{slotLabel(upcomingBooks[0].slotTime)} · {ar ? `${upcomingBooks[0].partySize} ${upcomingBooks[0].partySize === 1 ? 'ضيف' : 'ضيوف'}` : `${upcomingBooks[0].partySize} ${upcomingBooks[0].partySize === 1 ? 'guest' : 'guests'}`}
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
                    <div className="text-sm font-semibold text-white">{t(lang, 'account.setDietary')}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{t(lang, 'account.setDietaryHint')}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-700" />
                </button>
              </FadeIn>
            )}

            {/* Quick actions */}
            <FadeIn delay={100}>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">{t(lang, 'home.quickActions')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/menu"
                  className="rounded-2xl p-4 flex flex-col gap-3 transition-all active:scale-[0.97]"
                  style={{ backgroundColor: 'var(--brand)' }}>
                  <Utensils size={22} className="text-black" />
                  <div>
                    <div className="font-black text-black text-sm">{t(lang, 'home.orderFood')}</div>
                    <div className="text-black/60 text-xs">{t(lang, 'home.browseMenu')}</div>
                  </div>
                </Link>
                <Link href="/book"
                  className="rounded-2xl p-4 flex flex-col gap-3 transition-all active:scale-[0.97]"
                  style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
                  <CalendarDays size={22} style={{ color: 'var(--brand)' }} />
                  <div>
                    <div className="font-black text-white text-sm">{t(lang, 'home.reserveTable')}</div>
                    <div className="text-gray-600 text-xs">{t(lang, 'home.pickDateTime')}</div>
                  </div>
                </Link>
              </div>
            </FadeIn>

            {/* Favourites strip */}
            {favItems.length > 0 && (
              <FadeIn delay={130}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Heart size={10} className="text-red-400 fill-red-400" /> {t(lang, 'account.favourites')}
                  </p>
                  <button onClick={() => setTab('favourites')} style={{ color: 'var(--brand)' }} className="text-xs flex items-center gap-1">
                    {t(lang, 'account.seeAll')} <ArrowRight size={11} />
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {favItems.slice(0, 6).map((item: any) => (
                    <div key={item.id} className="flex-shrink-0 w-28 rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97]"
                      style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
                      onClick={() => router.push(`/menu?open=${item.id}`)}>
                      {item.videoUrl
                        ? <video src={item.videoUrl} className="w-full h-20 object-cover" autoPlay loop muted playsInline />
                        : item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-20 object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          : <div className="w-full h-20 flex items-center justify-center text-2xl" style={{ backgroundColor: '#1a1a1a' }}>🍽️</div>
                      }
                      <div className="p-2">
                        <div className="text-white text-[10px] font-semibold truncate">{item.name}</div>
                        <div className="text-[10px] font-black mt-0.5" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeIn>
            )}

            {/* Must try */}
            {featuredItems.length > 0 && (() => {
              const mustTryPages = Math.ceil(featuredItems.length / 4)
              const visibleMustTry = featuredItems.slice(mustTryPage * 4, mustTryPage * 4 + 4)
              return (
                <FadeIn delay={160}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t(lang, 'home.mustTry')}</p>
                    <Link href="/menu" style={{ color: 'var(--brand)' }} className="text-xs flex items-center gap-1">
                      {t(lang, 'home.viewAll')} <ArrowRight size={11} />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                    style={{
                      opacity: mustTryFading ? 0 : 1,
                      transform: mustTryFading ? 'translateY(10px) scale(0.98)' : 'translateY(0) scale(1)',
                      transition: 'opacity 0.38s ease, transform 0.38s cubic-bezier(0.33,1,0.68,1)',
                    }}>
                    {visibleMustTry.map((item: any, i) => (
                      <div key={item.id}
                        className="group rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97]"
                        style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
                        onClick={() => router.push(`/menu?open=${item.id}`)}>
                        <div className="h-28 overflow-hidden relative">
                          {item.videoUrl
                            ? <video src={item.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                            : <img src={item.imageUrl} alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          }
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}>
                              <Plus size={16} className="text-black" />
                            </div>
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="font-semibold text-white text-xs truncate">{item.name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="font-black text-sm" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(2)}</span>
                            <span className="text-gray-700 text-[10px] flex items-center gap-0.5"><Clock size={9} /> {item.prepTimeMins}m</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {mustTryPages > 1 && (
                    <div className="flex justify-center gap-1.5 mt-3">
                      {Array.from({ length: mustTryPages }).map((_, i) => (
                        <div key={i} className="rounded-full transition-all duration-300"
                          style={{ width: i === mustTryPage ? 18 : 6, height: 6, backgroundColor: i === mustTryPage ? 'var(--brand)' : '#333' }} />
                      ))}
                    </div>
                  )}
                </FadeIn>
              )
            })()}

            {/* Testimonials relay */}
            <FadeIn delay={200}>
              <div className="rounded-2xl p-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111, #0d0d0d)', border: '1px solid #1e1e1e' }}>
                <div style={{
                  transition: 'opacity 0.35s ease, transform 0.35s ease',
                  opacity: testimonialFading ? 0 : 1,
                  transform: testimonialFading ? 'translateY(6px)' : 'translateY(0)',
                }}>
                  <div className="flex gap-0.5 mb-3">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={12} className={i <= (testimonials[testimonialIdx]?.rating ?? 5) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'} />
                    ))}
                  </div>
                  <p className="text-white text-sm font-semibold leading-relaxed mb-3">
                    &ldquo;{testimonials[testimonialIdx]?.quote}&rdquo;
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-gray-600 text-xs">— {testimonials[testimonialIdx]?.name}</p>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                      style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>
                      {testimonials[testimonialIdx]?.tag}
                    </span>
                  </div>
                </div>
                {/* Dot indicators */}
                <div className="flex justify-center gap-1.5 mt-4">
                  {testimonials.map((_, i) => (
                    <button key={i} onClick={() => { setTestimonialFading(true); setTimeout(() => { setTestimonialIdx(i); setTestimonialFading(false) }, 350) }}
                      className="rounded-full transition-all duration-300"
                      style={{ width: i === testimonialIdx ? 18 : 6, height: 6, backgroundColor: i === testimonialIdx ? 'var(--brand)' : '#333' }} />
                  ))}
                </div>
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
                  <p className="text-white font-bold mb-1">{t(lang, 'account.noOrders')}</p>
                  <p className="text-gray-600 text-sm mb-5">{t(lang, 'account.noOrdersHint')}</p>
                  <Link href="/menu" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    <Utensils size={15} /> {t(lang, 'account.browseMenuBtn')}
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <div className="space-y-3">
                {activeOrders.length > 0 && (
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{t(lang, 'account.activeLabel')}</p>
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
                          border: `1px solid ${isActive ? 'rgba(var(--brand-rgb),0.3)' : '#1e1e1e'}`,
                          boxShadow: isActive ? '0 0 20px rgba(var(--brand-rgb),0.05)' : 'none',
                        }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={isActive
                                ? { backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }
                                : order.status === 'CANCELLED'
                                  ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }
                                  : { backgroundColor: '#1a1a1a', color: '#666' }}>
                              • {(ar ? ORDER_STATUS_LABEL_AR : ORDER_STATUS_LABEL)[order.status] ?? order.status}
                            </span>
                            <span className="text-gray-700 text-[10px] font-mono">#{order.id.slice(-6).toUpperCase()}</span>
                          </div>
                          <span className="text-gray-700 text-[10px]">{timeAgo(order.createdAt)}</span>
                        </div>

                        <div className="text-gray-500 text-xs mb-3 leading-relaxed">
                          {order.items.slice(0, 3).map((i: any) => `${i.quantity}× ${ar && i.menuItem.nameAr ? i.menuItem.nameAr : i.menuItem.name}`).join('، ')}
                          {order.items.length > 3 && <span className="text-gray-700"> {ar ? `+${order.items.length - 3} أخرى` : `+${order.items.length - 3} more`}</span>}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-white text-base">AED {Number(order.total).toFixed(2)}</span>
                            <span className="text-gray-700 text-xs ml-2">
                              {order.type === 'TAKEAWAY' ? (ar ? `رمز #${order.tokenNumber}` : `Token #${order.tokenNumber}`) : order.table ? (ar ? `طاولة ${order.table.tableNumber}` : `Table ${order.table.tableNumber}`) : t(lang, 'account.dineIn')}
                            </span>
                          </div>
                          {isActive && (
                            <Link href="/menu?track=1" className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl"
                              style={{ border: '1px solid rgba(var(--brand-rgb),0.3)', color: 'var(--brand)' }}>
                              {t(lang, 'account.track')} <ChevronRight size={12} />
                            </Link>
                          )}
                        </div>

                        {order.status === 'DELIVERED' && (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #1e1e1e' }}>
                            {(hasFeedback || fb?.done) ? (
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--brand)' }}>
                                {'★'.repeat(hasFeedback?.rating ?? fb?.rating ?? 5)}{'☆'.repeat(5 - (hasFeedback?.rating ?? fb?.rating ?? 5))}
                                <span style={{ color: '#555' }}>{hasFeedback?.comment || 'Thanks for your feedback!'}</span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{t(lang, 'account.rateOrder')}</div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <StarRating value={fb?.rating ?? 0}
                                    onChange={rating => setFeedback(prev => ({ ...prev, [order.id]: { rating, comment: prev[order.id]?.comment ?? '', submitting: false, done: false } }))}
                                  />
                                  {(fb?.rating ?? 0) > 0 && (
                                    <>
                                      <input value={fb?.comment ?? ''}
                                        onChange={e => setFeedback(prev => ({ ...prev, [order.id]: { ...prev[order.id], comment: e.target.value } }))}
                                        placeholder={t(lang, 'account.commentPlaceholder')}
                                        className="flex-1 min-w-0 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none placeholder-gray-700"
                                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                                      <button onClick={() => submitFeedback(order.id)} disabled={fb?.submitting}
                                        className="text-xs px-3 py-1.5 rounded-lg font-bold flex-shrink-0 disabled:opacity-50"
                                        style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                                        {fb?.submitting ? '…' : t(lang, 'account.submit')}
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
                  <p className="text-white font-bold mb-1">{t(lang, 'account.noReservations')}</p>
                  <p className="text-gray-600 text-sm mb-5">{t(lang, 'account.noReservationsHint')}</p>
                  <Link href="/book" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    <CalendarDays size={15} /> {t(lang, 'account.bookTableBtn')}
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <>
                {upcomingBooks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">{t(lang, 'account.upcoming')}</p>
                    <div className="space-y-3">
                      {upcomingBooks.map((b, i) => (
                        <FadeIn key={b.id} delay={i * 50}>
                          <div className="rounded-2xl p-4"
                            style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="font-bold text-white text-sm">
                                  {new Date(b.slotDate).toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { weekday: 'long', day: 'numeric', month: 'short' })}
                                </div>
                                <div className="font-bold text-sm mt-0.5" style={{ color: 'var(--brand)' }}>{slotLabel(b.slotTime)}</div>
                              </div>
                              <StatusBadge variant={bookingStatusVariant(b.status)} label={(ar ? BOOKING_STATUS_LABEL_AR : BOOKING_STATUS_LABEL)[b.status] ?? b.status} size="sm" />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-600 mb-4">
                              <span>{b.table?.tableNumber ? (ar ? `طاولة ${b.table.tableNumber}` : `Table ${b.table.tableNumber}`) : '—'}</span>
                              <span>·</span>
                              <span>{ar ? `${b.partySize} ${b.partySize === 1 ? 'ضيف' : 'ضيوف'}` : `${b.partySize} ${b.partySize === 1 ? 'guest' : 'guests'}`}</span>
                              {b.notes && <><span>·</span><span className="truncate text-gray-700">{b.notes}</span></>}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg"
                                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                                <Clock size={10} /> {t(lang, 'account.arriveWithin')}
                              </div>
                              <button onClick={() => cancelBooking(b.id)} disabled={cancellingId === b.id}
                                className="text-xs text-red-500 hover:text-red-400 disabled:opacity-40 font-medium">
                                {cancellingId === b.id ? <Loader2 size={12} className="animate-spin" /> : t(lang, 'account.cancel')}
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
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">{t(lang, 'account.history')}</p>
                    <div className="space-y-2">
                      {bookings.filter(b => !['PENDING','CONFIRMED'].includes(b.status)).map((b, i) => (
                        <FadeIn key={b.id} delay={i * 40}>
                          <div className="rounded-2xl p-3.5 flex items-center gap-3"
                            style={{ backgroundColor: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-400 truncate">
                                {new Date(b.slotDate).toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}{slotLabel(b.slotTime)}
                              </div>
                              <div className="text-xs text-gray-700 mt-0.5">{ar ? `${b.partySize} ${b.partySize === 1 ? 'ضيف' : 'ضيوف'}` : `${b.partySize} ${b.partySize === 1 ? 'guest' : 'guests'}`}</div>
                            </div>
                            <StatusBadge variant={bookingStatusVariant(b.status)} label={(ar ? BOOKING_STATUS_LABEL_AR : BOOKING_STATUS_LABEL)[b.status] ?? b.status} size="xs" />
                          </div>
                        </FadeIn>
                      ))}
                    </div>
                  </div>
                )}

                <FadeIn delay={100}>
                  <Link href="/book" className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
                    style={{ border: '1px solid rgba(var(--brand-rgb),0.3)', color: 'var(--brand)' }}>
                    <CalendarDays size={15} /> {t(lang, 'account.makeAnotherReservation')}
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
                  <p className="text-white font-bold mb-1">{t(lang, 'account.noFavourites')}</p>
                  <p className="text-gray-600 text-sm mb-5">{t(lang, 'account.noFavouritesHint')}</p>
                  <Link href="/menu" className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-2xl text-sm"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    <Utensils size={15} /> {t(lang, 'account.browseMenuBtn')}
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <>
                <p className="text-xs text-gray-600 mb-4">{ar ? `${favItems.length} طبق محفوظ` : `${favItems.length} saved dish${favItems.length !== 1 ? 'es' : ''}`}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {favItems.map((item: any, i) => (
                    <FadeIn key={item.id} delay={i * 40}>
                      <div className="group rounded-2xl overflow-hidden transition-all"
                        style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                        <div className="relative h-32 overflow-hidden">
                          {item.videoUrl
                            ? <video src={item.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                            : item.imageUrl
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
                            <span className="font-black text-sm" style={{ color: 'var(--brand)' }}>AED {Number(item.price).toFixed(2)}</span>
                            <button
                              onClick={() => router.push(`/menu?open=${item.id}`)}
                              className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg"
                              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                              <Plus size={10} /> {t(lang, 'account.view')}
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

            {/* ── Crop modal ── */}
            {cropSrc && (
              <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}>
                <div className="flex flex-col items-center gap-4 w-full max-w-sm px-4">
                  <div>
                    <p className="text-white font-black text-lg text-center mb-0.5">Crop your photo</p>
                    <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Drag to reposition · pinch or scroll to zoom</p>
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ maxHeight: '55vh' }}>
                    <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}
                      aspect={1} circularCrop minWidth={60}>
                      <img ref={cropImgRef} src={cropSrc} onLoad={onCropImageLoad}
                        style={{ maxHeight: '55vh', maxWidth: '100%', display: 'block' }} alt="crop preview" />
                    </ReactCrop>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => { setCropSrc(null); URL.revokeObjectURL(cropSrc) }}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                      Cancel
                    </button>
                    <button onClick={cropAndUpload}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm"
                      style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                      Use Photo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Edit profile bottom sheet ── */}
            {editingProfile && (
              <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
                onClick={() => { setEditingProfile(false); setProfileName(user.name) }}>
                <div className="w-full rounded-t-3xl flex flex-col"
                  style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e', maxHeight: '85vh' }}
                  onClick={e => e.stopPropagation()}>
                  {/* drag handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#333' }} />
                  </div>
                  <div className="overflow-y-auto px-5 pt-3 pb-8 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-black text-white">Edit Profile</h2>
                      <button onClick={() => { setEditingProfile(false); setProfileName(user.name) }}
                        className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <X size={14} className="text-gray-400" />
                      </button>
                    </div>

                    {/* avatar inside sheet */}
                    <div className="flex items-center gap-4">
                      <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                        className="relative w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden group"
                        style={{ border: '2px solid var(--brand)' }}>
                        {user.avatarUrl
                          ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          : <div className="w-full h-full flex items-center justify-center font-black text-2xl"
                              style={{ background: 'linear-gradient(135deg, var(--brand), #d97706)', color: '#000' }}>
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                        }
                        <div className="absolute inset-0 flex items-center justify-center transition-opacity rounded-2xl opacity-0 group-hover:opacity-100"
                          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                          {uploadingAvatar ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
                        </div>
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-white mb-0.5">Profile photo</p>
                        <p className="text-[11px] mb-2" style={{ color: '#555' }}>JPG, PNG or WebP · Max 5 MB</p>
                        <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                          style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                          <Camera size={11} /> {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                        </button>
                      </div>
                    </div>

                    {/* name field */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#555' }}>
                        {t(lang, 'account.name')}
                      </label>
                      <input value={profileName} onChange={e => setProfileName(e.target.value)}
                        className="w-full text-white text-sm px-4 py-3 rounded-2xl focus:outline-none transition-colors"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.5)'}
                        onBlur={e => e.currentTarget.style.borderColor = '#2a2a2a'}
                        placeholder={t(lang, 'account.yourNamePlaceholder')} />
                    </div>

                    {/* email — read only in sheet */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#555' }}>
                        {t(lang, 'account.email')}
                      </label>
                      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
                        <Mail size={13} style={{ color: '#444' }} />
                        <span className="text-sm" style={{ color: '#555' }}>{user.email}</span>
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                          {t(lang, 'account.verified')}
                        </span>
                      </div>
                    </div>

                    <button onClick={async () => { await saveProfile(); setEditingProfile(false) }}
                      disabled={savingProfile || !profileName.trim()}
                      className="w-full font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                      {savingProfile ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Personal info — read-only card */}
            <FadeIn delay={0}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <User size={14} style={{ color: 'var(--brand)' }} /> {t(lang, 'account.personalInfo')}
                  </h2>
                  <button onClick={() => { setEditingProfile(true); setProfileName(user.name) }}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.15)' }}>
                    <Edit3 size={11} /> {t(lang, 'account.edit')}
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <span className="text-[11px] font-semibold" style={{ color: '#555' }}>{t(lang, 'account.name')}</span>
                    <span className="text-sm font-semibold text-white">{user.name}</span>
                  </div>
                  <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <span className="text-[11px] font-semibold" style={{ color: '#555' }}>{t(lang, 'account.email')}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm" style={{ color: '#666' }}>{user.email}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>✓</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[11px] font-semibold" style={{ color: '#555' }}>{t(lang, 'account.memberSince')}</span>
                    <span className="text-sm" style={{ color: '#666' }}>
                      {(user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Dietary preferences */}
            <FadeIn delay={60}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Leaf size={14} className="text-green-500" /> {t(lang, 'account.dietaryPrefs')}
                </h2>
                <p className="text-xs text-gray-600 mb-4">{t(lang, 'account.dietaryHint')}</p>
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
                        <span className="truncate">{ar ? opt.labelAr : opt.label}</span>
                        {active && <Check size={11} className="ml-auto flex-shrink-0 text-green-400" />}
                      </button>
                    )
                  })}
                </div>
                {dietary.length > 0 && (
                  <p className="text-[10px] text-green-600 mt-3 flex items-center gap-1.5">
                    <Check size={10} />
                    {ar ? `${dietary.length} تفضيل نشط — سيظهر في ملاحظات طلبك للمطبخ` : `${dietary.length} preference${dietary.length !== 1 ? 's' : ''} active — will appear in your order notes to the kitchen`}
                  </p>
                )}
              </div>
            </FadeIn>

            {/* Notifications */}
            <FadeIn delay={100}>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                  <Bell size={14} style={{ color: 'var(--brand)' }} /> {t(lang, 'account.notifications')}
                </h2>
                <p className="text-xs text-gray-600 mb-4">{t(lang, 'account.notifHint')}</p>
                <div className="space-y-3">
                  {[
                    { label: t(lang, 'account.orderUpdates'),     sub: t(lang, 'account.orderUpdatesSub'),    value: notifyOrder,   key: 'order'   as const },
                    { label: t(lang, 'account.bookingReminders'), sub: t(lang, 'account.bookingRemindersSub'), value: notifyBooking, key: 'booking' as const },
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
                        style={item.value ? { backgroundColor: 'var(--brand)' } : { backgroundColor: '#2a2a2a' }}>
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
                  <AlertTriangle size={13} /> {t(lang, 'account.accountSection')}
                </h2>
                <button onClick={() => { logout(); router.push('/') }}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 font-medium transition-colors">
                  <LogOut size={13} /> {t(lang, 'account.signOutAllDevices')}
                </button>
              </div>
            </FadeIn>

          </div>
        )}
        </div>{/* end tab content */}
      </div>{/* end desktop layout */}
    </div>
  )
}

export default function AccountPage() {
  return <Suspense><AccountContent /></Suspense>
}
