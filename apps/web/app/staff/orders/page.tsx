'use client'
import { useEffect, useState, useCallback } from 'react'
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
  items: { quantity: number; unitPrice: number; menuItem: { name: string } }[]
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

function elapsed(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return mins < 1 ? 'just now' : `${mins}m ago`
}

// ── Compact order card (kitchen lanes) ───────────────────────────────────────
function OrderCard({ order, onAdvance, onCancel, busy }: {
  order: Order
  onAdvance: (id: string, status: string) => void
  onCancel?: (id: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const next = NEXT_STATUS[order.status]
  const label = order.type === 'DINE_IN'
    ? (order.table?.name ?? (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : 'Dine-in'))
    : `Takeaway #${order.tokenNumber}`
  const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
  const isUrgent = mins >= 15

  return (
    <div className={`bg-[var(--card-bg)] rounded-2xl border overflow-hidden shadow-sm flex flex-col ${
      isUrgent ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-[var(--card-border)]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {order.type === 'DINE_IN'
            ? <Utensils size={13} className="text-orange-500 flex-shrink-0" />
            : <Package size={13} className="text-blue-500 flex-shrink-0" />}
          <span className="font-bold text-sm text-gray-900 dark:text-white truncate">{label}</span>
          {order.paymentMethod === 'CARD' && (
            <span className="text-[10px] font-bold text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
              <CreditCard size={9} /> Paid
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] flex items-center gap-1 ${isUrgent ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
            <Clock size={9} />{elapsed(order.createdAt)}
          </span>
          <button onClick={() => setExpanded(p => !p)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 space-y-1 flex-1 pb-1">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-700 dark:text-gray-300">
                <span className="font-semibold">{item.quantity}×</span> {item.menuItem.name}
              </span>
            </div>
          ))}
          {order.notes && (
            <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-2 py-1 mt-1">
              ⚠ {order.notes}
            </div>
          )}
        </div>
      )}

      <div className="px-4 pb-4 pt-2 flex flex-col gap-1.5">
        {next && (
          <button onClick={() => onAdvance(order.id, next)} disabled={busy}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${NEXT_COLOR[order.status]}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {NEXT_LABEL[order.status]}
          </button>
        )}
        {order.status === 'PENDING' && onCancel && (
          <button onClick={() => onCancel(order.id)} disabled={busy}
            className="w-full border border-gray-200 dark:border-gray-700 text-red-500 py-1.5 rounded-xl text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Cancel Order
          </button>
        )}
      </div>
    </div>
  )
}

// ── Payment collection row — one row per table, no item list ─────────────────
function PaymentRow({ group, onSettle, onViewBill, busy }: {
  group: TableGroup
  onSettle: (tableId: string) => void
  onViewBill: (tableId: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)

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
          <button onClick={() => onSettle(group.tableId)} disabled={busy}
            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
            Collect Cash · AED {group.cashTotal.toFixed(2)}
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

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
    socket.on('order:new', (o: Order) => {
      setOrders(prev => [o, ...prev])
      notify.order.new(o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Takeaway #${o.tokenNumber}`)
    })
    socket.on('order:updated', (o: Order) => setOrders(prev => prev.map(x => x.id === o.id ? o : x)))
    socket.on('order:ready', (o: Order) => {
      setOrders(prev => prev.map(x => x.id === o.id ? o : x))
      notify.order.ready(o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Token #${o.tokenNumber}`)
    })
    return () => { socket.off('order:new'); socket.off('order:updated'); socket.off('order:ready') }
  }, [])

  const advance = async (id: string, status: string) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  const cancel = async (id: string) => {
    setBusy(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/orders/${id}/status`, { status: 'CANCELLED' })
      setOrders(prev => prev.filter(o => o.id !== id))
      notify.error('Order cancelled')
    } finally { setBusy(p => ({ ...p, [id]: false })) }
  }

  const settleTable = async (tableId: string) => {
    setBusy(p => ({ ...p, [tableId]: true }))
    try {
      const { data } = await api.post(`/payments/table/${tableId}/settle-all-cash`)
      notify.order.cashCollected(Number(data.total).toFixed(2))
      setOrders(prev => prev.map(o =>
        o.table?.id === tableId && o.paymentStatus === 'UNPAID'
          ? { ...o, paymentStatus: 'PAID' }
          : o
      ))
    } finally { setBusy(p => ({ ...p, [tableId]: false })) }
  }

  const viewBill = (tableId: string) => {
    window.location.href = '/staff/bills'
  }

  // ── Buckets ────────────────────────────────────────────────────────────────
  const pending   = orders.filter(o => o.status === 'PENDING')
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
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Orders</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {totalActive > 0 && <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">{totalActive} active</span>}
            {pending.length > 0 && <span className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">{pending.length} needs approval</span>}
            {ready.length > 0 && <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">{ready.length} ready to serve</span>}
            {tableGroups.size > 0 && <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">{tableGroups.size} table{tableGroups.size !== 1 ? 's' : ''} awaiting payment</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pending.map(o => <OrderCard key={o.id} order={o} onAdvance={advance} onCancel={cancel} busy={!!busy[o.id]} />)}
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {completed.map(o => <CompletedCard key={o.id} order={o} />)}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
