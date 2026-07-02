'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Receipt, RefreshCw, Printer, CreditCard, Banknote, Clock,
  CheckCircle2, History, Users, ChevronDown, ChevronRight,
  Package, Phone, Loader2, BadgeCheck, ArrowRight,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TableRow { id: string; tableNumber: number; name: string | null; status: string; capacity: number }
interface BillOrder {
  id: string; status: string; paymentStatus: string; paymentMethod?: string
  createdAt: string; subtotal: number; vatAmount: number; total: number
  user?: { name: string } | null
  items: { quantity: number; unitPrice: number; menuItem: { name: string } }[]
}
interface BillSummary { subtotal: number; vatAmount: number; total: number; allPaid: boolean; anyUnpaid: boolean; orderCount: number }
interface Tab { sessionId: string; orders: BillOrder[]; summary: BillSummary }
interface ActiveTableEntry { table: TableRow; tabs: Tab[]; combined: BillSummary }
interface ClosedSession { table: TableRow; sessionId: string; orders: BillOrder[]; summary: BillSummary; closedAt: string }
interface TakeawayEntry {
  tokenNumber: number; contactPhone: string | null
  customer: { id: string; name: string } | null
  orders: BillOrder[]; summary: BillSummary; latestStatus: string; createdAt: string
}

function tabLabel(tab: Tab, idx: number) {
  const user = tab.orders.find(o => o.user)?.user
  return user ? user.name.split(' ')[0] : `Guest ${idx + 1}`
}

// ── Print helpers ─────────────────────────────────────────────────────────────
function buildReceiptHtml(title: string, rows: { name: string; qty: number; total: number }[], summary: BillSummary, paidLabel?: string) {
  const now = new Date().toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })
  return `<!DOCTYPE html><html><head><title>Receipt – ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;max-width:360px;margin:32px auto;padding:24px;color:#111}
h1{font-size:22px;font-weight:800;color:#f97316}h2{font-size:13px;color:#666;margin-top:2px}
.meta{font-size:11px;color:#999;margin:16px 0 8px;padding-top:16px;border-top:1px solid #eee}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th{text-align:left;font-weight:600;color:#666;padding:4px 0;border-bottom:1px solid #eee}
td{padding:5px 0;border-bottom:1px solid #f5f5f5}td:last-child,th:last-child{text-align:right}
.totals td{padding:3px 0}.totals td:last-child{text-align:right}.totals tr:last-child{font-size:16px;font-weight:800}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-top:12px}
.paid{background:#dcfce7;color:#15803d}.unpaid{background:#fef9c3;color:#854d0e}
.footer{font-size:10px;color:#999;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<h1>Al Manzil</h1><h2>Kerala & South Indian Cuisine</h2>
<p class="meta"><strong>${title}</strong> &nbsp;·&nbsp; ${now}<br>Receipt #${Date.now().toString(36).toUpperCase().slice(-8)}</p>
<table><tr><th>Item</th><th>Qty</th><th>AED</th></tr>
${rows.map(r => `<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.total.toFixed(2)}</td></tr>`).join('')}
</table>
<table class="totals" style="margin-top:16px">
<tr><td style="color:#666">Subtotal</td><td>AED ${Number(summary.subtotal).toFixed(2)}</td></tr>
<tr><td style="color:#666">VAT (5%)</td><td>AED ${Number(summary.vatAmount).toFixed(2)}</td></tr>
<tr><td style="padding-top:8px">Total</td><td style="padding-top:8px">AED ${Number(summary.total).toFixed(2)}</td></tr>
</table>
<div><span class="badge ${summary.allPaid ? 'paid' : 'unpaid'}">${paidLabel ?? (summary.allPaid ? '✓ PAID' : 'PAYMENT PENDING')}</span></div>
<p class="footer">Thank you for dining with us · الشكر لتناول الطعام معنا<br>TRN: 100XXXXXXXX | VAT Reg No.</p>
<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`
}

function openPrint(html: string) {
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(html); w.document.close()
}

