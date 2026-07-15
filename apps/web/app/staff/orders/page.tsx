'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Clock, Package, Utensils, RefreshCw, Banknote, CreditCard,
  ChefHat, CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Users, Receipt, ArrowRight, BadgeCheck, WifiOff, Wifi, Trash2, Plus, Search, X, Send,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { ModalBackdrop } from '@/components/ModalBackdrop'

interface Order {
  id: string; type: string; status: string; total: number; vatAmount: number; subtotal: number
  paymentMethod?: string | null; paymentStatus?: string; stripeIntentId?: string | null
  tokenNumber?: number; notes?: string; createdAt: string; clientIp?: string | null
  isRush?: boolean
  table?: { id: string; tableNumber: number; name?: string }
  user?: { name: string } | null
  items: { quantity: number; unitPrice: number; notes?: string | null; menuItem: { id: string; name: string; prepTimeMins?: number }; modifiers?: { name: string; priceAdd: number }[] }[]
}

const NEXT_STATUS: Record<string, string>  = { PENDING: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' }
const NEXT_LABEL: Record<string, string>   = { PENDING: 'Accept & Send to Kitchen', ACCEPTED: 'Start Preparing', PREPARING: 'Mark Ready', READY: 'Mark Served' }
const NEXT_LABEL_SHORT: Record<string, string> = { PENDING: 'Accept', ACCEPTED: 'Preparing', PREPARING: 'Ready', READY: 'Served' }
const NEXT_COLOR: Record<string, string>   = {
  PENDING:   '',   // handled inline with var(--brand)
  ACCEPTED:  'bg-blue-500 hover:bg-blue-600 text-white',
  PREPARING: 'bg-orange-500 hover:bg-orange-600 text-white',
  READY:     'bg-green-500 hover:bg-green-600 text-white',
}

function formatDuration(ms: number) {
  const totalSecs = Math.floor(Math.abs(ms) / 1000)
  if (totalSecs < 60) return `${totalSecs}s`
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins < 60) return `${mins}m ${secs}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ${secs}s`
}

function useOrderTimer(createdAt: string, estMins: number) {
  const estMs = estMins * 60 * 1000
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(createdAt).getTime())
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - new Date(createdAt).getTime()), 1000)
    return () => clearInterval(t)
  }, [createdAt])
  const remaining = estMs - elapsed
  const overdue = remaining < 0
  const label = overdue ? `-${formatDuration(remaining)}` : formatDuration(remaining)
  return { label, overdue, isUrgent: overdue }
}

// ── Compact order card (Kanban columns) ──────────────────────────────────────
const CANCELLABLE_BY_ROLE: Record<string, string[]> = {
  STAFF:   ['PENDING'],
  MANAGER: ['PENDING', 'ACCEPTED', 'PREPARING'],
  OWNER:   ['PENDING', 'ACCEPTED', 'PREPARING'],
}

