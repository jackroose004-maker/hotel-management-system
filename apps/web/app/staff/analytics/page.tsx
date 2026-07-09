'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, ShoppingBag, CreditCard, Banknote, Utensils, ArrowUpRight,
  Printer, RefreshCw, ChevronLeft, ChevronRight, Scissors,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { apiFetch } from '@/lib/api'
import api from '@/lib/api'

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

interface EodData {
  date: string
  orderCount: number; dineInCount: number; takeawayCount: number
  cashTotal: number; cardTotal: number
  splitCashTotal: number; splitCardTotal: number
  totalCashInTill: number; totalCardTerminal: number
  netRevenue: number; grossRevenue: number
  discountsGiven: number; vatCollected: number; tipTotal: number
  voidsTotal: number; voidCount: number; avgOrderValue: number
  hourly: { hour: number; orders: number; cash: number; card: number }[]
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
        {byDay.map((d) => {
          const pct = (d.revenue / maxRev) * 100
          const isMax = d.revenue === maxRev && d.revenue > 0
          const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center group relative">
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
                <div className="bg-gray-900 dark:bg-gray-800 border border-white/10 text-white text-[10px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap">
                  <div className="font-bold" style={{ color: 'var(--brand)' }}>AED {d.revenue.toFixed(0)}</div>
                  <div className="text-gray-400">{d.orders} orders</div>
                </div>
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-800" />
              </div>
              <div className="w-full rounded-t-lg overflow-hidden" style={{ height: `${Math.max(pct, d.revenue > 0 ? 3 : 0)}%` }}>
                <div className="w-full h-full"
                  style={isMax
                    ? { background: 'linear-gradient(to top, rgba(var(--brand-rgb),1), rgba(var(--brand-rgb),0.7))' }
                    : { backgroundColor: 'rgba(var(--brand-rgb),0.55)' }} />
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
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
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
              <div className={`w-full rounded-sm transition-all ${h.count === 0 ? 'bg-gray-100 dark:bg-white/[0.03]' : isPeak ? '' : 'bg-blue-400 dark:bg-blue-500/70'}`}
                style={{ height: `${Math.max(pct, h.count > 0 ? 8 : 0)}%`, ...(isPeak && h.count > 0 ? { backgroundColor: 'var(--brand)' } : {}) }} />
              {h.hour % 6 === 0 && <div className="text-[8px] text-gray-400 mt-1">{fmt(h.hour)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Utensils size={28} className="text-gray-200 dark:text-gray-800" />
          <div className="text-sm text-gray-400">No orders yet</div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => {
            const pct = (item.qty / (items[0]?.qty ?? 1)) * 100
            const colors = ['#f59e0b', '#fb923c', '#fbbf24', '#a3a3a3', '#737373']
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
      )}
    </div>
  )
}

function OrderMix({ data }: { data: AnalyticsData }) {
  const rows = [
    { label: 'Dine-In',  value: data.dineIn,     color: '#f59e0b', bg: '' },
    { label: 'Takeaway', value: data.takeaway,    color: '#60a5fa', bg: 'bg-blue-400' },
    { label: 'Card',     value: data.paidOrders,  color: '#4ade80', bg: 'bg-green-400' },
    { label: 'Cash',     value: data.cashOrders,  color: '#c084fc', bg: 'bg-purple-400' },
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
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <ShoppingBag size={28} className="text-gray-200 dark:text-gray-800" />
          <div className="text-sm text-gray-400">No orders in this period</div>
        </div>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-6">
            {rows.map(r => r.value > 0 && (
              <div key={r.label} className={`${r.bg} transition-all`}
                style={{ width: `${(r.value / total) * 100}%`, ...(r.bg === '' ? { backgroundColor: 'var(--brand)' } : {}) }}
                title={`${r.label}: ${r.value}`} />
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
      )}
    </div>
  )
}

// ─── EOD Report ─────────────────────────────────────────────────────────────
function EodReport({ eod, date, onDateChange, loading, onRefresh }: {
  eod: EodData | null
  date: string
  onDateChange: (d: string) => void
  loading: boolean
  onRefresh: () => void
}) {
  const fmt = (h: number) => h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`
  const maxHourlyTotal = eod ? Math.max(...eod.hourly.map(h => h.cash + h.card), 1) : 1

  function prevDay() {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1)
    onDateChange(d.toISOString().split('T')[0])
  }
  function nextDay() {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 1)
    const today = new Date().toISOString().split('T')[0]
    if (d.toISOString().split('T')[0] <= today) onDateChange(d.toISOString().split('T')[0])
  }

  function printReport() {
    if (!eod) return
    const dateLabel = new Date(eod.date + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const html = `<!DOCTYPE html><html><head><title>EOD Report – ${dateLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;max-width:420px;margin:32px auto;padding:24px;color:#111}
h1{font-size:20px;font-weight:800;color:#f97316}h2{font-size:12px;color:#888;margin-top:2px}
.date{font-size:13px;color:#555;margin:16px 0 4px}
section{margin-top:20px;padding-top:16px;border-top:1px solid #eee}
h3{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.row.bold{font-weight:800;font-size:15px;margin-top:6px;padding-top:8px;border-top:1px solid #eee}
.green{color:#16a34a}.blue{color:#2563eb}.muted{color:#aaa}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dcfce7;color:#15803d;margin-top:12px}
.footer{font-size:10px;color:#999;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<h1>Shift Close Report</h1><h2>${dateLabel}</h2>
<section>
<h3>Till Reconciliation</h3>
<div class="row"><span>Cash in Till</span><span class="green">AED ${eod.totalCashInTill.toFixed(2)}</span></div>
<div class="row muted"><span style="padding-left:12px">· Direct cash</span><span>AED ${eod.cashTotal.toFixed(2)}</span></div>
${eod.splitCashTotal > 0 ? `<div class="row muted"><span style="padding-left:12px">· Split (cash portion)</span><span>AED ${eod.splitCashTotal.toFixed(2)}</span></div>` : ''}
<div class="row"><span>Card Terminal</span><span class="blue">AED ${eod.totalCardTerminal.toFixed(2)}</span></div>
<div class="row muted"><span style="padding-left:12px">· Direct card</span><span>AED ${eod.cardTotal.toFixed(2)}</span></div>
${eod.splitCardTotal > 0 ? `<div class="row muted"><span style="padding-left:12px">· Split (card portion)</span><span>AED ${eod.splitCardTotal.toFixed(2)}</span></div>` : ''}
<div class="row bold"><span>Net Revenue</span><span>AED ${eod.netRevenue.toFixed(2)}</span></div>
</section>
<section>
<h3>Adjustments</h3>
<div class="row"><span>Tips (Gratuity)</span><span>AED ${(eod.tipTotal ?? 0).toFixed(2)}</span></div>
<div class="row"><span>Discounts Given</span><span>−AED ${eod.discountsGiven.toFixed(2)}</span></div>
<div class="row"><span>Voids</span><span>−AED ${eod.voidsTotal.toFixed(2)} (${eod.voidCount})</span></div>
<div class="row"><span>VAT Collected (5%)</span><span>AED ${eod.vatCollected.toFixed(2)}</span></div>
</section>
<section>
<h3>Orders</h3>
<div class="row"><span>Total Orders</span><span>${eod.orderCount}</span></div>
<div class="row"><span>Dine-In</span><span>${eod.dineInCount}</span></div>
<div class="row"><span>Takeaway</span><span>${eod.takeawayCount}</span></div>
<div class="row"><span>Avg Order Value</span><span>AED ${eod.avgOrderValue.toFixed(2)}</span></div>
</section>
<div class="footer">Generated ${new Date().toLocaleString('en-AE')} · Al Manzil POS</div>
<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
  }

  const isToday = date === new Date().toISOString().split('T')[0]
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-4">
      {/* Date navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevDay} className="p-2 rounded-xl border transition-colors"
          style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center">
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{dateLabel}</span>
          {isToday && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>Today</span>}
        </div>
        <button onClick={nextDay} disabled={isToday} className="p-2 rounded-xl border transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
          <ChevronRight size={16} />
        </button>
        <button onClick={onRefresh} className="p-2 rounded-xl border transition-colors"
          style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        {eod && (
          <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors"
            style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
            <Printer size={13} /> Print
          </button>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }} />
          ))}
        </div>
      )}

      {!loading && !eod && (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          <Scissors size={36} />
          <p className="text-sm font-semibold">No data for this date</p>
        </div>
      )}

      {!loading && eod && (
        <>
          {/* ── Till reconciliation — the main numbers ── */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Till Reconciliation</p>
            </div>
            <div className="p-5 space-y-3">
              {/* Cash */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Banknote size={16} className="text-green-400" />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Cash in Till</span>
                  </div>
                  {eod.splitCashTotal > 0 && (
                    <p className="text-[11px] mt-0.5 ml-6" style={{ color: 'var(--text-muted)' }}>
                      Direct AED {eod.cashTotal.toFixed(2)} + Split AED {eod.splitCashTotal.toFixed(2)}
                    </p>
                  )}
                </div>
                <span className="text-2xl font-black text-green-400">AED {eod.totalCashInTill.toFixed(2)}</span>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--card-border)' }} />

              {/* Card */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-blue-400" />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Card Terminal</span>
                  </div>
                  {eod.splitCardTotal > 0 && (
                    <p className="text-[11px] mt-0.5 ml-6" style={{ color: 'var(--text-muted)' }}>
                      Direct AED {eod.cardTotal.toFixed(2)} + Split AED {eod.splitCardTotal.toFixed(2)}
                    </p>
                  )}
                </div>
                <span className="text-2xl font-black text-blue-400">AED {eod.totalCardTerminal.toFixed(2)}</span>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--card-border)' }} />

              {/* Net */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Net Revenue</span>
                <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>AED {eod.netRevenue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ── Adjustments + Stats grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Orders', value: String(eod.orderCount), sub: `${eod.dineInCount} dine · ${eod.takeawayCount} takeaway`, color: 'rgba(var(--brand-rgb),0.1)', fg: 'var(--brand)' },
              { label: 'Avg Order', value: `AED ${eod.avgOrderValue.toFixed(0)}`, sub: 'per order', color: 'rgba(59,130,246,0.1)', fg: '#60a5fa' },
              { label: 'Tips', value: `AED ${(eod.tipTotal ?? 0).toFixed(0)}`, sub: 'total gratuity collected', color: 'rgba(22,163,74,0.1)', fg: '#4ade80' },
              { label: 'Discounts', value: `−AED ${eod.discountsGiven.toFixed(0)}`, sub: `off AED ${eod.grossRevenue.toFixed(0)} gross`, color: 'rgba(234,179,8,0.1)', fg: '#eab308' },
              { label: 'VAT Collected', value: `AED ${eod.vatCollected.toFixed(0)}`, sub: '5% UAE VAT', color: 'rgba(168,85,247,0.1)', fg: '#a855f7' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: s.color }}>
                  <TrendingUp size={14} style={{ color: s.fg }} />
                </div>
                <div className="text-lg font-extrabold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Hourly cash vs card bar chart ── */}
          {eod.hourly.length > 0 && (
            <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hourly Breakdown</p>
                <div className="flex items-center gap-3 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Cash</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Card</span>
                </div>
              </div>
              <div className="flex items-end gap-1 h-28">
                {eod.hourly.map(h => {
                  const total = h.cash + h.card
                  const pct = (total / maxHourlyTotal) * 100
                  const cashPct = total > 0 ? (h.cash / total) * 100 : 0
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
                      <div className="absolute -top-14 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                        <div className="text-[10px] px-2 py-1.5 rounded-lg whitespace-nowrap border"
                          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                          <div className="text-green-400">Cash AED {h.cash.toFixed(0)}</div>
                          <div className="text-blue-400">Card AED {h.card.toFixed(0)}</div>
                          <div className="font-bold">{h.orders} orders</div>
                        </div>
                      </div>
                      <div className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse" style={{ height: `${Math.max(pct, total > 0 ? 5 : 0)}%` }}>
                        <div style={{ height: `${cashPct}%`, backgroundColor: '#4ade80', minHeight: h.cash > 0 ? 3 : 0 }} />
                        <div style={{ height: `${100 - cashPct}%`, backgroundColor: '#60a5fa', minHeight: h.card > 0 ? 3 : 0 }} />
                      </div>
                      <div className="text-[8px] mt-1" style={{ color: 'var(--text-muted)' }}>{fmt(h.hour)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Voids note */}
          {eod.voidCount > 0 && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <span className="text-amber-400 text-sm">⚠</span>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {eod.voidCount} void{eod.voidCount !== 1 ? 's' : ''} totalling AED {eod.voidsTotal.toFixed(2)} — excluded from revenue
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

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
  const [tab, setTab] = useState<'analytics' | 'eod'>('analytics')
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const todayStr = new Date().toISOString().split('T')[0]
  const [eodDate, setEodDate] = useState(todayStr)
  const [eod, setEod] = useState<EodData | null>(null)
  const [eodLoading, setEodLoading] = useState(false)

  useEffect(() => {
    if (tab !== 'analytics' || !token) return
    setLoading(true)
    apiFetch<AnalyticsData>(`/orders/analytics?period=${period}`, { token })
      .then(setData).catch(console.error).finally(() => setLoading(false))
  }, [period, token, tab])

  const loadEod = useCallback(async () => {
    if (!token) return
    setEodLoading(true)
    try {
      const { data: d } = await api.get(`/orders/eod-report?date=${eodDate}`)
      setEod(d)
    } catch { setEod(null) }
    finally { setEodLoading(false) }
  }, [eodDate, token])

  useEffect(() => {
    if (tab === 'eod') loadEod()
  }, [tab, loadEod])

  const stats = data ? [
    { icon: TrendingUp, label: 'Total Revenue',  value: `AED ${data.totalRevenue.toFixed(0)}`,  sub: `Avg AED ${data.avgOrderValue.toFixed(0)} per order`, accentStyle: { backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' } as React.CSSProperties },
    { icon: ShoppingBag, label: 'Total Orders',   value: String(data.totalOrders),                sub: `${data.dineIn} dine-in · ${data.takeaway} takeaway`, accent: 'bg-blue-50 dark:bg-blue-500/10 text-blue-500' },
    { icon: CreditCard,  label: 'Card Paid',      value: String(data.paidOrders),                 sub: data.totalOrders > 0 ? `${Math.round(data.paidOrders / data.totalOrders * 100)}% of orders` : '—', accent: 'bg-green-50 dark:bg-green-500/10 text-green-500' },
    { icon: Banknote,    label: 'Cash Orders',    value: String(data.cashOrders),                 sub: data.totalOrders > 0 ? `${Math.round(data.cashOrders / data.totalOrders * 100)}% of orders` : '—', accent: 'bg-purple-50 dark:bg-purple-500/10 text-purple-500' },
  ] : []

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-3 sm:py-0 sm:h-14 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Revenue, performance & shift close</p>
        </div>

        {/* Main tab toggle */}
        <div className="flex rounded-xl p-1 self-start sm:self-auto border" style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)' }}>
          <button onClick={() => setTab('analytics')}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === 'analytics'
              ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
              : { color: 'var(--text-muted)' }}>
            Analytics
          </button>
          <button onClick={() => setTab('eod')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === 'eod'
              ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
              : { color: 'var(--text-muted)' }}>
            <Scissors size={12} /> Shift Close
          </button>
        </div>

        {/* Period picker — only for analytics tab */}
        {tab === 'analytics' && (
          <div className="flex rounded-xl p-1 self-start sm:self-auto border" style={{ backgroundColor: 'var(--muted-bg)', borderColor: 'var(--card-border)' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={period === p.key
                  ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                  : { color: 'var(--text-muted)' }}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 flex-1 overflow-auto">

        {/* ── Analytics tab ── */}
        {tab === 'analytics' && (
          <>
            {loading && <Skeleton />}
            {data && !loading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {stats.map(s => (
                    <div key={s.label} className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-200 dark:border-white/[0.06] p-5 group hover:shadow-md transition-all shadow-sm">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${(s as any).accent ?? ''}`}
                        style={(s as any).accentStyle}>
                        <s.icon size={16} />
                      </div>
                      <div className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{s.value}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-0.5">{s.label}</div>
                      {s.sub && <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">{s.sub}</div>}
                    </div>
                  ))}
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  {data.byDay.length > 1 ? <RevenueChart byDay={data.byDay} /> : (
                    <div className="bg-white dark:bg-[var(--card-bg)] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6 flex flex-col justify-center">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Revenue Today</div>
                      <div className="text-5xl font-extrabold tracking-tight" style={{ color: 'var(--brand)' }}>AED {data.totalRevenue.toFixed(0)}</div>
                      <div className="text-sm text-gray-400 mt-2">{data.totalOrders} order{data.totalOrders !== 1 ? 's' : ''} placed</div>
                      <div className="flex items-center gap-1.5 mt-4 text-xs text-green-500 font-semibold">
                        <ArrowUpRight size={13} /> Live — refreshes with each order
                      </div>
                    </div>
                  )}
                  <HourlyChart hourly={data.hourly} />
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <TopItems items={data.topItems} />
                  <OrderMix data={data} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Shift Close tab ── */}
        {tab === 'eod' && (
          <EodReport
            eod={eod}
            date={eodDate}
            onDateChange={setEodDate}
            loading={eodLoading}
            onRefresh={loadEod}
          />
        )}
      </div>
    </div>
  )
}
