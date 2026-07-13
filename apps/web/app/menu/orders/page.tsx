'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Clock, CheckCircle, ChefHat, BellRing, PackageCheck, UtensilsCrossed, ChevronLeft,
  MessageCircle, Send, X,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'
import { useBrandStore, initBrand } from '@/store/brand'
import { useLangStore, applyLangDir, t, syncLangToServer, type Lang } from '@/store/lang'
import ForceDark from '@/components/ForceDark'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Order {
  id: string; status: string; tokenNumber?: number; total: number
  vatAmount: number; subtotal: number; type: string; paymentStatus: string
  paymentMethod?: string | null; stripeIntentId?: string | null; userId?: string | null
  expectedReadyAt?: string | null
  table?: { id: string; name: string | null; tableNumber: number } | null
  items: { quantity: number; notes?: string | null; unitPrice: number; menuItem: { name: string }; modifiers?: { name: string; priceAdd: number }[] }[]
}

const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

const STEPS_DINE_IN = [
  { labelKey: 'menu.received',  icon: Clock        },
  { labelKey: 'menu.confirmed', icon: CheckCircle  },
  { labelKey: 'menu.preparing', icon: ChefHat      },
  { labelKey: 'menu.ready',     icon: BellRing     },
]
const STEPS_TAKEAWAY = [
  { labelKey: 'menu.received',  icon: Clock        },
  { labelKey: 'menu.confirmed', icon: CheckCircle  },
  { labelKey: 'menu.preparing', icon: ChefHat      },
  { labelKey: 'menu.ready',     icon: PackageCheck },
]

// ─── Feedback Modal — Premium ─────────────────────────────────────────────────
const FEEDBACK_TAGS_POSITIVE = ['Great taste', 'Fast service', 'Friendly staff', 'Good value']
const FEEDBACK_TAGS_NEGATIVE = ['Slow service', 'Cold food', 'Wrong order', 'Noisy', 'Pricey']

const MOOD_LABELS: Record<number, string> = {
  1: 'Poor 😞',
  2: 'Fair 😐',
  3: 'Good 🙂',
  4: 'Great 👍',
  5: 'Excellent! 🎉',
}

function FeedbackModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [rating, setRating]       = useState(0)
  const [hover, setHover]         = useState(0)
  const [tags, setTags]           = useState<string[]>([])
  const [comment, setComment]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)
  const brandLogoUrl              = useBrandStore(s => s.logoUrl)

  const activeRating = hover || rating
  const suggestedTags = rating >= 4 ? FEEDBACK_TAGS_POSITIVE : rating > 0 && rating <= 2 ? FEEDBACK_TAGS_NEGATIVE : []

  const submit = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      await api.post(`/orders/${orderId}/feedback`, {
        rating,
        comment: comment.trim() || undefined,
        tags: tags.join(',') || undefined,
      })
      setDone(true)
      setTimeout(onClose, 2200)
    } catch { onClose() }
    finally { setSubmitting(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(20px)',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#0d0d0d',
          border: '1px solid #1e1e1e',
          borderRadius: 24,
          padding: '2rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top brand gradient line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(to right, transparent, var(--brand) 20%, var(--brand) 80%, transparent)',
        }} />

        {done ? (
          /* ── Thank You State ── */
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(var(--brand-rgb),0.12)',
              border: '2px solid var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
              animation: 'fbCheckScale 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
            }}>
              <CheckCircle size={28} style={{ color: 'var(--brand)' }} />
            </div>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Thank you!</p>
            <p style={{ fontSize: 13, color: '#666' }}>We&apos;ll make it even better</p>
            <style>{`@keyframes fbCheckScale { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
          </div>
        ) : (
          <>
            {/* Brand icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandLogoUrl}
                  alt="brand"
                  style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #1e1e1e' }}
                />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(var(--brand-rgb),0.12)',
                  border: '1px solid rgba(var(--brand-rgb),0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <UtensilsCrossed size={18} style={{ color: 'var(--brand)' }} />
                </div>
              )}
            </div>

            {/* Headline */}
            <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 6 }}>
              How was your meal?
            </p>
            <p style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: '1.5rem' }}>
              Your feedback goes directly to our team
            </p>

            {/* Star row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(s)}
                  style={{
                    fontSize: 40,
                    lineHeight: 1,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 0',
                    transition: 'transform 0.15s ease, filter 0.15s ease',
                    transform: activeRating >= s ? 'scale(1.15)' : 'scale(1)',
                    filter: activeRating >= s ? 'none' : 'grayscale(1) opacity(0.3)',
                  }}
                >
                  ⭐
                </button>
              ))}
            </div>

            {/* Mood label */}
            <div style={{
              textAlign: 'center',
              height: 22,
              marginBottom: '1rem',
              transition: 'opacity 0.2s',
              opacity: rating > 0 ? 1 : 0,
            }}>
              <span style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>
                {MOOD_LABELS[rating] ?? ''}
              </span>
            </div>

            {/* Tag chips */}
            {suggestedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: '1rem' }}>
                {suggestedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTags(p => p.includes(tag) ? p.filter(x => x !== tag) : [...p, tag])}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 100,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: tags.includes(tag)
                        ? '1px solid transparent'
                        : '1px solid rgba(var(--brand-rgb),0.2)',
                      background: tags.includes(tag)
                        ? 'var(--brand)'
                        : 'rgba(var(--brand-rgb),0.08)',
                      color: tags.includes(tag) ? '#000' : '#888',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Comment textarea */}
            {rating > 0 && (
              <textarea
                rows={2}
                placeholder="Anything else? (optional)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1e1e1e',
                  outline: 'none',
                  color: '#fff',
                  fontSize: 13,
                  resize: 'none',
                  padding: '8px 0',
                  marginBottom: '1.25rem',
                  boxSizing: 'border-box',
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...({ placeholder: 'Anything else? (optional)' } as any)}
              />
            )}
            {rating === 0 && <div style={{ height: '1.25rem', marginBottom: '1.25rem' }} />}

            {/* Submit button */}
            <button
              onClick={submit}
              disabled={submitting || !rating}
              style={{
                width: '100%',
                height: 52,
                background: 'var(--brand)',
                color: '#000',
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                cursor: rating ? 'pointer' : 'default',
                opacity: !rating ? 0.4 : 1,
                transition: 'opacity 0.2s',
                marginBottom: 12,
              }}
            >
              {submitting ? 'Sending…' : 'Submit Feedback'}
            </button>

            {/* Skip link */}
            <button
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Guest Cancel Modal ────────────────────────────────────────────────────────
const CANCEL_REASONS_DINE_IN  = ['Changed my mind', 'Ordered by mistake', 'Waiting too long', 'Other']
const CANCEL_REASONS_TAKEAWAY = ['Changed my mind', 'Ordered by mistake', 'Will pick up later', 'Other']

function GuestCancelModal({ order, onConfirm, onClose, busy }: {
  order: Order; onConfirm: (reason: string) => void; onClose: () => void; busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  useBodyScrollLock(true)
  const reasons = order.type === 'TAKEAWAY' ? CANCEL_REASONS_TAKEAWAY : CANCEL_REASONS_DINE_IN
  const finalReason = reason === 'Other' ? custom.trim() : reason

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-6 space-y-4"
        style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }} onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <p className="text-base font-black text-white mb-0.5">Cancel your order?</p>
          <p className="text-xs text-gray-500">This cannot be undone. Please let us know why.</p>
        </div>
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
                : { backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e', color: '#888' }}>{r}</button>
          ))}
          {reason === 'Other' && (
            <input autoFocus type="text" placeholder="Tell us what happened..."
              value={custom} onChange={e => setCustom(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
              style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e' }} />
          )}
        </div>
        <button onClick={() => finalReason && onConfirm(finalReason)} disabled={busy || !finalReason}
          className="w-full py-3 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-40"
          style={{ backgroundColor: '#dc2626' }}>{busy ? 'Cancelling…' : 'Yes, Cancel Order'}</button>
        <button onClick={onClose} disabled={busy}
          className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors">Keep my order</button>
      </div>
    </div>
  )
}

// ─── Order Track Card ──────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#eab308',
  ACCEPTED:  '#3b82f6',
  PREPARING: '#f97316',
  READY:     '#06b6d4',
  DELIVERED: '#22c55e',
  CANCELLED: '#6b7280',
}
const STATUS_ICON: Record<string, string> = {
  PENDING:   '📋',
  ACCEPTED:  '✅',
  PREPARING: '👨‍🍳',
  READY:     '🔔',
  DELIVERED: '😊',
  CANCELLED: '❌',
}
// KDS mode (default) — 4 steps: Received → Confirmed → Preparing → Ready
const STATUS_LABEL_KEY: Record<string, { dine: string; take: string }> = {
  PENDING:   { dine: 'menu.orderReceived', take: 'menu.orderReceived' },
  ACCEPTED:  { dine: 'menu.confirmed',     take: 'menu.confirmed'     },
  PREPARING: { dine: 'menu.beingPrepared', take: 'menu.beingPrepared' },
  READY:     { dine: 'menu.readyToServe',  take: 'menu.readyPickup'   },
  DELIVERED: { dine: 'menu.enjoyMeal',     take: 'menu.collected'     },
  CANCELLED: { dine: 'menu.cancelled',     take: 'menu.cancelled'     },
}
const STATUS_SUB_KEY: Record<string, { dine: string; take: string }> = {
  PENDING:   { dine: 'menu.awaitingApproval', take: 'menu.weGotYourOrder'  },
  ACCEPTED:  { dine: 'menu.inKitchenQueue',   take: 'menu.gettingStarted'  },
  PREPARING: { dine: 'menu.chefOnIt',         take: 'menu.cookingNow'      },
  READY:     { dine: 'menu.waiterOnWay',       take: 'menu.collectCounter'  },
  DELIVERED: { dine: 'menu.thankYouDining',   take: 'menu.enjoyMeal'       },
  CANCELLED: { dine: 'menu.speakStaff',       take: 'menu.speakStaff'      },
}
const STATUS_SHORT_KEY: Record<string, string> = {
  PENDING:   'menu.received',
  ACCEPTED:  'menu.confirmed',
  PREPARING: 'menu.preparing',
  READY:     'menu.ready',
  DELIVERED: 'menu.delivered',
  CANCELLED: 'menu.cancelled',
}

// Thermal mode — 3 steps: Received → With Kitchen → Ready
// ACCEPTED and PREPARING both map to step 1 ("With Kitchen")
const THERMAL_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 1, READY: 2, DELIVERED: 3 }
const THERMAL_STEPS_DINE_IN = [
  { labelKey: 'menu.received',       icon: Clock        },
  { labelKey: 'menu.withKitchen',    icon: ChefHat      },
  { labelKey: 'menu.ready',          icon: BellRing     },
]
const THERMAL_STEPS_TAKEAWAY = [
  { labelKey: 'menu.received',       icon: Clock        },
  { labelKey: 'menu.withKitchen',    icon: ChefHat      },
  { labelKey: 'menu.ready',          icon: PackageCheck },
]
// Thermal-specific copy — replaces KDS copy for ACCEPTED status
const THERMAL_LABEL_KEY: Record<string, { dine: string; take: string }> = {
  PENDING:   { dine: 'menu.orderReceived',    take: 'menu.orderReceived'    },
  ACCEPTED:  { dine: 'menu.kotSent',          take: 'menu.kotSent'          },
  PREPARING: { dine: 'menu.kotSent',          take: 'menu.kotSent'          },
  READY:     { dine: 'menu.readyToServe',     take: 'menu.readyPickup'      },
  DELIVERED: { dine: 'menu.enjoyMeal',        take: 'menu.collected'        },
  CANCELLED: { dine: 'menu.cancelled',        take: 'menu.cancelled'        },
}
const THERMAL_SUB_KEY: Record<string, { dine: string; take: string }> = {
  PENDING:   { dine: 'menu.awaitingApproval', take: 'menu.weGotYourOrder'   },
  ACCEPTED:  { dine: 'menu.kotSentSub',       take: 'menu.kotSentSub'       },
  PREPARING: { dine: 'menu.kotSentSub',       take: 'menu.kotSentSub'       },
  READY:     { dine: 'menu.waiterOnWay',      take: 'menu.collectCounter'   },
  DELIVERED: { dine: 'menu.thankYouDining',   take: 'menu.enjoyMeal'        },
  CANCELLED: { dine: 'menu.speakStaff',       take: 'menu.speakStaff'       },
}

function OrderTrackCard({ o, lang, thermalMode, onCancel, onOpenChat, hasUnread }: {
  o: Order; lang: Lang; thermalMode: boolean; onCancel: (reason: string) => void
  onOpenChat: (orderId: string) => void
  hasUnread: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const isTakeaway = o.type === 'TAKEAWAY'
  const sIdx = thermalMode
    ? (THERMAL_STEP[o.status] ?? 0)
    : (STATUS_STEP[o.status] ?? 0)
  const steps = thermalMode
    ? (isTakeaway ? THERMAL_STEPS_TAKEAWAY : THERMAL_STEPS_DINE_IN)
    : (isTakeaway ? STEPS_TAKEAWAY : STEPS_DINE_IN)
  const isReady = o.status === 'READY'
  const isCancelled = o.status === 'CANCELLED'
  const dotColor = STATUS_COLOR[o.status] ?? '#888'

  useEffect(() => {
    if (['READY','DELIVERED','CANCELLED'].includes(o.status)) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [o.status])

  const fmtDur = (ms: number) => {
    const s = Math.floor(Math.abs(ms) / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60), sec = s % 60
    if (m < 60) return `${m}m ${sec}s`
    return `${Math.floor(m / 60)}h ${m % 60}m ${sec}s`
  }

  const remainingMs = o.expectedReadyAt && ['ACCEPTED','PREPARING'].includes(o.status)
    ? new Date(o.expectedReadyAt).getTime() - now : null

  const labelMap = thermalMode ? THERMAL_LABEL_KEY : STATUS_LABEL_KEY
  const subMap   = thermalMode ? THERMAL_SUB_KEY   : STATUS_SUB_KEY
  const labelKey = isTakeaway ? labelMap[o.status]?.take : labelMap[o.status]?.dine
  const subKey   = isTakeaway ? subMap[o.status]?.take   : subMap[o.status]?.dine
  const label = labelKey ? t(lang, labelKey) : o.status
  const sub   = subKey   ? t(lang, subKey)   : ''
  const short = STATUS_SHORT_KEY[o.status] ? t(lang, STATUS_SHORT_KEY[o.status]) : o.status
  const icon  = STATUS_ICON[o.status] ?? '📋'
  const totalQty = o.items.reduce((s, i) => s + i.quantity, 0)
  const net = Number(o.total) / 1.05
  const vat = Number(o.total) - net

  return (
    <>
      {/* ── Boarding pass card ────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden flex"
        style={{
          backgroundColor: '#111',
          border: (isReady || o.status === 'DELIVERED') ? `1px solid ${dotColor}55` : '1px solid #1e1e1e',
          boxShadow: (isReady || o.status === 'DELIVERED') ? `0 0 24px ${dotColor}20` : 'none',
        }}>

        {/* ── Left band (status) ── */}
        <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0 py-4 px-3"
          style={{
            width: 56,
            background: `linear-gradient(180deg, ${dotColor}22 0%, ${dotColor}10 100%)`,
            borderRight: `1px solid ${dotColor}22`,
          }}>
          <span className="text-xl leading-none">{icon}</span>
          <div style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: '0.12em',
            color: dotColor,
            userSelect: 'none',
          }}>
            {short}
          </div>
          {o.tokenNumber && (
            <span className="text-[9px] font-black text-center leading-tight"
              style={{ color: dotColor }}>#{o.tokenNumber}</span>
          )}
        </div>

        {/* ── Right content ── */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Top section: label + context chips + amount */}
          <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
            <div className="flex-1 min-w-0">
              <p className="font-black text-[15px] text-white leading-tight">{label}</p>
              <p className="text-[10px] mt-0.5 leading-snug" style={{ color: '#666' }}>{sub}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#666' }}>
                  {isTakeaway ? `🛍 ${t(lang, 'menu.takeaway')}` : `🍽 ${t(lang, 'menu.dineIn')}`}
                </span>
                {o.table && !isTakeaway && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#666' }}>
                    🪑 {o.table.name ?? `Table ${o.table.tableNumber}`}
                  </span>
                )}
                {remainingMs !== null && remainingMs < 0 && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold animate-pulse"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                    +{fmtDur(remainingMs)} {t(lang, 'menu.delayedLabel')}
                  </span>
                )}
                {remainingMs !== null && remainingMs >= 0 && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold tabular-nums"
                    style={{ background: `${dotColor}18`, color: dotColor }}>
                    {fmtDur(remainingMs)} {t(lang, 'menu.awayLabel')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-[15px] font-black text-white tabular-nums">
                AED {Number(o.total).toFixed(2)}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: '#555' }}>{totalQty} item{totalQty !== 1 ? 's' : ''}</p>
              {/* Payment badge — only shown once order is delivered */}
              {o.status === 'DELIVERED' && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full mt-1"
                  style={o.paymentStatus === 'PAID'
                    ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }
                    : { background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }}>
                  {o.paymentStatus === 'PAID' ? '✓ Paid' : '💵 Pay at exit'}
                </span>
              )}
            </div>
          </div>

          {/* Stepper */}
          {!isCancelled && (() => {
            const clampedIdx = Math.min(sIdx, steps.length - 1)
            const pct = (clampedIdx / (steps.length - 1)) * 100
            return (
              <div className="px-3 pb-3 pt-1">
                {/* dot + track row — absolute lines, dots with solid bg to cover the track */}
                <div className="relative" style={{ height: 28 }}>
                  {/* grey track */}
                  <div className="absolute" style={{ left: 14, right: 14, top: 13, height: 2, background: '#2a2a2a', borderRadius: 1 }} />
                  {/* filled track */}
                  <div className="absolute transition-all duration-700" style={{ left: 14, top: 13, height: 2, width: `calc(${pct}% - ${pct / 100 * 28}px)`, background: dotColor, borderRadius: 1 }} />
                  {/* dots */}
                  <div className="absolute inset-0 flex justify-between items-center">
                    {steps.map((step, i) => {
                      const Icon  = step.icon
                      const done   = i < clampedIdx
                      const active = i === clampedIdx
                      // In thermal mode the "With Kitchen" step pulses while cooking
                      const pulsing = thermalMode && active && ['ACCEPTED', 'PREPARING'].includes(o.status)
                      return (
                        <div key={step.labelKey}
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500${pulsing ? ' animate-pulse' : ''}`}
                          style={{
                            background: active ? dotColor : done ? '#111' : '#111',
                            border: `2px solid ${active ? dotColor : done ? dotColor : '#2a2a2a'}`,
                            boxShadow: active ? `0 0 12px ${dotColor}99` : 'none',
                            position: 'relative', zIndex: 1,
                          }}>
                          <Icon size={11} style={{ color: active ? '#000' : done ? dotColor : '#444' }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
                {/* label row */}
                <div className="flex justify-between mt-1">
                  {steps.map((step, i) => {
                    const done   = i < clampedIdx
                    const active = i === clampedIdx
                    const stepLabel = (!isTakeaway && i === steps.length - 1)
                      ? (o.status === 'DELIVERED' ? t(lang, 'menu.servedDone') : t(lang, 'menu.serve'))
                      : t(lang, step.labelKey)
                    return (
                      <span key={step.labelKey} className="text-[8px] text-center leading-tight font-semibold w-7"
                        style={{ color: active ? dotColor : done ? `${dotColor}90` : '#333' }}>
                        {stepLabel}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Need help / chat button — shown while order is in kitchen */}
          {['ACCEPTED', 'PREPARING'].includes(o.status) && (
            <div className="px-3 pb-2">
              <button
                onClick={() => onOpenChat(o.id)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] relative"
                style={{
                  background: hasUnread ? 'rgba(var(--brand-rgb),0.15)' : 'rgba(255,255,255,0.04)',
                  border: hasUnread ? '1px solid rgba(var(--brand-rgb),0.4)' : '1px solid #222',
                  color: hasUnread ? 'var(--brand)' : '#555',
                }}>
                <MessageCircle size={13} />
                {hasUnread ? 'Staff replied — tap to view' : 'Need help? Chat with staff'}
                {hasUnread && (
                  <span className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse" />
                )}
              </button>
            </div>
          )}

          {/* Dashed divider (boarding pass tear line) */}
          <div className="relative flex items-center px-3" style={{ marginTop: -2 }}>
            <div className="flex-1" style={{ borderTop: '1px dashed #222' }} />
          </div>

          {/* Accordion toggle */}
          <button onClick={() => setExpanded(p => !p)}
            className="flex items-center justify-between px-3 py-2.5 text-[11px] font-semibold transition-colors"
            style={{ color: expanded ? dotColor : '#444' }}>
            <span>{expanded ? `▲ ${t(lang, 'menu.hideItems')}` : `▼ ${t(lang, 'menu.viewItems')}`}</span>
            <span style={{ color: '#444' }}>{totalQty} item{totalQty !== 1 ? 's' : ''}</span>
          </button>

          {/* Accordion body */}
          {expanded && (
            <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid #1a1a1a' }}>
              <div className="pt-2.5 space-y-2">
                {o.items.map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-[12px] text-gray-300 flex-1 min-w-0">
                        <span className="font-black mr-1" style={{ color: dotColor }}>{item.quantity}×</span>
                        {item.menuItem.name}
                      </span>
                      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#555' }}>
                        AED {(item.quantity * (Number(item.unitPrice) + (item.modifiers ?? []).reduce((s, m) => s + Number(m.priceAdd), 0))).toFixed(2)}
                      </span>
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="mt-0.5 ml-4 space-y-0.5">
                        {item.modifiers.map((m, mi) => (
                          <p key={mi} className="text-[10px] text-blue-400">+ {m.name}</p>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-[10px] mt-1 px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(var(--brand-rgb),0.08)', color: 'var(--brand)' }}>
                        📝 {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-2 space-y-1" style={{ borderTop: '1px solid #1a1a1a' }}>
                <div className="flex justify-between text-[10px]" style={{ color: '#555' }}>
                  <span>{t(lang, 'menu.netExclVat')}</span><span>AED {net.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: '#555' }}>
                  <span>{t(lang, 'menu.vatPct')}</span><span>AED {vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[13px] font-black pt-1">
                  <span className="text-white">{t(lang, 'menu.total')}</span>
                  <span style={{ color: dotColor }}>AED {Number(o.total).toFixed(2)}</span>
                </div>
              </div>
              {o.status === 'PENDING' && (
                <button onClick={() => setShowCancel(true)}
                  className="w-full py-2 rounded-xl text-xs font-semibold border transition-colors"
                  style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#f87171', background: 'rgba(239,68,68,0.05)' }}>
                  {t(lang, 'menu.cancelThisOrder')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showCancel && (
        <GuestCancelModal order={o} busy={cancelBusy} onClose={() => setShowCancel(false)}
          onConfirm={async reason => {
            setCancelBusy(true)
            try { await onCancel(reason) } finally { setCancelBusy(false); setShowCancel(false) }
          }} />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MenuOrdersPage() {
  const router = useRouter()
  const { lang, setLang } = useLangStore()
  const brandLogoUrl    = useBrandStore(s => s.logoUrl)
  const brandName       = useBrandStore(s => s.restaurantName)
  const brandNameAr     = useBrandStore(s => s.restaurantNameAr)
  const showLangToggle  = useBrandStore(s => s.showLanguageToggle)
  const ar = lang === 'ar'

  const [orders, setOrders]             = useState<Order[]>([])
  const [feedbackOrderId, setFeedback]  = useState<string | null>(null)
  const [cancelling, setCancelling]     = useState(false)
  const [guestOrderCount, setGuestOrderCount] = useState(0)
  const [tableId, setTableId]           = useState('')
  const [tableNum, setTableNum]         = useState<number | null>(null)
  const [loaded, setLoaded]             = useState(false)
  // Chat
  const [thermalMode, setThermalMode]   = useState(false)
  const [chatOrderId, setChatOrderId]   = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Record<string, { from: 'guest' | 'staff'; text: string }[]>>({})
  const [chatText, setChatText]         = useState('')
  const [chatBusy, setChatBusy]         = useState(false)
  const [unread, setUnread]             = useState<Set<string>>(new Set())

  useEffect(() => {
    applyLangDir(lang)
    initBrand()

    const count = parseInt(typeof window !== 'undefined' ? localStorage.getItem('almanzil_guest_order_count') || '0' : '0')
    setGuestOrderCount(count)

    const storedTableId  = localStorage.getItem('almanzil_table_id')
    const storedTableNum = localStorage.getItem('almanzil_table_num')
    if (storedTableId) setTableId(storedTableId)
    if (storedTableNum) setTableNum(parseInt(storedTableNum) || null)

    // Load orders from localStorage + API
    const storedIds: string[] = (() => {
      try { return JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]') } catch { return [] }
    })()

    const fetchOrders = async () => {
      const live: Order[] = []
      const deadIds: string[] = []

      if (storedIds.length) {
        const results = await Promise.allSettled(storedIds.slice(0, 10).map(id => api.get(`/orders/${id}`)))
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const o: Order = r.value.data
            const isAbandoned = o.stripeIntentId && !o.paymentMethod && o.paymentStatus === 'UNPAID'
            const isDone = o.status === 'CANCELLED' || (o.status === 'DELIVERED' && o.paymentStatus === 'PAID') || isAbandoned
            if (!isDone) live.push(o)
            else deadIds.push(storedIds[i])
          } else {
            deadIds.push(storedIds[i])
          }
        })
        if (deadIds.length) {
          localStorage.setItem('almanzil_order_ids', JSON.stringify(storedIds.filter(id => !deadIds.includes(id))))
        }
      }

      // Also check by session token (orders placed by staff for this guest)
      try {
        const sessionToken = sessionStorage.getItem('almanzil_tab_token')
        if (sessionToken) {
          const r = await api.get(`/orders/by-session/${sessionToken}`)
          const serverOrders: Order[] = r.data ?? []
          const existing = new Set(live.map(o => o.id))
          for (const o of serverOrders) {
            if (!existing.has(o.id) && o.status !== 'CANCELLED' && !(o.status === 'DELIVERED' && o.paymentStatus === 'PAID'))
              live.push(o)
          }
        }
      } catch {}

      // Logged-in user orders — scoped to current table session only
      try {
        const token = localStorage.getItem('token')
        const currentTableId = localStorage.getItem('almanzil_table_id')
        if (token) {
          const r = await api.get('/orders/mine')
          const myOrders: Order[] = r.data ?? []
          const existing = new Set(live.map(o => o.id))
          for (const o of myOrders) {
            // Only include orders that belong to the current table (or takeaway if no table)
            const sameTable = currentTableId ? o.table?.id === currentTableId : !o.table
            if (!existing.has(o.id) && sameTable && o.status !== 'CANCELLED' && !(o.status === 'DELIVERED' && o.paymentStatus === 'PAID'))
              live.push(o)
          }
        }
      } catch {}

      setOrders(live)
      setLoaded(true)

      // If no orders at all, bounce back to menu
      if (!live.length) router.replace('/menu')
    }

    fetchOrders()
    api.get('/settings').then(r => setThermalMode(!!r.data?.thermalEnabled)).catch(() => {})
  }, [lang, router])

  // Socket — live updates
  useEffect(() => {
    const socket = getSocket()
    const handler = (updated: Order) => {
      let statusChanged: { to: string; id: string } | null = null
      let billPaid: string | null = null
      setOrders(prev => {
        const idx = prev.findIndex(o => o.id === updated.id)
        if (idx < 0) return prev
        const old = prev[idx]
        if (old.status !== updated.status) statusChanged = { to: updated.status, id: updated.id }
        // Feedback fires when bill is settled — not when food is delivered
        if (old.paymentStatus !== 'PAID' && updated.paymentStatus === 'PAID') billPaid = updated.id
        const next = [...prev]; next[idx] = updated; return next
      })
      setTimeout(() => {
        if (statusChanged) {
          if (statusChanged.to === 'ACCEPTED')  notify.order.accepted('Your order')
          if (statusChanged.to === 'PREPARING') notify.order.preparing('Your order')
          if (statusChanged.to === 'READY')     notify.order.readyGuest()
          if (statusChanged.to === 'CANCELLED') notify.order.cancelled()
        }
        if (billPaid) setFeedback(billPaid)
      }, 0)
    }
    const onMessage = (payload: { orderId: string; message: string; staffName?: string }) => {
      setChatMessages(prev => ({
        ...prev,
        [payload.orderId]: [...(prev[payload.orderId] ?? []), { from: 'staff', text: payload.message }],
      }))
      // Mark as unread if chat isn't open for this order
      setChatOrderId(current => {
        if (current !== payload.orderId) setUnread(u => new Set([...u, payload.orderId]))
        return current
      })
      notify.info(payload.message, '💬 Staff replied')
    }

    socket.on('order:updated', handler)
    socket.on('order:ready', handler)
    socket.on('order:message', onMessage)
    return () => {
      socket.off('order:updated', handler)
      socket.off('order:ready', handler)
      socket.off('order:message', onMessage)
    }
  }, [])

  const cancelOrder = async (orderId: string, reason: string) => {
    setCancelling(true)
    try {
      await api.post(`/orders/${orderId}/cancel`, { cancelReason: reason })
      setOrders(prev => {
        const next = prev.filter(o => o.id !== orderId)
        try {
          const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
          localStorage.setItem('almanzil_order_ids', JSON.stringify(ids.filter(id => id !== orderId)))
        } catch {}
        if (!next.length) router.replace('/menu')
        return next
      })
      notify.info(`Order cancelled — ${reason}`)
    } catch {
      notify.error('Could not cancel — please ask a staff member')
    } finally {
      setCancelling(false)
    }
  }

  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0)
  const hasReady   = orders.some(o => o.status === 'READY')
  const allDineIn  = orders.every(o => o.type === 'DINE_IN')

  // Build back-to-menu URL preserving table context
  const menuUrl = tableId ? `/menu?qr=table-${tableNum ?? ''}&new=1` : '/menu?new=1'

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#080808' }}>
      <ForceDark />
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'var(--brand)' }} />
    </div>
  )

  return (
    <>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#080808' }}>
        <ForceDark />
        {/* Brand top line */}
        <div style={{ height: 2, background: 'linear-gradient(to right, transparent, var(--brand) 30%, var(--brand) 70%, transparent)' }} />

        {/* Header */}
        <div className="px-4 h-14 flex items-center justify-between sticky top-0 z-10 border-b"
          style={{ backgroundColor: 'rgba(8,8,8,0.9)', borderColor: '#1a1a1a', backdropFilter: 'blur(12px)' }}>
          <Link href="/" className="flex items-center gap-2">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogoUrl} alt="logo" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>
                <UtensilsCrossed size={14} className="text-[var(--brand)]" />
              </div>
            )}
            <span className="font-bold text-sm text-white">{ar && brandNameAr ? brandNameAr : brandName}</span>
          </Link>
          <div className="flex items-center gap-2">
            {hasReady ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full animate-pulse"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                {allDineIn ? '🔔 Ready!' : '📦 Ready!'}
              </span>
            ) : (
              <span className="text-xs font-semibold text-gray-400">{t(lang, 'menu.yourOrder')}</span>
            )}
            {showLangToggle && (
              <button onClick={() => {
                const next: Lang = ar ? 'en' : 'ar'
                setLang(next)
                const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null
                syncLangToServer(next, tk)
              }}
                className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all"
                style={{ backgroundColor: '#0d0d0d', color: ar ? 'var(--brand)' : '#555', border: '1px solid #1e1e1e' }}>
                {ar ? 'EN' : 'ع'}
              </button>
            )}
            <Link href={menuUrl} className="flex items-center gap-1 ml-1 transition-colors"
              style={{ color: 'var(--brand)' }}>
              <ChevronLeft size={16} />
              <span className="text-xs font-semibold">{t(lang, 'menu.back')}</span>
            </Link>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4 pb-24 space-y-3">
          {/* Summary strip */}
          {orders.length > 0 && (
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.12) 0%, rgba(var(--brand-rgb),0.04) 100%)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
              <div>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'rgba(var(--brand-rgb),0.6)' }}>
                  {orders.length} {orders.length !== 1 ? t(lang, 'menu.ordersActivePl') : t(lang, 'menu.ordersActiveCount')}
                </p>
                <p className="text-[17px] font-black text-white leading-tight">
                  AED <span style={{ color: 'var(--brand)' }}>{grandTotal.toFixed(2)}</span>
                </p>
              </div>
              <div className="text-right">
                {orders.every(o => o.paymentStatus === 'PAID')
                  ? <span className="text-xs font-bold text-green-400 flex items-center gap-1"><CheckCircle size={12} /> {t(lang, 'menu.confirmed')}</span>
                  : <span className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--brand)' }}>💵 {t(lang, 'menu.payAtExit')}</span>}
              </div>
            </div>
          )}

          {/* Order cards */}
          {orders.map(o => (
            <OrderTrackCard key={o.id} o={o} lang={lang} thermalMode={thermalMode}
              onCancel={reason => cancelOrder(o.id, reason)}
              onOpenChat={id => { setChatOrderId(id); setUnread(u => { const n = new Set(u); n.delete(id); return n }) }}
              hasUnread={unread.has(o.id)} />
          ))}

          {/* Order more CTA */}
          <div className="rounded-2xl p-4" style={{ border: '1px solid rgba(var(--brand-rgb),0.25)', backgroundColor: 'rgba(var(--brand-rgb),0.04)' }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--brand)' }}>{t(lang, 'cart.wantToAddMore')}</p>
            <p className="text-xs mb-3" style={{ color: 'rgba(var(--brand-rgb),0.5)' }}>
              {allDineIn ? t(lang, 'menu.allItemsToTable') : t(lang, 'menu.addToExisting')}
            </p>
            <Link href={menuUrl}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-center flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              {t(lang, 'cart.orderMoreItems')}
            </Link>
          </div>

          {/* Signup nudge for guests with multiple orders */}
          {guestOrderCount >= 2 && !orders[0]?.userId && (
            <div className="rounded-2xl p-4" style={{ border: '1px solid #1e1e1e' }}>
              <p className="text-sm font-bold text-white mb-1">{t(lang, 'menu.saveOrderHistory')}</p>
              <p className="text-xs text-gray-500 mb-3">{t(lang, 'menu.saveOrderHistorySub')}</p>
              <div className="flex gap-2">
                <Link href="/login?redirect=/menu/orders&tab=signup"
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center"
                  style={{ backgroundColor: 'var(--brand)', color: '#000' }}>{t(lang, 'menu.signUpFree')}</Link>
                <Link href="/login?redirect=/menu/orders"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
                  style={{ border: '1px solid rgba(var(--brand-rgb),0.4)', color: 'var(--brand)' }}>{t(lang, 'nav.signIn')}</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {feedbackOrderId && (
        <FeedbackModal orderId={feedbackOrderId} onClose={() => setFeedback(null)} />
      )}

      {/* ── Chat bottom sheet ── */}
      {chatOrderId && (() => {
        const order = orders.find(o => o.id === chatOrderId)
        const msgs  = chatMessages[chatOrderId] ?? []
        const orderLabel = order
          ? (order.type === 'TAKEAWAY' ? `Token #${order.tokenNumber}` : (order.table?.name ?? `Table ${order.table?.tableNumber}`))
          : 'Your order'

        const sendHelp = async (text: string) => {
          setChatBusy(true)
          try {
            await api.post(`/orders/${chatOrderId}/help`, { message: text })
            setChatMessages(prev => ({
              ...prev,
              [chatOrderId]: [...(prev[chatOrderId] ?? []), { from: 'guest', text }],
            }))
            setChatText('')
          } catch { /* silent */ } finally { setChatBusy(false) }
        }

        const isOrderDelayed = order?.expectedReadyAt
          ? new Date(order.expectedReadyAt).getTime() < Date.now()
          : false
        const QUICK_OPTIONS = [
          ...(isOrderDelayed ? ['My order is taking too long'] : []),
          'Wrong item received',
          'I need cutlery / napkins',
          'Check please',
        ]

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setChatOrderId(null)}>
            <div className="rounded-t-3xl flex flex-col overflow-hidden"
              style={{ backgroundColor: '#0d0d0d', border: '1px solid #1e1e1e', maxHeight: '70vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Handle + header */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ background: '#333' }} />
              </div>
              <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(var(--brand-rgb),0.12)' }}>
                  <MessageCircle size={15} style={{ color: 'var(--brand)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Chat with staff</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{orderLabel}</p>
                </div>
                <button onClick={() => setChatOrderId(null)} className="p-1.5 rounded-lg" style={{ color: '#555' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Quick help buttons */}
              {msgs.length === 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {QUICK_OPTIONS.map(q => (
                    <button key={q} onClick={() => sendHelp(q)} disabled={chatBusy}
                      className="text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #2a2a2a', color: '#888' }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Message thread */}
              {msgs.length > 0 && (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ borderTop: '1px solid #1a1a1a' }}>
                  {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.from === 'guest' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%] px-3 py-2 rounded-2xl text-[12px] font-medium"
                        style={m.from === 'guest'
                          ? { background: 'var(--brand)', color: '#000', borderBottomRightRadius: 4 }
                          : { background: '#1e1e1e', color: '#ddd', borderBottomLeftRadius: 4 }}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Text input */}
              <div className="px-4 py-4 flex gap-2" style={{ borderTop: '1px solid #1a1a1a' }}>
                <input
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && chatText.trim() && sendHelp(chatText.trim())}
                  placeholder="Type a message…"
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#e5e5e5' }}
                />
                <button onClick={() => chatText.trim() && sendHelp(chatText.trim())}
                  disabled={chatBusy || !chatText.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  style={{ background: 'var(--brand)' }}>
                  {chatBusy
                    ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                    : <Send size={14} style={{ color: '#000' }} />}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