function OrderCard({ order, onAdvance, onCancel, onVoid, onAddItems, onRush, onReply, hasGuestMessage, busy, isNew, userRole, hasKitchenPerm, thermalEnabled }: {
  order: Order
  onAdvance: (id: string, status: string) => void
  onCancel?: (id: string) => void
  onVoid?:   (id: string) => void
  onAddItems?: (id: string) => void
  onRush?: (id: string, isRush: boolean) => void
  onReply?: (id: string) => void
  hasGuestMessage?: boolean
  busy: boolean
  isNew?: boolean
  userRole?: string
  hasKitchenPerm?: boolean
  thermalEnabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label: timeLabel, overdue, isUrgent } = useOrderTimer(order.createdAt, estMins)
  // Kitchen-permission users can only advance kitchen stages (ACCEPTED→PREPARING→READY)
  const KITCHEN_STAGES = ['ACCEPTED', 'PREPARING']
  const canAdvance = !hasKitchenPerm || KITCHEN_STAGES.includes(order.status)
  // Skip mode: PENDING jumps to READY (prints KOT); waiter marks ACCEPTED→READY when chef says done, then READY→DELIVERED after serving
  const SKIP_STATUS: Record<string, string> = { PENDING: 'READY', ACCEPTED: 'READY', READY: 'DELIVERED' }
  const SKIP_LABEL: Record<string, string>  = { PENDING: 'Accept & Ready', ACCEPTED: 'Ready to Serve', READY: 'Mark Served' }
  const SKIP_LABEL_SHORT: Record<string, string> = { PENDING: 'Accept', ACCEPTED: 'Ready', READY: 'Served' }
  const nextStatus = canAdvance ? (thermalEnabled ? (SKIP_STATUS[order.status] ?? NEXT_STATUS[order.status]) : NEXT_STATUS[order.status]) : undefined
  const nextLabel       = thermalEnabled ? (SKIP_LABEL[order.status]       ?? NEXT_LABEL[order.status])       : NEXT_LABEL[order.status]
  const nextLabelShort  = thermalEnabled ? (SKIP_LABEL_SHORT[order.status] ?? NEXT_LABEL_SHORT[order.status]) : NEXT_LABEL_SHORT[order.status]
  const next = nextStatus
  const tableLabel = order.type === 'DINE_IN'
    ? (order.table?.name ?? (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : 'Dine-in'))
    : `#${order.tokenNumber}`
  const hasNotes = order.items.some(i => i.notes) || !!order.notes
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)
  const summaryText = order.items.map(i => `${i.quantity}× ${i.menuItem.name}`).join(', ')

  const accentColor =
    order.status === 'PENDING'   ? '#eab308' :
    order.status === 'ACCEPTED'  ? '#3b82f6' :
    order.status === 'PREPARING' ? '#3b82f6' :
    order.status === 'READY'     ? '#22c55e' : '#6b7280'

  const actionBtnClass = 'flex-1 py-2.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.98]'

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${order.isRush ? '#ef4444' : isUrgent ? '#ef4444' : 'var(--card-border)'}`,
        ...(isNew ? { boxShadow: '0 0 0 2px var(--brand), 0 0 16px rgba(var(--brand-rgb),0.2)' } : {}),
      }}
    >
      <div className="flex">
        {/* Accent bar */}
        <div style={{ width: 3, background: accentColor, flexShrink: 0, borderRadius: '12px 0 0 0' }} />

        <div className="flex flex-col flex-1 min-w-0">
          {isUrgent && <div style={{ height: 2, background: '#ef4444' }} />}

          {/* ── Fixed header (always visible, always same height) ── */}
          <button
            onClick={() => setExpanded(p => !p)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
          >
            {/* type icon */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
              order.type === 'DINE_IN' ? 'bg-orange-500/10' : 'bg-blue-500/10'
            }`}>
              {order.type === 'DINE_IN'
                ? <Utensils size={12} className="text-orange-400" />
                : <Package size={12} className="text-blue-400" />}
            </div>

            {/* label + summary */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[13px] leading-tight" style={{ color: 'var(--text-primary)' }}>{tableLabel}</span>
                {order.isRush && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 animate-pulse"
                    style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}>
                    ⚡ RUSH
                  </span>
                )}
                {hasGuestMessage && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 animate-bounce"
                    style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }}>
                    💬 Help
                  </span>
                )}
                <span className={`text-[9px] font-bold flex items-center gap-0.5 flex-shrink-0 ${overdue ? 'text-red-500' : 'text-green-400'}`}>
                  <Clock size={7} />{overdue ? timeLabel : `${timeLabel} left`}
                </span>
                {hasNotes && <span className="text-[9px] text-amber-400 flex-shrink-0">✏</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{summaryText}</p>
              </div>
            </div>

            {/* total + chevron */}
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className="text-[13px] font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
                AED {Number(order.total).toFixed(2)}
              </span>
              <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {totalQty} item{totalQty !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
              </span>
            </div>
          </button>

          {/* ── Accordion: item details ── */}
          {expanded && (
            <div className="px-3 pb-2.5 space-y-1.5" style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10 }}>
              {order.items.map((item, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span className="text-[10px] font-black text-orange-400 flex-shrink-0">{item.quantity}×</span>
                      <span className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{item.menuItem.name}</span>
                    </div>
                    <span className="text-[10px] flex-shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
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
                    <div className="mt-1 rounded px-2 py-1"
                      style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)' }}>
                      <span className="text-[10px] text-amber-400">{item.notes}</span>
                    </div>
                  )}
                </div>
              ))}
              {order.notes && (
                <div className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 mt-0.5"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle size={10} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] text-red-400 font-semibold leading-tight">{order.notes}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Action row ── */}
          {(next || onVoid || onAddItems || onRush || (onReply && hasGuestMessage)) && (
            <div className="px-3 pb-3 pt-2 space-y-2" style={{ borderTop: '1px solid var(--card-border)' }}>
              {/* Primary advance — full width, shorter label on mobile */}
              {next && (
                <button onClick={() => onAdvance(order.id, next)} disabled={busy}
                  className={`w-full py-2.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.98] ${order.status === 'PENDING' ? '' : NEXT_COLOR[order.status]}`}
                  style={order.status === 'PENDING' ? { backgroundColor: 'var(--brand)', color: '#000' } : undefined}>
                  {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                  <span className="hidden sm:inline">{nextLabel}</span>
                  <span className="sm:hidden">{nextLabelShort}</span>
                </button>
              )}
              {/* Secondary actions — compact row */}
              {(onAddItems || onCancel || onVoid || onRush || (onReply && hasGuestMessage)) && (
                <div className="flex gap-1.5">
                  {onAddItems && (thermalEnabled ? ['PENDING','READY'].includes(order.status) : ['PENDING','ACCEPTED','PREPARING'].includes(order.status)) && (
                    <button onClick={() => onAddItems(order.id)} disabled={busy}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                      style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}
                      title="Add more items">
                      <Plus size={11} /> Add
                    </button>
                  )}
                  {onCancel && userRole && (CANCELLABLE_BY_ROLE[userRole] ?? []).includes(order.status) && (
                    <button onClick={() => onCancel(order.id)} disabled={busy}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                      style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
                      <X size={11} /> Cancel
                    </button>
                  )}
                  {onVoid && ['MANAGER','OWNER'].includes(userRole ?? '') && ['READY','DELIVERED'].includes(order.status) && (
                    <button onClick={() => onVoid(order.id)} disabled={busy}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all disabled:opacity-50"
                      style={{ border: '1px solid rgba(234,179,8,0.4)', color: '#eab308' }}>
                      Void
                    </button>
                  )}
                  {onReply && hasGuestMessage && (
                    <button onClick={() => onReply(order.id)} disabled={busy}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                      style={{ backgroundColor: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                      💬 Reply
                    </button>
                  )}
                  {onRush && !['DELIVERED','CANCELLED'].includes(order.status) && (
                    <button onClick={() => onRush(order.id, !order.isRush)} disabled={busy}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                      style={order.isRush
                        ? { backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171' }
                        : { border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                      ⚡ {order.isRush ? 'Rushed' : 'Rush'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Payment method modal ──────────────────────────────────────────────────────
const CASH_NOTES = [5, 10, 20, 50, 100, 200, 500]

// ── Completed order card ──────────────────────────────────────────────────────
const TIMELINE_STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED']
const STEP_LABEL: Record<string, string> = { PENDING: 'Placed', ACCEPTED: 'Accepted', PREPARING: 'Cooking', READY: 'Ready', DELIVERED: 'Served' }

function CompletedCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false)
  const tableLabel = order.table?.name ?? (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : null) ?? 'Dine-in'
  const label = order.type === 'DINE_IN' ? tableLabel : `Takeaway #${order.tokenNumber}`
  const time = new Date(order.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)
  const doneIdx = TIMELINE_STEPS.indexOf('DELIVERED')

  return (
    <div className="rounded-2xl border overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', minWidth: 240 }}>
      <button onClick={() => setExpanded(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
          <CheckCircle size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
            {order.user && <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">member</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{time} · {totalItems} item{totalItems !== 1 ? 's' : ''}</span>
            {order.paymentMethod === 'CARD'
              ? <span className="text-[10px] font-semibold text-blue-400 flex items-center gap-0.5"><CreditCard size={8} />Card</span>
              : <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-0.5"><Banknote size={8} />Cash</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>AED {Number(order.total).toFixed(2)}</span>
          {expanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        </div>
      </button>

      {/* Mini timeline strip */}
      <div className="px-4 pb-2.5" style={{ borderTop: '1px solid var(--card-border)', paddingTop: 8 }}>
        {/* connector row */}
        <div className="flex items-center mb-1">
          {TIMELINE_STEPS.map((step, i) => {
            const done = i <= doneIdx
            return (
              <div key={step} className="flex items-center flex-1 min-w-0">
                <div className="w-3 h-3 rounded-full flex-shrink-0 relative z-10"
                  style={{ backgroundColor: done ? '#22c55e' : 'var(--card-border)' }} />
                {i < TIMELINE_STEPS.length - 1 && (
                  <div className="h-0.5 flex-1" style={{ backgroundColor: i < doneIdx ? '#22c55e' : 'var(--card-border)' }} />
                )}
              </div>
            )
          })}
        </div>
        {/* label row */}
        <div className="flex">
          {TIMELINE_STEPS.map((step, i) => {
            const done = i <= doneIdx
            return (
              <div key={step} className="flex-1 min-w-0 flex justify-center">
                <span className="text-[8px] font-semibold text-center" style={{ color: done ? '#22c55e' : 'var(--text-muted)', opacity: done ? 1 : 0.5 }}>
                  {STEP_LABEL[step]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-1 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.quantity}×</span> {item.menuItem.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>{(item.quantity * (Number(item.unitPrice) + (item.modifiers ?? []).reduce((s, m) => s + Number(m.priceAdd), 0))).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-2 mt-1" style={{ borderTop: '1px solid var(--card-border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ color: 'var(--text-muted)' }}>AED {Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>VAT</span>
            <span style={{ color: 'var(--text-muted)' }}>AED {Number(order.vatAmount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-black pt-1">
            <span style={{ color: 'var(--text-primary)' }}>Total</span>
            <span style={{ color: 'var(--text-primary)' }}>AED {Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cancel reason modal ───────────────────────────────────────────────────────
const CANCEL_REASONS = [
  'Customer changed mind',
  'Item out of stock',
  'Kitchen issue',
  'Duplicate order',
  'Other',
]

const VOID_REASONS = [
  'Wrong item served',
  'Quality issue',
  'Allergy concern',
  'Customer complaint',
  'Management decision',
  'Other',
]

function CancelReasonModal({ order, onConfirm, onClose, busy, mode = 'cancel' }: {
  order: Order
  onConfirm: (id: string, reason: string) => void
  onClose: () => void
  busy: boolean
  mode?: 'cancel' | 'void'
}) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  const finalReason = reason === 'Other' ? custom.trim() : reason

  const isVoid = mode === 'void'
  const reasons = isVoid ? VOID_REASONS : CANCEL_REASONS
  const canReorder = !isVoid && order.items.length > 0
  const accentColor = isVoid ? '#eab308' : '#dc2626'
  const accentBg   = isVoid ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)'
  const accentBorder = isVoid ? 'rgba(234,179,8,0.5)' : 'rgba(239,68,68,0.5)'

  return (
    <ModalBackdrop onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-base mb-0.5" style={{ color: 'var(--text-primary)' }}>
            {isVoid ? 'Void Order?' : 'Cancel Order?'}
          </h3>
          {isVoid && (
            <p className="text-[11px] mb-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
              Voiding removes this order from the bill. Use for served items with a quality issue.
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {order.type === 'DINE_IN'
              ? `Table ${order.table?.tableNumber ?? ''} · AED ${Number(order.total).toFixed(2)}`
              : `Takeaway #${order.tokenNumber} · AED ${Number(order.total).toFixed(2)}`}
          </p>
        </div>

        <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: 'var(--muted-bg)' }}>
          {order.items.map((item, i) => (
            <p key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.quantity}× {item.menuItem.name}</p>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Reason for {isVoid ? 'voiding' : 'cancelling'}
          </p>
          {reasons.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all"
              style={reason === r
                ? { backgroundColor: accentBg, border: `1.5px solid ${accentBorder}`, color: accentColor }
                : { backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
              {r}
            </button>
          ))}
          {reason === 'Other' && (
            <input autoFocus type="text" placeholder="Describe the reason..."
              value={custom} onChange={e => setCustom(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button onClick={() => finalReason && onConfirm(order.id, finalReason)} disabled={busy || !finalReason}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: accentColor }}>
            {busy ? (isVoid ? 'Voiding…' : 'Cancelling…') : (isVoid ? 'Confirm Void' : 'Confirm Cancel')}
          </button>
          {canReorder && (
            <button onClick={() => finalReason && onConfirm(order.id, finalReason + ' [reorder-requested]')}
              disabled={busy || !finalReason}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ border: '1px solid rgba(var(--brand-rgb),0.4)', color: 'var(--brand)', backgroundColor: 'transparent' }}>
              Cancel & Place Same Order Again
            </button>
          )}
          <button onClick={onClose} disabled={busy}
            className="w-full py-2 text-sm transition-colors" style={{ color: 'var(--text-muted)' }}>
            Go Back
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({
  title, dotColor, count, children, emptyIcon, emptyText,
}: {
  title: string
  dotColor: string
  count: number
  children: React.ReactNode
  emptyIcon: React.ReactNode
  emptyText: string
}) {
  return (
    <div className="flex flex-col min-w-0 rounded-2xl overflow-hidden"
      style={{ flex: '1 1 0', background: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>

      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `2px solid ${dotColor}33`, background: `${dotColor}0d` }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }} />
        <span className="text-[11px] font-bold tracking-wide uppercase flex-1"
          style={{ color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {count > 0 && (
          <span className="text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: dotColor, color: '#000' }}>
            {count}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 p-3 pb-4"
        style={{ scrollbarWidth: 'thin' }}>
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-16 gap-2">
            <span style={{ color: 'var(--text-muted)', opacity: 0.25 }}>{emptyIcon}</span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)', opacity: 0.35 }}>{emptyText}</span>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ── Add Items Modal ───────────────────────────────────────────────────────────
interface MenuItem { id: string; name: string; price: number; categoryName?: string; isAvailable: boolean }
interface AddModifierOption { id: string; name: string; priceAdd: number; isDefault: boolean }
interface AddModifierGroup { id: string; name: string; required: boolean; minSelect: number; maxSelect: number; options: AddModifierOption[] }
interface AddMenuItem { id: string; name: string; price: number; categoryId: string; isAvailable: boolean; modifierGroups?: AddModifierGroup[] }
interface AddCartEntry { menuItemId: string; quantity: number; optionIds: string[]; label: string }

function AddItemsModal({ order, onClose, onSaved }: {
  order: Order; onClose: () => void; onSaved: (updated: Order) => void
}) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [menuItems, setMenuItems] = useState<AddMenuItem[]>([])
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  const [cart, setCart] = useState<AddCartEntry[]>([])
  const [modSheet, setModSheet] = useState<{ item: AddMenuItem; selections: Record<string, string[]> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/menu/categories'),
      api.get('/menu/items?includeUnavailable=false'),
    ]).then(([catRes, itemRes]) => {
      const cats = catRes.data?.data ?? catRes.data ?? []
      const items = (itemRes.data?.data ?? itemRes.data ?? []).filter((i: AddMenuItem) => i.isAvailable)
      setCategories(cats)
      setMenuItems(items)
      setActiveCatId(cats[0]?.id ?? null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cartCount = cart.reduce((s, e) => s + e.quantity, 0)
  const cartTotal = cart.reduce((s, e) => {
    const item = menuItems.find(i => i.id === e.menuItemId)
    if (!item) return s
    const modExtra = (item.modifierGroups ?? []).flatMap(g => g.options).filter(o => e.optionIds.includes(o.id)).reduce((a, o) => a + Number(o.priceAdd), 0)
    return s + (Number(item.price) + modExtra) * e.quantity
  }, 0)

  function cartAddSimple(item: AddMenuItem) {
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds: [], label: '' }])
  }
  function cartRemoveEntry(idx: number) {
    setCart(c => {
      const n = [...c]
      if (n[idx].quantity > 1) { n[idx] = { ...n[idx], quantity: n[idx].quantity - 1 }; return n }
      n.splice(idx, 1); return n
    })
  }
  function cartAddEntry(idx: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n })
  }
  function openModSheet(item: AddMenuItem) {
    const defaults: Record<string, string[]> = {}
    for (const g of item.modifierGroups ?? []) {
      defaults[g.id] = g.options.filter(o => o.isDefault).map(o => o.id)
    }
    setModSheet({ item, selections: defaults })
  }
  function confirmModSheet() {
    if (!modSheet) return
    const { item, selections } = modSheet
    const optionIds = Object.values(selections).flat()
    const labelParts: string[] = []
    for (const g of item.modifierGroups ?? []) {
      const chosen = g.options.filter(o => selections[g.id]?.includes(o.id))
      if (chosen.length) labelParts.push(chosen.map(o => o.name).join(', '))
    }
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds, label: labelParts.join(' · ') }])
    setModSheet(null)
  }
  function toggleModOption(groupId: string, optionId: string, maxSelect: number) {
    setModSheet(s => {
      if (!s) return s
      const prev = s.selections[groupId] ?? []
      let next: string[]
      if (prev.includes(optionId)) {
        next = prev.filter(id => id !== optionId)
      } else if (maxSelect === 1) {
        next = [optionId]
      } else {
        next = prev.length < maxSelect ? [...prev, optionId] : prev
      }
      return { ...s, selections: { ...s.selections, [groupId]: next } }
    })
  }

  const tableLabel = order.type === 'DINE_IN'
    ? (order.table?.name ?? `Table ${order.table?.tableNumber}`)
    : `#${order.tokenNumber}`

  const submit = async () => {
    if (!cart.length) return
    setSaving(true); setError('')
    try {
      // Build modifier payloads: look up name+priceAdd from menuItems
      const items = cart.map(e => {
        const item = menuItems.find(i => i.id === e.menuItemId)!
        const allOpts = (item.modifierGroups ?? []).flatMap(g => g.options)
        const modifiers = e.optionIds.map(oid => {
          const opt = allOpts.find(o => o.id === oid)!
          return { optionId: oid, name: opt.name, priceAdd: Number(opt.priceAdd) }
        })
        return { menuItemId: e.menuItemId, quantity: e.quantity, ...(modifiers.length ? { modifiers } : {}) }
      })
      const { data } = await api.post(`/orders/${order.id}/items`, { items })
      onSaved(data); onClose()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to add items')
    } finally { setSaving(false) }
  }

  const visibleItems = (() => {
    const q = menuSearch.trim().toLowerCase()
    return q ? menuItems.filter(i => i.name.toLowerCase().includes(q)) : menuItems.filter(i => i.categoryId === activeCatId)
  })()

  return (
    <ModalBackdrop onClick={onClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--card-bg)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--card-border)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Add Items</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tableLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search + categories + list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input value={menuSearch}
                  onChange={e => { setMenuSearch(e.target.value); if (e.target.value) setActiveCatId(null) }}
                  placeholder="Search dishes…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
              </div>

              {/* Category tabs */}
              {!menuSearch && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                  {categories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => setActiveCatId(cat.id)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: activeCatId === cat.id ? 'var(--brand)' : 'var(--muted-bg)',
                        color: activeCatId === cat.id ? '#fff' : 'var(--text-muted)',
                        border: '1px solid var(--card-border)',
                      }}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Items */}
              <div className="space-y-2">
                {visibleItems.length === 0 ? (
                  <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>
                    {menuSearch ? `No results for "${menuSearch}"` : 'No items in this category'}
                  </p>
                ) : visibleItems.map(item => {
                  const hasModifiers = (item.modifierGroups ?? []).length > 0
                  const itemEntries = cart.filter(e => e.menuItemId === item.id)
                  const totalQty = itemEntries.reduce((s, e) => s + e.quantity, 0)
                  return (
                    <div key={item.id} className="rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
                      style={{ border: `1px solid ${totalQty > 0 ? 'rgba(var(--brand-rgb),0.3)' : 'var(--card-border)'}`, backgroundColor: totalQty > 0 ? 'rgba(var(--brand-rgb),0.04)' : 'var(--card-bg)' }}
                      onClick={() => hasModifiers ? openModSheet(item) : cartAddSimple(item)}>
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            AED {Number(item.price).toFixed(2)}{hasModifiers && <span className="ml-1 opacity-60">· customisable</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {hasModifiers ? (
                            <button type="button" onClick={() => openModSheet(item)}
                              className="px-3 h-7 rounded-full text-xs font-semibold"
                              style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                              + Add
                            </button>
                          ) : totalQty > 0 ? (
                            <>
                              <button type="button"
                                onClick={() => { const idx = cart.findLastIndex(e => e.menuItemId === item.id); if (idx >= 0) cartRemoveEntry(idx) }}
                                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>−</button>
                              <span className="w-5 text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{totalQty}</span>
                              <button type="button" onClick={() => cartAddSimple(item)}
                                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>+</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => cartAddSimple(item)}
                              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>+</button>
                          )}
                        </div>
                      </div>
                      {hasModifiers && itemEntries.length > 0 && (
                        <div className="px-3 pb-2 space-y-1">
                          {itemEntries.map((e, idx) => {
                            const globalIdx = cart.indexOf(e)
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <span className="flex-1 truncate">{e.label || 'No extras'} ×{e.quantity}</span>
                                <button type="button" onClick={() => cartRemoveEntry(globalIdx)} className="text-red-400 flex items-center justify-center"><Trash2 size={12} /></button>
                                <button type="button" onClick={() => cartAddEntry(globalIdx)} className="font-bold" style={{ color: 'var(--brand)' }}>+1</button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Cart summary pill */}
              {cartCount > 0 && (
                <div className="rounded-xl p-3 flex items-center justify-between"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                    {cartCount} item{cartCount > 1 ? 's' : ''} added
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>AED {cartTotal.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <button onClick={submit} disabled={saving || cartCount === 0}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--brand)', color: '#fff' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Adding…' : cartCount > 0 ? `Add ${cartCount} item${cartCount > 1 ? 's' : ''} to order` : 'Select items above'}
          </button>
        </div>

        {/* Modifier bottom sheet */}
        {modSheet && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={e => { if (e.target === e.currentTarget) setModSheet(null) }}>
            <div className="rounded-t-2xl overflow-hidden flex flex-col max-h-[80vh]"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{modSheet.item.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>AED {Number(modSheet.item.price).toFixed(2)}</p>
                </div>
                <button type="button" onClick={() => setModSheet(null)} className="text-lg font-bold leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                {(modSheet.item.modifierGroups ?? []).map(group => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
                      {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>Required</span>}
                      {group.maxSelect > 1 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pick up to {group.maxSelect}</span>}
                    </div>
                    <div className="space-y-1.5">
                      {group.options.map(opt => {
                        const selected = (modSheet.selections[group.id] ?? []).includes(opt.id)
                        return (
                          <button key={opt.id} type="button" onClick={() => toggleModOption(group.id, opt.id, group.maxSelect)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                            style={{ border: `1px solid ${selected ? 'var(--brand)' : 'var(--card-border)'}`, backgroundColor: selected ? 'rgba(var(--brand-rgb),0.06)' : 'var(--muted-bg)' }}>
                            <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                              style={{ borderColor: selected ? 'var(--brand)' : 'var(--card-border)', backgroundColor: selected ? 'var(--brand)' : 'transparent' }}>
                              {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.name}</span>
                            {Number(opt.priceAdd) > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>+AED {Number(opt.priceAdd).toFixed(2)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
                {(() => {
                  const missing = (modSheet.item.modifierGroups ?? []).filter(g => g.required && !(modSheet.selections[g.id]?.length))
                  return (
                    <button type="button" onClick={confirmModSheet} disabled={missing.length > 0}
                      className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                      {missing.length > 0 ? `Select ${missing[0].name}` : 'Add to Order'}
                    </button>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  )
}

// ── Staff Place Order Panel ───────────────────────────────────────────────────
// Uses same rich UI as AddItemsModal: all items loaded upfront with modifier groups,
// full search + category tabs, modifier sheet, same cart format.

function StaffPlaceOrderPanel({ tableId, tableName, onClose, onPlaced }: {
  tableId: string; tableName: string; onClose: () => void; onPlaced: () => void
}) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [menuItems, setMenuItems] = useState<AddMenuItem[]>([])
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  const [cart, setCart] = useState<AddCartEntry[]>([])
  const [modSheet, setModSheet] = useState<{ item: AddMenuItem; selections: Record<string, string[]> } | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/menu/categories'),
      api.get('/menu/items?includeUnavailable=false'),
    ]).then(([catRes, itemRes]) => {
      const cats = catRes.data?.data ?? catRes.data ?? []
      const items = (itemRes.data?.data ?? itemRes.data ?? []).filter((i: AddMenuItem) => i.isAvailable)
      setCategories(cats)
      setMenuItems(items)
      setActiveCatId(cats[0]?.id ?? null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cartCount = cart.reduce((s, e) => s + e.quantity, 0)
  const cartTotal = cart.reduce((s, e) => {
    const item = menuItems.find(i => i.id === e.menuItemId)
    if (!item) return s
    const modExtra = (item.modifierGroups ?? []).flatMap(g => g.options).filter(o => e.optionIds.includes(o.id)).reduce((a, o) => a + Number(o.priceAdd), 0)
    return s + (Number(item.price) + modExtra) * e.quantity
  }, 0)

  function cartAddSimple(item: AddMenuItem) {
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds: [], label: '' }])
  }
  function cartRemoveEntry(idx: number) {
    setCart(c => {
      const n = [...c]
      if (n[idx].quantity > 1) { n[idx] = { ...n[idx], quantity: n[idx].quantity - 1 }; return n }
      n.splice(idx, 1); return n
    })
  }
  function cartAddEntry(idx: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n })
  }
  function openModSheet(item: AddMenuItem) {
    const defaults: Record<string, string[]> = {}
    for (const g of item.modifierGroups ?? []) {
      defaults[g.id] = g.options.filter(o => o.isDefault).map(o => o.id)
    }
    setModSheet({ item, selections: defaults })
  }
  function confirmModSheet() {
    if (!modSheet) return
    const { item, selections } = modSheet
    const optionIds = Object.values(selections).flat()
    const labelParts: string[] = []
    for (const g of item.modifierGroups ?? []) {
      const chosen = g.options.filter(o => selections[g.id]?.includes(o.id))
      if (chosen.length) labelParts.push(chosen.map(o => o.name).join(', '))
    }
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds, label: labelParts.join(' · ') }])
    setModSheet(null)
  }
  function toggleModOption(groupId: string, optionId: string, maxSelect: number) {
    setModSheet(s => {
      if (!s) return s
      const prev = s.selections[groupId] ?? []
      let next: string[]
      if (prev.includes(optionId)) {
        next = prev.filter(id => id !== optionId)
      } else if (maxSelect === 1) {
        next = [optionId]
      } else {
        next = prev.length < maxSelect ? [...prev, optionId] : prev
      }
      return { ...s, selections: { ...s.selections, [groupId]: next } }
    })
  }

  const submit = async () => {
    if (!cart.length) return
    setSaving(true); setError('')
    try {
      const items = cart.map(e => {
        const item = menuItems.find(i => i.id === e.menuItemId)!
        const allOpts = (item.modifierGroups ?? []).flatMap(g => g.options)
        const modifiers = e.optionIds.map(oid => {
          const opt = allOpts.find(o => o.id === oid)!
          return { optionId: oid, name: opt.name, priceAdd: Number(opt.priceAdd) }
        })
        return { menuItemId: e.menuItemId, quantity: e.quantity, ...(modifiers.length ? { modifiers } : {}) }
      })
      await api.post(`/orders/table/${tableId}/staff-order`, {
        items,
        notes: notes.trim() || undefined,
      })
      notify.success(`Order placed for ${tableName}`)
      onPlaced()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not place order')
    } finally { setSaving(false) }
  }

  const visibleItems = (() => {
    const q = menuSearch.trim().toLowerCase()
    return q ? menuItems.filter(i => i.name.toLowerCase().includes(q)) : menuItems.filter(i => i.categoryId === activeCatId)
  })()

  return (
    <ModalBackdrop onClick={onClose} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--card-bg)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--card-border)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Place Order</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tableName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search + categories + list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
          ) : (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input value={menuSearch}
                  onChange={e => { setMenuSearch(e.target.value); if (e.target.value) setActiveCatId(null) }}
                  placeholder="Search dishes…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
              </div>

              {!menuSearch && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                  {categories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => setActiveCatId(cat.id)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: activeCatId === cat.id ? 'var(--brand)' : 'var(--muted-bg)',
                        color: activeCatId === cat.id ? '#fff' : 'var(--text-muted)',
                        border: '1px solid var(--card-border)',
                      }}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {visibleItems.length === 0 ? (
                  <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>
                    {menuSearch ? `No results for "${menuSearch}"` : 'No items in this category'}
                  </p>
                ) : visibleItems.map(item => {
                  const hasModifiers = (item.modifierGroups ?? []).length > 0
                  const itemEntries = cart.filter(e => e.menuItemId === item.id)
                  const totalQty = itemEntries.reduce((s, e) => s + e.quantity, 0)
                  return (
                    <div key={item.id} className="rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
                      style={{ border: `1px solid ${totalQty > 0 ? 'rgba(var(--brand-rgb),0.3)' : 'var(--card-border)'}`, backgroundColor: totalQty > 0 ? 'rgba(var(--brand-rgb),0.04)' : 'var(--card-bg)' }}
                      onClick={() => hasModifiers ? openModSheet(item) : cartAddSimple(item)}>
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            AED {Number(item.price).toFixed(2)}{hasModifiers && <span className="ml-1 opacity-60">· customisable</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {hasModifiers ? (
                            <button type="button" onClick={() => openModSheet(item)}
                              className="px-3 h-7 rounded-full text-xs font-semibold"
                              style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                              + Add
                            </button>
                          ) : totalQty > 0 ? (
                            <>
                              <button type="button"
                                onClick={() => { const idx = cart.findLastIndex(e => e.menuItemId === item.id); if (idx >= 0) cartRemoveEntry(idx) }}
                                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>−</button>
                              <span className="w-5 text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{totalQty}</span>
                              <button type="button" onClick={() => cartAddSimple(item)}
                                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>+</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => cartAddSimple(item)}
                              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>+</button>
                          )}
                        </div>
                      </div>
                      {hasModifiers && itemEntries.length > 0 && (
                        <div className="px-3 pb-2 space-y-1">
                          {itemEntries.map((e, idx) => {
                            const globalIdx = cart.indexOf(e)
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <span className="flex-1 truncate">{e.label || 'No extras'} ×{e.quantity}</span>
                                <button type="button" onClick={() => cartRemoveEntry(globalIdx)} className="text-red-400 flex items-center justify-center"><Trash2 size={12} /></button>
                                <button type="button" onClick={() => cartAddEntry(globalIdx)} className="font-bold" style={{ color: 'var(--brand)' }}>+1</button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Order notes */}
              {cartCount > 0 && (
                <div className="space-y-2">
                  <div className="rounded-xl p-3 flex items-center justify-between"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                      {cartCount} item{cartCount > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>AED {cartTotal.toFixed(2)}</span>
                  </div>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Order notes (optional)…"
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <button onClick={submit} disabled={saving || cartCount === 0}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--brand)', color: '#fff' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Placing…' : cartCount > 0 ? `Place order · ${cartCount} item${cartCount > 1 ? 's' : ''}` : 'Select items above'}
          </button>
        </div>

        {/* Modifier bottom sheet */}
        {modSheet && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={e => { if (e.target === e.currentTarget) setModSheet(null) }}>
            <div className="rounded-t-2xl overflow-hidden flex flex-col max-h-[80vh]"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{modSheet.item.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>AED {Number(modSheet.item.price).toFixed(2)}</p>
                </div>
                <button type="button" onClick={() => setModSheet(null)} className="text-lg font-bold leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                {(modSheet.item.modifierGroups ?? []).map(group => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
                      {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>Required</span>}
                      {group.maxSelect > 1 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pick up to {group.maxSelect}</span>}
                    </div>
                    <div className="space-y-1.5">
                      {group.options.map(opt => {
                        const selected = (modSheet.selections[group.id] ?? []).includes(opt.id)
                        return (
                          <button key={opt.id} type="button" onClick={() => toggleModOption(group.id, opt.id, group.maxSelect)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                            style={{ border: `1px solid ${selected ? 'var(--brand)' : 'var(--card-border)'}`, backgroundColor: selected ? 'rgba(var(--brand-rgb),0.06)' : 'var(--muted-bg)' }}>
                            <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                              style={{ borderColor: selected ? 'var(--brand)' : 'var(--card-border)', backgroundColor: selected ? 'var(--brand)' : 'transparent' }}>
                              {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.name}</span>
                            {Number(opt.priceAdd) > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>+AED {Number(opt.priceAdd).toFixed(2)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
                {(() => {
                  const missing = (modSheet.item.modifierGroups ?? []).filter(g => g.required && !(modSheet.selections[g.id]?.length))
                  return (
                    <button type="button" onClick={confirmModSheet} disabled={missing.length > 0}
                      className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                      {missing.length > 0 ? `Select ${missing[0].name}` : 'Add to Order'}
                    </button>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
function OrdersPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [mobileTab, setMobileTab] = useState(0)
  const [cancelTarget, setCancelTarget]       = useState<Order | null>(null)
  const [voidTarget, setVoidTarget]           = useState<Order | null>(null)
  const [addItemsTarget, setAddItemsTarget]   = useState<Order | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const [socketConnected, setSocketConnected] = useState(true)
  const [helpAlerts, setHelpAlerts] = useState<{ orderId: string; tableLabel: string; message: string; at: Date }[]>([])
  const [guestMessages, setGuestMessages] = useState<Record<string, { from: 'staff' | 'guest'; text: string }[]>>({})
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [staffOrderTable, setStaffOrderTable] = useState<{ id: string; name: string } | null>(null)
  const [thermalEnabled, setThermalEnabled] = useState(false)
  const recentlyActioned = useRef<Set<string>>(new Set())
  const userRole = useAuthStore(s => s.user?.role ?? 'STAFF')
  // Kitchen-only mode: user has 'kitchen' but NOT 'orders' — pure KDS/display user (Chef role)
  // Owners, managers, and general staff who also have 'orders' can advance all stages including Accept
  const hasKitchenPerm = useAuthStore(s => s.permissions.includes('kitchen' as any) && !s.permissions.includes('orders' as any))

  // Auto-open place-order panel if tableId is in URL (from bookings page)
  useEffect(() => {
    const tableId = searchParams.get('tableId')
    const tableName = searchParams.get('tableName') ?? `Table`
    if (tableId) {
      setStaffOrderTable({ id: tableId, name: tableName })
      router.replace('/staff/orders')
    }
  }, [searchParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, settingsRes] = await Promise.all([
        api.get(filter === 'active' ? '/orders/active' : '/orders'),
        api.get('/settings'),
      ])
      setOrders(ordersRes.data)
      setThermalEnabled(settingsRes.data?.thermalEnabled ?? false)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const socket = getSocket()

    const onConnect    = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)

    const onNew = (o: Order & { heldUntil?: string | null }) => {
      // Cooling hold: guest can still free-cancel — this board sees it only on release
      if (o.heldUntil && new Date(o.heldUntil) > new Date()) return
      // Re-fetch all orders so concurrent orders placed at the same time aren't missed
      load()
      setNewOrderIds(prev => new Set([...prev, o.id]))
      setTimeout(() => setNewOrderIds(prev => { const n = new Set(prev); n.delete(o.id); return n }), 4000)
      notify.order.new(o.type === 'DINE_IN' ? (o.table?.name ?? `Table ${o.table?.tableNumber}`) : `Takeaway #${o.tokenNumber}`)
    }
    const onUpdated = (o: Order) => {
      setOrders(prev => prev.map(x => x.id === o.id ? o : x))
    }
    const onReady = (o: Order) => {
      setOrders(prev => prev.map(x => x.id === o.id ? o : x))
      if (!recentlyActioned.current.has(o.id)) {
        notify.order.ready(o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Token #${o.tokenNumber}`)
      }
    }
    const onHelp = (payload: { orderId: string; tableLabel: string; message: string }) => {
      setHelpAlerts(prev => [...prev, { orderId: payload.orderId, tableLabel: payload.tableLabel, message: payload.message, at: new Date() }])
      setGuestMessages(prev => ({
        ...prev,
        [payload.orderId]: [...(prev[payload.orderId] ?? []), { from: 'guest', text: payload.message || 'Needs help' }],
      }))
    }

    socket.on('connect',       onConnect)
    socket.on('disconnect',    onDisconnect)
    socket.on('order:new',     onNew)
    socket.on('order:updated', onUpdated)
    socket.on('order:ready',   onReady)
    socket.on('order:help',    onHelp)
    return () => {
      socket.off('connect',       onConnect)
      socket.off('disconnect',    onDisconnect)
      socket.off('order:new',     onNew)
      socket.off('order:updated', onUpdated)
      socket.off('order:ready',   onReady)
      socket.off('order:help',    onHelp)
    }
  }, [])

  const advance = async (id: string, status: string) => {
    recentlyActioned.current.add(id)
    setTimeout(() => recentlyActioned.current.delete(id), 4000)
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status })
      // No optimistic update — socket events (order:updated / order:ready) handle state.
      // Optimistic update caused a race: PREPARING socket arrived before the HTTP response
      // resolved, so the optimistic READY write would overwrite the correct PREPARING state.
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  const sendReply = async (orderId: string) => {
    if (!replyText.trim()) return
    setReplyBusy(true)
    try {
      await api.post(`/orders/${orderId}/message`, { message: replyText.trim() })
      setGuestMessages(prev => ({
        ...prev,
        [orderId]: [...(prev[orderId] ?? []), { from: 'staff', text: replyText.trim() }],
      }))
      setReplyText('')
      setReplyTarget(null)
    } finally { setReplyBusy(false) }
  }

  const rushOrder = async (id: string, isRush: boolean) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/rush`, { isRush })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, isRush } : o))
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  const voidOrder = async (id: string, reason: string) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.post(`/orders/${id}/void`, { reason })
      setOrders(prev => prev.filter(o => o.id !== id))
      setVoidTarget(null)
      notify.info('Order voided — removed from bill')
    } catch (e: any) {
      notify.error(e?.message ?? 'Could not void order')
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  const cancel = async (id: string, reason: string) => {
    const wantReorder = reason.endsWith('[reorder-requested]')
    const cleanReason = reason.replace(' [reorder-requested]', '').trim()
    const order = orders.find(o => o.id === id)

    setBusy(p => ({ ...p, [id]: true }))
    recentlyActioned.current.add(id)
    setTimeout(() => recentlyActioned.current.delete(id), 4000)
    try {
      await api.patch(`/orders/${id}/status`, { status: 'CANCELLED', cancelReason: cleanReason })
      setOrders(prev => prev.filter(o => o.id !== id))
      setCancelTarget(null)
      notify.info(`Order cancelled — ${cleanReason}`)

      if (wantReorder && order) {
        try {
          await api.post('/orders', {
            type: order.type,
            tableId: order.table?.id,
            items: order.items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
          })
          notify.success('New order placed with same items')
        } catch (e: any) {
          notify.error(e?.message ?? 'Could not reorder — please place manually')
        }
      }
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }



  const dismissZombie = async (id: string) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status: 'CANCELLED', cancelReason: 'Abandoned card payment' })
      setOrders(prev => prev.filter(o => o.id !== id))
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  // ── Buckets ────────────────────────────────────────────────────────────────
  const rushFirst = (a: Order, b: Order) => (b.isRush ? 1 : 0) - (a.isRush ? 1 : 0)
  const pending   = orders.filter(o => o.status === 'PENDING' && o.paymentMethod === 'CASH').sort(rushFirst)
  const zombies   = orders.filter(o => o.status === 'PENDING' && o.stripeIntentId && !o.paymentMethod)
  // In KDS mode: kitchen col shows ACCEPTED+PREPARING; waiter sees READY then marks delivered
  // In thermal mode: KOT already printed, so ACCEPTED orders go to a "Cooking" col where waiter marks directly delivered
  const kitchen   = !thermalEnabled ? orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status)).sort(rushFirst) : []
  const cooking   = thermalEnabled  ? orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status)).sort(rushFirst) : []
  const ready     = orders.filter(o => o.status === 'READY').sort(rushFirst)

  const completed = filter === 'all'
    ? orders.filter(o => o.status === 'DELIVERED' && o.paymentStatus !== 'UNPAID')
    : []

  // Group pending orders by table for the Approval column
  const pendingByTable = pending.reduce<Record<string, { name: string; orders: Order[] }>>((acc, o) => {
    const key = o.table?.id ?? `takeaway-${o.tokenNumber}`
    const name = o.table?.name ?? (o.table ? `Table ${o.table.tableNumber}` : `Takeaway #${o.tokenNumber}`)
    if (!acc[key]) acc[key] = { name, orders: [] }
    acc[key].orders.push(o)
    return acc
  }, {})
  const pendingGroups = Object.values(pendingByTable)

  const col1Count = pending.length + zombies.length
  const allEmpty  = col1Count === 0 && kitchen.length === 0 && cooking.length === 0 && ready.length === 0

  return (
    <>
    {/* Full-height page, no page-level scroll */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-14 flex flex-col justify-center px-4 sm:px-6"
        style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--header-bg)' }}>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Live Orders</h1>
          {socketConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <WifiOff size={10} />
              OFFLINE
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <div className="flex rounded-xl p-0.5" style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
              {(['active', 'all'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={filter === f
                    ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
                    : { color: 'var(--text-muted)' }}>
                  {f === 'active' ? 'Active' : 'All'}
                </button>
              ))}
            </div>
            <button onClick={load}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban Board ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── Mobile tab bar (md and below) ── */}
        <div className="flex md:hidden flex-shrink-0 gap-1 px-3 pt-3 pb-2">
          {(thermalEnabled
            ? [{ label: 'Approval', dot: '#eab308', count: pending.length + zombies.length }, { label: 'Cooking', dot: '#f97316', count: cooking.length }, { label: 'Ready', dot: '#22c55e', count: ready.length }]
            : [{ label: 'Approval', dot: '#eab308', count: pending.length + zombies.length }, { label: 'Kitchen', dot: '#3b82f6', count: kitchen.length }, { label: 'Ready', dot: '#22c55e', count: ready.length }]
          ).map((tab, i) => (
            <button key={i} onClick={() => setMobileTab(i)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all"
              style={{
                background: mobileTab === i ? `${tab.dot}22` : 'var(--muted-bg)',
                border: `1px solid ${mobileTab === i ? tab.dot : 'var(--card-border)'}`,
                color: mobileTab === i ? tab.dot : 'var(--text-muted)',
              }}>
              <span className="w-2 h-2 rounded-full" style={{ background: tab.dot }} />
              {tab.label}
              <span className="font-black">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* 4 columns row — desktop only */}
        {allEmpty ? (
          <div className="hidden md:flex flex-1 items-center justify-center gap-3 flex-col"
            style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
            <CheckCircle size={36} />
            <p className="text-sm font-semibold">All caught up — no active orders</p>
          </div>
        ) : (
        <div className="hidden md:flex" style={{
          gap: 12,
          padding: '12px 16px',
          flex: 1,
          overflow: 'hidden',
          alignItems: 'stretch',
        }}>

          {/* ── Col 1: Needs Approval (always visible) ── */}
          <KanbanColumn
            title="Needs Approval"
            dotColor="#eab308"
            count={col1Count}
            emptyIcon={<AlertCircle size={28} />}
            emptyText="Nothing here"
          >
            {pendingGroups.map(group => (
              <div key={group.name}>
                {pendingGroups.length > 1 || group.orders.length > 1 ? (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      {group.name}
                    </span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                      {group.orders.length}
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2.5">
                  {group.orders.map(o => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      onAdvance={advance}
                      onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)}
                      onVoid={id => setVoidTarget(orders.find(x => x.id === id) ?? null)}
                      onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
                      userRole={userRole}
                      hasKitchenPerm={hasKitchenPerm}
                      thermalEnabled={thermalEnabled}
                      onRush={rushOrder}
                      onReply={id => setReplyTarget(id)}
                      hasGuestMessage={!!(guestMessages[o.id]?.length)}
                      busy={!!busy[o.id]}
                      isNew={newOrderIds.has(o.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Zombie chips */}
            {zombies.length > 0 && (
              <div className="mt-1">
                <p className="text-[9px] font-semibold uppercase tracking-wide mb-1.5 px-1"
                  style={{ color: 'var(--text-muted)' }}>
                  Abandoned payments ({zombies.length})
                </p>
                {zombies.map(o => {
                  const lbl = o.type === 'DINE_IN'
                    ? (o.table?.name ?? `Table ${o.table?.tableNumber}`)
                    : `Takeaway #${o.tokenNumber}`
                  const t = new Date(o.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={o.id} className="rounded-xl flex items-center gap-3 px-3 py-2.5 mb-1.5"
                      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', opacity: 0.7 }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{lbl}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          <Clock size={8} className="inline mr-0.5" />{t} · AED {Number(o.total).toFixed(2)}
                        </p>
                      </div>
                      <button onClick={() => dismissZombie(o.id)} disabled={!!busy[o.id]}
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                        title="Dismiss abandoned order">
                        {busy[o.id] ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </KanbanColumn>

          {/* ── Col 2: In Kitchen (KDS mode) or Cooking (thermal mode) ── */}
          {!thermalEnabled ? (
            <KanbanColumn title="In Kitchen" dotColor="#3b82f6" count={kitchen.length}
              emptyIcon={<ChefHat size={28} />} emptyText="Nothing cooking">
              {kitchen.map(o => (
                <OrderCard key={o.id} order={o} onAdvance={advance}
                  onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)}
                  onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
                  userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder}
                  onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)}
                  busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
              ))}
            </KanbanColumn>
          ) : (
            <KanbanColumn title="Cooking" dotColor="#f97316" count={cooking.length}
              emptyIcon={<ChefHat size={28} />} emptyText="Nothing cooking">
              {cooking.map(o => (
                <OrderCard key={o.id} order={o} onAdvance={advance}
                  onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)}
                  onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
                  userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder}
                  onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)}
                  busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
              ))}
            </KanbanColumn>
          )}

          {/* ── Col 3: Ready ── */}
          <KanbanColumn title="Ready" dotColor="#22c55e" count={ready.length}
            emptyIcon={<CheckCircle size={28} />} emptyText="Nothing ready yet">
            {ready.map(o => (
              <OrderCard key={o.id} order={o} onAdvance={advance}
                onVoid={id => setVoidTarget(orders.find(x => x.id === id) ?? null)}
                onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
                userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder}
                onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)}
                busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
            ))}
          </KanbanColumn>

        </div>
        )}

        {/* ── Mobile single-column view ───────────────────────────────── */}
        <div className="flex md:hidden flex-col flex-1 overflow-y-auto gap-2.5 px-3 pb-4" style={{ scrollbarWidth: 'thin' }}>
          {mobileTab === 0 && <>
            {pendingGroups.map(group => (
              <div key={group.name}>
                {(pendingGroups.length > 1 || group.orders.length > 1) && (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{group.name}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}>{group.orders.length}</span>
                  </div>
                )}
                {group.orders.map(o => (
                  <OrderCard key={o.id} order={o} onAdvance={advance}
                    onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)}
                      onVoid={id => setVoidTarget(orders.find(x => x.id === id) ?? null)}
                      onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
                      userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder}
                      onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)}
                    busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
                ))}
              </div>
            ))}
            {zombies.length > 0 && zombies.map(o => {
              const lbl = o.type === 'DINE_IN' ? (o.table?.name ?? `Table ${o.table?.tableNumber}`) : `Takeaway #${o.tokenNumber}`
              const t = new Date(o.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={o.id} className="rounded-xl flex items-center gap-3 px-3 py-2.5"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', opacity: 0.7 }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{lbl}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}><Clock size={8} className="inline mr-0.5" />{t} · AED {Number(o.total).toFixed(2)}</p>
                  </div>
                  <button onClick={() => dismissZombie(o.id)} disabled={!!busy[o.id]}
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                    {busy[o.id] ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              )
            })}
            {pending.length === 0 && zombies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                <AlertCircle size={28} /><span className="text-xs">Nothing here</span>
              </div>
            )}
          </>}
          {mobileTab === 1 && <>
            {(thermalEnabled ? cooking : kitchen).map(o => <OrderCard key={o.id} order={o} onAdvance={advance}
              onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)}
              onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
              userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder} onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)} busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />)}
            {(thermalEnabled ? cooking : kitchen).length === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}><ChefHat size={28} /><span className="text-xs">Nothing here</span></div>}
          </>}
          {mobileTab === 2 && <>
            {ready.map(o => <OrderCard key={o.id} order={o} onAdvance={advance}
              onVoid={id => setVoidTarget(orders.find(x => x.id === id) ?? null)}
              onAddItems={id => setAddItemsTarget(orders.find(x => x.id === id) ?? null)}
              userRole={userRole} hasKitchenPerm={hasKitchenPerm} thermalEnabled={thermalEnabled} onRush={rushOrder} onReply={id => setReplyTarget(id)} hasGuestMessage={!!(guestMessages[o.id]?.length)} busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />)}
            {ready.length === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}><CheckCircle size={28} /><span className="text-xs">Nothing here</span></div>}
          </>}
        </div>

        {/* ── Completed row (All view only) ───────────────────────────────── */}
        {completed.length > 0 && (
          <div className="flex-shrink-0 px-4 pb-4"
            style={{ borderTop: '1px solid var(--card-border)', paddingTop: 12 }}>
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck size={14} className="text-gray-400" />
              <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Completed</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                {completed.length}
              </span>
              <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>
                · AED {completed.reduce((s, o) => s + Number(o.total), 0).toFixed(2)} total
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'thin' }}>
              {completed.map(o => <CompletedCard key={o.id} order={o} />)}
            </div>
          </div>
        )}
      </div>

    </div>

    {cancelTarget && (
      <CancelReasonModal
        order={cancelTarget}
        onConfirm={cancel}
        onClose={() => setCancelTarget(null)}
        busy={!!busy[cancelTarget.id]}
        mode="cancel"
      />
    )}
    {voidTarget && (
      <CancelReasonModal
        order={voidTarget}
        onConfirm={voidOrder}
        onClose={() => setVoidTarget(null)}
        busy={!!busy[voidTarget.id]}
        mode="void"
      />
    )}
    {addItemsTarget && (
      <AddItemsModal
        order={addItemsTarget}
        onClose={() => setAddItemsTarget(null)}
        onSaved={updated => {
          setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
          setAddItemsTarget(null)
        }}
      />
    )}

    {/* ── Guest help alerts ── */}
    {helpAlerts.length > 0 && (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
        {helpAlerts.map((a, i) => (
            <div key={i} className="rounded-2xl p-3.5 flex items-start gap-3 shadow-2xl"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(239,68,68,0.4)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>🙋</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white">🪑 {a.tableLabel}</p>
                <p className="text-[11px] text-red-400 mt-0.5">"{a.message}"</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setReplyTarget(a.orderId); setHelpAlerts(p => p.filter((_, j) => j !== i)) }}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    Reply
                  </button>
                  <button onClick={() => setHelpAlerts(p => p.filter((_, j) => j !== i))}
                    className="text-[11px] px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: '#2a2a2a', color: '#666' }}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
        ))}
      </div>
    )}

    {/* ── Reply to guest modal ── */}
    {replyTarget && (
      <ModalBackdrop style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full max-w-sm rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <div className="px-4 py-3.5 border-b" style={{ borderColor: '#2a2a2a' }}>
            <p className="text-sm font-black text-white">Reply to guest</p>
            {guestMessages[replyTarget]?.filter(m => m.from === 'guest').slice(-1).map((m, i) => (
              <p key={i} className="text-xs text-gray-500 mt-0.5">"{m.text}"</p>
            ))}
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {['On its way!', 'Just 5 more minutes', 'Sorry for the wait', 'Coming right up'].map(q => (
                <button key={q} onClick={() => setReplyText(q)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
                  style={replyText === q
                    ? { backgroundColor: 'var(--brand)', color: '#000' }
                    : { backgroundColor: '#2a2a2a', color: '#aaa' }}>
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendReply(replyTarget)}
                placeholder="Type a message…"
                className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: '#111', border: '1px solid #2a2a2a', color: '#e5e5e5' }}
              />
              <button onClick={() => sendReply(replyTarget)} disabled={replyBusy || !replyText.trim()}
                className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40"
                style={{ backgroundColor: 'var(--brand)' }}>
                {replyBusy ? <Loader2 size={13} className="animate-spin" style={{ color: '#000' }} /> : <Send size={13} style={{ color: '#000' }} />}
              </button>
            </div>
            <button onClick={() => { setReplyTarget(null); setReplyText('') }}
              className="w-full py-2 rounded-xl text-xs text-gray-500 hover:text-gray-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </ModalBackdrop>
    )}
    {staffOrderTable && (
      <StaffPlaceOrderPanel
        tableId={staffOrderTable.id}
        tableName={staffOrderTable.name}
        onClose={() => setStaffOrderTable(null)}
        onPlaced={() => { setStaffOrderTable(null); load() }}
      />
    )}
    </>
  )
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageInner />
    </Suspense>
  )
}
