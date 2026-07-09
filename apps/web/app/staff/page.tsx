'use client'
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Utensils, Clock, CheckCircle, TrendingUp,
  Users, Banknote, ArrowRight, RefreshCw, Zap,
  ChefHat, CalendarDays, LayoutGrid, Timer,
} from 'lucide-react'
import type React from 'react'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'

interface TableSummary { id: string; tableNumber: number; name: string | null; status: string; capacity: number }
interface OrderSummary {
  id: string; status: string; type: string; total: number; createdAt: string; paymentStatus: string
  table?: { tableNumber: number; name?: string }
  tokenNumber?: number
  items: { quantity: number; menuItem: { name: string; prepTimeMins?: number } }[]
}

const TABLE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  EMPTY:        { label: 'Available',  bg: '#10b981', text: '#fff' },
  OCCUPIED:     { label: 'Occupied',   bg: '#f43f5e', text: '#fff' },
  BILL_PENDING: { label: 'Bill Due',   bg: 'var(--brand)', text: '#fff' },
  DIRTY:        { label: 'Cleaning',   bg: '#6b7280', text: '#fff' },
}

function formatDuration(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m < 60) return `${m}m ${sec}s`
  return `${Math.floor(m / 60)}h ${m % 60}m ${sec}s`
}
function elapsedMins(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
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
  return { label: overdue ? `-${formatDuration(remaining)}` : `${formatDuration(remaining)} left`, overdue }
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, accent, urgent, onClick,
}: {
  label: string; value: string | number; sub: string
  icon: React.ReactNode; accent?: string; urgent?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className="rounded-2xl border p-4 text-left transition-all hover:opacity-90 active:scale-[0.98] flex flex-col gap-3 w-full"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: urgent ? 'var(--brand)' : 'var(--card-border)' }}>
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: accent ? `${accent}18` : 'var(--muted-bg)' }}>
          {icon}
        </div>
        {urgent && (
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand)' }} />
        )}
      </div>
      <div>
        <div className="text-2xl font-black leading-none" style={{ color: 'var(--text-primary)' }}>{value}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide mt-1.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
        <div className="text-[11px] mt-0.5 font-medium" style={{ color: urgent ? 'var(--brand)' : 'var(--text-muted)' }}>{sub}</div>
      </div>
    </button>
  )
}

function ActiveOrderRow({ o }: { o: OrderSummary }) {
  const estMins = Math.max(...o.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label: timeLabel, overdue } = useOrderTimer(o.createdAt, estMins)
  const label = o.type === 'DINE_IN' ? `Table ${o.table?.name ?? o.table?.tableNumber}` : `Takeaway #${o.tokenNumber}`
  const statusStyles: Record<string, React.CSSProperties> = {
    PENDING:   { backgroundColor: 'var(--c-pending-bg)',  color: 'var(--c-pending-fg)' },
    ACCEPTED:  { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)' },
    PREPARING: { backgroundColor: 'var(--c-warning-bg)',  color: 'var(--c-warning-fg)' },
    READY:     { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)' },
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--card-border)', backgroundColor: overdue ? 'var(--c-danger-bg)' : undefined }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{label}</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={statusStyles[o.status] ?? {}}>{o.status}</span>
        </div>
        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {o.items.slice(0, 2).map((i) => `${i.quantity}× ${i.menuItem.name}`).join(', ')}
          {o.items.length > 2 && ` +${o.items.length - 2}`}
        </div>
      </div>
      <span className="text-[10px] font-bold tabular-nums flex-shrink-0"
        style={{ color: overdue ? 'var(--c-danger-fg)' : 'var(--text-muted)' }}>
        {timeLabel}
      </span>
    </div>
  )
}

