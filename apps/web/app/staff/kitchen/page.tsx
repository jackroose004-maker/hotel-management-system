'use client'
import { useEffect, useState } from 'react'
import { ChefHat, Clock, Utensils, Package, RefreshCw, Flame } from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { getSocket } from '@/lib/socket'

interface Order {
  id: string; type: string; status: string; createdAt: string; tokenNumber?: number; notes?: string
  table?: { tableNumber: number }
  items: { quantity: number; notes?: string; menuItem: { name: string; prepTimeMins: number } }[]
}

function formatDuration(ms: number) {
  const totalSecs = Math.floor(Math.abs(ms) / 1000)
  if (totalSecs < 60) return `${totalSecs}s`
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins < 60) return `${mins}m ${secs}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ${secs}s`
}

function useElapsed(createdAt: string, estMins: number) {
  const estMs = estMins * 60 * 1000
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(createdAt).getTime())
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - new Date(createdAt).getTime()), 1000)
    return () => clearInterval(t)
  }, [createdAt])
  const remaining = estMs - elapsed
  const late = remaining < 0
  const label = late ? `-${formatDuration(remaining)}` : formatDuration(remaining)
  return { label, mins: Math.floor(elapsed / 60000), late }
}

function OrderTicket({ order, onUpdate }: { order: Order; onUpdate: (id: string, status: string) => void }) {
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label: timeLabel, mins, late } = useElapsed(order.createdAt, estMins)
  const isPreparing = order.status === 'PREPARING'

  return (
    <div className={`group bg-[var(--card-bg)] rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${
      late        ? 'border-red-200 dark:border-red-900'
      : isPreparing ? 'border-orange-200 dark:border-orange-900'
      : 'border-gray-200 dark:border-[var(--card-border)]'
    }`}>

      {/* Colour strip */}
      <div className={`h-1 flex-shrink-0 ${late ? 'bg-red-400' : isPreparing ? 'bg-orange-400' : 'bg-yellow-300 dark:bg-yellow-500'}`} />

      {/* Ticket header */}
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
              {order.type === 'DINE_IN' ? `Table ${order.table?.tableNumber}` : `Token #${order.tokenNumber}`}
            </span>
            {order.tokenNumber && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#d97706' }}>
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

      {/* Items */}
      <div className="px-4 py-3 space-y-2 flex-1">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-extrabold px-2 py-0.5 rounded-md flex-shrink-0 min-w-[28px] text-center">
              {item.quantity}×
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{item.menuItem.name}</p>
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

      {/* Action */}
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

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.get('/orders/active')
      .then(r => setOrders(r.data.filter((o: Order) => ['ACCEPTED', 'PREPARING'].includes(o.status))))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const s = getSocket()
    // Only add to kitchen when order reaches ACCEPTED (manager approved)
    s.on('order:new', (o: Order) => {
      if (o.status === 'ACCEPTED') {
        setOrders(p => [o, ...p])
        const label = o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Takeaway #${o.tokenNumber}`
        notify.info(`New order in kitchen — ${label}`, `🍳 New Order`, { icon: '🍳' })
      }
    })
    s.on('order:updated', (o: Order) => {
      if (['DELIVERED', 'CANCELLED', 'READY', 'PENDING'].includes(o.status)) {
        setOrders(p => p.filter(x => x.id !== o.id))
      } else if (o.status === 'ACCEPTED') {
        // Manager just approved a cash order — add it now
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

  // Sort: late first → pending before preparing → oldest first
  const sorted = [...orders].sort((a, b) => {
    const aMin = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 60000)
    const bMin = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000)
    const aLate = aMin > 20 ? 1 : 0
    const bLate = bMin > 20 ? 1 : 0
    if (bLate !== aLate) return bLate - aLate
    return bMin - aMin
  })

  const lateCount     = orders.filter(o => Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000) > 20).length
  const preparingCount = orders.filter(o => o.status === 'PREPARING').length
  const pendingCount  = orders.filter(o => ['PENDING', 'ACCEPTED'].includes(o.status)).length

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Kitchen Display</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">{orders.length} active</span>
            {pendingCount > 0 && <span className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">{pendingCount} waiting</span>}
            {preparingCount > 0 && <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">{preparingCount} cooking</span>}
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

        {/* Skeleton */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[var(--card-bg)] rounded-2xl border border-gray-200 dark:border-[var(--card-border)] h-48" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-green-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <ChefHat size={28} className="text-green-400 dark:text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kitchen is all clear</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[240px]">No tickets in the queue. Orders accepted by staff will appear here automatically.</p>
            </div>
          </div>
        )}

        {/* Ticket grid — single unified stream, sorted by urgency */}
        {!loading && sorted.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map(o => <OrderTicket key={o.id} order={o} onUpdate={updateStatus} />)}
          </div>
        )}
      </div>
    </div>
  )
}
