'use client'
import { useEffect, useRef, useState } from 'react'
import { ChefHat, Clock, Utensils, Package, RefreshCw, Flame, ChevronDown } from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'

interface Modifier { name: string; priceAdd: number }
interface Order {
  id: string; type: string; status: string; isVoided?: boolean; createdAt: string; tokenNumber?: number; notes?: string
  table?: { tableNumber: number; name?: string | null }
  items: { quantity: number; notes?: string; menuItem: { name: string; prepTimeMins: number }; modifiers?: Modifier[] }[]
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatCountdown(ms: number) {
  const abs = Math.abs(ms)
  const s = Math.floor(abs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m ${s % 60}s`
}

function useElapsed(createdAt: string) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(createdAt).getTime())
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - new Date(createdAt).getTime()), 1000)
    return () => clearInterval(t)
  }, [createdAt])
  return elapsed
}

// ── Passive ticket: no buttons, click to expand items ─────────────────────────
function PassiveTicket({ order }: { order: Order }) {
  const [open, setOpen] = useState(true)
  const elapsed = useElapsed(order.createdAt)
  const mins = Math.floor(elapsed / 60000)
  const late = mins > 20
  const label = order.type === 'DINE_IN'
    ? (order.table?.name ?? `Table ${order.table?.tableNumber}`)
    : `Token #${order.tokenNumber}`

  return (
    <div
      onClick={() => setOpen(o => !o)}
      className={`bg-[var(--card-bg)] rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer ${
        late ? 'border-red-200 dark:border-red-900' : 'border-gray-200 dark:border-[var(--card-border)]'
      }`}
    >
      {/* Colour strip */}
      <div className={`h-1 flex-shrink-0 ${late ? 'bg-red-400' : 'bg-amber-400'}`} />

      {/* Header row — always visible */}
      <div className={`flex items-center justify-between px-4 py-3 ${late ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {order.type === 'DINE_IN'
            ? <Utensils size={13} className="text-orange-500 flex-shrink-0" />
            : <Package size={13} className="text-blue-500 flex-shrink-0" />
          }
          <span className="font-bold text-gray-900 dark:text-white text-sm truncate">{label}</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
            {order.items.reduce((s, i) => s + i.quantity, 0)} item{order.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-bold flex-shrink-0 ml-2 ${late ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {late && <Flame size={12} className="text-red-500" />}
          <Clock size={10} />
          <span>{formatElapsed(elapsed)} ago</span>
          <ChevronDown size={13} className={`ml-1 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expandable items */}
      {open && (
        <div className="px-4 py-3 space-y-2 border-t border-gray-100 dark:border-[var(--card-border)]">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-extrabold px-2 py-0.5 rounded-md flex-shrink-0 min-w-[28px] text-center">
                {item.quantity}×
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{item.menuItem.name}</p>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.modifiers.map((m, mi) => (
                      <p key={mi} className="text-[11px] text-blue-500 dark:text-blue-400 font-medium">+ {m.name}</p>
                    ))}
                  </div>
                )}
                {item.notes && <p className="text-xs text-orange-500 dark:text-orange-400 mt-0.5">↳ {item.notes}</p>}
              </div>
            </div>
          ))}
          {order.notes && (
            <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-lg px-2.5 py-2 mt-1">
              <span className="font-bold flex-shrink-0">Note:</span> {order.notes}
            </div>
          )}
          <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1">
            Received at {new Date(order.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>
        </div>
      )}
    </div>
  )
}

