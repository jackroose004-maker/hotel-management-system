'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Clock, Package, Utensils, RefreshCw, Banknote, CreditCard,
  ChefHat, CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Users, Receipt, ArrowRight, BadgeCheck, WifiOff, Trash2,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'

interface Order {
  id: string; type: string; status: string; total: number; vatAmount: number; subtotal: number
  paymentMethod?: string | null; paymentStatus?: string; stripeIntentId?: string | null
  tokenNumber?: number; notes?: string; createdAt: string; clientIp?: string | null
  table?: { id: string; tableNumber: number; name?: string }
  user?: { name: string } | null
  items: { quantity: number; unitPrice: number; notes?: string | null; menuItem: { id: string; name: string; prepTimeMins?: number } }[]
}

interface TableGroup {
  tableId: string
  tableName: string
  orders: Order[]
  cashTotal: number
  cardTotal: number
  hasCash: boolean
  peopleCount: number
}

const NEXT_STATUS: Record<string, string>  = { PENDING: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' }
const NEXT_LABEL: Record<string, string>   = { PENDING: 'Accept & Send to Kitchen', ACCEPTED: 'Start Preparing', PREPARING: 'Mark Ready', READY: 'Mark Served' }
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
function OrderCard({ order, onAdvance, onCancel, busy, isNew }: {
  order: Order
  onAdvance: (id: string, status: string) => void
  onCancel?: (id: string) => void
  busy: boolean
  isNew?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label: timeLabel, overdue, isUrgent } = useOrderTimer(order.createdAt, estMins)
  const next = NEXT_STATUS[order.status]
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
        border: `1px solid ${isUrgent ? '#ef4444' : 'var(--card-border)'}`,
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
                <span className={`text-[9px] font-bold flex items-center gap-0.5 flex-shrink-0 ${overdue ? 'text-red-500' : 'text-green-400'}`}>
                  <Clock size={7} />{overdue ? timeLabel : `${timeLabel} left`}
                </span>
                {hasNotes && <span className="text-[9px] text-amber-400 flex-shrink-0">✏</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{summaryText}</p>
                {order.clientIp && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                    {order.clientIp}
                  </span>
                )}
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
                      AED {(item.quantity * Number(item.unitPrice)).toFixed(2)}
                    </span>
                  </div>
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

          {/* ── Action row (always same height) ── */}
          {next && (
            <div className="px-3 pb-3 pt-2 flex gap-2" style={{ borderTop: '1px solid var(--card-border)' }}>
              {order.status === 'PENDING' ? (
                <>
                  <button onClick={() => onAdvance(order.id, next)} disabled={busy}
                    className={actionBtnClass}
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                    Accept
                  </button>
                  {onCancel && (
                    <button onClick={() => onCancel(order.id)} disabled={busy}
                      className={`${actionBtnClass} flex-none px-4`}
                      style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
                      Cancel
                    </button>
                  )}
                </>
              ) : (
                <button onClick={() => onAdvance(order.id, next)} disabled={busy}
                  className={`${actionBtnClass} ${NEXT_COLOR[order.status]}`}>
                  {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                  {NEXT_LABEL[order.status]}
                </button>
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

function SettleModal({ amount, items, onConfirm, onClose, busy }: {
  amount: number
  items: { name: string; qty: number; price: number }[]
  onConfirm: (method: 'CASH' | 'CARD') => void
  onClose: () => void
  busy: boolean
}) {
  const [step, setStep] = useState<'review' | 'method' | 'cash'>('review')
  const [received, setReceived] = useState('')
  const [confirming, setConfirming] = useState<'CASH' | 'CARD' | null>(null)
  const receivedNum = parseFloat(received) || 0
  const change = receivedNum - amount
  const changeValid = receivedNum >= amount

  const handleConfirm = (method: 'CASH' | 'CARD') => {
    setConfirming(method)
    onConfirm(method)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>

        {step === 'review' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Review Bill</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                Verify before settling
              </span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
              <div>
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      <span className="font-black text-xs mr-1.5" style={{ color: 'var(--brand)' }}>{item.qty}×</span>
                      {item.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      AED {item.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ backgroundColor: 'var(--muted-bg)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
                <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>AED {amount.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => setStep('method')}
              className="w-full py-3.5 rounded-2xl font-black text-sm"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              ✓ Looks Good — Choose Payment
            </button>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-sm font-semibold"
              style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
              Go Back
            </button>
          </>
        )}

        {step === 'method' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-2">💳</div>
              <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>How did they pay?</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Bill total: <strong style={{ color: 'var(--text-primary)' }}>AED {amount.toFixed(2)}</strong>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('cash')} disabled={!!confirming}
                className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)' }}>
                <Banknote size={24} style={{ color: '#16a34a' }} />
                <div className="text-center">
                  <p className="text-sm font-black text-green-600 dark:text-green-400">Cash</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Physical notes</p>
                </div>
              </button>
              <button onClick={() => handleConfirm('CARD')} disabled={!!confirming}
                className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)' }}>
                {confirming === 'CARD' ? <Loader2 size={24} className="animate-spin" style={{ color: '#3b82f6' }} /> : <CreditCard size={24} style={{ color: '#3b82f6' }} />}
                <div className="text-center">
                  <p className="text-sm font-black text-blue-600 dark:text-blue-400">{confirming === 'CARD' ? 'Recording…' : 'Card · Tap'}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Online · Transfer</p>
                </div>
              </button>
            </div>
            {!confirming && (
              <button onClick={() => setStep('review')}
                className="w-full py-3 rounded-2xl text-sm font-semibold"
                style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                ← Back to Review
              </button>
            )}
          </>
        )}

        {step === 'cash' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('method')} style={{ color: 'var(--text-muted)' }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Cash Collection</h2>
            </div>
            <div className="rounded-xl px-4 py-3 flex justify-between items-center"
              style={{ backgroundColor: 'var(--muted-bg)' }}>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Bill Total</span>
              <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>AED {amount.toFixed(2)}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Amount received</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CASH_NOTES.filter(n => n >= amount || n === Math.ceil(amount / 10) * 10).slice(0, 6).map(n => (
                  <button key={n} onClick={() => setReceived(String(n))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={Number(received) === n
                      ? { backgroundColor: 'var(--brand, #f97316)', color: '#000' }
                      : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
                    {n}
                  </button>
                ))}
              </div>
              <input type="number" inputMode="decimal" placeholder={`Enter amount (min ${amount.toFixed(2)})`}
                value={received} onChange={e => setReceived(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-base font-bold outline-none"
                style={{ backgroundColor: 'var(--muted-bg)', border: `2px solid ${changeValid && received ? '#16a34a' : 'var(--card-border)'}`, color: 'var(--text-primary)' }} />
            </div>
            {received && (
              <div className="rounded-xl px-4 py-3 flex justify-between items-center"
                style={{ backgroundColor: changeValid ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${changeValid ? '#16a34a' : 'rgba(239,68,68,0.3)'}` }}>
                <span className="text-sm font-semibold" style={{ color: changeValid ? '#16a34a' : '#f87171' }}>
                  {changeValid ? 'Change to return' : 'Not enough'}
                </span>
                <span className="text-xl font-black" style={{ color: changeValid ? '#16a34a' : '#f87171' }}>
                  {changeValid ? `AED ${change.toFixed(2)}` : `Short AED ${Math.abs(change).toFixed(2)}`}
                </span>
              </div>
            )}
            <button onClick={() => handleConfirm('CASH')} disabled={!!confirming || !changeValid}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
              {confirming === 'CASH' ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
              {confirming === 'CASH' ? 'Recording…' : `Confirm — AED ${amount.toFixed(2)} received`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Payment collection row ────────────────────────────────────────────────────
function PaymentRow({ group, onSettle, onViewBill, busy, myIp }: {
  group: TableGroup
  onSettle: (tableId: string, method: 'CASH' | 'CARD') => void
  onViewBill: (tableId: string) => void
  busy: boolean
  myIp: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showIpWarning, setShowIpWarning] = useState(false)

  // True if any order in this group was placed from the same IP as the current device
  const hasSameIpOrder = myIp
    ? group.orders.some(o => o.clientIp && o.clientIp === myIp)
    : false

  const handleSettleClick = () => {
    if (hasSameIpOrder) { setShowIpWarning(true); return }
    setShowSettle(true)
  }

  const itemMap = new Map<string, { name: string; qty: number; price: number }>()
  for (const o of group.orders) {
    for (const i of o.items) {
      const k = i.menuItem.name
      const ex = itemMap.get(k)
      if (ex) { ex.qty += i.quantity; ex.price += i.quantity * Number(i.unitPrice) }
      else itemMap.set(k, { name: k, qty: i.quantity, price: i.quantity * Number(i.unitPrice) })
    }
  }
  const reviewItems = [...itemMap.values()]

  const personMap = new Map<string, { label: string; orders: Order[]; total: number; isPaid: boolean }>()
  for (const o of group.orders) {
    const key = o.user?.name ?? `guest-${o.id.slice(-4)}`
    const label = o.user?.name?.split(' ')[0] ?? `Guest`
    if (!personMap.has(key)) personMap.set(key, { label, orders: [], total: 0, isPaid: false })
    const p = personMap.get(key)!
    p.orders.push(o)
    p.total += Number(o.total)
    p.isPaid = o.paymentStatus === 'PAID'
  }
  const people = [...personMap.values()]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid rgba(168,85,247,0.4)' }}>
      <button onClick={() => setExpanded(p => !p)} className="w-full px-3 py-2.5 flex items-center gap-3 text-left">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(168,85,247,0.15)' }}>
          <Utensils size={15} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>{group.tableName}</span>
            <span className="text-[10px] text-purple-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ background: 'rgba(168,85,247,0.15)' }}>
              {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {group.hasCash && (
              <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                <Banknote size={9} className="text-orange-400" /> {group.cashTotal.toFixed(2)} cash
              </span>
            )}
            {group.cardTotal > 0 && (
              <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                <CreditCard size={9} className="text-green-400" /> {group.cardTotal.toFixed(2)} card
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
            AED {(group.cashTotal + group.cardTotal).toFixed(2)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--card-border)' }}>
          {people.map((person, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3"
              style={{ borderBottom: '1px solid var(--card-border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                  {person.label[0]}
                </div>
                <span className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{person.label}</span>
                {person.orders[0]?.user && <span className="text-[9px] text-blue-400 font-semibold">member</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>AED {person.total.toFixed(2)}</span>
                {person.isPaid ? (
                  <span className="text-[10px] text-green-400 font-semibold flex items-center gap-0.5">
                    <CheckCircle size={11} /> Paid
                  </span>
                ) : (
                  <span className="text-[10px] text-yellow-500 font-semibold">Pending</span>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-2" style={{ background: 'var(--muted-bg)' }}>
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <Package size={9} />
              {(() => {
                const allItems = group.orders.flatMap(o => o.items)
                const iMap = new Map<string, number>()
                for (const i of allItems) iMap.set(i.menuItem.name, (iMap.get(i.menuItem.name) ?? 0) + i.quantity)
                const top3 = [...iMap.entries()].slice(0, 3).map(([name, qty]) => `${qty}× ${name}`).join(', ')
                const rest = iMap.size - 3
                return top3 + (rest > 0 ? ` +${rest} more` : '')
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="px-3 pb-3 pt-2 flex gap-2" style={{ borderTop: '1px solid var(--card-border)' }}>
        {group.hasCash && (
          <button onClick={handleSettleClick} disabled={busy}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: '#7c3aed', color: '#fff' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
            <span>Collect</span>
            <span className="font-black">AED {(group.cashTotal + group.cardTotal).toFixed(2)}</span>
          </button>
        )}
        {!group.hasCash && group.cardTotal > 0 && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
            <CreditCard size={13} /> Fully Paid by Card
          </div>
        )}
        <button onClick={() => onViewBill(group.tableId)}
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
          <Receipt size={13} />
        </button>
      </div>

      {showIpWarning && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Order from your device
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  One or more orders in this group were placed from this device ({myIp}).
                  Are you sure you want to close the bill?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}
                onClick={() => setShowIpWarning(false)}>
                Cancel
              </button>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
                onClick={() => { setShowIpWarning(false); setShowSettle(true) }}>
                Yes, close bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettle && (
        <SettleModal
          amount={group.cashTotal + group.cardTotal}
          items={reviewItems}
          busy={busy}
          onClose={() => setShowSettle(false)}
          onConfirm={method => { setShowSettle(false); onSettle(group.tableId, method) }}
        />
      )}
    </div>
  )
}

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
              <span style={{ color: 'var(--text-muted)' }}>{(item.quantity * Number(item.unitPrice)).toFixed(2)}</span>
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

function CancelReasonModal({ order, onConfirm, onClose, busy }: {
  order: Order
  onConfirm: (id: string, reason: string) => void
  onClose: () => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  const finalReason = reason === 'Other' ? custom.trim() : reason

  const canReorder = order.items.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-base mb-0.5" style={{ color: 'var(--text-primary)' }}>Cancel Order?</h3>
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
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Reason for cancelling</p>
          {CANCEL_REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all"
              style={reason === r
                ? { backgroundColor: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.5)', color: '#f87171' }
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
            style={{ backgroundColor: '#dc2626' }}>
            {busy ? 'Cancelling…' : 'Confirm Cancel'}
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
    </div>
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
    <div className="flex flex-col min-w-0" style={{ flex: '1 1 0' }}>
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 mb-2 rounded-xl flex-shrink-0"
        style={{ background: 'var(--muted-bg)', border: '0.5px solid var(--card-border)' }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-xs font-bold flex-1" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: `${dotColor}22`, color: dotColor }}>
          {count}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 px-0.5 pb-4"
        style={{ scrollbarWidth: 'thin' }}>
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 rounded-xl"
            style={{ border: '1px dashed var(--card-border)' }}>
            <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{emptyIcon}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{emptyText}</span>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [mobileTab, setMobileTab] = useState(0)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const [socketConnected, setSocketConnected] = useState(true)
  const [myIp, setMyIp] = useState<string>('')
  const recentlyActioned = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(filter === 'active' ? '/orders/active' : '/orders')
      setOrders(data)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/orders/my-ip').then(r => setMyIp(r.data.ip)).catch(() => {}) }, [])

  useEffect(() => {
    const socket = getSocket()

    const onConnect    = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)

    const onNew = (o: Order) => {
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

    socket.on('connect',       onConnect)
    socket.on('disconnect',    onDisconnect)
    socket.on('order:new',     onNew)
    socket.on('order:updated', onUpdated)
    socket.on('order:ready',   onReady)
    return () => {
      socket.off('connect',       onConnect)
      socket.off('disconnect',    onDisconnect)
      socket.off('order:new',     onNew)
      socket.off('order:updated', onUpdated)
      socket.off('order:ready',   onReady)
    }
  }, [])

  const advance = async (id: string, status: string) => {
    recentlyActioned.current.add(id)
    setTimeout(() => recentlyActioned.current.delete(id), 4000)
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
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

  const settleTable = async (tableId: string, method: 'CASH' | 'CARD') => {
    setBusy(p => ({ ...p, [tableId]: true }))
    try {
      const { data } = await api.post(`/payments/table/${tableId}/settle-all-cash`, { method })
      const label = method === 'CARD' ? 'Card payment recorded' : `Cash collected`
      notify.success(`${label} — AED ${Number(data.total).toFixed(2)}`)
      setOrders(prev => prev.map(o =>
        o.table?.id === tableId && o.paymentStatus === 'UNPAID'
          ? { ...o, paymentStatus: 'PAID', paymentMethod: method }
          : o
      ))
    } finally { setBusy(p => ({ ...p, [tableId]: false })) }
  }

  const viewBill = (_tableId: string) => {
    window.location.href = '/staff/bills'
  }

  const dismissZombie = async (id: string) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status: 'CANCELLED', cancelReason: 'Abandoned card payment' })
      setOrders(prev => prev.filter(o => o.id !== id))
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  // ── Buckets ────────────────────────────────────────────────────────────────
  const pending   = orders.filter(o => o.status === 'PENDING' && o.paymentMethod === 'CASH')
  const zombies   = orders.filter(o => o.status === 'PENDING' && o.stripeIntentId && !o.paymentMethod)
  const kitchen   = orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status))
  const ready     = orders.filter(o => o.status === 'READY')
  const takeawayHandover = orders.filter(o => o.type === 'TAKEAWAY' && o.status === 'DELIVERED' && o.paymentStatus === 'UNPAID')

  const awaitingPayment = orders.filter(o => o.type === 'DINE_IN' && o.status === 'DELIVERED' && o.paymentStatus === 'UNPAID')
  const tableGroups = new Map<string, TableGroup>()
  for (const o of awaitingPayment) {
    if (!o.table) continue
    const key = o.table.id
    if (!tableGroups.has(key)) {
      tableGroups.set(key, { tableId: key, tableName: o.table.name ?? `Table ${o.table.tableNumber}`, orders: [], cashTotal: 0, cardTotal: 0, hasCash: false, peopleCount: 0 })
    }
    const g = tableGroups.get(key)!
    g.orders.push(o)
    if (o.paymentMethod === 'CASH' || !o.paymentMethod) { g.cashTotal += Number(o.total); g.hasCash = true }
    else g.cardTotal += Number(o.total)
  }

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

  const col4Count = tableGroups.size + takeawayHandover.length
  const col1Count = pending.length + zombies.length
  const allEmpty  = col1Count === 0 && kitchen.length === 0 && ready.length === 0 && col4Count === 0

  return (
    <>
    {/* Full-height page, no page-level scroll */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3"
        style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
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
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-xl p-1" style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
              {(['active', 'all'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={filter === f
                    ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
                    : { color: 'var(--text-muted)' }}>
                  {f === 'active' ? 'Active' : 'All'}
                </button>
              ))}
            </div>
            <button onClick={load}
              className="p-2.5 rounded-xl border transition-colors"
              style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban Board ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── Mobile tab bar (md and below) ── */}
        <div className="flex md:hidden flex-shrink-0 gap-1 px-3 pt-3 pb-2">
          {[
            { label: 'Approval', dot: '#eab308', count: pending.length + zombies.length },
            { label: 'Kitchen',  dot: '#3b82f6', count: kitchen.length },
            { label: 'Ready',    dot: '#22c55e', count: ready.length },
            { label: 'Payment',  dot: '#a855f7', count: col4Count },
          ].map((tab, i) => (
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

          {/* ── Col 2: In Kitchen ── */}
          {kitchen.length > 0 && (
            <KanbanColumn title="In Kitchen" dotColor="#3b82f6" count={kitchen.length}
              emptyIcon={<ChefHat size={28} />} emptyText="Nothing here">
              {kitchen.map(o => (
                <OrderCard key={o.id} order={o} onAdvance={advance}
                  busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
              ))}
            </KanbanColumn>
          )}

          {/* ── Col 3: Ready ── */}
          {ready.length > 0 && (
            <KanbanColumn title="Ready" dotColor="#22c55e" count={ready.length}
              emptyIcon={<CheckCircle size={28} />} emptyText="Nothing here">
              {ready.map(o => (
                <OrderCard key={o.id} order={o} onAdvance={advance}
                  busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />
              ))}
            </KanbanColumn>
          )}

          {/* ── Col 4: Collect Payment ── */}
          {col4Count > 0 && (
            <KanbanColumn title="Collect Payment" dotColor="#a855f7" count={col4Count}
              emptyIcon={<Banknote size={28} />} emptyText="Nothing here">
              {[...tableGroups.values()].map(g => (
                <PaymentRow key={g.tableId} group={g} onSettle={settleTable} onViewBill={viewBill} busy={!!busy[g.tableId]} myIp={myIp} />
              ))}
              {takeawayHandover.map(o => (
                <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} />
              ))}
            </KanbanColumn>
          )}

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
            {kitchen.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />)}
            {kitchen.length === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}><ChefHat size={28} /><span className="text-xs">Nothing here</span></div>}
          </>}
          {mobileTab === 2 && <>
            {ready.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} isNew={newOrderIds.has(o.id)} />)}
            {ready.length === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}><CheckCircle size={28} /><span className="text-xs">Nothing here</span></div>}
          </>}
          {mobileTab === 3 && <>
            {[...tableGroups.values()].map(g => <PaymentRow key={g.tableId} group={g} onSettle={settleTable} onViewBill={viewBill} busy={!!busy[g.tableId]} myIp={myIp} />)}
            {takeawayHandover.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} />)}
            {col4Count === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}><Banknote size={28} /><span className="text-xs">Nothing here</span></div>}
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
      />
    )}
    </>
  )
}
