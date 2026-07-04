'use client'
import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Stripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import {
  Plus, Minus, ShoppingCart, X, ArrowLeft, Clock,
  CheckCircle, ChefHat, Bike, UtensilsCrossed,
  Loader2, Lock, Banknote, Moon, Sun, Heart, Table2, AlertCircle,
  BellRing, PackageCheck, ChevronDown, ChevronUp, ChevronLeft,
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

type View = 'menu' | 'cart' | 'payment' | 'tracking' | 'confirmed'

interface ModifierOption {
  id: string; name: string; priceAdd: number; isDefault: boolean
}
interface ModifierGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number
  options: ModifierOption[]
}
interface MenuItem {
  id: string; name: string; description?: string; categoryId?: string
  price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string
  modifierGroups?: ModifierGroup[]
}
interface Category { id: string; name: string; itemCount: number; items: MenuItem[] }
interface CategoryPageState {
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
  loaded: boolean
}
const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

const STEPS_DINE_IN = [
  { label: 'Received',  emoji: '📋', icon: Clock        },
  { label: 'Confirmed', emoji: '✅', icon: CheckCircle  },
  { label: 'Preparing', emoji: '👨‍🍳', icon: ChefHat     },
  { label: 'Serve!',    emoji: '🔔', icon: BellRing     },  // bell = waiter brings to table
]

const STEPS_TAKEAWAY = [
  { label: 'Received',  emoji: '📋', icon: Clock        },
  { label: 'Confirmed', emoji: '✅', icon: CheckCircle  },
  { label: 'Preparing', emoji: '👨‍🍳', icon: ChefHat     },
  { label: 'Pick Up!',  emoji: '📦', icon: PackageCheck },  // box = collect at counter
]

const fadeUp = 'opacity-0 translate-y-4 animate-[fadeUp_0.4s_ease_forwards]'

// ─── FEEDBACK MODAL ───────────────────────────────────────────────────────────
const FEEDBACK_TAGS_POSITIVE = ['Great taste', 'Fast service', 'Friendly staff', 'Good value']
const FEEDBACK_TAGS_NEGATIVE = ['Slow service', 'Cold food', 'Wrong order', 'Noisy', 'Pricey']

function FeedbackModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const suggestedTags = rating >= 4 ? FEEDBACK_TAGS_POSITIVE : rating > 0 ? FEEDBACK_TAGS_NEGATIVE : []

  const submit = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      await api.post(`/orders/${orderId}/feedback`, { rating, comment: comment.trim() || undefined, tags: tags.join(',') || undefined })
      setDone(true)
      setTimeout(onClose, 1800)
    } catch { onClose() }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-t-3xl p-6 space-y-5"
        style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
        {done ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">🙏</div>
            <p className="text-lg font-black text-white">Thank you!</p>
            <p className="text-sm text-gray-500 mt-1">Your feedback helps us improve</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-base font-black text-white mb-0.5">How was your experience?</p>
              <p className="text-xs text-gray-500">Takes 10 seconds — helps our team</p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s}
                  onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(s)}
                  className="text-4xl transition-transform active:scale-90"
                  style={{ filter: (hover || rating) >= s ? 'none' : 'grayscale(1) opacity(0.3)' }}>
                  ⭐
                </button>
              ))}
            </div>

            {/* Suggestion tags */}
            {suggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedTags.map(tag => (
                  <button key={tag} onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={tags.includes(tag)
                      ? { backgroundColor: '#f59e0b', color: '#000' }
                      : { backgroundColor: '#1e1e1e', color: '#777', border: '1px solid #2a2a2a' }}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Comment */}
            {rating > 0 && (
              <textarea rows={2} placeholder="Anything else you'd like to share? (optional)"
                value={comment} onChange={e => setComment(e.target.value)}
                className="w-full text-sm text-white placeholder-gray-600 rounded-xl px-3 py-2.5 focus:outline-none resize-none"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
            )}

            <div className="flex gap-2">
              <button onClick={submit} disabled={submitting || !rating}
                className="flex-1 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-40"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                {submitting ? 'Sending…' : 'Submit Feedback'}
              </button>
              <button onClick={onClose}
                className="px-4 py-3 rounded-2xl text-xs text-gray-500 hover:text-white transition-colors"
                style={{ border: '1px solid #1e1e1e' }}>
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── GUEST CANCEL MODAL ───────────────────────────────────────────────────────
const GUEST_CANCEL_REASONS_DINE_IN  = ['Changed my mind', 'Ordered by mistake', 'Waiting too long', 'Other']
const GUEST_CANCEL_REASONS_TAKEAWAY = ['Changed my mind', 'Ordered by mistake', 'Will pick up later', 'Other']

function GuestCancelModal({ order, onConfirm, onClose, busy }: {
  order: Order; onConfirm: (reason: string) => void; onClose: () => void; busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  const isTakeaway = order.type === 'TAKEAWAY'
  const reasons = isTakeaway ? GUEST_CANCEL_REASONS_TAKEAWAY : GUEST_CANCEL_REASONS_DINE_IN
  const finalReason = reason === 'Other' ? custom.trim() : reason

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-6 space-y-4"
        style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}
        onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <p className="text-base font-black text-white mb-0.5">Cancel your order?</p>
          <p className="text-xs text-gray-500">This cannot be undone. Please let us know why.</p>
        </div>

        {/* Items reminder */}
        <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
          {order.items.map((item, i) => (
            <p key={i} className="text-xs text-gray-400">{item.quantity}× {item.menuItem.name}</p>
          ))}
        </div>

        <div className="space-y-1.5">
          {reasons.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all"
              style={reason === r
                ? { backgroundColor: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.4)', color: '#f87171' }
                : { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#888' }}>
              {r}
            </button>
          ))}
          {reason === 'Other' && (
            <input autoFocus type="text" placeholder="Tell us what happened..."
              value={custom} onChange={e => setCustom(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
          )}
        </div>

        <button onClick={() => finalReason && onConfirm(finalReason)} disabled={busy || !finalReason}
          className="w-full py-3 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-40"
          style={{ backgroundColor: '#dc2626' }}>
          {busy ? 'Cancelling…' : 'Yes, Cancel Order'}
        </button>
        <button onClick={onClose} disabled={busy}
          className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors">
          Keep my order
        </button>
      </div>
    </div>
  )
}

// ─── ORDER TRACKING CARD ──────────────────────────────────────────────────────
interface Order {
  id: string; status: string; tokenNumber?: number; total: number
  vatAmount: number; subtotal: number; type: string; paymentStatus: string
  paymentMethod?: string | null; userId?: string | null
  expectedReadyAt?: string | null
  table?: { id: string; name: string | null; tableNumber: number } | null
  items: { quantity: number; notes?: string | null; unitPrice: number; menuItem: { name: string } }[]
}
function OrderTrackCard({ o, idx, onCancel }: { o: Order; idx: number; onCancel: (reason: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const sIdx = STATUS_STEP[o.status] ?? 0
  const isTakeaway = o.type === 'TAKEAWAY'
  const steps = isTakeaway ? STEPS_TAKEAWAY : STEPS_DINE_IN
  const isReady = o.status === 'READY'

  // Real-time clock — 1s tick while order is in-progress
  useEffect(() => {
    if (['READY','DELIVERED','CANCELLED'].includes(o.status)) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [o.status])

  // Format a duration (absolute ms) as "Xs", "Xm Xs", or "Xh Xm Xs"
  const fmtDur = (ms: number) => {
    const s = Math.floor(Math.abs(ms) / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60), sec = s % 60
    if (m < 60) return `${m}m ${sec}s`
    return `${Math.floor(m / 60)}h ${m % 60}m ${sec}s`
  }

  // remaining: positive = time left, negative = overdue
  const remainingMs = o.expectedReadyAt && ['ACCEPTED','PREPARING'].includes(o.status)
    ? new Date(o.expectedReadyAt).getTime() - now
    : null

  const STATUS_EMOJI: Record<string, string> = { PENDING: '📋', ACCEPTED: '✅', PREPARING: '👨‍🍳', READY: '🎉', DELIVERED: '😊', CANCELLED: '❌' }
  const DINE_IN_LABEL: Record<string, string>   = { PENDING: 'Order Received', ACCEPTED: 'Confirmed', PREPARING: 'Being Prepared', READY: 'Ready to Serve!', DELIVERED: 'Enjoy Your Meal!', CANCELLED: 'Cancelled' }
  const TAKEAWAY_LABEL: Record<string, string>  = { PENDING: 'Order Received', ACCEPTED: 'Confirmed', PREPARING: 'Being Prepared', READY: 'Ready for Pickup!', DELIVERED: 'Collected!', CANCELLED: 'Cancelled' }
  const DINE_IN_SUB: Record<string, string>     = { PENDING: 'Awaiting kitchen approval', ACCEPTED: 'In the kitchen queue', PREPARING: "Our chef is on it!", READY: 'Your waiter is bringing it now 🔔', DELIVERED: 'Thank you for dining with us', CANCELLED: 'Please speak to a staff member' }
  const TAKEAWAY_SUB: Record<string, string>    = { PENDING: 'We got your order', ACCEPTED: 'Getting started in the kitchen', PREPARING: 'Cooking your order now!', READY: 'Come collect at the counter 📦', DELIVERED: 'Enjoy!', CANCELLED: 'Please speak to a staff member' }

  const statusLabel = isTakeaway ? TAKEAWAY_LABEL[o.status] : DINE_IN_LABEL[o.status]
  const statusSub   = isTakeaway ? TAKEAWAY_SUB[o.status]   : DINE_IN_SUB[o.status]

  const net = Number(o.total) / 1.05
  const vat = Number(o.total) - net

  return (
  <>
    <div className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#111',
        border: isReady ? '1px solid rgba(245,158,11,0.5)' : '1px solid #1e1e1e',
        boxShadow: isReady ? '0 0 24px rgba(245,158,11,0.1)' : 'none',
      }}>

      {/* ── Hero status block (always visible) ── */}
      <div className="flex flex-col items-center pt-6 pb-4 px-4 text-center">
        <span className="text-5xl mb-3">{STATUS_EMOJI[o.status] ?? '📋'}</span>
        {/* Reference number — always visible, guests quote this to staff */}
        {o.tokenNumber && (
          <div className="mb-2 px-4 py-1.5 rounded-full font-black text-lg tracking-wider"
            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', letterSpacing: '0.15em' }}>
            #{o.tokenNumber}
          </div>
        )}
        <p className="text-xl font-bold text-white leading-tight">{statusLabel}</p>
        <p className="text-xs text-gray-500 mt-1">{statusSub}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#888' }}>
            {isTakeaway ? '🛍 Takeaway' : '🍽 Dine-in'}
          </span>
          {o.table && !isTakeaway && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#888' }}>
              🪑 {o.table.name ?? `Table ${o.table.tableNumber}`}
            </span>
          )}
          {remainingMs !== null && remainingMs < 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
              +{fmtDur(remainingMs)} delay
            </span>
          )}
          {remainingMs !== null && remainingMs >= 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold tabular-nums"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
              {fmtDur(remainingMs)} away
            </span>
          )}
        </div>
      </div>

      {/* ── Progress stepper (always visible) ── */}
      {o.status !== 'CANCELLED' && (
        <div className="px-5 pb-4">
          <div className="relative flex items-start justify-between">
            <div className="absolute top-4 left-4 right-4 h-0.5 rounded-full" style={{ backgroundColor: '#2a2a2a' }} />
            <div className="absolute top-4 left-4 h-0.5 rounded-full transition-all duration-700"
              style={{
                width: `calc(${Math.min((sIdx / (steps.length - 1)) * 100, 100)}% - 2rem)`,
                backgroundColor: '#f59e0b',
              }} />
            {steps.map((step, i) => {
              const Icon = step.icon
              const done = i <= sIdx
              const active = i === sIdx
              const label = (!isTakeaway && i === steps.length - 1)
                ? (o.status === 'DELIVERED' ? 'Served ✓' : 'Serve!')
                : step.label
              return (
                <div key={step.label} className="relative flex flex-col items-center gap-1.5 flex-1">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 z-10"
                    style={{
                      backgroundColor: done ? '#f59e0b' : '#1a1a1a',
                      border: `2px solid ${done ? '#f59e0b' : '#2a2a2a'}`,
                      boxShadow: active ? '0 0 14px rgba(245,158,11,0.5)' : 'none',
                    }}>
                    <Icon size={15} style={{ color: done ? '#000' : '#555' }} />
                  </div>
                  <span className="text-[9px] text-center leading-tight px-0.5 font-semibold"
                    style={{ color: active ? '#f59e0b' : done ? '#aaa' : '#555' }}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Accordion toggle ── */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors"
        style={{ color: expanded ? '#f59e0b' : '#555', borderTop: '1px solid #1e1e1e' }}>
        {expanded ? '▲ Hide details' : '▼ View order details · AED ' + Number(o.total).toFixed(2)}
      </button>

      {/* ── Order summary (collapse/expand) ── */}
      {expanded && (
        <>
          <div className="mx-4 mb-4 rounded-xl p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Your Order</p>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: o.paymentStatus === 'PAID' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                         color: o.paymentStatus === 'PAID' ? '#4ade80' : '#f59e0b' }}>
                {o.paymentStatus === 'PAID' ? '✓ Card' : 'Cash'}
              </span>
            </div>

            <div className="space-y-2 mb-3">
              {o.items.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{item.quantity}× {item.menuItem.name}</span>
                    <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
                      AED {(item.quantity * Number(item.unitPrice)).toFixed(2)}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] mt-0.5 px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                      📝 {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t pt-3 space-y-1" style={{ borderColor: '#1e1e1e' }}>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Net (excl. VAT)</span><span>AED {net.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>VAT (5%)</span><span>AED {vat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1">
                <span className="text-white">Total</span>
                <span style={{ color: '#f59e0b' }}>AED {Number(o.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {o.status === 'PENDING' && (
            <div className="px-4 pb-4">
              <button onClick={() => setShowCancelModal(true)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold transition-colors border"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#f87171', backgroundColor: 'rgba(239,68,68,0.06)' }}>
                Cancel this order
              </button>
            </div>
          )}
        </>
      )}
    </div>

    {showCancelModal && (
      <GuestCancelModal
        order={o}
        busy={cancelBusy}
        onClose={() => setShowCancelModal(false)}
        onConfirm={async reason => {
          setCancelBusy(true)
          try { await onCancel(reason) } finally { setCancelBusy(false); setShowCancelModal(false) }
        }}
      />
    )}
  </>
  )
}

function StripeCheckout({ clientSecret, order, dark, onSuccess, onCancel }: {
  clientSecret: string
  order: Order
  dark: boolean
  onSuccess: (paymentIntentId: string) => void
  onCancel: () => void
}) {
  const [stripe, setStripe] = useState<Stripe | null | undefined>(undefined)
  useEffect(() => { getStripe().then(s => setStripe(s)) }, [])
  if (stripe === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={24} className="animate-spin text-amber-500" />
      </div>
    )
  }
  if (!stripe) {
    return (
      <p className="text-center text-sm text-red-400 py-4">
        Card payments are not configured. Please ask staff or use Pay Cash When Leaving.
      </p>
    )
  }
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: dark ? 'night' : 'stripe', variables: { colorPrimary: '#f97316' } } }}>
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
function FoodCard({ item, index, qty, isFav, isLoggedIn: loggedIn, onToggleFav, onOpen }: {
  item: MenuItem; index: number; qty: number; isFav: boolean; isLoggedIn: boolean
  onToggleFav: () => void; onOpen: () => void
}) {
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

  const vatInclusivePrice = Number(item.price) * 1.05
  return (
    <div
      ref={cardRef}
      onClick={onOpen}
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
      <div className="relative h-40 w-full overflow-hidden flex-shrink-0">
        <FoodImage src={item.imageUrl} alt={item.name} className="w-full h-full transition-transform duration-500 hover:scale-105" />
        {loggedIn && (
          <button onClick={e => { e.stopPropagation(); onToggleFav() }}
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

function MenuPageInner() {
  const searchParams = useSearchParams()
  // When coming from book page: tableId + bookingId pre-set, card-only
  const urlTableId   = searchParams.get('tableId')   ?? ''
  const urlBookingId = searchParams.get('bookingId') ?? ''
  const urlQr        = searchParams.get('qr')        ?? ''   // from QR scan
  const urlOpenItem  = searchParams.get('open')      ?? ''   // from signature dish click
  const urlTrack     = searchParams.get('track')     === '1' // from account page Track button
  const fromBooking  = !!urlTableId && !!urlBookingId
  const fromQr       = !!urlQr

  const [view, setView] = useState<View>(urlTrack ? 'tracking' : 'menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryPages, setCategoryPages] = useState<Record<string, CategoryPageState>>({})
  const [activeCategory, setActiveCategory] = useState('')
  // Single order kept for payment flow only; multi-order tracking uses activeOrders
  const [order, setOrder] = useState<Order | null>(null)
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
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
  const [cancelling, setCancelling] = useState(false)
  const [feedbackOrderId, setFeedbackOrderId] = useState<string | null>(null)

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
      const cats: Category[] = (r.data ?? []).map((c: { id: string; name: string; itemCount?: number }) => ({
        id: c.id,
        name: c.name,
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
    if (storedIds.length) {
      Promise.allSettled(storedIds.slice(0, 10).map(id => api.get(`/orders/${id}`))).then(results => {
        const live: Order[] = []
        const deadIds: string[] = []
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const o: Order = r.value.data
            const isDone = !o || o.status === 'CANCELLED' || (o.status === 'DELIVERED' && o.paymentStatus === 'PAID')
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
        if (live.length) {
          setActiveOrders(live)
          setView('tracking')
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
        setView('tracking')
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
        setView('tracking')
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
        if (to === 'DELIVERED' && from !== 'DELIVERED') setFeedbackOrderId(orderId)
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
    setPlacing(true)
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
          setView('tracking')
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
        setView('tracking')
        toast.success('Order placed! Pay at the counter when you leave.', { duration: 4000, position: 'top-center' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not place order. Try again.'
      notify.error(msg)
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (orderId: string, reason: string) => {
    setCancelling(true)
    try {
      await api.post(`/orders/${orderId}/cancel`, { cancelReason: reason })
      const cancelledId = orderId
      setActiveOrders(prev => {
        const next = prev.filter(o => o.id !== cancelledId)
        try {
          const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
          localStorage.setItem('almanzil_order_ids', JSON.stringify(ids.filter(id => id !== cancelledId)))
        } catch {}
        return next
      })
      if (order?.id === orderId) setOrder(null)
      notify.info(`Order cancelled — ${reason}`)
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
      setActiveOrders(prev => {
        const idx = prev.findIndex(o => o.id === data.order.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = data.order; return next }
        return [data.order, ...prev]
      })
      setClientSecret(null)
      setView('confirmed')  // show payment confirmation screen
    } catch {
      notify.error('Payment went through but confirmation failed. Show this screen to staff.')
      setView('tracking')
    }
  }

  // Lock body scroll when drawer or modal is open
  useEffect(() => {
    const locked = !!drawerItem || showCashConfirm
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerItem, showCashConfirm])

  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0)
  const stepIdx = order ? (STATUS_STEP[order.status] ?? 0) : 0

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
              <span style={{ color: '#f59e0b' }}>AED {Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          <button onClick={() => {
            setView('tracking')
            setFeedbackOrderId(order.id)
          }}
            className="w-full py-4 rounded-2xl font-black text-base"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}>
            Track My Order →
          </button>
        </div>

        {feedbackOrderId && (
          <FeedbackModal orderId={feedbackOrderId} onClose={() => setFeedbackOrderId(null)} />
        )}
      </div>
    )
  }

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
          <StripeCheckout
            clientSecret={clientSecret}
            order={order}
            dark={dark}
            onSuccess={handlePaymentSuccess}
            onCancel={() => setView('cart')}
          />
          <p className="text-center text-xs text-gray-300 mt-4">
            Test card: 4242 4242 4242 4242 · Any future date · Any CVC
          </p>
        </div>
      </div>
    )
  }

  // ─── TRACKING VIEW ────────────────────────────────────────────────────────
  if (view === 'tracking') {
    const displayOrders = activeOrders.length ? activeOrders : (order ? [order] : [])
    const grandTotal = displayOrders.reduce((s, o) => s + Number(o.total), 0)
    const hasReady = displayOrders.some(o => o.status === 'READY')
    const allDineIn = displayOrders.every(o => o.type === 'DINE_IN')


    return (
      <>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        {/* Gold top line */}
        <div style={{ height: 2, background: 'linear-gradient(to right, transparent, #f59e0b 30%, #f59e0b 70%, transparent)' }} />

        {/* Header */}
        <div className="px-4 h-14 flex items-center justify-between sticky top-0 z-10 border-b"
          style={{ backgroundColor: 'rgba(8,8,8,0.9)', borderColor: '#1a1a1a', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('menu')}
              className="flex items-center gap-1.5 text-amber-500 hover:text-amber-400 transition-colors mr-1"
            >
              <ChevronLeft size={18} />
              <span className="text-xs font-semibold">Menu</span>
            </button>
            <div className="w-px h-4" style={{ backgroundColor: '#2a2a2a' }} />
            <UtensilsCrossed size={17} className="text-amber-500" />
            <span className="font-bold text-sm text-white">My Orders</span>
          </div>
          {hasReady && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full animate-pulse"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              {allDineIn ? '🔔 Ready to serve!' : '📦 Ready for pickup!'}
            </span>
          )}
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-28 space-y-4">

          {/* Summary strip */}
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{displayOrders.length} order{displayOrders.length > 1 ? 's' : ''} active</p>
              <p className="text-base font-black text-white">Total <span style={{ color: '#f59e0b' }}>AED {grandTotal.toFixed(2)}</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-600 mb-1">Payment</p>
              {displayOrders.every(o => o.paymentStatus === 'PAID')
                ? <span className="text-xs font-bold text-green-400">✓ All Paid</span>
                : <span className="text-xs font-bold text-amber-400">💵 Pay at Exit</span>}
            </div>
          </div>

          {/* Order cards — accordion */}
          {displayOrders.map((o, idx) => (
            <OrderTrackCard key={o.id} o={o} idx={idx}
              onCancel={reason => cancelOrder(o.id, reason)} />
          ))}

          {/* Order More CTA */}
          <div className="rounded-2xl p-4" style={{ border: '1px solid rgba(245,158,11,0.25)', backgroundColor: 'rgba(245,158,11,0.04)' }}>
            <p className="text-xs font-semibold text-amber-400 mb-0.5">Want to add more?</p>
            <p className="text-xs text-amber-400/50 mb-3">
              {allDineIn ? 'All new items will be added to your bill for this table.' : 'Add to your existing order.'}
            </p>
            <button onClick={() => setView('menu')}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}>
              + Order More Items
            </button>
          </div>

          {/* Signup nudge */}
          {guestOrderCount >= 2 && !displayOrders[0]?.userId && (
            <div className="rounded-2xl p-4" style={{ border: '1px solid #1e1e1e' }}>
              <p className="text-sm font-bold text-white mb-1">Save your order history</p>
              <p className="text-xs text-gray-500 mb-3">Create a free account to track past orders and check out faster.</p>
              <div className="flex gap-2">
                <Link href="/login?redirect=/menu" className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}>Sign Up Free</Link>
                <Link href="/login?redirect=/menu" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
                  style={{ border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>Sign In</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feedback modal — shown after DELIVERED via socket */}
      {feedbackOrderId && (
        <FeedbackModal orderId={feedbackOrderId} onClose={() => setFeedbackOrderId(null)} />
      )}
      </>
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

            {/* Table already known from localStorage — show locked tile so guest doesn't re-select */}
            {cart.orderType === 'DINE_IN' && !fromBooking && !fromQr && tableId && (
              <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
                <Table2 size={14} className="text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-400">
                  {allTables.find(t => t.id === tableId)?.name ?? `Table ${tableNum}`}
                </span>
                <button onClick={() => { setTableId(''); setTableNum(null); setTableInput('') }}
                  className="ml-auto text-[10px] text-gray-500 underline">change</button>
              </div>
            )}

            {/* Table picker — guests can pick any table except ones being cleaned */}
            {cart.orderType === 'DINE_IN' && !fromBooking && !fromQr && !tableId && (() => {
              const selectable = allTables.filter(t => t.status !== 'DIRTY')
              return (
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <Table2 size={11} /> Select your table
                </div>
                {selectable.length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                    No tables available right now. Please ask a staff member.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {selectable.map(t => (
                      <button key={t.id} onClick={() => { setTableId(t.id); setTableNum(t.tableNumber); cart.setTableId(t.id) }}
                          style={tableId === t.id
                          ? { backgroundColor: '#f59e0b', border: '1px solid #f59e0b', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }
                          : { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        className="rounded-xl py-3 px-2 text-center transition-all">
                        <div className={`font-bold text-sm ${tableId === t.id ? 'text-black' : 'text-white'}`}>
                          {t.name ?? `T${t.tableNumber}`}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${tableId === t.id ? 'text-amber-100' : 'text-gray-400'}`}>
                          {t.status === 'EMPTY' ? `${t.capacity} seats` : t.status === 'OCCUPIED' ? 'seated' : 'billing'}
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
              <p className="text-xs text-gray-400 mt-2 text-center">Token number given · Collect at counter when ready</p>
            )}

            {/* ── Staff session picker ── shown only when staff has selected a table with existing guests */}
            {isStaff && tableId && cart.orderType === 'DINE_IN' && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: '#2a2a2a' }}>
                <div className="text-xs text-amber-500 font-semibold mb-2 flex items-center gap-1.5">
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
                            ? { backgroundColor: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.5)' }
                            : { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-bold" style={{ color: selected ? '#f59e0b' : '#ccc' }}>
                              {s.label}
                              {time && <span className="font-normal text-gray-500 ml-1.5">· {time}</span>}
                            </p>
                            {selected && <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>✓ Selected</span>}
                          </div>
                          <p className="text-[10px] text-gray-500 leading-relaxed">
                            {s.itemSummary.length > 0
                              ? s.itemSummary.join(', ')
                              : `${s.itemCount} item${s.itemCount !== 1 ? 's' : ''}`}
                          </p>
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: selected ? '#f59e0b' : '#555' }}>
                            AED {s.total.toFixed(2)}
                          </p>
                        </button>
                      )
                    })}
                    {/* New guest / separate bill */}
                    <button onClick={() => setSelectedSessionId('__new__')}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={selectedSessionId === '__new__'
                        ? { backgroundColor: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.5)' }
                        : { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderStyle: 'dashed' }}>
                      <span className="text-xs font-bold" style={{ color: selectedSessionId === '__new__' ? '#f59e0b' : '#666' }}>
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
              {/* Cash option */}
              {!fromBooking && (() => {
                const hasDineInSession = cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                // Returning dine-in guest ordering more — they're already on a cash tab, just add directly
                const isReturningDineIn = cart.orderType === 'DINE_IN' && activeOrders.some(o => o.type === 'DINE_IN')
                if (cart.orderType === 'DINE_IN') {
                  return (
                    <button onClick={() => isReturningDineIn ? placeOrder(false) : setShowCashConfirm(true)}
                      disabled={placing || !canOrder}
                      className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                      {placing ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={16} />}
                      {isReturningDineIn ? `Add to My Order · AED ${cart.total().toFixed(2)}` : `Pay Cash When Leaving · AED ${cart.total().toFixed(2)}`}
                    </button>
                  )
                }
                if (cart.orderType === 'TAKEAWAY') {
                  // Walk-in takeaway OR dine-in guest adding takeaway — both can pay at counter
                  const cashLabel = hasDineInSession
                    ? `Add to My Table Bill · AED ${cart.total().toFixed(2)}`
                    : `Pay at Counter · AED ${cart.total().toFixed(2)}`
                  return (
                    <button onClick={() => setShowCashConfirm(true)}
                      disabled={placing || !canOrder}
                      className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                      {placing ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={16} />}
                      {cashLabel}
                    </button>
                  )
                }
              })()}
              {/* Card payment */}
              <button onClick={() => placeOrder(true)}
                disabled={placing || !canOrder}
                className="w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 text-gray-300 hover:text-white"
                style={{ border: '2px solid #2a2a2a', backgroundColor: 'transparent' }}>
                {placing ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                Pay by Card · AED {cart.total().toFixed(2)}
              </button>
              {!fromBooking && cart.orderType === 'DINE_IN' && (
                <p className="text-center text-[11px] text-gray-600">Most guests pay cash at the counter when leaving</p>
              )}
              {!fromBooking && cart.orderType === 'TAKEAWAY' && (
                <p className="text-center text-[11px] text-gray-600">
                  {activeOrders.some(o => o.type === 'DINE_IN') && tableId
                    ? 'Bag will be ready when you leave — added to your table bill'
                    : 'Pay at the counter when you collect'}
                </p>
              )}
              {fromBooking && (
                <p className="text-center text-xs text-gray-600">Pre-order with your booking — card payment required</p>
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
                  ? 'Add Takeaway to Your Bill'
                  : cart.orderType === 'TAKEAWAY'
                  ? 'Pay at Counter on Collection'
                  : 'Pay Cash When Leaving'}
              </h2>
              <p className="text-sm text-gray-500">
                {cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                  ? "We'll pack it and add it to your table bill. Collect when you're ready to leave."
                  : cart.orderType === 'TAKEAWAY'
                  ? "Your order goes to the kitchen now. Pay at the counter when you collect."
                  : 'Your order will be sent to the kitchen now. Please pay at the counter before you leave.'}
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
                <span className="font-black text-white">Total</span>
                <span className="font-black text-lg" style={{ color: '#f59e0b' }}>AED {cart.total().toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 text-center">Prices include 5% VAT</p>
            <button onClick={() => placeOrder(false)}
              disabled={placing}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
              {placing ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
              {placing ? 'Placing order…'
                : cart.orderType === 'TAKEAWAY' && activeOrders.some(o => o.type === 'DINE_IN') && tableId
                ? 'Confirm — Add to My Bill'
                : cart.orderType === 'TAKEAWAY'
                ? 'Confirm — Pay at Counter'
                : "Confirm — I'll Pay on Exit"}
            </button>
            <button onClick={() => setShowCashConfirm(false)} disabled={placing}
              className="w-full py-3 rounded-2xl text-sm text-gray-500 hover:text-white transition-colors"
              style={{ border: '1px solid #1e1e1e' }}>
              Go Back
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
              {favItems.map((item, i) => (
                <FoodCard key={item.id} item={item} index={i}
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
                <h2 className="text-2xl font-black text-white tracking-tight">{cat.name}</h2>
                <div className="text-xs text-gray-600 mt-0.5">{cat.itemCount ?? cat.items.length} {(cat.itemCount ?? cat.items.length) === 1 ? 'dish' : 'dishes'}</div>
              </div>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(245,158,11,0.35), transparent)' }} />
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {cat.items.map((item, i) => (
                <FoodCard key={item.id} item={item} index={i}
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
                <Loader2 size={20} className="animate-spin text-amber-500/60" />
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
          <button onClick={() => setView('tracking')}
            className="w-full flex items-center justify-between gap-4 py-3.5 px-5 rounded-2xl font-bold transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            <span className="text-sm w-7 h-7 rounded-full flex items-center justify-center font-black"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
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
            style={{ backgroundColor: '#f59e0b', color: '#000', boxShadow: '0 8px 30px rgba(245,158,11,0.4)' }}>
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