// ── KDS ticket: interactive buttons ───────────────────────────────────────────
function KdsTicket({ order, onUpdate }: { order: Order; onUpdate: (id: string, status: string) => void }) {
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const elapsed = useElapsed(order.createdAt)
  const estMs = estMins * 60 * 1000
  const remaining = estMs - elapsed
  const late = remaining < 0
  const timeLabel = late ? `-${formatCountdown(remaining)}` : formatCountdown(remaining)
  const isPreparing = order.status === 'PREPARING'

  return (
    <div className={`group bg-[var(--card-bg)] rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${
      late        ? 'border-red-200 dark:border-red-900'
      : isPreparing ? 'border-orange-200 dark:border-orange-900'
      : 'border-gray-200 dark:border-[var(--card-border)]'
    }`}>

      <div className={`h-1 flex-shrink-0 ${late ? 'bg-red-400' : isPreparing ? 'bg-orange-400' : 'bg-yellow-300 dark:bg-yellow-500'}`} />

      <div className={`flex items-center justify-between px-4 py-3 flex-shrink-0 ${
        late ? 'bg-red-50 dark:bg-red-900/20'
        : isPreparing ? 'bg-orange-50 dark:bg-orange-900/20'
        : 'bg-gray-50 dark:bg-gray-800/50'
      }`}>
        <div className="flex items-center gap-2">
          {order.type === 'DINE_IN'
            ? <Utensils size={13} className="text-orange-500 flex-shrink-0" />
            : <Package size={13} className="text-blue-500 flex-shrink-0" />
          }
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-900 dark:text-white text-sm">
              {order.type === 'DINE_IN' ? (order.table?.name ?? `Table ${order.table?.tableNumber}`) : `Token #${order.tokenNumber}`}
            </span>
            {order.tokenNumber && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: '#d97706' }}>
                #{order.tokenNumber}
              </span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-bold ${late ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {late && <Flame size={12} className="text-red-500" />}
          <Clock size={10} />
          {late ? timeLabel : `${timeLabel} left`}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2 flex-1">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-extrabold px-2 py-0.5 rounded-md flex-shrink-0 min-w-[28px] text-center">
              {item.quantity}×
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{item.menuItem.name}</p>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {item.modifiers.map((m, mi) => (
                    <p key={mi} className="text-[11px] text-blue-500 dark:text-blue-400 font-medium">+ {m.name}</p>
                  ))}
                </div>
              )}
              {item.notes && <p className="text-xs text-orange-500 dark:text-orange-400 mt-0.5">↳ {item.notes}</p>}
            </div>
          </div>
        ))}
        {order.notes && (
          <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-lg px-2.5 py-2 mt-1">
            <span className="font-bold flex-shrink-0">Note:</span> {order.notes}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex-shrink-0">
        {(order.status === 'PENDING' || order.status === 'ACCEPTED') && (
          <button onClick={() => onUpdate(order.id, 'PREPARING')}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm shadow-orange-200 dark:shadow-none">
            Start Preparing
          </button>
        )}
        {isPreparing && (
          <button onClick={() => onUpdate(order.id, 'READY')}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm">
            Ready to Serve ✓
          </button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [thermal, setThermal] = useState<boolean | null>(null)
  const thermalRef = useRef<boolean | null>(null)

  const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY']

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/orders/active'),
      api.get('/settings'),
    ]).then(([ordersRes, settingsRes]) => {
      const isThermal = !!settingsRes.data.thermalEnabled
      thermalRef.current = isThermal
      setThermal(isThermal)
      const statuses = isThermal ? ACTIVE_STATUSES : ['ACCEPTED', 'PREPARING']
      setOrders(ordersRes.data.filter((o: Order) => statuses.includes(o.status)))
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const s = getSocket()
    s.on('order:new', (o: Order & { heldUntil?: string | null }) => {
      // Cooling hold: guest can still free-cancel — kitchen sees it only on release
      if (o.heldUntil && new Date(o.heldUntil) > new Date()) return
      // Thermal mode: show new PENDING orders immediately (no accept step)
      // Non-thermal: only show once staff accepts (ACCEPTED status)
      const isThermal = thermalRef.current
      const shouldShow = isThermal ? o.status === 'PENDING' : o.status === 'ACCEPTED'
      if (shouldShow) {
        setOrders(p => [o, ...p])
        const label = o.type === 'DINE_IN'
          ? (o.table?.name ?? `Table ${o.table?.tableNumber}`)
          : `Takeaway #${o.tokenNumber}`
        notify.info(`New order in kitchen — ${label}`, `🍳 New Order`, { icon: '🍳' })
      }
    })
    s.on('order:updated', (o: Order) => {
      if (['DELIVERED', 'CANCELLED'].includes(o.status) || o.isVoided) {
        setOrders(p => p.filter(x => x.id !== o.id))
      } else if (o.status === 'ACCEPTED' || (thermalRef.current && o.status === 'PENDING')) {
        // Add to list if not already present (could arrive via update not new)
        setOrders(p => p.some(x => x.id === o.id) ? p.map(x => x.id === o.id ? o : x) : [o, ...p])
      } else {
        setOrders(p => p.map(x => x.id === o.id ? o : x))
      }
    })
    return () => { s.off('order:new'); s.off('order:updated') }
  }, [])

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/orders/${id}/status`, { status })
    if (status === 'READY') {
      setOrders(p => p.filter(o => o.id !== id))
      notify.order.ready('Order')
    } else {
      setOrders(p => p.map(o => o.id === id ? { ...o, status } : o))
    }
  }

  const sorted = [...orders].sort((a, b) => {
    const aMs = Date.now() - new Date(a.createdAt).getTime()
    const bMs = Date.now() - new Date(b.createdAt).getTime()
    return bMs - aMs // oldest first
  })

  const lateCount = orders.filter(o => (Date.now() - new Date(o.createdAt).getTime()) > 20 * 60 * 1000).length

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Kitchen Display</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {thermal !== null && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                thermal
                  ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
              }`}>
                {thermal ? 'Thermal printer mode' : 'KDS mode'}
              </span>
            )}
            <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">{orders.length} active</span>
            {lateCount > 0 && <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{lateCount} late</span>}
          </div>
        </div>
        <button onClick={load}
          className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Board */}
      <div className="p-4 sm:p-6">

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[var(--card-bg)] rounded-2xl border border-gray-200 dark:border-[var(--card-border)] h-16" />
            ))}
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-green-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <ChefHat size={28} className="text-green-400 dark:text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kitchen is all clear</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[240px]">No active tickets. New orders will appear here automatically.</p>
            </div>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {thermal
              ? sorted.map(o => <PassiveTicket key={o.id} order={o} />)
              : sorted.map(o => <KdsTicket key={o.id} order={o} onUpdate={updateStatus} />)
            }
          </div>
        )}
      </div>
    </div>
  )
}
