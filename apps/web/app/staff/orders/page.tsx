'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Clock, Package, Utensils, RefreshCw, Banknote, CreditCard,
  ChefHat, CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Users, Receipt, ArrowRight, BadgeCheck,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'

interface Order {
  id: string; type: string; status: string; total: number; vatAmount: number; subtotal: number
  paymentMethod?: string; paymentStatus?: string
  tokenNumber?: number; notes?: string; createdAt: string
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
  PENDING:   'bg-yellow-500 hover:bg-yellow-600 text-white',
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

// ── Compact order card (kitchen lanes) ───────────────────────────────────────
function OrderCard({ order, onAdvance, onCancel, busy }: {
  order: Order
  onAdvance: (id: string, status: string) => void
  onCancel?: (id: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label: timeLabel, overdue, isUrgent } = useOrderTimer(order.createdAt, estMins)
  const next = NEXT_STATUS[order.status]
  const label = order.type === 'DINE_IN'
    ? (order.table?.name ?? (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : 'Dine-in'))
    : `#${order.tokenNumber}`
  const hasNotes = order.items.some(i => i.notes) || !!order.notes
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className={`rounded-xl overflow-hidden flex flex-col bg-[var(--card-bg)] border ${
      isUrgent ? 'border-red-500 dark:border-red-600' : 'border-gray-200 dark:border-[var(--card-border)]'
    }`}>

      {/* Urgent stripe */}
      {isUrgent && <div className="h-0.5 bg-red-500" />}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          order.type === 'DINE_IN' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {order.type === 'DINE_IN'
            ? <Utensils size={12} className="text-orange-500" />
            : <Package size={12} className="text-blue-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[13px] text-gray-900 dark:text-white truncate leading-tight">{label}</span>
            {order.tokenNumber && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                #{order.tokenNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className={`text-[9px] flex items-center gap-0.5 font-medium ${overdue ? 'text-red-500 font-bold' : 'text-green-600 dark:text-green-400'}`}>
              <Clock size={8} />{overdue ? timeLabel : `${timeLabel} left`}
            </span>
            {order.paymentMethod === 'CARD' && (
              <span className="text-[9px] font-bold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                <CreditCard size={7} /> Paid
              </span>
            )}
            {hasNotes && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-0.5 rounded-full">✏</span>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(p => !p)} className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {/* Items summary (always visible) */}
      <div className="px-3 pb-2 border-t border-gray-100 dark:border-[var(--card-border)] pt-2">
        {expanded ? (
          <div className="space-y-1.5">
            {order.items.map((item, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-[10px] font-black text-orange-500 flex-shrink-0">{item.quantity}×</span>
                    <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">{item.menuItem.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                    {(item.quantity * Number(item.unitPrice)).toFixed(0)}
                  </span>
                </div>
                {item.notes && (
                  <div className="mt-1 flex items-start gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded px-2 py-1">
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 leading-tight">{item.notes}</span>
                  </div>
                )}
              </div>
            ))}
            {order.notes && (
              <div className="flex items-start gap-1.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-2 py-1.5 mt-1">
                <AlertCircle size={10} className="text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-[10px] text-red-700 dark:text-red-300 font-semibold leading-tight">{order.notes}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug truncate">
            {order.items.map(i => `${i.quantity}× ${i.menuItem.name}`).join(', ')}
          </p>
        )}

        {/* Total row */}
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-[var(--card-border)]">
          <span className="text-[10px] text-gray-400">{totalQty} item{totalQty !== 1 ? 's' : ''}</span>
          <span className="text-[13px] font-black text-gray-900 dark:text-white">AED {Number(order.total).toFixed(2)}</span>
        </div>
      </div>

      {/* Action button — always pinned at bottom */}
      <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5 mt-auto">
        {next && (
          <button onClick={() => onAdvance(order.id, next)} disabled={busy}
            className={`w-full py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.98] ${NEXT_COLOR[order.status]}`}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {NEXT_LABEL[order.status]}
          </button>
        )}
        {order.status === 'PENDING' && onCancel && (
          <button onClick={() => onCancel(order.id)} disabled={busy}
            className="w-full border border-gray-200 dark:border-gray-700 text-red-500 py-1.5 rounded-lg text-[10px] font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ── Payment method modal (same design as bills page) ─────────────────────────
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
  const receivedNum = parseFloat(received) || 0
  const change = receivedNum - amount
  const changeValid = receivedNum >= amount

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
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                Verify before settling
              </span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
              <div>
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      <span className="font-black text-xs mr-1.5" style={{ color: '#f59e0b' }}>{item.qty}×</span>
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
              style={{ backgroundColor: '#f59e0b', color: '#000' }}>
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
              <button onClick={() => setStep('cash')} disabled={busy}
                className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)' }}>
                <Banknote size={24} style={{ color: '#16a34a' }} />
                <div className="text-center">
                  <p className="text-sm font-black text-green-600 dark:text-green-400">Cash</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Physical notes</p>
                </div>
              </button>
              <button onClick={() => onConfirm('CARD')} disabled={busy}
                className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)' }}>
                <CreditCard size={24} style={{ color: '#3b82f6' }} />
                <div className="text-center">
                  <p className="text-sm font-black text-blue-600 dark:text-blue-400">Card · Tap</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Online · Transfer</p>
                </div>
              </button>
            </div>
            {!busy && (
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
            <button onClick={() => onConfirm('CASH')} disabled={busy || !changeValid}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
              {busy ? 'Recording…' : `Confirm — AED ${amount.toFixed(2)} received`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Payment collection row — one row per table, no item list ─────────────────
function PaymentRow({ group, onSettle, onViewBill, busy }: {
  group: TableGroup
  onSettle: (tableId: string, method: 'CASH' | 'CARD') => void
  onViewBill: (tableId: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSettle, setShowSettle] = useState(false)

  // Flat item list for review step
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

  // Per-person breakdown (group orders by user/guest)
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
    <div className="bg-[var(--card-bg)] rounded-2xl border-2 border-purple-200 dark:border-purple-800 overflow-hidden shadow-sm">

      {/* Summary row — always visible */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
          <Utensils size={15} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white text-sm">{group.tableName}</span>
            <span className="text-[10px] text-purple-500 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full font-semibold">
              {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {group.hasCash && (
              <span className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold flex items-center gap-1">
                <Banknote size={10} /> AED {group.cashTotal.toFixed(2)} cash
              </span>
            )}
            {group.cardTotal > 0 && (
              <span className="text-[11px] text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                <CreditCard size={10} /> AED {group.cardTotal.toFixed(2)} card
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-black text-gray-900 dark:text-white">AED {(group.cashTotal + group.cardTotal).toFixed(2)}</span>
          <button onClick={() => setExpanded(p => !p)}
            className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded: per-person breakdown */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-[var(--card-border)] divide-y divide-gray-100 dark:divide-[var(--card-border)]">
          {people.map((person, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {person.label[0]}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{person.label}</span>
                {person.orders[0]?.user && <span className="text-[9px] text-blue-400 font-semibold">member</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold text-gray-900 dark:text-white">AED {person.total.toFixed(2)}</span>
                {person.isPaid ? (
                  <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5">
                    <CheckCircle size={11} /> Paid
                  </span>
                ) : (
                  <span className="text-[10px] text-yellow-600 font-semibold">Pending</span>
                )}
              </div>
            </div>
          ))}

          {/* Items summary (collapsed count, not full list) */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/30">
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Package size={9} />
              {(() => {
                const allItems = group.orders.flatMap(o => o.items)
                const itemMap = new Map<string, number>()
                for (const i of allItems) {
                  itemMap.set(i.menuItem.name, (itemMap.get(i.menuItem.name) ?? 0) + i.quantity)
                }
                const top3 = [...itemMap.entries()].slice(0, 3).map(([name, qty]) => `${qty}× ${name}`).join(', ')
                const rest = itemMap.size - 3
                return top3 + (rest > 0 ? ` +${rest} more` : '')
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-[var(--card-border)] flex gap-2">
        {group.hasCash && (
          <button onClick={() => setShowSettle(true)} disabled={busy}
            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
            Settle Bill · AED {(group.cashTotal + group.cardTotal).toFixed(2)}
          </button>
        )}
        {!group.hasCash && group.cardTotal > 0 && (
          <div className="flex-1 flex items-center justify-center gap-2 text-green-600 dark:text-green-400 text-xs font-semibold py-2.5 rounded-xl bg-green-50 dark:bg-green-900/10">
            <CreditCard size={14} /> Fully Paid by Card
          </div>
        )}
        <button onClick={() => onViewBill(group.tableId)}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-orange-500 hover:border-orange-300 transition-colors flex-shrink-0">
          <Receipt size={15} />
        </button>
      </div>

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
function CompletedCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false)
  const tableLabel = order.table?.name ?? (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : null) ?? 'Dine-in'
  const label = order.type === 'DINE_IN' ? tableLabel : `Takeaway #${order.tokenNumber}`
  const time = new Date(order.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
  const method = order.paymentMethod === 'CARD' ? 'Card' : order.paymentMethod === 'CASH' ? 'Cash' : 'Paid'
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', opacity: 0.85 }}>
      {/* Header row */}
      <button onClick={() => setExpanded(p => !p)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:opacity-80 transition-opacity">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--muted-bg)' }}>
          {order.type === 'DINE_IN'
            ? <Utensils size={14} className="text-gray-400" />
            : <Package size={14} className="text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{label}</p>
            {order.user && <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">member</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-[var(--text-muted)]"><Clock size={9} className="inline mr-0.5" />{time}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
            {order.paymentMethod === 'CARD'
              ? <span className="text-[10px] font-semibold text-blue-500 flex items-center gap-0.5"><CreditCard size={9} />Card</span>
              : <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-0.5"><Banknote size={9} />Cash</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-black text-[var(--text-primary)]">AED {Number(order.total).toFixed(2)}</span>
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-500"><CheckCircle size={10} />Paid</span>
        </div>
        <div className="ml-1 flex-shrink-0">
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded items */}
      {expanded && (
        <div className="px-4 pb-4 space-y-1 border-t border-[var(--card-border)] pt-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]"><span className="font-semibold text-[var(--text-primary)]">{item.quantity}×</span> {item.menuItem.name}</span>
              <span className="text-[var(--text-muted)]">AED {(item.quantity * Number(item.unitPrice)).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-2 border-t border-[var(--card-border)] mt-1">
            <span className="text-[var(--text-muted)]">Subtotal</span>
            <span className="text-[var(--text-muted)]">AED {Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--text-muted)]">VAT</span>
            <span className="text-[var(--text-muted)]">AED {Number(order.vatAmount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-black pt-1">
            <span className="text-[var(--text-primary)]">Total</span>
            <span className="text-[var(--text-primary)]">AED {Number(order.total).toFixed(2)}</span>
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
          <h3 className="font-bold text-[var(--text-primary)] text-base mb-0.5">Cancel Order?</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {order.type === 'DINE_IN'
              ? `Table ${order.table?.tableNumber ?? ''} · AED ${Number(order.total).toFixed(2)}`
              : `Takeaway #${order.tokenNumber} · AED ${Number(order.total).toFixed(2)}`}
          </p>
        </div>

        {/* Items quick summary */}
        <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: 'var(--muted-bg)' }}>
          {order.items.map((item, i) => (
            <p key={i} className="text-xs text-[var(--text-muted)]">{item.quantity}× {item.menuItem.name}</p>
          ))}
        </div>

        {/* Reason picker */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Reason for cancelling</p>
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
              style={{ border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', backgroundColor: 'transparent' }}>
              Cancel & Place Same Order Again
            </button>
          )}
          <button onClick={onClose} disabled={busy}
            className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Go Back
          </button>
        </div>
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
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  // Track orders we just acted on — skip socket echo notifications for those
  const recentlyActioned = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(filter === 'active' ? '/orders/active' : '/orders')
      setOrders(data)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const socket = getSocket()

    const onNew = (o: Order) => {
      setOrders(prev => [o, ...prev])
      notify.order.new(o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Takeaway #${o.tokenNumber}`)
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

    socket.on('order:new', onNew)
    socket.on('order:updated', onUpdated)
    socket.on('order:ready', onReady)
    return () => {
      socket.off('order:new', onNew)
      socket.off('order:updated', onUpdated)
      socket.off('order:ready', onReady)
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

      // Reorder: create a new order with same items at same table
      if (wantReorder && order) {
        try {
          await api.post('/orders', {
            type: order.type,
            tableId: order.table?.id,
            items: order.items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
          })
          notify.success('New order placed with same items')
        } catch {
          notify.error('Could not reorder — please place manually')
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

  const viewBill = (tableId: string) => {
    window.location.href = '/staff/bills'
  }

  // ── Buckets ────────────────────────────────────────────────────────────────
  // Only cash orders need manual approval — card orders skip PENDING (go to ACCEPTED after Stripe succeeds)
  const pending   = orders.filter(o => o.status === 'PENDING' && o.paymentMethod === 'CASH')
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

  const totalActive = pending.length + kitchen.length + ready.length

  return (
    <>
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Orders</h1>
        <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
          {(totalActive > 0 || pending.length > 0 || ready.length > 0 || tableGroups.size > 0) ? (
            <div className="flex items-center gap-2 flex-wrap">
              {totalActive > 0 && <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">{totalActive} active</span>}
              {pending.length > 0 && <span className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">{pending.length} needs approval</span>}
              {ready.length > 0 && <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">{ready.length} ready to serve</span>}
              {tableGroups.size > 0 && <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">{tableGroups.size} table{tableGroups.size !== 1 ? 's' : ''} awaiting payment</span>}
            </div>
          ) : <span />}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <div className="flex rounded-xl p-1 border border-[var(--card-border)]" style={{ backgroundColor: 'var(--muted-bg)' }}>
              {(['active', 'all'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={filter === f
                    ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                    : { color: 'var(--text-muted)' }}>
                  {f === 'active' ? 'Active' : 'All'}
                </button>
              ))}
            </div>
            <button onClick={load} className="p-2.5 rounded-xl border transition-colors" style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Lanes */}
      <div className="p-4 sm:p-6 space-y-8 overflow-auto flex-1">

        {!loading && orders.filter(o => !['CANCELLED'].includes(o.status)).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-amber-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Package size={28} className="text-amber-400 dark:text-amber-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{filter === 'active' ? 'No active orders right now' : 'No orders today yet'}</p>
              <p className="text-xs text-gray-400 mt-1">New orders appear here in real time</p>
            </div>
          </div>
        )}

        {/* ── 1. Needs Approval ─────────────────────────────────────── */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={15} className="text-yellow-500" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Needs Approval</h2>
              <span className="text-[10px] font-bold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">{pending.length}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pending.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} onCancel={id => setCancelTarget(orders.find(x => x.id === id) ?? null)} busy={!!busy[o.id]} />)}
            </div>
          </section>
        )}

        {/* ── 2. In Kitchen ─────────────────────────────────────────── */}
        {kitchen.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ChefHat size={15} className="text-orange-500" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">In Kitchen</h2>
              <span className="text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full">{kitchen.length}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {kitchen.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} />)}
            </div>
          </section>
        )}

        {/* ── 3. Ready to Serve ─────────────────────────────────────── */}
        {ready.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={15} className="text-green-500" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Ready to Serve</h2>
              <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">{ready.length}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ready.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} />)}
            </div>
          </section>
        )}

        {/* ── 4. Collect Payment — compact list, not item dump ──────── */}
        {tableGroups.size > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Banknote size={15} className="text-purple-500" />
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Collect Payment</h2>
                <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">
                  {tableGroups.size} table{tableGroups.size !== 1 ? 's' : ''}
                </span>
              </div>
              <a href="/staff/bills" className="text-[11px] text-orange-500 hover:text-orange-400 font-semibold flex items-center gap-1">
                Full Bill View <ArrowRight size={11} />
              </a>
            </div>
            <div className="flex flex-col gap-3">
              {[...tableGroups.values()].map(g => (
                <PaymentRow key={g.tableId} group={g} onSettle={settleTable} onViewBill={viewBill} busy={!!busy[g.tableId]} />
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Takeaway handover ──────────────────────────────────── */}
        {takeawayHandover.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package size={15} className="text-blue-500" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Takeaway — Hand Over</h2>
              <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">{takeawayHandover.length}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {takeawayHandover.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} busy={!!busy[o.id]} />)}
            </div>
          </section>
        )}

        {/* ── 6. Completed (visible in "All" view only) ─────────────── */}
        {completed.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BadgeCheck size={15} className="text-gray-400" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Completed</h2>
              <span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">{completed.length}</span>
              <span className="text-[10px] text-gray-400 ml-1">
                · AED {completed.reduce((s, o) => s + Number(o.total), 0).toFixed(2)} total
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {completed.map(o => <CompletedCard key={o.id} order={o} />)}
            </div>
          </section>
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
