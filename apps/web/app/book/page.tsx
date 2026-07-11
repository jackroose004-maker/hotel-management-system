'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useLangStore, applyLangDir, syncLangToServer, type Lang } from '@/store/lang'
import { useBrandStore, initBrand } from '@/store/brand'
import {
  CalendarDays, Clock, Users,
  AlertTriangle, CheckCircle2, ArrowLeft, MapPin, UtensilsCrossed,
  Download, Printer, Sofa, Trees, Eye, Lock,
} from 'lucide-react'
import Link from 'next/link'
import { QRCodeCanvas } from 'qrcode.react'
import ForceDark from '@/components/ForceDark'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface Slot { time: string; available: number; total: number; isPast: boolean; isFull: boolean }

function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c }
function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}
function dayLabel(d: Date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[d.getDay()]
}

export default function BookPage() {
  const router = useRouter()
  const { user, token } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const ar = lang === 'ar'
  const showLangToggle = useBrandStore(s => s.showLanguageToggle)
  const brandColor = useBrandStore(s => s.brandColor) || '#f59e0b'
  useEffect(() => { applyLangDir(lang); initBrand() }, [lang])

  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().token) router.replace('/login?redirect=/book')
    }, 120)
    return () => clearTimeout(t)
  }, [router])

  const today = new Date()
  const maxDate = addDays(today, 7)

  const [date, setDate] = useState(new Date())
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [partySize, setPartySize] = useState(2)
  const [notes, setNotes] = useState('')
  const [seatingPreference, setSeatingPreference] = useState<string>('Indoor')
  const [availableTables, setAvailableTables] = useState<any[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [tablesLoading, setTablesLoading] = useState(false)
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick')
  const [booking, setBooking] = useState<any>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrText, setQrText] = useState('')
  const [preOrder, setPreOrder] = useState<any>(null) // order placed alongside booking
  const ticketRef = useRef<HTMLDivElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // 7-day strip
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  useEffect(() => { fetchSlots() }, [date])

  useEffect(() => {
    if (step !== 'confirm' || !selected) return
    setSelectedTableId(null)
    setTablesLoading(true)
    fetch(`${API}/tables/tables-for-date?date=${formatDate(date)}&partySize=${partySize}`)
      .then(r => r.json()).then(j => setAvailableTables(j?.data ?? j ?? []))
      .catch(() => setAvailableTables([]))
      .finally(() => setTablesLoading(false))
  }, [partySize, step])

  async function fetchSlots() {
    setLoading(true)
    try {
      const r = await fetch(`${API}/bookings/availability?date=${formatDate(date)}`)
      const json = await r.json()
      const payload = json?.data ?? json
      setSlots(payload?.slots ?? [])
      setBookingsEnabled(payload?.bookingsEnabled !== false)
    } finally { setLoading(false) }
  }

  async function selectSlot(time: string) {
    setSelected(time)
    setStep('confirm')
    setSelectedTableId(null)
    setTablesLoading(true)
    try {
      const r = await fetch(`${API}/tables/tables-for-date?date=${formatDate(date)}&partySize=${partySize}`)
      const json = await r.json()
      setAvailableTables(json?.data ?? json ?? [])
    } catch { setAvailableTables([]) }
    finally { setTablesLoading(false) }
  }

  async function confirmBooking() {
    if (!token || !selected) return
    setSubmitting(true)
    setError('')
    try {
      const r = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          partySize, slotDate: formatDate(date), slotTime: selected, notes, seatingPreference,
          ...(selectedTableId ? { tableId: selectedTableId } : {}),
          idempotencyKey: `${user?.id}-${formatDate(date)}-${selected}-${Date.now()}`,
        }),
      })
      const json = await r.json()
      const payload = json?.data ?? json
      if (!r.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Booking failed')
      setBooking(payload)
      setStep('done')
      // Set QR text — QRCodeCanvas renders it, then we extract data URL via useEffect
      setQrText([
        'AL MANZIL HOTEL',
        `Ref: ${payload.id.slice(-8).toUpperCase()}`,
        `Date: ${new Date(payload.slotDate).toLocaleDateString('en-AE', { weekday:'long', day:'numeric', month:'long' })}`,
        `Time: ${slotLabel(payload.slotTime)}`,
        `Table: ${payload.table?.tableNumber ?? '—'}`,
        `Guests: ${payload.partySize}`,
        `Name: ${user?.name ?? ''}`,
      ].join('\n'))
    } catch (e: any) {
      setError(e.message)
    } finally { setSubmitting(false) }
  }

  // Extract QR data URL after QRCodeCanvas renders
  useEffect(() => {
    if (!qrText) return
    setTimeout(() => {
      const canvas = document.getElementById('booking-qr-canvas') as HTMLCanvasElement | null
      if (canvas) setQrDataUrl(canvas.toDataURL('image/png'))
    }, 100)
  }, [qrText])

  const futureSlots = slots.filter(s => !s.isPast)
  const availableCount = futureSlots.filter(s => !s.isFull).length

  // ── DONE ─────────────────────────────────────────────────────────────────
  function printTicket() {
    const w = window.open('', '_blank')
    if (!w || !booking) return
    const ref = booking.id.slice(-8).toUpperCase()
    const dateStr = new Date(booking.slotDate).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const timeStr = slotLabel(booking.slotTime)
    const guestName = user?.name ?? 'Guest'
    const tableNo = booking.table?.tableNumber ? `Table ${booking.table.tableNumber}` : 'TBD'
    const zone = seatingPreference || booking.table?.zone || 'Indoor'

    const preOrderRows = preOrder
      ? preOrder.items.map((i: any) => `
          <tr>
            <td style="padding:6px 0;color:#444;font-size:12.5px;">${i.quantity}× ${i.menuItem.name}</td>
            <td style="padding:6px 0;color:#111;font-size:12.5px;font-weight:600;text-align:right;">AED ${(Number(i.unitPrice) * i.quantity).toFixed(2)}</td>
          </tr>`).join('')
      : ''

    const preOrderSection = preOrder ? `
      <div style="height:1px;background:repeating-linear-gradient(90deg,#ddd 0,#ddd 6px,transparent 6px,transparent 12px);margin:20px 0;"></div>
      <div style="font-size:10px;font-weight:800;color:#999;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Pre-Order Summary</div>
      <table width="100%" cellpadding="0" cellspacing="0">${preOrderRows}</table>
      <div style="height:1px;background:#eee;margin:14px 0;"></div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="color:#888;font-size:12px;padding:3px 0;">Subtotal</td><td style="text-align:right;font-size:12px;color:#444;">AED ${Number(preOrder.subtotal).toFixed(2)}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding:3px 0;">VAT (5%)</td><td style="text-align:right;font-size:12px;color:#444;">AED ${Number(preOrder.vatAmount).toFixed(2)}</td></tr>
        <tr><td style="color:#111;font-size:14px;font-weight:800;padding:8px 0 3px;">Total</td><td style="text-align:right;font-size:16px;font-weight:900;color:${brandColor};">AED ${Number(preOrder.total).toFixed(2)}</td></tr>
      </table>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 14px;margin-top:10px;font-size:11px;font-weight:700;color:#15803d;text-align:center;">
        ${preOrder.paymentStatus === 'PAID' ? '✓ Pre-order Paid by Card' : '💵 Pay at Table'}
      </div>` : ''

    w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<title>Al Manzil — Booking ${ref}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#f2f2f2;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:40px 16px;}
  .page{width:400px;}
  .card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.12);}
  .stripe{height:6px;background:${brandColor};}
  .head{background:#111;padding:28px 28px 24px;position:relative;}
  .head-logo{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-bottom:2px;}
  .head-sub{font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:1px;text-transform:uppercase;}
  .head-badge{position:absolute;top:28px;right:28px;background:${brandColor}25;border:1px solid ${brandColor}80;border-radius:20px;padding:5px 12px;font-size:10px;font-weight:700;color:${brandColor};letter-spacing:1px;text-transform:uppercase;}
  .body{padding:24px 28px;}
  .ref-row{display:flex;align-items:center;justify-content:space-between;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:10px 14px;margin-bottom:20px;}
  .ref-label{font-size:10px;font-weight:700;color:#aaa;letter-spacing:2px;text-transform:uppercase;}
  .ref-value{font-family:monospace;font-size:13px;font-weight:900;color:#111;letter-spacing:3px;}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}
  .detail-item .dl{font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px;}
  .detail-item .dv{font-size:15px;font-weight:700;color:#111;}
  .detail-item .dv.accent{color:${brandColor};font-size:18px;font-weight:900;}
  .guest-row{background:#f9f9f9;border-radius:10px;padding:12px 14px;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
  .guest-avatar{width:36px;height:36px;border-radius:50%;background:#111;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:#fff;flex-shrink:0;}
  .guest-name{font-size:14px;font-weight:700;color:#111;}
  .guest-meta{font-size:11px;color:#999;margin-top:1px;}
  .qr-box{border:1px solid #eee;border-radius:14px;padding:20px;text-align:center;margin-bottom:16px;}
  .qr-box img{width:160px;height:160px;border-radius:10px;display:block;margin:0 auto 10px;}
  .qr-label{font-size:11px;color:#999;line-height:1.5;}
  .notice{background:#fff8ee;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;font-size:11.5px;color:#92400e;line-height:1.6;}
  .footer{background:#f9f9f9;border-top:1px solid #f0f0f0;padding:14px 28px;display:flex;justify-content:space-between;align-items:center;}
  .footer-left{font-size:10px;color:#bbb;}
  .footer-right{font-size:10px;color:#bbb;font-family:monospace;letter-spacing:1px;}
  @media print{body{padding:0;background:#fff;}.page{width:100%;}.card{box-shadow:none;border-radius:0;}}
</style>
</head><body>
<div class="page">
  <div class="card">
    <div class="stripe"></div>
    <div class="head">
      <div class="head-badge">Confirmed</div>
      <div class="head-logo">Al Manzil Hotel</div>
      <div class="head-sub">${preOrder ? 'Booking + Pre-Order' : 'Reservation'}</div>
    </div>
    <div class="body">
      <div class="ref-row">
        <span class="ref-label">Booking Ref</span>
        <span class="ref-value">${ref}</span>
      </div>
      <div class="guest-row">
        <div class="guest-avatar">${guestName.charAt(0).toUpperCase()}</div>
        <div>
          <div class="guest-name">${guestName}</div>
          <div class="guest-meta">${booking.partySize} ${booking.partySize === 1 ? 'guest' : 'guests'} · ${zone} seating</div>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="dl">Date</div>
          <div class="dv">${dateStr}</div>
        </div>
        <div class="detail-item">
          <div class="dl">Time</div>
          <div class="dv accent">${timeStr}</div>
        </div>
        <div class="detail-item">
          <div class="dl">Table</div>
          <div class="dv">${tableNo}</div>
        </div>
        <div class="detail-item">
          <div class="dl">Party Size</div>
          <div class="dv">${booking.partySize} people</div>
        </div>
      </div>
      ${qrDataUrl ? `
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="Booking QR Code"/>
        <div class="qr-label">Scan this QR at the hotel entrance<br/>to confirm your arrival instantly</div>
      </div>` : ''}
      ${preOrderSection}
      <div class="notice" style="margin-top:${preOrder ? '16px' : '0'};">
        ⏱ &nbsp;Please arrive within <strong>15 minutes</strong> of your slot time.
        After that, your table may be released to walk-in guests.
        ${preOrder ? '<br/>🍽 Your pre-ordered food will be sent to the kitchen the moment you scan in.' : ''}
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">© Al Manzil Hotel · Dubai, UAE</span>
      <span class="footer-right">${ref}</span>
    </div>
  </div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
    w.document.close()
  }

  if (step === 'done' && booking) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col">
        <ForceDark />
        <div className="px-4 py-4 flex items-center gap-3">
          <Link href="/" className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
            <ArrowLeft size={16} className="text-white" />
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-5">
            <CheckCircle2 size={40} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You're booked!</h1>
          <p className="text-gray-400 text-sm mb-8">Table held for 15 minutes from your slot time.</p>

          {/* Ticket card */}
          <div ref={ticketRef} className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
            <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: brandColor }}>
              <span className="font-bold text-white">Al Manzil Hotel</span>
              <span className="text-white/80 text-sm">Booking confirmed</span>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Date', value: new Date(booking.slotDate).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' }) },
                { label: 'Time', value: slotLabel(booking.slotTime) },
                { label: 'Table', value: `Table ${booking.table?.tableNumber ?? '—'}` },
                { label: 'Guests', value: `${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}` },
                { label: 'Ref', value: booking.id.slice(-8).toUpperCase() },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{r.label}</span>
                  <span className={`font-semibold text-sm text-white ${r.label === 'Ref' ? 'font-mono text-xs tracking-widest text-gray-300' : ''}`}>{r.value}</span>
                </div>
              ))}
              {/* Hidden canvas used to extract data URL for print */}
              {qrText && (
                <div className="hidden">
                  <QRCodeCanvas id="booking-qr-canvas" value={qrText} size={200} />
                </div>
              )}
              {/* Visible QR */}
              {qrText && (
                <div className="pt-3 border-t border-gray-800 flex flex-col items-center gap-1.5">
                  <div className="bg-white p-2 rounded-xl">
                    <QRCodeCanvas value={qrText} size={120} />
                  </div>
                  <p className="text-gray-600 text-[10px]">Scan to verify booking details</p>
                </div>
              )}
            </div>
          </div>

          {/* Pre-order food prompt — only if no order yet */}
          {!preOrder && booking.table?.id && (
            <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-4 mb-4" style={{ border: `1px solid ${brandColor}40` }}>
              <div className="text-white font-bold text-sm mb-1">🍛 Pre-order your food?</div>
              <p className="text-gray-400 text-xs mb-3 leading-relaxed">
                Skip the wait — order now and your meal will be ready when you arrive. Card payment required.
              </p>
              <Link
                href={`/menu?tableId=${booking.table.id}&bookingId=${booking.id}`}
                className="flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl text-sm transition-all hover:opacity-90"
                style={{ backgroundColor: brandColor }}>
                Yes, order food now →
              </Link>
            </div>
          )}

          {/* Print / Download button */}
          <button onClick={printTicket}
            className="w-full max-w-sm flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold py-3.5 rounded-2xl text-sm mb-4 transition-colors">
            <Printer size={16} style={{ color: brandColor }} />
            Print / Save as PDF
          </button>

          <div className="w-full max-w-sm rounded-xl p-3 mb-6 flex gap-2 text-left" style={{ backgroundColor: `${brandColor}18`, border: `1px solid ${brandColor}30` }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: brandColor }} />
            <p className="text-xs leading-relaxed" style={{ color: brandColor }}>Arrive within 15 minutes of your slot. Table may be released after that.</p>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-3">
            <Link href="/account?tab=bookings"
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold py-3 rounded-2xl text-sm transition-colors">
              View &amp; manage my bookings
            </Link>
            <button onClick={() => { setStep('pick'); setSelected(null); setBooking(null); setQrDataUrl(''); setQrText(''); setPreOrder(null) }}
              className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: brandColor }}>
              Make another booking
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col">
        <ForceDark />
        <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-800">
          <button onClick={() => setStep('pick')} className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
            <ArrowLeft size={16} className="text-white" />
          </button>
          <span className="font-semibold text-white">Confirm Reservation</span>
        </div>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
          {/* Selected slot summary */}
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: `${brandColor}18`, border: `1px solid ${brandColor}40` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brandColor }}>
              <CalendarDays size={20} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                {date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="font-semibold" style={{ color: brandColor }}>{selected && slotLabel(selected)}</div>
            </div>
          </div>

          {/* Party size */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users size={12} /> Party Size
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setPartySize(Math.max(1, partySize - 1))}
                className="w-11 h-11 rounded-full border border-gray-700 flex items-center justify-center text-gray-300 transition-colors text-lg font-bold hover:text-white"
                style={{ '--hover-bc': brandColor } as any}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; (e.currentTarget as HTMLElement).style.color = '' }}>
                −
              </button>
              <div className="text-center">
                <div className="text-4xl font-black text-white">{partySize}</div>
                <div className="text-gray-400 text-xs mt-0.5">{partySize === 1 ? 'guest' : 'guests'}</div>
              </div>
              <button onClick={() => setPartySize(Math.min(12, partySize + 1))}
                className="w-11 h-11 rounded-full border border-gray-700 flex items-center justify-center text-gray-300 transition-colors text-lg font-bold"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = brandColor; (e.currentTarget as HTMLElement).style.color = brandColor }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; (e.currentTarget as HTMLElement).style.color = '' }}>
                +
              </button>
            </div>
          </div>

          {/* Table selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MapPin size={12} /> Select a Table <span className="font-normal normal-case text-gray-600">(optional)</span>
            </div>
            {tablesLoading ? (
              <div className="text-xs text-gray-600 py-2">Loading available tables…</div>
            ) : availableTables.length === 0 ? (
              <p className="text-xs text-gray-600">No tables available — one will be assigned at check-in.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availableTables.map((t: any) => {
                  const active = selectedTableId === t.id
                  return (
                    <button key={t.id} onClick={() => setSelectedTableId(active ? null : t.id)}
                      className="flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all"
                      style={active
                        ? { backgroundColor: `${brandColor}20`, borderColor: brandColor }
                        : { backgroundColor: '#1f1f1f', borderColor: '#374151' }}>
                      <span className="text-sm font-bold" style={{ color: active ? brandColor : '#fff' }}>
                        #{t.tableNumber} {t.name}
                      </span>
                      <span className="text-[11px] mt-0.5" style={{ color: active ? brandColor : '#6b7280' }}>
                        {t.capacity}p · {t.zone ?? 'Indoor'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Special requests */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Special Requests <span className="font-normal text-gray-600 normal-case">(optional)</span>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Birthday celebration, high chair, dietary needs..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none transition-colors"
            onFocus={e => { e.currentTarget.style.borderColor = brandColor }}
            onBlur={e => { e.currentTarget.style.borderColor = '' }}
              rows={3} />
          </div>

          {/* 15-min notice */}
          <div className="flex gap-2 p-3 rounded-xl" style={{ backgroundColor: `${brandColor}15`, border: `1px solid ${brandColor}30` }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: brandColor }} />
            <p className="text-xs leading-relaxed" style={{ color: brandColor }}>
              <strong>Please arrive within 15 minutes</strong> of your slot. After that, your table may be given to other guests.
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          <button onClick={confirmBooking} disabled={submitting}
            className="w-full text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 transition-all hover:opacity-90"
            style={{ backgroundColor: brandColor, boxShadow: `0 8px 24px ${brandColor}30` }}>
            {submitting ? 'Reserving your table...' : `Confirm for ${partySize} ${partySize === 1 ? 'guest' : 'guests'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── PICK ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col">
      <ForceDark />
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=75"
            alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/60 to-gray-950" />
        </div>
        <div className="relative px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
              <ArrowLeft size={16} className="text-white" />
            </Link>
            {showLangToggle && (
              <button onClick={() => {
                const next: Lang = ar ? 'en' : 'ar'
                setLang(next)
                const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null
                syncLangToServer(next, tk)
              }}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: ar ? 'var(--brand)' : '#aaa', border: '1px solid rgba(255,255,255,0.12)' }}>
                {ar ? 'EN' : 'ع'}
              </button>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{ar ? 'احجز طاولة' : 'Reserve a Table'}</h1>
          <p className="text-gray-400 text-sm flex items-center gap-1.5">
            <MapPin size={12} /> {ar ? 'فندق المنزل · دبي، الإمارات' : 'Al Manzil Hotel · Dubai, UAE'}
          </p>
        </div>
      </div>

      {/* Week strip */}
      <div className="px-4 -mt-1 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {weekDays.map((d, i) => {
            const isSelected = formatDate(d) === formatDate(date)
            const isToday = formatDate(d) === formatDate(today)
            return (
              <button key={i} onClick={() => setDate(d)}
                className="flex-shrink-0 w-14 py-2.5 rounded-xl flex flex-col items-center gap-0.5 transition-all border"
                style={isSelected
                  ? { backgroundColor: brandColor, borderColor: brandColor, boxShadow: `0 4px 12px ${brandColor}40` }
                  : { backgroundColor: '#111', borderColor: '#1f2937' }}>
                <span className={`text-[10px] font-medium ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                  {isToday ? 'Today' : dayLabel(d)}
                </span>
                <span className={`text-base font-bold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots */}
      <div className="flex-1 px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <Clock size={14} style={{ color: brandColor }} />
            {date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'short' })}
          </h2>
          {!loading && availableCount > 0 && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full font-medium">
              {availableCount} slots available
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !bookingsEnabled ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🚶</div>
            <p className="text-white font-semibold mb-1">Walk-in only right now</p>
            <p className="text-gray-400 text-sm">Online bookings are paused. Come in and we'll seat you directly.</p>
          </div>
        ) : futureSlots.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">😴</div>
            <div className="text-gray-400 text-sm">No slots for this date</div>
          </div>
        ) : (
          <>
            {/* Peak hours banner — shown if any visible slot is peak */}
            {futureSlots.some(s => (s as any).isPeak) && (
              <div className="mb-3 flex gap-2.5 items-start bg-purple-500/10 border border-purple-500/25 rounded-xl px-3.5 py-3">
                <span className="text-purple-400 text-base leading-none mt-0.5">🔥</span>
                <div>
                  <p className="text-purple-300 text-xs font-semibold leading-snug">Peak hours — walk-in only</p>
                  <p className="text-purple-400/70 text-[11px] mt-0.5 leading-snug">
                    Online booking is paused during 7–10 PM. Come in and we'll seat you directly.
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {futureSlots.map(slot => {
                const isPeak = (slot as any).isPeak
                return (
                  <button key={slot.time}
                    onClick={() => !slot.isFull && !isPeak && selectSlot(slot.time)}
                    disabled={slot.isFull || isPeak}
                    className={`rounded-xl p-3 text-left transition-all border ${
                      isPeak
                        ? 'bg-purple-500/8 border-purple-500/20 opacity-60 cursor-not-allowed'
                        : slot.isFull
                        ? 'bg-gray-900/50 border-gray-800 opacity-40 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                    style={
                      !isPeak && !slot.isFull
                        ? selected === slot.time
                          ? { borderColor: brandColor, backgroundColor: `${brandColor}25` }
                          : { borderColor: `${brandColor}40`, backgroundColor: `${brandColor}10` }
                        : undefined
                    }>
                    <div className={`text-sm font-bold ${
                      isPeak ? 'text-purple-400' : slot.isFull ? 'text-gray-600' : ''
                    }`} style={!isPeak && !slot.isFull ? { color: selected === slot.time ? brandColor : `${brandColor}cc` } : undefined}>
                      {slotLabel(slot.time)}
                    </div>
                    <div className={`text-[10px] mt-0.5 font-medium ${
                      isPeak ? 'text-purple-500' : slot.isFull ? 'text-gray-700' : slot.available <= 2 ? 'text-green-400' : 'text-green-500'
                    }`}>
                      {isPeak ? 'Walk-in only' : slot.isFull ? 'Full' : slot.available <= 2 ? `${slot.available} left!` : `${slot.available} free`}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Info cards below slots */}
        <div className="mt-6 grid grid-cols-2 gap-3 pb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <UtensilsCrossed size={18} className="mb-2" style={{ color: brandColor }} />
            <div className="text-white font-semibold text-sm">Kerala Cuisine</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Authentic South Indian dishes made fresh daily</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Clock size={18} className="mb-2" style={{ color: brandColor }} />
            <div className="text-white font-semibold text-sm">Table Held</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">We hold your table for 15 minutes after slot time</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Users size={18} className="mb-2" style={{ color: brandColor }} />
            <div className="text-white font-semibold text-sm">Up to 12 Guests</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Groups welcome — mention it in special requests</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <CalendarDays size={18} className="mb-2" style={{ color: brandColor }} />
            <div className="text-white font-semibold text-sm">Free to Cancel</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Cancel anytime from your account before the slot</div>
          </div>
        </div>
      </div>
    </div>
  )
}
