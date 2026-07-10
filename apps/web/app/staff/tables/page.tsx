'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Table2, Check, X, QrCode, Printer, Users, RefreshCw, Clock, Receipt, CreditCard, Banknote, CheckCircle2, Plus, Minus, ShoppingBag, LogIn, Settings, ScanLine, Loader2, Search, Trash2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { notify } from '@/lib/notify'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'
import BillReceipt, { DEFAULT_BILL_CONFIG } from '@/components/ui/BillReceipt'
import type { BillConfig, ReceiptData } from '@/components/ui/BillReceipt'

interface UpcomingBooking { id: string; slotTime: string; status: string; partySize: number; customer: { name: string } | null }
interface Table { id: string; tableNumber: number; name: string | null; capacity: number; zone: string; status: string; isActive: boolean; isReservable: boolean; qrCode?: string; updatedAt?: string; upcomingBooking?: UpcomingBooking | null }

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
interface ModOption { id: string; name: string; priceAdd: number; isDefault: boolean }
interface ModGroup { id: string; name: string; required: boolean; minSelect: number; maxSelect: number; options: ModOption[] }
interface MenuItem { id: string; name: string; price: number; categoryId?: string; category?: { name: string }; isAvailable: boolean; modifierGroups?: ModGroup[] }
interface CartEntry { menuItemId: string; quantity: number; optionIds: string[]; label: string }

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
  const router = useRouter()
  const isOwner = user?.role === 'OWNER'
  const [tables, setTables]       = useState<Table[]>([])
  const [restaurantCfg, setRestaurantCfg] = useState<any>(null)
  const billReceiptRef = useRef<HTMLDivElement>(null)
  const [qrModal, setQrModal]         = useState<Table | null>(null)
  const [qrRegenConfirm, setQrRegenConfirm] = useState(false)
  const [forceAvailableConfirm, setForceAvailableConfirm] = useState<string | null>(null)
  const [forceAvailableBill, setForceAvailableBill] = useState<{ orderCount: number; total: number; anyUnpaid: boolean } | null>(null)
  const [forceAvailableLoading, setForceAvailableLoading] = useState(false)
  const [qrRegening, setQrRegening]   = useState(false)
  const [billModal, setBillModal]     = useState<{ table: Table; bill: TableBill } | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  // Staff "Add to Bill" modal
  const [addOrderModal, setAddOrderModal] = useState<Table | null>(null)
  const [menuItems, setMenuItems]         = useState<MenuItem[]>([])
  const [menuCategories, setMenuCategories] = useState<{ id: string; name: string }[]>([])
  const [menuLoading, setMenuLoading]     = useState(false)
  const [cart, setCart]                   = useState<CartEntry[]>([])
  const [menuSearch, setMenuSearch]       = useState('')
  const [activeCatId, setActiveCatId]     = useState<string | null>(null)
  const [modSheet, setModSheet]           = useState<{ item: MenuItem; selections: Record<string, string[]> } | null>(null)
  const [addingOrder, setAddingOrder]     = useState(false)
  const [tableSessions, setTableSessions] = useState<{ sessionId: string; label: string }[]>([])
  const [selectedSession, setSelectedSession] = useState<string>('') // '' = new session
  const [filter, setFilter]               = useState<Status | 'ALL' | 'RESERVED'>('ALL')
  const [checkingIn, setCheckingIn]        = useState<string | null>(null) // bookingId being checked in
  const now = useNow(30000)

  // QR scanner state
  const [scannerOpen, setScannerOpen]     = useState(false)
  const [scanResult, setScanResult]       = useState<{ state: 'scanning' | 'processing' | 'done' | 'error'; msg?: string; detail?: string } >({ state: 'scanning' })
  const videoRef                          = useRef<HTMLVideoElement>(null)
  const streamRef                         = useRef<MediaStream | null>(null)
  const rafRef                            = useRef<number>(0)

  const load = useCallback(() => api.get('/tables').then(r => setTables(r.data)), [])
  useEffect(() => {
    load()
    api.get('/settings').then(r => setRestaurantCfg(r.data)).catch(() => {})
  }, [])

  const stopScanner = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const closeScanner = () => {
    stopScanner()
    setScannerOpen(false)
    setScanResult({ state: 'scanning' })
  }

  const openScanner = async () => {
    setScanResult({ state: 'scanning' })
    setScannerOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        tickScan()
      }
    } catch (err: any) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      setScanResult({
        state: 'error',
        msg: denied ? 'Camera permission denied' : 'Camera not available',
        detail: denied ? 'camera_permission' : err?.message ?? 'Could not access camera.',
      })
    }
  }

  const tickScan = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(tickScan); return }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    import('jsqr').then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
      if (code?.data) {
        handleQrData(code.data)
      } else {
        rafRef.current = requestAnimationFrame(tickScan)
      }
    })
  }

  const handleQrData = async (data: string) => {
    stopScanner()
    setScanResult({ state: 'processing' })
    // Extract booking ref from URL: /book/arrive/{ref}
    const match = data.match(/\/book\/arrive\/([^/?#]+)/)
    const ref = match?.[1]
    if (!ref) {
      setScanResult({ state: 'error', msg: 'Invalid QR code', detail: 'This QR code is not a valid booking ticket.' })
      return
    }
    try {
      const r = await api.post(`/bookings/${ref}/staff-checkin`)
      // Fetch booking details to show guest name + table
      const details = await api.get(`/bookings/${ref}/public`).catch(() => ({ data: null }))
      const d = details.data
      const guestName = d?.guestName ?? 'Guest'
      const tableInfo = d?.table ? `Table ${d.table.number}${d.table.zone ? ` · ${d.table.zone}` : ''}` : ''
      setScanResult({ state: 'done', msg: `${guestName} checked in`, detail: tableInfo || undefined })
      load()
    } catch (e: any) {
      setScanResult({ state: 'error', msg: e?.response?.data?.message ?? e?.message ?? 'Check-in failed', detail: 'Tap retry to scan again.' })
    }
  }

  const openAddOrder = async (table: Table) => {
    setCart([])
    setMenuSearch('')
    setModSheet(null)
    setTableSessions([])
    setSelectedSession('')
    setAddOrderModal(table)
    setMenuLoading(true)
    try {
      const [catRes, itemRes, sessRes] = await Promise.allSettled([
        api.get('/menu/categories'),
        api.get('/menu/items?includeUnavailable=false'),
        api.get(`/orders/table/${table.id}/sessions`),
      ])
      if (catRes.status === 'fulfilled') {
        const cats = catRes.value.data?.data ?? catRes.value.data ?? []
        setMenuCategories(cats)
        setActiveCatId(cats[0]?.id ?? null)
      }
      if (itemRes.status === 'fulfilled') {
        const all = itemRes.value.data?.data ?? itemRes.value.data ?? []
        setMenuItems(all.filter((m: MenuItem) => m.isAvailable !== false))
      }
      if (sessRes.status === 'fulfilled' && sessRes.value.data?.length > 0) {
        const mapped = sessRes.value.data.map((s: any, i: number) => ({
          sessionId: s.sessionId,
          label: s.userName ? s.userName.split(' ')[0] : `Guest ${i + 1}`,
        }))
        setTableSessions(mapped)
        setSelectedSession(mapped[0].sessionId)
      }
    } finally { setMenuLoading(false) }
  }

  const cartCount = cart.reduce((s, e) => s + e.quantity, 0)
  const cartTotal = cart.reduce((s, e) => {
    const item = menuItems.find(i => i.id === e.menuItemId)
    if (!item) return s
    const modExtra = (item.modifierGroups ?? []).flatMap(g => g.options).filter(o => e.optionIds.includes(o.id)).reduce((a, o) => a + Number(o.priceAdd), 0)
    return s + (Number(item.price) + modExtra) * e.quantity
  }, 0)

  function cartAddSimple(item: MenuItem) {
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds: [], label: '' }])
  }
  function cartRemoveEntry(idx: number) {
    setCart(c => { const n = [...c]; if (n[idx].quantity > 1) { n[idx] = { ...n[idx], quantity: n[idx].quantity - 1 }; return n } n.splice(idx, 1); return n })
  }
  function cartAddEntry(idx: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n })
  }
  function openModSheet(item: MenuItem) {
    const defaults: Record<string, string[]> = {}
    for (const g of item.modifierGroups ?? []) defaults[g.id] = g.options.filter(o => o.isDefault).map(o => o.id)
    setModSheet({ item, selections: defaults })
  }
  function confirmModSheet() {
    if (!modSheet) return
    const { item, selections } = modSheet
    const optionIds = Object.values(selections).flat()
    const labelParts: string[] = []
    for (const g of item.modifierGroups ?? []) {
      const chosen = g.options.filter(o => selections[g.id]?.includes(o.id))
      if (chosen.length) labelParts.push(chosen.map(o => o.name).join(', '))
    }
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds, label: labelParts.join(' · ') }])
    setModSheet(null)
  }
  function toggleModOption(groupId: string, optionId: string, maxSelect: number) {
    setModSheet(s => {
      if (!s) return s
      const prev = s.selections[groupId] ?? []
      const next = prev.includes(optionId) ? prev.filter(id => id !== optionId) : maxSelect === 1 ? [optionId] : prev.length < maxSelect ? [...prev, optionId] : prev
      return { ...s, selections: { ...s.selections, [groupId]: next } }
    })
  }

  const submitStaffOrder = async () => {
    if (!addOrderModal || !cart.length) { notify.error('Add at least one item'); return }
    setAddingOrder(true)
    try {
      const items = cart.map(e => {
        const item = menuItems.find(i => i.id === e.menuItemId)!
        const allOpts = (item.modifierGroups ?? []).flatMap(g => g.options)
        const modifiers = e.optionIds.map(oid => { const opt = allOpts.find(o => o.id === oid)!; return { optionId: oid, name: opt.name, priceAdd: Number(opt.priceAdd) } })
        return { menuItemId: e.menuItemId, quantity: e.quantity, ...(modifiers.length ? { modifiers } : {}) }
      })
      await api.post(`/orders/table/${addOrderModal.id}/staff-order`, {
        type: 'DINE_IN', tableId: addOrderModal.id, items,
        ...(selectedSession ? { guestTabToken: selectedSession } : {}),
      })
      notify.success('Order added to the bill')
      setAddOrderModal(null)
      setCart([])
    } catch (e: any) {
      notify.error(e?.response?.data?.message ?? e?.message ?? 'Could not place order')
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

  const printBill = (_table: Table, _bill: TableBill) => {
    const el = billReceiptRef.current
    if (!el) return
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff}@media print{@page{margin:0}}</style>
</head><body>${el.outerHTML}<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`)
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

  const checkInGuest = async (bookingId: string, tableId: string) => {
    setCheckingIn(bookingId)
    try {
      await api.post(`/orders/booking/${bookingId}/check-in`)
      setTables(p => p.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED' } : t))
      notify.success('Guest checked in — table is now seated')
    } catch {
      notify.error('Check-in failed')
    } finally {
      setCheckingIn(null)
    }
  }

  const countBy = (s: string) => tables.filter(t => t.status === s).length
  const countReserved = tables.filter(t => t.status === 'EMPTY' && !!t.upcomingBooking).length
  const visible = filter === 'ALL' ? tables
    : filter === 'RESERVED' ? tables.filter(t => t.status === 'EMPTY' && !!t.upcomingBooking)
    : tables.filter(t => t.status === filter)

  return (
    <div className="flex flex-col flex-1">

      {/* Hidden QR canvases */}
      <div className="hidden">{tables.map(t => t.qrCode && <QRCodeCanvas key={t.id} id={`qr-${t.id}`} value={getQrUrl(t)} size={200} />)}</div>

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-safe-top pt-4 pb-3">
            <div>
              <p className="text-white font-bold text-base">Scan Guest QR</p>
              <p className="text-white/40 text-xs">Point camera at guest&apos;s booking ticket</p>
            </div>
            <button onClick={closeScanner} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <X size={18} className="text-white" />
            </button>
          </div>

          {/* Camera / result area */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {/* Video feed */}
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />

            {/* Dark overlay with cutout */}
            {scanResult.state === 'scanning' && (
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-64 h-64 relative">
                  {/* Corner brackets */}
                  {[['top-0 left-0', 'border-t-2 border-l-2 rounded-tl-xl'],
                    ['top-0 right-0', 'border-t-2 border-r-2 rounded-tr-xl'],
                    ['bottom-0 left-0', 'border-b-2 border-l-2 rounded-bl-xl'],
                    ['bottom-0 right-0', 'border-b-2 border-r-2 rounded-br-xl'],
                  ].map(([pos, cls]) => (
                    <div key={pos} className={`absolute w-8 h-8 ${pos} ${cls}`}
                      style={{ borderColor: 'var(--brand)' }} />
                  ))}
                  {/* Scan line animation */}
                  <div className="absolute inset-x-2 h-0.5 animate-scan-line" style={{ background: 'var(--brand)', boxShadow: '0 0 8px var(--brand)' }} />
                </div>
                <p className="text-white/60 text-sm mt-5">Align QR within the frame</p>
              </div>
            )}

            {/* Processing */}
            {scanResult.state === 'processing' && (
              <div className="relative z-10 flex flex-col items-center gap-3">
                <Loader2 size={44} className="text-white animate-spin" />
                <p className="text-white font-semibold">Checking in guest…</p>
                <p className="text-white/40 text-sm">Seating table · firing kitchen</p>
              </div>
            )}

            {/* Success */}
            {scanResult.state === 'done' && (
              <div className="relative z-10 flex flex-col items-center gap-3 px-8 text-center">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-1">
                  <CheckCircle2 size={44} className="text-green-400" />
                </div>
                <p className="text-white text-xl font-bold">{scanResult.msg}</p>
                {scanResult.detail && <p className="text-white/50 text-sm">{scanResult.detail}</p>}
                <button onClick={closeScanner}
                  className="mt-4 px-8 py-3 rounded-2xl font-bold text-sm text-white"
                  style={{ background: 'var(--brand)' }}>
                  Done
                </button>
                <button onClick={() => { setScanResult({ state: 'scanning' }); openScanner() }}
                  className="text-white/40 text-xs underline underline-offset-2">
                  Scan another
                </button>
              </div>
            )}

            {/* Error */}
            {scanResult.state === 'error' && (
              <div className="relative z-10 flex flex-col items-center gap-3 px-8 text-center max-w-xs">
                <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center mb-1">
                  <X size={40} className="text-red-400" />
                </div>
                <p className="text-white text-lg font-bold">{scanResult.msg}</p>
                {scanResult.detail === 'camera_permission' ? (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-2 w-full">
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">How to enable camera</p>
                    {[
                      'Tap the lock / info icon in your browser address bar',
                      'Find "Camera" and set it to Allow',
                      'Reload this page, then tap Scan QR again',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-white/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-white/50 text-sm">{step}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/40 text-sm">{scanResult.detail}</p>
                )}
                <button onClick={() => { setScanResult({ state: 'scanning' }); openScanner() }}
                  className="mt-2 px-8 py-3 rounded-2xl font-bold text-sm text-white"
                  style={{ background: 'var(--brand)' }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                {isOwner && (
                  <button
                    onClick={() => { setBillModal(null); router.push('/staff/settings?section=bill') }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                    title="Bill & Receipt settings">
                    <Settings size={15} />
                  </button>
                )}
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

          {/* Hidden BillReceipt — used as print source */}
          {(() => {
            const cfg: BillConfig = { ...DEFAULT_BILL_CONFIG, ...(restaurantCfg?.billConfig ?? {}) }
            const receiptData: ReceiptData = {
              sessionId: billModal.bill.sessionId ?? '',
              table: { name: billModal.table.name ?? undefined, tableNumber: billModal.table.tableNumber },
              orders: billModal.bill.orders.map(o => ({
                id: o.id,
                createdAt: o.createdAt,
                user: o.user,
                items: o.items.map(i => ({
                  menuItem: { name: i.menuItem.name },
                  quantity: i.quantity,
                  unitPrice: Number(i.unitPrice),
                  total: i.quantity * Number(i.unitPrice),
                })),
              })),
              summary: {
                subtotal: Number(billModal.bill.summary.subtotal),
                vatAmount: Number(billModal.bill.summary.vatAmount),
                total: Number(billModal.bill.summary.total),
              },
              restaurant: {
                restaurantName: restaurantCfg?.restaurantName ?? 'Al Manzil',
                tagline: restaurantCfg?.tagline ?? null,
                address: restaurantCfg?.address ?? null,
                phone: restaurantCfg?.phone ?? null,
                logoUrl: restaurantCfg?.logoUrl ?? null,
                vatNumber: restaurantCfg?.vatNumber ?? cfg.vatNumber ?? null,
                vatRate: restaurantCfg?.vatRate ?? 0.05,
                currency: restaurantCfg?.currency ?? 'AED',
                currencySymbol: restaurantCfg?.currencySymbol ?? 'AED',
              },
            }
            return (
              <div className="hidden">
                <BillReceipt ref={billReceiptRef} data={receiptData} config={cfg} receiptNumber={String(Date.now()).slice(-8)} />
              </div>
            )
          })()}
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

            {/* Search + category tabs + items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {menuLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    <input value={menuSearch}
                      onChange={e => { setMenuSearch(e.target.value); if (e.target.value) setActiveCatId(null) }}
                      placeholder="Search dishes…"
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-[var(--card-border)]" />
                  </div>

                  {/* Category tabs */}
                  {!menuSearch && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                      {menuCategories.map(cat => (
                        <button key={cat.id} type="button" onClick={() => setActiveCatId(cat.id)}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            activeCatId === cat.id ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}
                          style={activeCatId === cat.id ? { backgroundColor: 'var(--brand)' } : undefined}>
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Item list */}
                  <div className="space-y-2">
                    {(() => {
                      const q = menuSearch.trim().toLowerCase()
                      const visible = q
                        ? menuItems.filter(i => i.name.toLowerCase().includes(q))
                        : menuItems.filter(i => i.categoryId === activeCatId)
                      if (!visible.length) return (
                        <p className="text-center text-sm py-6 text-gray-400">
                          {menuSearch ? `No results for "${menuSearch}"` : 'No items in this category'}
                        </p>
                      )
                      return visible.map(item => {
                        const hasModifiers = (item.modifierGroups ?? []).length > 0
                        const itemEntries = cart.filter(e => e.menuItemId === item.id)
                        const totalQty = itemEntries.reduce((s, e) => s + e.quantity, 0)
                        return (
                          <div key={item.id}
                            className="rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity border"
                            style={{ borderColor: totalQty > 0 ? 'rgba(var(--brand-rgb),0.4)' : undefined }}
                            onClick={() => hasModifiers ? openModSheet(item) : cartAddSimple(item)}>
                            <div className="flex items-center gap-3 px-3 py-3 bg-white dark:bg-[var(--card-bg)]">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">{item.name}</p>
                                <p className="text-xs mt-0.5 text-gray-400">
                                  AED {Number(item.price).toFixed(2)}{hasModifiers && <span className="ml-1 opacity-60">· customisable</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                {hasModifiers ? (
                                  <button type="button" onClick={() => openModSheet(item)}
                                    className="px-3 h-7 rounded-full text-xs font-semibold text-white"
                                    style={{ backgroundColor: 'var(--brand)' }}>+ Add</button>
                                ) : totalQty > 0 ? (
                                  <>
                                    <button type="button"
                                      onClick={() => { const idx = cart.findLastIndex(e => e.menuItemId === item.id); if (idx >= 0) cartRemoveEntry(idx) }}
                                      className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-sm text-gray-700 dark:text-gray-300">−</button>
                                    <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{totalQty}</span>
                                    <button type="button" onClick={() => cartAddSimple(item)}
                                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm text-white"
                                      style={{ backgroundColor: 'var(--brand)' }}>+</button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => cartAddSimple(item)}
                                    className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-sm text-gray-500">+</button>
                                )}
                              </div>
                            </div>
                            {hasModifiers && itemEntries.length > 0 && (
                              <div className="px-3 pb-2 space-y-1 bg-white dark:bg-[var(--card-bg)]">
                                {itemEntries.map((e, idx) => {
                                  const globalIdx = cart.indexOf(e)
                                  return (
                                    <div key={idx} className="flex items-center gap-2 text-xs text-gray-400">
                                      <span className="flex-1 truncate">{e.label || 'No extras'} ×{e.quantity}</span>
                                      <button type="button" onClick={() => cartRemoveEntry(globalIdx)} className="text-red-400"><Trash2 size={11} /></button>
                                      <button type="button" onClick={() => cartAddEntry(globalIdx)} className="font-bold" style={{ color: 'var(--brand)' }}>+1</button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Cart summary + submit */}
            {cartCount > 0 && (
              <div className="border-t border-gray-100 dark:border-[var(--card-border)] px-5 py-4 flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {cartCount} item{cartCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    AED {cartTotal.toFixed(2)}
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
                    : <><ShoppingBag size={15} /> Add to Bill · {cartCount} item{cartCount !== 1 ? 's' : ''}</>
                  }
                </button>
              </div>
            )}

            {/* Modifier bottom sheet */}
            {modSheet && (
              <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50 rounded-3xl"
                onClick={e => { if (e.target === e.currentTarget) setModSheet(null) }}>
                <div className="rounded-t-2xl overflow-hidden flex flex-col max-h-[80%] bg-white dark:bg-[var(--card-bg)] border border-gray-200 dark:border-[var(--card-border)]">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-[var(--card-border)] flex items-center gap-3 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate text-gray-900 dark:text-white">{modSheet.item.name}</p>
                      <p className="text-xs mt-0.5 text-gray-400">AED {Number(modSheet.item.price).toFixed(2)}</p>
                    </div>
                    <button type="button" onClick={() => setModSheet(null)} className="text-lg font-bold text-gray-400">×</button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {(modSheet.item.modifierGroups ?? []).map(group => (
                      <div key={group.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{group.name}</p>
                          {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>Required</span>}
                          {group.maxSelect > 1 && <span className="text-[10px] text-gray-400">Pick up to {group.maxSelect}</span>}
                        </div>
                        <div className="space-y-1.5">
                          {group.options.map(opt => {
                            const selected = (modSheet.selections[group.id] ?? []).includes(opt.id)
                            return (
                              <button key={opt.id} type="button" onClick={() => toggleModOption(group.id, opt.id, group.maxSelect)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border"
                                style={{ borderColor: selected ? 'var(--brand)' : undefined, backgroundColor: selected ? 'rgba(var(--brand-rgb),0.06)' : undefined }}>
                                <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                  style={{ borderColor: selected ? 'var(--brand)' : '#ccc', backgroundColor: selected ? 'var(--brand)' : 'transparent' }}>
                                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{opt.name}</span>
                                {Number(opt.priceAdd) > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>+AED {Number(opt.priceAdd).toFixed(2)}</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-100 dark:border-[var(--card-border)] flex-shrink-0">
                    {(() => {
                      const missing = (modSheet.item.modifierGroups ?? []).filter(g => g.required && !(modSheet.selections[g.id]?.length))
                      return (
                        <button type="button" onClick={confirmModSheet} disabled={missing.length > 0}
                          className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                          style={{ backgroundColor: 'var(--brand)' }}>
                          {missing.length > 0 ? `Select ${missing[0].name}` : 'Add to Order'}
                        </button>
                      )
                    })()}
                  </div>
                </div>
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
        <button onClick={openScanner}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all active:scale-95"
          style={{ background: 'var(--brand)' }}>
          <ScanLine size={13} />
          Scan QR
        </button>
        {/* Filter tabs inline */}
        <div className="hidden sm:flex items-center gap-1 ml-2 overflow-x-auto">
          {([
            ['ALL', 'All', 'All', tables.length],
            ['RESERVED', 'Reserved', 'Rsvd', countReserved],
            ...STATUSES.map(s => [s, S[s as Status].label, S[s as Status].labelShort, countBy(s)]),
          ] as [string, string, string, number][]).map(([key, label, , count]) => (
            <button key={key} onClick={() => setFilter(key as any)}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
              style={filter === key
                ? key === 'RESERVED'
                  ? { backgroundColor: '#f59e0b', color: '#000' }
                  : { backgroundColor: 'var(--brand)', color: '#000' }
                : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              {label}
              <span className="text-[10px] font-bold opacity-70">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile filter tabs */}
      <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        {([
          ['ALL', 'All', tables.length],
          ['RESERVED', 'Rsvd', countReserved],
          ...STATUSES.map(s => [s, S[s as Status].labelShort, countBy(s)]),
        ] as [string, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => setFilter(key as any)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
            style={filter === key
              ? key === 'RESERVED'
                ? { backgroundColor: '#f59e0b', color: '#000' }
                : { backgroundColor: 'var(--brand)', color: '#000' }
              : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
            {label} <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="p-4 sm:p-6">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl"
            style={{ border: '1px dashed var(--card-border)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--muted-bg)' }}>
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
            const isReserved  = table.status === 'EMPTY' && !!table.upcomingBooking
            const isWalkIn    = !table.isReservable
            const cfg         = S[table.status as Status] ?? S.EMPTY
            const displayName = table.name ?? `Table ${table.tableNumber}`
            const isOccupied  = table.status === 'OCCUPIED' || table.status === 'BILL_PENDING'
            const modeColor   = isWalkIn ? '#6366f1' : '#10b981'
            const modeLabel   = isWalkIn ? 'Walk-in' : 'Online'

            return (
              <div key={table.id}
                className="rounded-2xl border overflow-hidden flex flex-col transition-all hover:shadow-md"
                style={{ borderColor: isWalkIn ? '#6366f133' : 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>

                {/* dual-tone top bar: left = booking mode, right = table status */}
                <div className="h-1 flex-shrink-0 flex">
                  <div className="w-1/3" style={{ backgroundColor: modeColor }} />
                  <div className="flex-1" style={{ backgroundColor: isReserved ? '#f59e0b' : cfg.color }} />
                </div>

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

                  {/* Name + seats + zone + booking mode */}
                  <div>
                    <p className="font-bold text-sm truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                        <Users size={9} />{table.capacity}p
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                        {table.zone ?? 'Indoor'}
                      </span>
                      {/* booking mode badge */}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                        style={{ backgroundColor: `${modeColor}18`, color: modeColor }}>
                        {modeLabel}
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
                          <div className="rounded-xl px-3 py-2.5 space-y-2"
                            style={{ border: '1px solid rgba(var(--brand-rgb),0.3)', background: 'rgba(var(--brand-rgb),0.06)' }}>
                            <p className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                              ⚠️ Force-reset {table.name ?? `Table ${table.tableNumber}`}?
                            </p>
                            {forceAvailableLoading ? (
                              <p className="text-[10px] animate-pulse" style={{ color: 'rgba(var(--brand-rgb),0.5)' }}>Checking active orders…</p>
                            ) : forceAvailableBill ? (
                              <div className="space-y-1">
                                {forceAvailableBill.orderCount > 0 ? (
                                  <>
                                    <p className="text-[10px] font-semibold" style={{ color: 'rgba(var(--brand-rgb),0.85)' }}>
                                      {forceAvailableBill.orderCount} active order{forceAvailableBill.orderCount !== 1 ? 's' : ''} · AED {forceAvailableBill.total.toFixed(2)} total
                                    </p>
                                    {forceAvailableBill.anyUnpaid && (
                                      <p className="text-[10px] font-bold" style={{ color: '#f87171' }}>
                                        💵 Unpaid bill — table status will reset but the bill stays open. Collect payment separately.
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-[10px]" style={{ color: 'rgba(var(--brand-rgb),0.6)' }}>No active orders on this table.</p>
                                )}
                              </div>
                            ) : null}
                            <div className="flex gap-1.5 pt-0.5">
                              <button onClick={() => { updateStatus(table.id, 'EMPTY'); setForceAvailableConfirm(null); setForceAvailableBill(null) }}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                style={{ background: 'rgba(var(--brand-rgb),0.18)', border: '1px solid rgba(var(--brand-rgb),0.4)', color: 'var(--brand)' }}>
                                <Check size={10} /> Confirm reset
                              </button>
                              <button onClick={() => { setForceAvailableConfirm(null); setForceAvailableBill(null) }}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors hover:bg-[var(--muted-bg)]"
                                style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={async () => {
                            setForceAvailableConfirm(table.id)
                            setForceAvailableLoading(true)
                            setForceAvailableBill(null)
                            try {
                              const r = await api.get(`/orders/table/${table.id}/bill`)
                              const b = r.data?.summary
                              setForceAvailableBill({ orderCount: b?.orderCount ?? 0, total: b?.total ?? 0, anyUnpaid: b?.anyUnpaid ?? false })
                            } catch { setForceAvailableBill({ orderCount: 0, total: 0, anyUnpaid: false }) }
                            finally { setForceAvailableLoading(false) }
                          }}
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

                    {table.status === 'EMPTY' && isReserved && table.upcomingBooking && (
                      <button
                        onClick={() => checkInGuest(table.upcomingBooking!.id, table.id)}
                        disabled={checkingIn === table.upcomingBooking.id}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors active:scale-[0.98] disabled:opacity-60"
                        style={{ backgroundColor: '#f59e0b', color: '#000' }}>
                        <LogIn size={13} />
                        {checkingIn === table.upcomingBooking.id ? 'Checking in…' : 'Check In Guest'}
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