function UrgentRow({ order }: { order: OrderSummary }) {
  const estMins = Math.max(...order.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
  const { label } = useOrderTimer(order.createdAt, estMins)
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium" style={{ color: 'var(--c-danger-fg)' }}>
        {order.type === 'DINE_IN' ? `Table ${order.table?.name ?? order.table?.tableNumber}` : `Takeaway #${order.tokenNumber}`}
        {' '}· {order.status}
      </span>
      <span className="font-bold tabular-nums" style={{ color: 'var(--c-danger-fg)' }}>{label}</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
interface ActiveShift { id: string; clockIn: string; user: { id: string; name: string; role: string } }

export default function Dashboard() {
  const router = useRouter()
  const { user } = useAuthStore()
  const isManager = ['OWNER', 'MANAGER'].includes(user?.role ?? '')
  const [tables, setTables]           = useState<TableSummary[]>([])
  const [orders, setOrders]           = useState<OrderSummary[]>([])
  const [todayRevenue, setTodayRevenue] = useState(0)
  const [todayOrders, setTodayOrders]   = useState(0)
  const [loading, setLoading]         = useState(true)
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const requests: Promise<any>[] = [
        api.get('/tables'),
        api.get('/orders/active'),
        api.get('/reports/today').catch(() => ({ data: null })),
      ]
      if (isManager) requests.push(api.get('/shifts/active').catch(() => ({ data: [] })))
      const [tablesRes, ordersRes, reportsRes, shiftsRes] = await Promise.all(requests)
      setTables(tablesRes.data ?? [])
      setOrders(ordersRes.data ?? [])
      setTodayRevenue(reportsRes.data?.grossRevenue ?? 0)
      setTodayOrders(reportsRes.data?.orderCount ?? 0)
      if (isManager) setActiveShifts(shiftsRes?.data ?? [])
    } finally { setLoading(false) }
  }, [isManager])

  useEffect(() => {
    load()
    const socket = getSocket()
    socket.on('order:new',     () => load())
    socket.on('order:updated', () => load())
    return () => { socket.off('order:new'); socket.off('order:updated') }
  }, [load])

  // Derived stats
  const activeOrders   = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status))
  const pending        = orders.filter(o => o.status === 'PENDING')
  const kitchen        = orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status))
  const ready          = orders.filter(o => o.status === 'READY')
  const awaitingPay    = orders.filter(o => o.status === 'DELIVERED' && o.paymentStatus === 'UNPAID')
  const urgent         = orders.filter(o => {
    if (!['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.status)) return false
    const estMins = Math.max(...o.items.map(i => i.menuItem.prepTimeMins ?? 15), 15)
    return elapsedMins(o.createdAt) >= estMins
  })

  const occupied = tables.filter(t => t.status === 'OCCUPIED').length
  const empty    = tables.filter(t => t.status === 'EMPTY').length
  const dirty    = tables.filter(t => t.status === 'DIRTY').length
  const billing  = tables.filter(t => t.status === 'BILL_PENDING').length

  const STATS = [
    {
      label: 'Active Orders',
      value: activeOrders.length,
      sub: pending.length > 0 ? `${pending.length} need approval` : kitchen.length > 0 ? `${kitchen.length} in kitchen` : 'none pending',
      icon: <Utensils size={16} style={{ color: 'var(--brand)' }} />,
      accent: 'var(--brand)',
      urgent: pending.length > 0,
      href: '/staff/orders',
    },
    {
      label: 'Ready to Serve',
      value: ready.length,
      sub: ready.length > 0 ? 'waiting at pass' : 'kitchen on track',
      icon: <CheckCircle size={16} style={{ color: '#10b981' }} />,
      accent: '#10b981',
      urgent: ready.length > 0,
      href: '/staff/orders',
    },
    {
      label: 'Awaiting Payment',
      value: awaitingPay.length,
      sub: awaitingPay.length > 0 ? `${[...new Set(awaitingPay.map(o => o.table?.tableNumber))].length} table${awaitingPay.length !== 1 ? 's' : ''}` : 'all settled',
      icon: <Banknote size={16} style={{ color: '#f43f5e' }} />,
      accent: '#f43f5e',
      urgent: awaitingPay.length > 0,
      href: '/staff/bills',
    },
    {
      label: "Today's Revenue",
      value: `AED ${Number(todayRevenue).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      sub: todayOrders > 0 ? `${todayOrders} order${todayOrders !== 1 ? 's' : ''} settled` : 'no settled orders yet',
      icon: <TrendingUp size={16} style={{ color: '#3b82f6' }} />,
      accent: '#3b82f6',
      urgent: false,
      href: '/staff/bills',
    },
    {
      label: 'Free Tables',
      value: empty,
      sub: `${occupied} occupied · ${billing} billing · ${dirty} cleaning`,
      icon: <LayoutGrid size={16} style={{ color: '#8b5cf6' }} />,
      accent: '#8b5cf6',
      urgent: false,
      href: '/staff/tables',
    },
    {
      label: 'In Kitchen',
      value: kitchen.length,
      sub: kitchen.length > 0 ? `${urgent.filter(o => ['ACCEPTED','PREPARING'].includes(o.status)).length} overdue` : 'no active orders',
      icon: <ChefHat size={16} style={{ color: '#06b6d4' }} />,
      accent: '#06b6d4',
      urgent: urgent.length > 0,
      href: '/staff/orders',
    },
  ]

  const today = new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header — matches h-14 sidebar line */}
      <div className="h-14 flex items-center justify-between px-4 sm:px-6 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--card-border)' }}>
        <div>
          <h1 className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {user?.role === 'OWNER' || user?.role === 'MANAGER' ? 'Overview' : 'Dashboard'}
          </h1>
          <p className="text-[11px] leading-none mt-0.5" style={{ color: 'var(--text-muted)' }}>{today}</p>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} title="Refresh">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

    <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col gap-5">

      {/* ── 6-stat grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {STATS.map(s => (
          <StatCard
            key={s.label}
            label={s.label}
            value={loading ? '—' : s.value}
            sub={s.sub}
            icon={s.icon}
            accent={s.accent}
            urgent={s.urgent}
            onClick={() => router.push(s.href)}
          />
        ))}
      </div>

      {/* ── Urgent alerts ─────────────────────────────────────────── */}
      {urgent.length > 0 && (
        <div className="rounded-2xl px-4 py-3 border"
          style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-bdr)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={13} style={{ color: 'var(--c-danger-fg)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--c-danger-fg)' }}>
              {urgent.length} order{urgent.length !== 1 ? 's' : ''} waiting over 15 minutes
            </span>
          </div>
          <div className="space-y-1.5">
            {urgent.slice(0, 3).map(o => <UrgentRow key={o.id} order={o} />)}
            {urgent.length > 3 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>+{urgent.length - 3} more</div>}
          </div>
          <button onClick={() => router.push('/staff/orders')}
            className="mt-2 flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: 'var(--c-danger-fg)' }}>
            Go to Orders <ArrowRight size={10} />
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">

        {/* ── Floor map ─────────────────────────────────────────── */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>

          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--card-border)' }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Floor Status</h2>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {empty} free · {occupied} occupied · {billing} bill due · {dirty} cleaning
              </p>
            </div>
            <button onClick={() => router.push('/staff/tables')}
              className="text-[11px] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: 'var(--brand)' }}>
              Manage <ArrowRight size={10} />
            </button>
          </div>

          <div className="p-3 grid grid-cols-4 gap-2">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--muted-bg)' }} />
                ))
              : tables.map(t => {
                  const cfg = TABLE_CFG[t.status] ?? TABLE_CFG.EMPTY
                  return (
                    <button key={t.id} onClick={() => router.push('/staff/tables')}
                      className="rounded-xl p-2.5 flex flex-col items-center justify-center gap-0.5 hover:opacity-85 active:scale-95 transition-all"
                      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                      <span className="text-[11px] font-black leading-none">{t.name ?? `T${t.tableNumber}`}</span>
                      <span className="text-[9px] opacity-80 leading-none">{cfg.label}</span>
                    </button>
                  )
                })
            }
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 px-4 pb-3 flex-wrap">
            {Object.entries(TABLE_CFG).map(([, cfg]) => (
              <div key={cfg.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.bg }} />
                <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live queue ────────────────────────────────────────── */}
        <div className="rounded-2xl border overflow-hidden flex flex-col"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>

          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--card-border)' }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Live Queue</h2>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {pending.length} pending · {kitchen.length} in kitchen · {ready.length} ready
              </p>
            </div>
            <button onClick={() => router.push('/staff/orders')}
              className="text-[11px] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: 'var(--brand)' }}>
              Manage <ArrowRight size={10} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-72">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            )}
            {!loading && activeOrders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle size={28} style={{ color: 'var(--c-success-fg)', opacity: 0.4 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All clear — no active orders</p>
              </div>
            )}
            {activeOrders.slice(0, 12).map(o => {
              return <ActiveOrderRow key={o.id} o={o} />
            })}
          </div>

          {activeOrders.length > 12 && (
            <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--card-border)' }}>
              <button onClick={() => router.push('/staff/orders')}
                className="text-xs font-semibold hover:underline w-full text-center"
                style={{ color: 'var(--brand)' }}>
                See all {activeOrders.length} orders →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Active shifts (manager/owner only) ── */}
      {isManager && activeShifts.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
            <Timer size={14} style={{ color: 'var(--brand)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>On Shift Now</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-1"
              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
              {activeShifts.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {activeShifts.map(s => {
              const elapsed = Date.now() - new Date(s.clockIn).getTime()
              const h = Math.floor(elapsed / 3600000)
              const m = Math.floor((elapsed % 3600000) / 60000)
              const dur = h > 0 ? `${h}h ${m}m` : `${m}m`
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.user.name}</span>
                    <span className="text-[10px] ml-2 capitalize" style={{ color: 'var(--text-muted)' }}>{s.user.role.toLowerCase()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {new Date(s.clockIn).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                      {dur}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
    </div>
  )
}
