'use client'
import { useEffect, useState, useCallback } from 'react'
import { Table2, Check, X, QrCode, Printer, Users, RefreshCw, Clock, Receipt, CreditCard, Banknote, CheckCircle2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { notify } from '@/lib/notify'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

interface UpcomingBooking { id: string; slotTime: string; status: string; partySize: number; customer: { name: string } | null }
interface Table { id: string; tableNumber: number; name: string | null; capacity: number; zone: string; status: string; isActive: boolean; qrCode?: string; updatedAt?: string; upcomingBooking?: UpcomingBooking | null }

interface BillOrder {
  id: string; status: string; paymentStatus: string; paymentMethod?: string
  createdAt: string; subtotal: number; vatAmount: number; total: number
  user?: { name: string } | null
  items: { quantity: number; unitPrice: number; menuItem: { name: string } }[]
}
interface TableBill {
  tableId: string; sessionId?: string
  orders: BillOrder[]
  summary: { subtotal: number; vatAmount: number; total: number; allPaid: boolean; anyUnpaid: boolean; orderCount: number }
}
interface MenuItem { id: string; name: string; price: number; category?: { name: string } }

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function clearingElapsed(updatedAt: string | undefined, nowMs: number) {
  if (!updatedAt) return null
  const mins = Math.floor((nowMs - new Date(updatedAt).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function clearingCountdown(updatedAt: string | undefined, nowMs: number, autoMinutes = 15) {
  if (!updatedAt) return null
  const elapsedMs = nowMs - new Date(updatedAt).getTime()
  const remaining = Math.ceil((autoMinutes * 60000 - elapsedMs) / 60000)
  return remaining > 0 ? remaining : 0
}

const S = {
  EMPTY:        { label: 'Available', labelShort: 'Free',    color: '#4ade80', filter: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  OCCUPIED:     { label: 'Seated',    labelShort: 'Seated',  color: '#f87171', filter: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
  BILL_PENDING: { label: 'Awaiting Bill', labelShort: 'Bill', color: '#fbbf24', filter: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' },
  DIRTY:        { label: 'Clearing',  labelShort: 'Dirty',   color: '#9ca3af', filter: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
}
const STATUSES = ['EMPTY', 'OCCUPIED', 'BILL_PENDING', 'DIRTY'] as const
type Status = typeof STATUSES[number]

export default function TablesPage() {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const [tables, setTables]       = useState<Table[]>([])
  const [qrModal, setQrModal]         = useState<Table | null>(null)
  const [qrRegenConfirm, setQrRegenConfirm] = useState(false)
  const [forceAvailableConfirm, setForceAvailableConfirm] = useState<string | null>(null)
  const [qrRegening, setQrRegening]   = useState(false)
  const [billModal, setBillModal]     = useState<{ table: Table; bill: TableBill } | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  // Staff "Add to Bill" modal
  const [addOrderModal, setAddOrderModal] = useState<Table | null>(null)
  const [menuItems, setMenuItems]         = useState<MenuItem[]>([])
  const [cart, setCart]                   = useState<Record<string, number>>({})
  const [addingOrder, setAddingOrder]     = useState(false)
  const [tableSessions, setTableSessions] = useState<{ sessionId: string; label: string }[]>([])
  const [selectedSession, setSelectedSession] = useState<string>('') // '' = new session
  const [filter, setFilter]               = useState<Status | 'ALL'>('ALL')
  const now = useNow(30000)

  const load = useCallback(() => api.get('/tables').then(r => setTables(r.data)), [])
  useEffect(() => { load() }, [])

  const openAddOrder = async (table: Table) => {
    setCart({})
    setTableSessions([])
    setSelectedSession('')
    setAddOrderModal(table)
    if (menuItems.length === 0) {
      const r = await api.get('/menu/items')
      setMenuItems(r.data.filter((m: any) => m.isAvailable !== false))
    }
    // Load existing sessions at this table so staff can pick which guest to add to
    try {
      const { data: sessions } = await api.get(`/orders/table/${table.id}/sessions`)
      if (sessions?.length > 0) {
        const mapped = sessions.map((s: any, i: number) => ({
          sessionId: s.sessionId,
          label: s.userName ? s.userName.split(' ')[0] : `Guest ${i + 1}`,
        }))
        setTableSessions(mapped)
        setSelectedSession(mapped[0].sessionId)
      }
    } catch {}
  }

  const cartQty = (id: string) => cart[id] ?? 0
  const adjustCart = (id: string, delta: number) =>
    setCart(p => { const n = Math.max(0, (p[id] ?? 0) + delta); const next = { ...p }; if (n === 0) delete next[id]; else next[id] = n; return next })

  const submitStaffOrder = async () => {
    if (!addOrderModal) return
    const items = Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    if (!items.length) { notify.error('Add at least one item'); return }
    setAddingOrder(true)
    try {
      await api.post(`/orders/table/${addOrderModal.id}/staff-order`, {
        type: 'DINE_IN', tableId: addOrderModal.id, items, paymentMethod: 'CASH',
        ...(selectedSession ? { guestTabToken: selectedSession } : {}),
      })
      notify.success('Order added to the bill')
      setAddOrderModal(null)
      setCart({})
    } catch (e: any) {
      notify.error(e?.message ?? 'Could not place order')
    } finally { setAddingOrder(false) }
  }

  const openBill = async (table: Table) => {
    setBillLoading(true)
    try {
      const r = await api.get(`/orders/table/${table.id}/bill`)
      setBillModal({ table, bill: r.data })
    } catch (e: any) {
      notify.error(e?.message ?? 'Could not load bill')
    } finally {
      setBillLoading(false) }
  }

  const printBill = (table: Table, bill: TableBill) => {
    const name = table.name ?? `Table ${table.tableNumber}`
    const now  = new Date().toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })
    const rows = bill.orders.flatMap(o => o.items.map(i => ({
      name: i.menuItem.name, qty: i.quantity, unit: Number(i.unitPrice), total: i.quantity * Number(i.unitPrice),
    })))
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Bill – ${name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;max-width:360px;margin:32px auto;padding:24px;color:#111}
h1{font-size:22px;font-weight:800;color:#f97316}h2{font-size:13px;font-weight:400;color:#666;margin-top:2px}
.meta{font-size:11px;color:#999;margin:16px 0 8px;padding-top:16px;border-top:1px solid #eee}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th{text-align:left;font-weight:600;color:#666;padding:4px 0;border-bottom:1px solid #eee}
td{padding:5px 0;border-bottom:1px solid #f5f5f5}
td:last-child,th:last-child{text-align:right}
.totals{margin-top:12px;font-size:13px}.totals tr:last-child{font-size:16px;font-weight:800}
.totals td{padding:3px 0}.totals td:last-child{text-align:right}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-top:4px}
.paid{background:#dcfce7;color:#15803d}.unpaid{background:#fef9c3;color:#854d0e}
.footer{font-size:10px;color:#999;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<h1>Al Manzil</h1><h2>Kerala & South Indian Cuisine</h2>
<p class="meta">${name} &nbsp;·&nbsp; ${now}</p>
<table><tr><th>Item</th><th>Qty</th><th>AED</th></tr>
${rows.map(r => `<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.total.toFixed(2)}</td></tr>`).join('')}
</table>
<table class="totals" style="margin-top:16px">
<tr><td style="color:#666">Subtotal</td><td>AED ${Number(bill.summary.subtotal).toFixed(2)}</td></tr>
<tr><td style="color:#666">VAT (5%)</td><td>AED ${Number(bill.summary.vatAmount).toFixed(2)}</td></tr>
<tr><td style="padding-top:8px">Total</td><td style="padding-top:8px">AED ${Number(bill.summary.total).toFixed(2)}</td></tr>
</table>
<div style="margin-top:12px">
<span class="badge ${bill.summary.allPaid ? 'paid' : 'unpaid'}">${bill.summary.allPaid ? '✓ PAID' : 'PAYMENT PENDING'}</span>
</div>
<p class="footer">Thank you for dining with us<br>الشكر لتناول الطعام معنا</p>
<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`)
    w.document.close()
  }

  const getQrUrl = (t: Table) => `${process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')}/menu?qr=${t.qrCode}`

  const printQr = (table: Table) => {
    const url = getQrUrl(table)
    const name = table.name ?? `Table ${table.tableNumber}`
    const canvas = document.getElementById(`qr-${table.id}`) as HTMLCanvasElement | null
    const dataUrl = canvas?.toDataURL('image/png') ?? ''
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>QR – ${name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}
.c{border:2px dashed #e5e7eb;border-radius:16px;padding:32px 40px;text-align:center;max-width:340px}
.l{font-size:20px;font-weight:800;color:#f97316;margin-bottom:6px}.s{font-size:12px;color:#9ca3af;margin-bottom:20px}
img{width:200px;height:200px;margin:0 auto 16px;display:block}.n{font-size:22px;font-weight:700;color:#111827;margin-bottom:4px}
.cap{font-size:13px;color:#6b7280;margin-bottom:16px}.h{font-size:11px;color:#9ca3af}</style></head>
<body><div class="c"><div class="l">Al Manzil</div><div class="s">Scan to order · اطلب عبر الرمز</div>
<img src="${dataUrl}"/><div class="n">${name}</div><div class="cap">${table.capacity} seats</div>
<div class="h">${url}</div></div><script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`)
    w.document.close()
  }

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/tables/${id}/status`, { status })
    setTables(p => p.map(t => t.id === id ? { ...t, status } : t))
    notify.success(status === 'EMPTY' ? 'Table marked available' : 'Table status updated')
  }

const countBy = (s: string) => tables.filter(t => t.status === s).length
  const visible = filter === 'ALL' ? tables : tables.filter(t => t.status === filter)

  return (
    <div className="flex flex-col flex-1">

      {/* Hidden QR canvases */}
      <div className="hidden">{tables.map(t => t.qrCode && <QRCodeCanvas key={t.id} id={`qr-${t.id}`} value={getQrUrl(t)} size={200} />)}</div>

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4"
          onClick={() => { setQrModal(null); setQrRegenConfirm(false) }}>
          {/* Sheet on mobile, centered card on desktop */}
          <div className="w-full sm:max-w-xs bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.4)' }}>

            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="relative border-b px-6 pt-5 pb-6 text-center"
              style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.06), rgba(var(--brand-rgb),0.12))', borderColor: 'rgba(var(--brand-rgb),0.15)' }}>
              {/* Close — desktop only */}
              <button onClick={() => { setQrModal(null); setQrRegenConfirm(false) }}
                className="hidden sm:flex absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 items-center justify-center transition-colors">
                <X size={14} className="text-gray-500" />
              </button>

              {/* Brand dot + name */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
                  style={{ backgroundColor: 'var(--brand)' }}>
                  <span className="text-black text-xs font-black">A</span>
                </div>
                <span className="font-black text-gray-900 text-lg tracking-tight">Al Manzil</span>
              </div>
              <p className="text-xs font-medium" style={{ color: 'var(--brand)' }}>اطلب عبر الرمز · Scan to order</p>
            </div>

            {/* QR code — centre stage */}
            <div className="flex justify-center px-8 py-6">
              <div className="relative">
                {/* Decorative warm frame */}
                <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 -z-10" />
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <QRCodeCanvas
                    value={getQrUrl(qrModal)}
                    size={200}
                    fgColor="#1c1c1e"
                    bgColor="#ffffff"
                    level="M"
                  />
                </div>
                {/* Corner accents */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: 'var(--brand)' }} />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: 'var(--brand)' }} />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: 'var(--brand)' }} />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: 'var(--brand)' }} />
              </div>
            </div>

            {/* Table badge */}
            <div className="text-center px-6 pb-5">
              <div className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full mb-2">
                <span className="font-black text-base" style={{ color: 'var(--brand)' }}>{qrModal.name ?? `Table ${qrModal.tableNumber}`}</span>
                <span className="w-1 h-1 rounded-full bg-gray-600" />
                <span className="text-gray-400 text-xs">{qrModal.capacity} seats</span>
              </div>
              <p className="text-[11px] text-gray-400">Scan with phone camera to browse the menu &amp; order</p>
            </div>

            {/* Actions */}
            <div className="px-5 pb-6 space-y-2.5">
              <button onClick={() => { printQr(qrModal); setQrModal(null); setQrRegenConfirm(false) }}
                className="w-full flex items-center justify-center gap-2 active:scale-[0.98] text-black font-bold py-3.5 rounded-2xl text-sm transition-all"
              style={{ backgroundColor: 'var(--brand)' }}>
                <Printer size={16} /> Print QR Code
              </button>


              {/* Regenerate — inline two-step, no browser dialog */}
              {!qrRegenConfirm ? (
                <button onClick={() => setQrRegenConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-700 py-3 rounded-2xl text-sm font-semibold transition-all">
                  <RefreshCw size={13} /> Reassign / Regenerate QR
                </button>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-rose-500 text-xs font-black">!</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-rose-700">Replace QR sticker?</p>
                      <p className="text-xs text-rose-400 mt-0.5 leading-relaxed">Old QR stops working immediately. Print the new one first and place it on the table before guests arrive.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setQrRegenConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button
                      disabled={qrRegening}
                      onClick={async () => {
                        setQrRegening(true)
                        try {
                          const r = await api.post(`/tables/${qrModal.id}/regenerate-qr`)
                          const updated = r.data
                          setTables(prev => prev.map(t => t.id === updated.id ? { ...t, qrCode: updated.qrCode } : t))
                          setQrModal(updated)
                          setQrRegenConfirm(false)
                          notify.success('New QR generated — print and replace the sticker')
                        } finally { setQrRegening(false) }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                      {qrRegening ? 'Generating…' : 'Yes, Replace'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bill Modal */}
      {billModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setBillModal(null)}>
          <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-[var(--card-border)] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)]">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{billModal.table.name ?? `Table ${billModal.table.tableNumber}`}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{billModal.bill.summary.orderCount} order{billModal.bill.summary.orderCount !== 1 ? 's' : ''} this session</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  billModal.bill.summary.allPaid
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                }`}>
                  {billModal.bill.summary.allPaid ? '✓ Settled' : billModal.bill.summary.anyUnpaid ? 'Awaiting Payment' : 'Paid'}
                </span>
                <button onClick={() => setBillModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Order list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {billModal.bill.orders.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No orders for this table today</p>
              ) : billModal.bill.orders.map((order, idx) => (
                <div key={order.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Order {idx + 1}</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(order.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {order.user && (
                        <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-semibold">
                          {order.user.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {order.paymentMethod === 'CASH' && <Banknote size={11} className="text-amber-500" />}
                      {order.paymentMethod === 'CARD' && <CreditCard size={11} className="text-green-500" />}
                      {order.paymentStatus === 'PAID'
                        ? <span className="text-[10px] text-green-600 dark:text-green-400 font-bold flex items-center gap-0.5"><CheckCircle2 size={10} /> Paid</span>
                        : <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-bold">Unpaid</span>
                      }
                    </div>
                  </div>
                  <div className="space-y-1">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-300">
                          <span className="font-semibold text-gray-800 dark:text-white">{item.quantity}×</span> {item.menuItem.name}
                        </span>
                        <span className="text-gray-400">AED {(item.quantity * Number(item.unitPrice)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-[10px] text-gray-400">Order total</span>
                    <span className="text-xs font-bold text-gray-800 dark:text-white">AED {Number(order.total).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals + actions */}
            <div className="border-t border-gray-200 dark:border-[var(--card-border)] px-6 py-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span><span>AED {Number(billModal.bill.summary.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>VAT (5%)</span><span>AED {Number(billModal.bill.summary.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-base text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span><span>AED {Number(billModal.bill.summary.total).toFixed(2)}</span>
              </div>
              <button
                onClick={() => printBill(billModal.table, billModal.bill)}
                className="w-full mt-2 flex items-center justify-center gap-2 text-black font-semibold py-2.5 rounded-xl text-sm transition-colors"
                style={{ backgroundColor: 'var(--brand)' }}>
                <Printer size={15} /> Print Receipt / Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to Bill Modal ── */}
      {addOrderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--card-bg)] rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[var(--card-border)] flex-shrink-0">
              <div>
                <p className="font-bold text-gray-900 dark:text-white text-sm">
                  Add Items · {addOrderModal.name ?? `Table ${addOrderModal.tableNumber}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Items will be added to the current session bill</p>
              </div>
              <button onClick={() => setAddOrderModal(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X size={16} />
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {menuItems.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
                </div>
              )}
              {/* Group by category */}
              {Array.from(new Set(menuItems.map(m => m.category?.name ?? 'Other'))).map(cat => {
                const items = menuItems.filter(m => (m.category?.name ?? 'Other') === cat)
                return (
                  <div key={cat}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-1.5">{cat}</p>
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl brand-hover transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                          <p className="text-xs text-gray-400">AED {Number(item.price).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {cartQty(item.id) > 0 ? (
                            <>
                              <button onClick={() => adjustCart(item.id, -1)}
                                className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                <Minus size={12} />
                              </button>
                              <span className="text-sm font-bold text-gray-900 dark:text-white w-5 text-center">{cartQty(item.id)}</span>
                              <button onClick={() => adjustCart(item.id, 1)}
                                className="w-7 h-7 rounded-full text-white flex items-center justify-center transition-colors"
                                style={{ backgroundColor: 'var(--brand, #f97316)' }}>
                                <Plus size={12} />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => adjustCart(item.id, 1)}
                              className="w-7 h-7 rounded-full text-white flex items-center justify-center transition-colors"
                              style={{ backgroundColor: 'var(--brand, #f97316)' }}>
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Cart summary + submit */}
            {Object.keys(cart).length > 0 && (
              <div className="border-t border-gray-100 dark:border-[var(--card-border)] px-5 py-4 flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {Object.values(cart).reduce((a, b) => a + b, 0)} item{Object.values(cart).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    AED {Object.entries(cart).reduce((s, [id, qty]) => {
                      const m = menuItems.find(x => x.id === id)
                      return s + (m ? Number(m.price) * qty : 0)
                    }, 0).toFixed(2)}
                  </span>
                </div>

                {/* Session picker — shown when table has multiple guests */}
                {tableSessions.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Add to which guest?</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {tableSessions.map(s => (
                        <button key={s.sessionId} onClick={() => setSelectedSession(s.sessionId)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          style={selectedSession === s.sessionId
                            ? { backgroundColor: 'var(--brand)', color: '#000' }
                            : { backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                          {s.label}
                        </button>
                      ))}
                      <button onClick={() => setSelectedSession('')}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={selectedSession === ''
                          ? { backgroundColor: 'var(--brand)', color: '#000' }
                          : { backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                        + New tab
                      </button>
                    </div>
                  </div>
                )}

                <button onClick={submitStaffOrder} disabled={addingOrder}
                  className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand, #f97316)' }}>
                  {addingOrder
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><ShoppingBag size={15} /> Add to Bill</>
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-14 flex items-center gap-2 px-4 sm:px-6 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <h1 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">Tables</h1>
        <button onClick={load} className="p-1 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }} title="Refresh">
          <RefreshCw size={12} />
        </button>
        {/* Filter tabs inline */}
        <div className="hidden sm:flex items-center gap-1 ml-2 overflow-x-auto">
          {([['ALL', 'All', 'All', tables.length], ...STATUSES.map(s => [s, S[s as Status].label, S[s as Status].labelShort, countBy(s)])] as [string, string, string, number][]).map(([key, label, labelShort, count]) => (
            <button key={key} onClick={() => setFilter(key as Status | 'ALL')}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
              style={filter === key
                ? { backgroundColor: 'var(--brand)', color: '#000' }
                : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              {label}
              <span className="text-[10px] font-bold opacity-70">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile filter tabs */}
      <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        {([['ALL', 'All', tables.length], ...STATUSES.map(s => [s, S[s as Status].labelShort, countBy(s)])] as [string, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => setFilter(key as Status | 'ALL')}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
            style={filter === key
              ? { backgroundColor: 'var(--brand)', color: '#000' }
              : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
            {label} <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="p-4 sm:p-6">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl"
            style={{ border: '1px dashed rgba(var(--brand-rgb),0.3)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)' }}>
              <Table2 size={28} style={{ color: 'var(--brand)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {tables.length === 0 ? 'No tables set up yet' : 'No tables match this filter'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-[240px]">
                {tables.length === 0
                  ? 'Add tables in Settings → Tables to start taking dine-in orders.'
                  : 'Try a different status filter to see other tables.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visible.map(table => {
            const isReserved = table.status === 'EMPTY' && !!table.upcomingBooking
            const cfg = S[table.status as Status] ?? S.EMPTY
            const displayName = table.name ?? `Table ${table.tableNumber}`
            const isOccupied = table.status === 'OCCUPIED' || table.status === 'BILL_PENDING'

            return (
              <div key={table.id}
                className="rounded-2xl border overflow-hidden flex flex-col transition-all hover:shadow-md"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>

                {/* Colour bar */}
                <div className="h-1 flex-shrink-0" style={{ backgroundColor: isReserved ? '#f59e0b' : cfg.color }} />

                {/* Body */}
                <div className="p-3 flex flex-col flex-1 gap-2">

                  {/* Number + status */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ backgroundColor: isReserved ? '#f59e0b' : cfg.color }}>
                      {table.tableNumber}
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0 truncate"
                      style={{ backgroundColor: isReserved ? '#f59e0b22' : `${cfg.color}22`, color: isReserved ? '#f59e0b' : cfg.color }}>
                      {isReserved ? 'Reserved' : (
                        <><span className="hidden sm:inline">{cfg.label}</span><span className="sm:hidden">{cfg.labelShort}</span></>
                      )}
                    </span>
                  </div>

                  {/* Name + seats + zone */}
                  <div>
                    <p className="font-bold text-sm truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                        <Users size={9} />{table.capacity} seats
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                        {table.zone ?? 'Indoor'}
                      </span>
                    </div>
                  </div>
                  {isReserved && table.upcomingBooking && (
                    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg text-[11px]"
                      style={{ backgroundColor: '#f59e0b18', border: '1px solid #f59e0b44' }}>
                      <span className="font-bold" style={{ color: '#f59e0b' }}>
                        {table.upcomingBooking.slotTime}
                      </span>
                      <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                        {table.upcomingBooking.customer?.name ?? 'Guest'} · {table.upcomingBooking.partySize} pax
                      </span>
                    </div>
                  )}
                  {table.status === 'DIRTY' && table.updatedAt && (
                    <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={9} />{clearingElapsed(table.updatedAt, now)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 mt-auto">
                    {isOccupied && (
                      <>
                        <button onClick={() => openAddOrder(table)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors text-white active:scale-[0.98]"
                          style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                          <Plus size={13} /> Add Items
                        </button>
                        <div className="flex gap-1.5">
                          <button onClick={() => openBill(table)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--muted-bg)]"
                            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                            <Receipt size={12} /><span className="hidden sm:inline">Bill</span>
                          </button>
                          {table.qrCode && (
                            <button onClick={() => { setQrModal(table); setQrRegenConfirm(false) }}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--muted-bg)]"
                              style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                              <QrCode size={12} /><span className="hidden sm:inline">QR</span>
                            </button>
                          )}
                        </div>
                        {isOwner && (forceAvailableConfirm === table.id ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => { updateStatus(table.id, 'EMPTY'); setForceAvailableConfirm(null) }}
                              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1">
                              <Check size={10} /> Confirm
                            </button>
                            <button onClick={() => setForceAvailableConfirm(null)}
                              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors hover:bg-[var(--muted-bg)]"
                              style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setForceAvailableConfirm(table.id)}
                            className="text-[11px] text-center py-1 transition-colors hover:underline"
                            style={{ color: 'var(--text-muted)' }}>
                            Force available
                          </button>
                        ))}
                      </>
                    )}

                    {table.status === 'DIRTY' && (
                      <button onClick={() => updateStatus(table.id, 'EMPTY')}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors active:scale-[0.98]"
                        style={{ backgroundColor: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                        <Check size={13} /> Mark Clean
                      </button>
                    )}

                    {table.status === 'EMPTY' && table.qrCode && (
                      <button onClick={() => { setQrModal(table); setQrRegenConfirm(false) }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--muted-bg)]"
                        style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                        <QrCode size={12} /> View QR
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
