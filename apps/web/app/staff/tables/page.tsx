'use client'
import { useEffect, useState, useCallback } from 'react'
import { Table2, Pencil, Check, X, QrCode, Printer, Users, RefreshCw, Clock, Receipt, CreditCard, Banknote, CheckCircle2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { notify } from '@/lib/notify'
import api from '@/lib/api'

interface Table { id: string; tableNumber: number; name: string | null; capacity: number; status: string; qrCode?: string; updatedAt?: string }

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
  EMPTY:        { label: 'Available',     dot: '#4ade80', card: 'bg-emerald-500', cardDark: 'dark:bg-emerald-600', text: 'text-white', sub: 'text-emerald-100', filter: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',    btn: 'bg-white/20 hover:bg-white/30 text-white border-white/20' },
  OCCUPIED:     { label: 'Seated',        dot: '#f87171', card: 'bg-red-500',     cardDark: 'dark:bg-red-600',     text: 'text-white', sub: 'text-red-100',   filter: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',            btn: 'bg-white/20 hover:bg-white/30 text-white border-white/20' },
  BILL_PENDING: { label: 'Awaiting Bill', dot: '#fbbf24', card: 'bg-yellow-400',  cardDark: 'dark:bg-yellow-500',  text: 'text-gray-900', sub: 'text-yellow-800', filter: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400', btn: 'bg-black/10 hover:bg-black/20 text-gray-900 border-black/10' },
  DIRTY:        { label: 'Clearing',      dot: '#9ca3af', card: 'bg-gray-400',    cardDark: 'dark:bg-gray-500',    text: 'text-white', sub: 'text-gray-100',  filter: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',          btn: 'bg-white/20 hover:bg-white/30 text-white border-white/20' },
}
const STATUSES = ['EMPTY', 'OCCUPIED', 'BILL_PENDING', 'DIRTY'] as const
type Status = typeof STATUSES[number]

export default function TablesPage() {
  const [tables, setTables]       = useState<Table[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [qrModal, setQrModal]         = useState<Table | null>(null)
  const [qrRegenConfirm, setQrRegenConfirm] = useState(false)
  const [qrRegening, setQrRegening]   = useState(false)
  const [billModal, setBillModal]     = useState<{ table: Table; bill: TableBill } | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  // Staff "Add to Bill" modal
  const [addOrderModal, setAddOrderModal] = useState<Table | null>(null)
  const [menuItems, setMenuItems]         = useState<MenuItem[]>([])
  const [cart, setCart]                   = useState<Record<string, number>>({})
  const [addingOrder, setAddingOrder]     = useState(false)
  const [filter, setFilter]               = useState<Status | 'ALL'>('ALL')
  const now = useNow(30000)

  const load = useCallback(() => api.get('/tables').then(r => setTables(r.data)), [])
  useEffect(() => { load() }, [])

  const openAddOrder = async (table: Table) => {
    setCart({})
    setAddOrderModal(table)
    if (menuItems.length === 0) {
      const r = await api.get('/menu/items')
      setMenuItems(r.data.filter((m: any) => m.isAvailable !== false))
    }
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
      })
      notify.success('Order added to the bill')
      setAddOrderModal(null)
      setCart({})
    } catch {
      notify.error('Could not place order')
    } finally { setAddingOrder(false) }
  }

  const openBill = async (table: Table) => {
    setBillLoading(true)
    try {
      const r = await api.get(`/orders/table/${table.id}/bill`)
      setBillModal({ table, bill: r.data })
    } catch {
      notify.error('Could not load bill')
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
    notify.success('Table marked clean')
  }

  const saveName = async (id: string) => {
    const name = nameInput.trim(); if (!name) return
    await api.patch(`/tables/${id}/name`, { name })
    setTables(p => p.map(t => t.id === id ? { ...t, name } : t))
    setEditingId(null); notify.success('Renamed')
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

            {/* Warm cream header */}
            <div className="relative bg-gradient-to-br from-amber-50 to-orange-50 border-b border-amber-100 px-6 pt-5 pb-6 text-center">
              {/* Close — desktop only */}
              <button onClick={() => { setQrModal(null); setQrRegenConfirm(false) }}
                className="hidden sm:flex absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 items-center justify-center transition-colors">
                <X size={14} className="text-gray-500" />
              </button>

              {/* Brand dot + name */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shadow-sm shadow-orange-200">
                  <span className="text-white text-xs font-black">A</span>
                </div>
                <span className="font-black text-gray-900 text-lg tracking-tight">Al Manzil</span>
              </div>
              <p className="text-amber-600 text-xs font-medium">اطلب عبر الرمز · Scan to order</p>
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
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-orange-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-orange-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-orange-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-orange-400 rounded-br-lg" />
              </div>
            </div>

            {/* Table badge */}
            <div className="text-center px-6 pb-5">
              <div className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full mb-2">
                <span className="text-orange-400 font-black text-base">{qrModal.name ?? `Table ${qrModal.tableNumber}`}</span>
                <span className="w-1 h-1 rounded-full bg-gray-600" />
                <span className="text-gray-400 text-xs">{qrModal.capacity} seats</span>
              </div>
              <p className="text-[11px] text-gray-400">Scan with phone camera to browse the menu &amp; order</p>
            </div>

            {/* Actions */}
            <div className="px-5 pb-6 space-y-2.5">
              <button onClick={() => { printQr(qrModal); setQrModal(null); setQrRegenConfirm(false) }}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg shadow-orange-200">
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
                className="w-full mt-2 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
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
                  <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {/* Group by category */}
              {Array.from(new Set(menuItems.map(m => m.category?.name ?? 'Other'))).map(cat => {
                const items = menuItems.filter(m => (m.category?.name ?? 'Other') === cat)
                return (
                  <div key={cat}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-1.5">{cat}</p>
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors">
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
              <div className="border-t border-gray-100 dark:border-[var(--card-border)] px-5 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">
                    {Object.values(cart).reduce((a, b) => a + b, 0)} item{Object.values(cart).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    AED {Object.entries(cart).reduce((s, [id, qty]) => {
                      const m = menuItems.find(x => x.id === id)
                      return s + (m ? Number(m.price) * qty : 0)
                    }, 0).toFixed(2)}
                  </span>
                </div>
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Tables</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{tables.length} total</span>
            {STATUSES.map(s => countBy(s) > 0 && (
              <span key={s} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${S[s].filter}`}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: S[s].dot }} />
                {countBy(s)} {S[s].label}
              </span>
            ))}
          </div>
        </div>
        <button onClick={load} className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors flex-shrink-0">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        {([['ALL', 'All Tables', tables.length], ...STATUSES.map(s => [s, S[s as Status].label, countBy(s)])] as [string, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => setFilter(key as Status | 'ALL')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
              ${filter === key
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-200 dark:shadow-none'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${filter === key ? 'bg-white/20' : 'bg-white dark:bg-gray-900 text-gray-400'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="p-4 sm:p-6">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-amber-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Table2 size={28} className="text-amber-400 dark:text-amber-600" />
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {visible.map(table => {
            const cfg = S[table.status as Status] ?? S.EMPTY
            const displayName = table.name ?? `Table ${table.tableNumber}`
            const isEditing = editingId === table.id

            return (
              <div key={table.id} className="group bg-[var(--card-bg)] rounded-2xl border border-gray-200 dark:border-[var(--card-border)] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">

                {/* Coloured status area */}
                <div className={`${cfg.card} ${cfg.cardDark} px-4 pt-4 pb-3 flex flex-col gap-1`}>
                  {/* Name */}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveName(table.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="flex-1 text-sm font-bold bg-white/20 border border-white/30 rounded-lg px-2 py-1 focus:outline-none text-white placeholder-white/50 min-w-0" />
                      <button onClick={() => saveName(table.id)} className="text-white/80 hover:text-white flex-shrink-0"><Check size={13} /></button>
                      <button onClick={() => setEditingId(null)} className="text-white/60 hover:text-white flex-shrink-0"><X size={13} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group/n">
                      <p className={`font-extrabold text-base truncate flex-1 ${cfg.text}`}>{displayName}</p>
                      <button onClick={() => { setEditingId(table.id); setNameInput(displayName) }}
                        className={`opacity-0 group-hover/n:opacity-100 transition-opacity flex-shrink-0 ${cfg.text} opacity-60 hover:opacity-100`}>
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}

                  <p className={`text-xs font-semibold ${cfg.sub}`}>{cfg.label}</p>

                  {/* Clearing: show elapsed + auto-clear countdown */}
                  {table.status === 'DIRTY' && table.updatedAt && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-100/80 mt-0.5">
                      <Clock size={9} />
                      <span>Cleaning {clearingElapsed(table.updatedAt, now)}</span>
                      {(clearingCountdown(table.updatedAt, now) ?? 0) > 0 && (
                        <span className="ml-1 opacity-70">· auto-clears in {clearingCountdown(table.updatedAt, now)}m</span>
                      )}
                      {(clearingCountdown(table.updatedAt, now) ?? 1) <= 0 && (
                        <span className="ml-1 text-green-300">· clearing soon…</span>
                      )}
                    </div>
                  )}

                  {/* Capacity + QR */}
                  <div className="flex items-center justify-between mt-1">
                    <span className={`flex items-center gap-1 text-xs ${cfg.sub}`}>
                      <Users size={11} /> {table.capacity} seats
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(table.status === 'OCCUPIED' || table.status === 'BILL_PENDING') && (
                        <>
                          <button onClick={() => openAddOrder(table)}
                            className={`${cfg.text} opacity-70 hover:opacity-100 transition-opacity`}
                            title="Add items to bill">
                            <Plus size={13} />
                          </button>
                          <button onClick={() => openBill(table)}
                            className={`${cfg.text} opacity-70 hover:opacity-100 transition-opacity`}
                            title="View consolidated bill">
                            <Receipt size={13} />
                          </button>
                        </>
                      )}
                      {table.qrCode && (
                        <button onClick={() => { setQrModal(table); setQrRegenConfirm(false) }}
                          className={`${cfg.text} opacity-60 hover:opacity-100 transition-opacity`}>
                          <QrCode size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions — only "Mark Clean" is manual; everything else is automated */}
                <div className="p-2.5">
                  {table.status === 'DIRTY' ? (
                    <button onClick={() => updateStatus(table.id, 'EMPTY')}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center justify-center gap-1.5">
                      ✓ Mark Clean
                    </button>
                  ) : (
                    <div className="text-center text-[10px] text-gray-400 py-1.5">
                      {table.status === 'EMPTY' && 'Ready for guests'}
                      {table.status === 'OCCUPIED' && 'Orders in progress'}
                      {table.status === 'BILL_PENDING' && 'Awaiting payment'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