// ── Totals row ────────────────────────────────────────────────────────────────
function TotalsBlock({ subtotal, vat, total }: { subtotal: number; vat: number; total: number }) {
  return (
    <div className="space-y-0.5 pt-2 mt-2 border-t" style={{ borderColor: 'var(--card-border)' }}>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Subtotal</span><span>AED {subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>VAT (5%)</span><span>AED {vat.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm font-black pt-1" style={{ color: 'var(--text-primary)' }}>
        <span>Total</span><span>AED {total.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ── Per-tab row inside a table card ──────────────────────────────────────────
function TabRow({ tab, idx, tableName, onSettleCash, busy }: {
  tab: Tab; idx: number; tableName: string
  onSettleCash: (sessionId: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const label = tabLabel(tab, idx)
  const isMember = !!tab.orders.find(o => o.user)
  const total = Number(tab.summary.total)

  const itemMap = new Map<string, { name: string; qty: number; price: number }>()
  for (const o of tab.orders) {
    for (const i of o.items) {
      const k = i.menuItem.name
      const existing = itemMap.get(k)
      if (existing) { existing.qty += i.quantity; existing.price += i.quantity * Number(i.unitPrice) }
      else itemMap.set(k, { name: k, qty: i.quantity, price: i.quantity * Number(i.unitPrice) })
    }
  }
  const items = [...itemMap.values()]

  function printTab() {
    const rows = items.map(i => ({ name: i.name, qty: i.qty, total: i.price }))
    openPrint(buildReceiptHtml(`${tableName} — ${label}`, rows, tab.summary))
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left hover:opacity-90"
        style={{ backgroundColor: 'var(--muted-bg)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
            style={{ backgroundColor: 'var(--brand)' }}>
            {label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
              {isMember && <BadgeCheck size={12} className="flex-shrink-0" style={{ color: 'var(--c-info-fg)' }} />}
            </div>
            <div className="text-[10px] text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''} · {tab.orders.length} order{tab.orders.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-black text-gray-900 dark:text-white">AED {total.toFixed(2)}</div>
            <div className="text-[10px] font-semibold" style={{ color: tab.summary.allPaid ? 'var(--c-success-fg)' : 'var(--c-pending-fg)' }}>
              {tab.summary.allPaid ? '✓ Paid' : 'Pending'}
            </div>
          </div>
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 space-y-1.5" style={{ backgroundColor: 'var(--card-bg)' }}>
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300">
                <span className="font-semibold">{item.qty}×</span> {item.name}
              </span>
              <span className="text-gray-400">AED {item.price.toFixed(2)}</span>
            </div>
          ))}

          <div className="pt-1">
            {tab.orders.map((o, i) => (
              <div key={o.id} className="flex items-center gap-1 text-[10px] text-gray-400">
                <Clock size={8} />
                Order {i + 1} — {new Date(o.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                {o.paymentMethod === 'CARD' && (
                  <span className="font-semibold" style={{ color: 'var(--c-success-fg)' }}>· card paid</span>
                )}
              </div>
            ))}
          </div>

          <TotalsBlock subtotal={Number(tab.summary.subtotal)} vat={Number(tab.summary.vatAmount)} total={total} />

          <div className="flex items-center gap-2 pt-1">
            {!tab.summary.allPaid ? (
              <button
                onClick={() => onSettleCash(tab.sessionId)} disabled={busy}
                className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity hover:opacity-90 text-white"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Banknote size={11} />}
                Collect Cash
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>
                <CheckCircle2 size={11} /> Settled
              </div>
            )}
            <button onClick={printTab}
              className="w-9 h-9 rounded-lg border flex items-center justify-center hover:opacity-80 transition-colors flex-shrink-0">
              <Printer size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active table card ─────────────────────────────────────────────────────────
function ActiveTableCard({ entry, onSettleCash, busySession }: {
  entry: ActiveTableEntry
  onSettleCash: (sessionId: string, tableId: string) => void
  busySession: Record<string, boolean>
}) {
  const [expanded, setExpanded] = useState(false)
  const tableName = entry.table.name ?? `Table ${entry.table.tableNumber}`
  const pendingTabs = entry.tabs.filter(t => t.summary.anyUnpaid).length
  const allSettled = pendingTabs === 0

  const printCombined = () => {
    const allOrders = entry.tabs.flatMap(t => t.orders)
    const itemMap = new Map<string, { name: string; qty: number; price: number }>()
    for (const o of allOrders) {
      for (const i of o.items) {
        const k = i.menuItem.name
        const ex = itemMap.get(k)
        if (ex) { ex.qty += i.quantity; ex.price += i.quantity * Number(i.unitPrice) }
        else itemMap.set(k, { name: k, qty: i.quantity, price: i.quantity * Number(i.unitPrice) })
      }
    }
    const rows = [...itemMap.values()].map(i => ({ name: i.name, qty: i.qty, total: i.price }))
    openPrint(buildReceiptHtml(tableName, rows, entry.combined))
  }

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: allSettled ? 'var(--c-success-bdr)' : 'var(--c-pending-bdr)' }}>

      {/* Table header */}
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:opacity-90">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: allSettled ? 'var(--c-success-fg)' : 'var(--c-pending-fg)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-gray-900 dark:text-white">{tableName}</span>
            <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Users size={9} /> {entry.tabs.length} {entry.tabs.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-gray-500">AED {Number(entry.combined.total).toFixed(2)}</span>
            {pendingTabs > 0
              ? <span className="text-[10px] font-semibold" style={{ color: 'var(--c-pending-fg)' }}>· {pendingTabs} awaiting payment</span>
              : <span className="text-[10px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>· fully settled</span>
            }
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-base font-black text-gray-900 dark:text-white">AED {Number(entry.combined.total).toFixed(2)}</div>
          </div>
          {expanded ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <>
          <div className="px-4 pb-3 space-y-2">
            {entry.tabs.map((tab, idx) => (
              <TabRow
                key={tab.sessionId}
                tab={tab}
                idx={idx}
                tableName={tableName}
                onSettleCash={(sessionId) => onSettleCash(sessionId, entry.table.id)}
                busy={!!busySession[tab.sessionId]}
              />
            ))}
          </div>

          {/* Combined footer */}
          <div className="mx-4 border-t pt-3 pb-3" style={{ borderColor: 'var(--card-border)' }}>
            <div className="flex justify-between text-xs text-gray-400 mb-0.5">
              <span>Subtotal</span><span>AED {Number(entry.combined.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>VAT (5%)</span><span>AED {Number(entry.combined.vatAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-gray-900 dark:text-white">
              <span>Combined Total</span><span>AED {Number(entry.combined.total).toFixed(2)}</span>
            </div>
          </div>

          <div className="px-4 pb-4 flex items-center gap-2">
            <button onClick={printCombined}
              className="flex-1 flex items-center justify-center gap-2 border py-2.5 rounded-xl text-xs font-semibold hover:opacity-80 transition-colors">
              <Printer size={13} /> Print Combined Bill
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Closed session card ───────────────────────────────────────────────────────
function ClosedSessionCard({ s }: { s: ClosedSession }) {
  const [expanded, setExpanded] = useState(false)
  const tableName = s.table.name ?? `Table ${s.table.tableNumber}`
  const userName = s.orders.find(o => o.user)?.user?.name?.split(' ')[0] ?? 'Guest'

  const itemMap = new Map<string, { name: string; qty: number; price: number }>()
  for (const o of s.orders) {
    for (const i of o.items) {
      const k = i.menuItem.name
      const ex = itemMap.get(k)
      if (ex) { ex.qty += i.quantity; ex.price += i.quantity * Number(i.unitPrice) }
      else itemMap.set(k, { name: k, qty: i.quantity, price: i.quantity * Number(i.unitPrice) })
    }
  }
  const items = [...itemMap.values()]

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:opacity-90">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white text-sm">{tableName}</span>
            <span className="text-gray-300 dark:text-white/20">·</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{userName}</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {new Date(s.closedAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
            {' · '}{s.summary.orderCount} order{s.summary.orderCount !== 1 ? 's' : ''}
            {' · '}{items.length} items
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-black text-gray-900 dark:text-white">AED {Number(s.summary.total).toFixed(2)}</div>
            <div className="text-[10px] font-semibold" style={{ color: s.summary.allPaid ? 'var(--c-success-fg)' : 'var(--c-pending-fg)' }}>
              {s.summary.allPaid ? '✓ Settled' : 'Pending'}
            </div>
          </div>
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300"><span className="font-semibold">{item.qty}×</span> {item.name}</span>
              <span className="text-gray-400">AED {item.price.toFixed(2)}</span>
            </div>
          ))}
          <TotalsBlock subtotal={Number(s.summary.subtotal)} vat={Number(s.summary.vatAmount)} total={Number(s.summary.total)} />
          <div className="flex justify-end pt-1">
            <button onClick={() => {
              const rows = items.map(i => ({ name: i.name, qty: i.qty, total: i.price }))
              openPrint(buildReceiptHtml(`${tableName} — ${userName}`, rows, s.summary))
            }} className="flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors">
              <Printer size={11} /> Reprint
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Takeaway card ─────────────────────────────────────────────────────────────
function TakeawayCard({ entry }: { entry: TakeawayEntry }) {
  const [expanded, setExpanded] = useState(false)
  const items = (() => {
    const m = new Map<string, { name: string; qty: number; price: number }>()
    for (const o of entry.orders) {
      for (const i of o.items) {
        const k = i.menuItem.name
        const ex = m.get(k)
        if (ex) { ex.qty += i.quantity; ex.price += i.quantity * Number(i.unitPrice) }
        else m.set(k, { name: k, qty: i.quantity, price: i.quantity * Number(i.unitPrice) })
      }
    }
    return [...m.values()]
  })()
  const label = entry.customer?.name ?? entry.contactPhone ?? `Token #${entry.tokenNumber}`
  const time = new Date(entry.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })

  function printTakeawayReceipt() {
    const rows = items.map(i => ({ name: i.name, qty: i.qty, total: i.price }))
    const html = buildReceiptHtml(`Takeaway #${entry.tokenNumber}`, rows, entry.summary, '✓ PAID BY CARD')
      .replace('Receipt #', `Token #${entry.tokenNumber} · Receipt #`)
    openPrint(html)
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:opacity-90">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base flex-shrink-0"
          style={{ backgroundColor: 'var(--brand)' }}>
          #{entry.tokenNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{label}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {entry.contactPhone && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Phone size={9} />{entry.contactPhone}</span>
            )}
            <span className="text-[10px] text-gray-400">{time} · {items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge variant="delivered" label={entry.latestStatus} size="xs" />
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300"><span className="font-semibold">{item.qty}×</span> {item.name}</span>
              <span className="text-gray-400">AED {item.price.toFixed(2)}</span>
            </div>
          ))}
          <TotalsBlock subtotal={Number(entry.summary.subtotal)} vat={Number(entry.summary.vatAmount)} total={Number(entry.summary.total)} />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>
              <CreditCard size={10} /> Paid by card
            </div>
            <button onClick={printTakeawayReceipt}
              className="flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors">
              <Printer size={11} /> Print
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BillsPage() {
  const [active, setActive]     = useState<ActiveTableEntry[]>([])
  const [closed, setClosed]     = useState<ClosedSession[]>([])
  const [takeaway, setTakeaway] = useState<TakeawayEntry[]>([])
  const [tab, setTab]           = useState<'active' | 'today' | 'takeaway'>('active')
  const [loading, setLoading]   = useState(true)
  const [busySession, setBusySession] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [activeRes, closedRes, takeawayRes] = await Promise.all([
        api.get('/orders/active-bills'),
        api.get('/orders/closed-bills-today'),
        api.get('/orders/takeaway-today'),
      ])
      setActive(activeRes.data ?? [])
      setClosed(closedRes.data ?? [])
      setTakeaway(takeawayRes.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const settleCash = async (sessionId: string, tableId: string) => {
    setBusySession(p => ({ ...p, [sessionId]: true }))
    try {
      await api.post(`/payments/table/${tableId}/settle-all-cash`)
      notify.order.cashCollected('')
      await load()
    } catch {
      notify.error('Failed to settle')
    } finally {
      setBusySession(p => ({ ...p, [sessionId]: false }))
    }
  }

  const totalTabs   = active.reduce((s, e) => s + e.tabs.length, 0)
  const pendingTabs = active.reduce((s, e) => s + e.tabs.filter(t => t.summary.anyUnpaid).length, 0)
  const todayRevenue = closed.reduce((s, c) => s + Number(c.summary.total), 0)

  const TABS = [
    { key: 'active'   as const, label: 'Active',    icon: Receipt, count: active.length },
    { key: 'takeaway' as const, label: 'Takeaway',  icon: Package, count: takeaway.length },
    { key: 'today'   as const, label: 'History',   icon: History, count: closed.length },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Header ── */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
        {/* Title row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Bills & Invoices</h1>
          <button onClick={load}
            className="p-2 rounded-xl transition-colors flex-shrink-0"
            style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stat badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {active.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand-dark)' }}>
              {active.length} table{active.length !== 1 ? 's' : ''} · {totalTabs} guest{totalTabs !== 1 ? 's' : ''}
            </span>
          )}
          {pendingTabs > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--c-pending-bg)', color: 'var(--c-pending-fg)' }}>
              {pendingTabs} awaiting payment
            </span>
          )}
          {todayRevenue > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>
              AED {todayRevenue.toFixed(2)} settled
            </span>
          )}
        </div>

        {/* Tab switcher — full width on mobile */}
        <div className="flex rounded-xl p-1 gap-0.5" style={{ backgroundColor: 'var(--muted-bg)' }}>
          {TABS.map(({ key, label, icon: Icon, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={tab === key
                ? { backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
                : { color: 'var(--text-muted)' }}
            >
              <Icon size={11} />
              {label}
              {count > 0 && (
                <span className="text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tab === key ? 'var(--brand)' : 'var(--c-neutral-fg)' }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-4 sm:p-6 flex-1 overflow-auto">

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-20 rounded-2xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }} />
            ))}
          </div>
        )}

        {/* Active — 2-col grid on large screens */}
        {!loading && tab === 'active' && (
          active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--brand-light)' }}>
                <Receipt size={24} style={{ color: 'var(--brand)' }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No active bills</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Bills appear when dine-in orders are placed.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {active.map(e => (
                <ActiveTableCard key={e.table.id} entry={e} onSettleCash={settleCash} busySession={busySession} />
              ))}
            </div>
          )
        )}

        {/* Takeaway — 3-col grid */}
        {!loading && tab === 'takeaway' && (
          takeaway.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--muted-bg)' }}>
                <Package size={24} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No takeaway orders today</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {takeaway.map(e => <TakeawayCard key={e.tokenNumber} entry={e} />)}
            </div>
          )
        )}

        {/* History — 3-col grid */}
        {!loading && tab === 'today' && (
          closed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--c-success-bg)' }}>
                <CheckCircle2 size={24} style={{ color: 'var(--c-success-fg)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No closed bills today yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Day summary banner */}
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: 'var(--c-success-bg)', border: '1px solid var(--c-success-bdr)' }}>
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--c-success-fg)' }}>Today's closed bills</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-success-fg)', opacity: 0.7 }}>
                    {closed.length} session{closed.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black" style={{ color: 'var(--c-success-fg)' }}>AED {todayRevenue.toFixed(2)}</div>
                  <div className="text-[10px]" style={{ color: 'var(--c-success-fg)', opacity: 0.7 }}>gross revenue</div>
                </div>
              </div>
              {/* Grid of closed session cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {closed.map(s => <ClosedSessionCard key={s.sessionId} s={s} />)}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
