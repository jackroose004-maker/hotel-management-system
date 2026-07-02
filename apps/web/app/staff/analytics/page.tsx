'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, ShoppingBag, CreditCard, Banknote, Utensils, ArrowUpRight } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { apiFetch } from '@/lib/api'

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 Days' },
  { key: '30d',   label: '30 Days' },
]

interface AnalyticsData {
  totalRevenue: number; totalOrders: number; paidOrders: number; cashOrders: number
  dineIn: number; takeaway: number; avgOrderValue: number
  byDay: { date: string; revenue: number; orders: number }[]
  hourly: { hour: number; count: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
}

// ─── Revenue chart ─────────────────────────────────────────────────────────
function RevenueChart({ byDay }: { byDay: { date: string; revenue: number; orders: number }[] }) {
  const maxRev = Math.max(...byDay.map(d => d.revenue), 1)
  return (
    <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5">Daily — hover bars for details</p>
        </div>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.06] px-3 py-1 rounded-full">
          AED {byDay.reduce((s, d) => s + d.revenue, 0).toFixed(0)} total
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {byDay.map((d, i) => {
          const pct = (d.revenue / maxRev) * 100
          const isMax = d.revenue === maxRev && d.revenue > 0
          const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center group relative">
              {/* Tooltip */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
                <div className="bg-gray-900 dark:bg-gray-800 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap">
                  <div className="font-bold text-orange-400">AED {d.revenue.toFixed(0)}</div>
                  <div className="text-gray-400">{d.orders} orders</div>
                </div>
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-800" />
              </div>
              {/* Bar */}
              <div className="w-full rounded-t-lg overflow-hidden"
                style={{ height: `${Math.max(pct, d.revenue > 0 ? 3 : 0)}%` }}>
                <div className={`w-full h-full transition-opacity group-hover:opacity-100
                  ${isMax ? 'bg-gradient-to-t from-orange-600 to-orange-400' : 'bg-orange-500/60 dark:bg-orange-500/40 group-hover:bg-orange-500/80'}`} />
              </div>
              <div className="text-[9px] text-gray-400 mt-1.5 text-center">{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Hourly heatmap ─────────────────────────────────────────────────────────
function HourlyChart({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const maxCount = Math.max(...hourly.map(h => h.count), 1)
  const peak = hourly.reduce((a, b) => b.count > a.count ? b : a, { hour: 0, count: 0 })
  const fmt = (h: number) => h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`

  return (
    <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Busiest Hours</h3>
          <p className="text-xs text-gray-400 mt-0.5">Orders placed per hour of day</p>
        </div>
        {peak.count > 0 && (
          <span className="text-xs font-bold text-orange-500 bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 px-3 py-1 rounded-full">
            Peak {fmt(peak.hour)}
          </span>
        )}
      </div>
      <div className="flex items-end gap-px h-24">
        {hourly.map(h => {
          const pct = (h.count / maxCount) * 100
          const isPeak = h.hour === peak.hour && h.count > 0
          return (
            <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
              {h.count > 0 && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 dark:bg-gray-800 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap border border-white/10">
                    {fmt(h.hour)}: {h.count}
                  </div>
                </div>
              )}
              <div className={`w-full rounded-sm transition-all ${h.count === 0
                ? 'bg-gray-100 dark:bg-white/[0.03]'
                : isPeak ? 'bg-orange-500' : 'bg-blue-400 dark:bg-blue-500/70'}`}
                style={{ height: `${Math.max(pct, h.count > 0 ? 8 : 0)}%` }} />
              {h.hour % 6 === 0 && <div className="text-[8px] text-gray-400 mt-1">{fmt(h.hour)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Top items ──────────────────────────────────────────────────────────────
function TopItems({ items }: { items: { name: string; qty: number; revenue: number }[] }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Top Sellers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Most-ordered dishes this period</p>
        </div>
        <Utensils size={16} className="text-gray-300 dark:text-gray-700" />
      </div>
      {items.length === 0
        ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Utensils size={28} className="text-gray-200 dark:text-gray-800" />
            <div className="text-sm text-gray-400">No orders yet</div>
          </div>
        )
        : (
          <div className="space-y-4">
            {items.map((item, i) => {
              const pct = (item.qty / (items[0]?.qty ?? 1)) * 100
              const colors = ['#f97316', '#fb923c', '#fbbf24', '#a3a3a3', '#737373']
              return (
                <div key={item.name}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm w-5 flex-shrink-0">{medals[i] ?? `${i + 1}.`}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                    <span className="text-sm font-extrabold text-gray-900 dark:text-white flex-shrink-0">{item.qty}<span className="text-gray-400 font-normal text-xs">×</span></span>
                    <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">AED {item.revenue.toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colors[i] ?? '#737373' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ─── Order mix ──────────────────────────────────────────────────────────────
function OrderMix({ data }: { data: AnalyticsData }) {
  const rows = [
    { label: 'Dine-In',   value: data.dineIn,      color: '#f97316', bg: 'bg-orange-500' },
    { label: 'Takeaway',  value: data.takeaway,     color: '#60a5fa', bg: 'bg-blue-400' },
    { label: 'Card',      value: data.paidOrders,   color: '#4ade80', bg: 'bg-green-400' },
    { label: 'Cash',      value: data.cashOrders,   color: '#c084fc', bg: 'bg-purple-400' },
  ]
  const total = data.totalOrders
  return (
    <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Order Mix</h3>
          <p className="text-xs text-gray-400 mt-0.5">Type & payment breakdown</p>
        </div>
        <ShoppingBag size={16} className="text-gray-300 dark:text-gray-700" />
      </div>
      {total === 0
        ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <ShoppingBag size={28} className="text-gray-200 dark:text-gray-800" />
            <div className="text-sm text-gray-400">No orders in this period</div>
          </div>
        )
        : (
          <>
            {/* Stacked bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-6">
              {rows.map(r => r.value > 0 && (
                <div key={r.label} className={`${r.bg} transition-all`}
                  style={{ width: `${(r.value / total) * 100}%` }} title={`${r.label}: ${r.value}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {rows.map(r => (
                <div key={r.label} className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{r.label}</span>
                  </div>
                  <div className="text-xl font-extrabold text-gray-900 dark:text-white">{r.value}</div>
                  <div className="text-[10px] text-gray-400">{total > 0 ? Math.round(r.value / total * 100) : 0}%</div>
                </div>
              ))}
            </div>
          </>
        )
      }
    </div>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border dark:border-white/[0.06] p-6 h-32">
            <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/[0.06] mb-4" />
            <div className="h-6 bg-gray-100 dark:bg-white/[0.06] rounded-lg w-3/4 mb-2" />
            <div className="h-3 bg-gray-50 dark:bg-white/[0.04] rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border dark:border-white/[0.06] h-56" />
        ))}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { token } = useAuthStore()
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiFetch<AnalyticsData>(`/orders/analytics?period=${period}`, { token })
      .then(setData).catch(console.error).finally(() => setLoading(false))
  }, [period, token])

  const stats = data ? [
    {
      icon: TrendingUp,
      label: 'Total Revenue',
      value: `AED ${data.totalRevenue.toFixed(0)}`,
      sub: `Avg AED ${data.avgOrderValue.toFixed(0)} per order`,
      accent: 'bg-orange-50 dark:bg-orange-500/10 text-orange-500',
    },
    {
      icon: ShoppingBag,
      label: 'Total Orders',
      value: String(data.totalOrders),
      sub: `${data.dineIn} dine-in · ${data.takeaway} takeaway`,
      accent: 'bg-blue-50 dark:bg-blue-500/10 text-blue-500',
    },
    {
      icon: CreditCard,
      label: 'Card Paid',
      value: String(data.paidOrders),
      sub: data.totalOrders > 0 ? `${Math.round(data.paidOrders / data.totalOrders * 100)}% of orders` : '—',
      accent: 'bg-green-50 dark:bg-green-500/10 text-green-500',
    },
    {
      icon: Banknote,
      label: 'Cash Orders',
      value: String(data.cashOrders),
      sub: data.totalOrders > 0 ? `${Math.round(data.cashOrders / data.totalOrders * 100)}% of orders` : '—',
      accent: 'bg-purple-50 dark:bg-purple-500/10 text-purple-500',
    },
  ] : []

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-xs text-gray-400 mt-0.5">Revenue, orders, and performance</p>
        </div>
        <div className="flex bg-amber-50 dark:bg-amber-900/10 rounded-xl p-1 self-start sm:self-auto border border-gray-200 dark:border-gray-700">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p.key
                  ? 'bg-white dark:bg-[var(--muted-bg)] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">

      {loading && <Skeleton />}

      {data && !loading && (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map(s => (
              <div key={s.label} className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-200 dark:border-white/[0.06] p-5 group hover:shadow-md dark:hover:border-white/10 transition-all shadow-sm">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${s.accent}`}>
                  <s.icon size={16} />
                </div>
                <div className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{s.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">{s.label}</div>
                {s.sub && <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-4">
            {data.byDay.length > 1
              ? <RevenueChart byDay={data.byDay} />
              : (
                <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6 flex flex-col justify-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Revenue Today</div>
                  <div className="text-5xl font-extrabold text-orange-500 tracking-tight">AED {data.totalRevenue.toFixed(0)}</div>
                  <div className="text-sm text-gray-400 mt-2">{data.totalOrders} order{data.totalOrders !== 1 ? 's' : ''} placed</div>
                  <div className="flex items-center gap-1.5 mt-4 text-xs text-green-500 font-semibold">
                    <ArrowUpRight size={13} /> Live — refreshes with each order
                  </div>
                </div>
              )
            }
            <HourlyChart hourly={data.hourly} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <TopItems items={data.topItems} />
            <OrderMix data={data} />
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
