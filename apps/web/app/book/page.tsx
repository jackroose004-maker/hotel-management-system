'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import {
  CalendarDays, Clock, Users,
  AlertTriangle, CheckCircle2, ArrowLeft, MapPin, UtensilsCrossed,
  Download, Printer,
} from 'lucide-react'
import Link from 'next/link'
import { QRCodeCanvas } from 'qrcode.react'
import ForceDark from '@/components/ForceDark'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface Slot { time: string; available: number; total: number; isPast: boolean; isFull: boolean }

function formatDate(d: Date) { return d.toISOString().split('T')[0] }
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
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [partySize, setPartySize] = useState(2)
  const [notes, setNotes] = useState('')
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

  async function fetchSlots() {
    setLoading(true)
    try {
      const r = await fetch(`${API}/bookings/availability?date=${formatDate(date)}`)
      const json = await r.json()
      const payload = json?.data ?? json
      setSlots(payload?.slots ?? [])
    } finally { setLoading(false) }
  }

  function selectSlot(time: string) {
    setSelected(time)
    setStep('confirm')
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
          partySize, slotDate: formatDate(date), slotTime: selected, notes,
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

    const orderSection = preOrder ? `
    <hr class="divider"/>
    <div class="section-title">Pre-Order</div>
    ${preOrder.items.map((i: any) => `
      <div class="row">
        <span class="label">${i.quantity}× ${i.menuItem.name}</span>
        <span class="value">AED ${(Number(i.unitPrice) * i.quantity).toFixed(2)}</span>
      </div>`).join('')}
    <hr class="divider"/>
    <div class="row"><span class="label">Subtotal</span><span class="value">AED ${Number(preOrder.subtotal).toFixed(2)}</span></div>
    <div class="row"><span class="label">VAT (5%)</span><span class="value">AED ${Number(preOrder.vatAmount).toFixed(2)}</span></div>
    <div class="row total"><span class="label">Total Paid</span><span class="value orange">AED ${Number(preOrder.total).toFixed(2)}</span></div>
    <div class="paid-badge">${preOrder.paymentStatus === 'PAID' ? '✓ Paid by Card' : '💵 Pay at Table'}</div>
    ` : ''

    w.document.write(`<!DOCTYPE html><html><head><title>Al Manzil Invoice ${ref}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; background:#fff; display:flex; justify-content:center; padding:40px; }
  .ticket { width:360px; border:2px solid #f97316; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.1); }
  .header { background:#f97316; color:#fff; padding:16px 20px; }
  .header h1 { margin:0 0 2px; font-size:18px; font-weight:800; }
  .header p { margin:0; font-size:12px; opacity:.85; }
  .body { padding:20px; }
  .row { display:flex; justify-content:space-between; margin-bottom:10px; align-items:center; }
  .row.total { margin-top:4px; }
  .row .label { color:#6b7280; font-size:13px; }
  .row .value { font-weight:700; font-size:13px; color:#111; }
  .row .value.orange { color:#f97316; font-size:15px; }
  .row .ref { font-family:monospace; font-size:12px; letter-spacing:2px; color:#374151; }
  .section-title { font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
  .divider { border:none; border-top:1px dashed #e5e7eb; margin:14px 0; }
  .qr { text-align:center; margin-top:14px; }
  .qr img { width:140px; height:140px; border-radius:8px; }
  .qr p { font-size:10px; color:#9ca3af; margin-top:6px; }
  .notice { background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 12px; font-size:11px; color:#92400e; margin-top:14px; line-height:1.5; }
  .paid-badge { background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; font-size:11px; font-weight:700; padding:6px 12px; border-radius:8px; text-align:center; margin-top:10px; }
  @media print { body { padding:0; } .ticket { box-shadow:none; border-radius:0; } }
</style></head><body>
<div class="ticket">
  <div class="header">
    <h1>🍽 Al Manzil Hotel</h1>
    <p>${preOrder ? 'Booking + Pre-Order Invoice' : 'Booking Confirmation'}</p>
  </div>
  <div class="body">
    <div class="section-title">Reservation</div>
    <div class="row"><span class="label">Guest</span><span class="value">${user?.name ?? ''}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${dateStr}</span></div>
    <div class="row"><span class="label">Time</span><span class="value">${timeStr}</span></div>
    <div class="row"><span class="label">Table</span><span class="value">Table ${booking.table?.tableNumber ?? '—'}</span></div>
    <div class="row"><span class="label">Guests</span><span class="value">${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}</span></div>
    <div class="row"><span class="label">Ref</span><span class="value ref">${ref}</span></div>
    ${orderSection}
    ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="QR"/><p>Scan to verify at the restaurant</p></div>` : ''}
    <div class="notice">⚠ Please arrive within 15 minutes of your slot time. Table may be released after that.</div>
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
            <div className="bg-amber-500 px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-white">Al Manzil Hotel</span>
              <span className="text-orange-100 text-sm">Booking confirmed</span>
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
            <div className="w-full max-w-sm bg-gray-900 border border-amber-500/30 rounded-2xl p-4 mb-4">
              <div className="text-white font-bold text-sm mb-1">🍛 Pre-order your food?</div>
              <p className="text-gray-400 text-xs mb-3 leading-relaxed">
                Skip the wait — order now and your meal will be ready when you arrive. Card payment required.
              </p>
              <Link
                href={`/menu?tableId=${booking.table.id}&bookingId=${booking.id}`}
                className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                Yes, order food now →
              </Link>
            </div>
          )}

          {/* Print / Download button */}
          <button onClick={printTicket}
            className="w-full max-w-sm flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold py-3.5 rounded-2xl text-sm mb-4 transition-colors">
            <Printer size={16} className="text-amber-400" />
            Print / Save as PDF
          </button>

          <div className="w-full max-w-sm bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 flex gap-2 text-left">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed">Arrive within 15 minutes of your slot. Table may be released after that.</p>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-3">
            <Link href="/account?tab=bookings"
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold py-3 rounded-2xl text-sm transition-colors">
              View &amp; manage my bookings
            </Link>
            <button onClick={() => { setStep('pick'); setSelected(null); setBooking(null); setQrDataUrl(''); setQrText(''); setPreOrder(null) }}
              className="text-amber-400 text-sm font-medium hover:text-amber-300">
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
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <CalendarDays size={20} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                {date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="text-amber-400 font-semibold">{selected && slotLabel(selected)}</div>
            </div>
          </div>

          {/* Party size */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users size={12} /> Party Size
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setPartySize(Math.max(1, partySize - 1))}
                className="w-11 h-11 rounded-full border border-gray-700 flex items-center justify-center text-gray-300 hover:border-amber-500 hover:text-amber-500 transition-colors text-lg font-bold">
                −
              </button>
              <div className="text-center">
                <div className="text-4xl font-black text-white">{partySize}</div>
                <div className="text-gray-400 text-xs mt-0.5">{partySize === 1 ? 'guest' : 'guests'}</div>
              </div>
              <button onClick={() => setPartySize(Math.min(12, partySize + 1))}
                className="w-11 h-11 rounded-full border border-gray-700 flex items-center justify-center text-gray-300 hover:border-amber-500 hover:text-amber-500 transition-colors text-lg font-bold">
                +
              </button>
            </div>
          </div>

          {/* Special requests */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Special Requests <span className="font-normal text-gray-600 normal-case">(optional)</span>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Window seat, birthday celebration, high chair, dietary needs..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-orange-500 transition-colors"
              rows={3} />
          </div>

          {/* 15-min notice */}
          <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed">
              <strong>Please arrive within 15 minutes</strong> of your slot. After that, your table may be given to other guests.
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{error}</div>
          )}

          <button onClick={confirmBooking} disabled={submitting}
            className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 transition-colors shadow-xl shadow-orange-500/20">
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
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Reserve a Table</h1>
          <p className="text-gray-400 text-sm flex items-center gap-1.5">
            <MapPin size={12} /> Al Manzil Hotel · Dubai, UAE
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
                className={`flex-shrink-0 w-14 py-2.5 rounded-xl flex flex-col items-center gap-0.5 transition-all border ${
                  isSelected
                    ? 'bg-amber-500 border-orange-500 shadow-lg shadow-amber-500/30'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-600'
                }`}>
                <span className={`text-[10px] font-medium ${isSelected ? 'text-orange-100' : 'text-gray-500'}`}>
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
            <Clock size={14} className="text-amber-400" />
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
        ) : futureSlots.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">😴</div>
            <div className="text-gray-400 text-sm">No slots for this date</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {futureSlots.map(slot => (
              <button key={slot.time}
                onClick={() => !slot.isFull && selectSlot(slot.time)}
                disabled={slot.isFull}
                className={`rounded-xl p-3 text-left transition-all border ${
                  slot.isFull
                    ? 'bg-gray-900/50 border-gray-800 opacity-40 cursor-not-allowed'
                    : slot.available <= 2
                    ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/20 cursor-pointer'
                    : 'bg-green-500/10 border-green-500/20 hover:border-green-400 hover:bg-green-500/20 cursor-pointer'
                }`}>
                <div className={`text-sm font-bold ${slot.isFull ? 'text-gray-600' : slot.available <= 2 ? 'text-amber-300' : 'text-green-300'}`}>
                  {slotLabel(slot.time)}
                </div>
                <div className={`text-[10px] mt-0.5 font-medium ${slot.isFull ? 'text-gray-700' : slot.available <= 2 ? 'text-amber-500' : 'text-green-500'}`}>
                  {slot.isFull ? 'Full' : slot.available <= 2 ? `${slot.available} left!` : `${slot.available} free`}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Info cards below slots */}
        <div className="mt-6 grid grid-cols-2 gap-3 pb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <UtensilsCrossed size={18} className="text-amber-400 mb-2" />
            <div className="text-white font-semibold text-sm">Kerala Cuisine</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Authentic South Indian dishes made fresh daily</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Clock size={18} className="text-amber-400 mb-2" />
            <div className="text-white font-semibold text-sm">Table Held</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">We hold your table for 15 minutes after slot time</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Users size={18} className="text-amber-400 mb-2" />
            <div className="text-white font-semibold text-sm">Up to 12 Guests</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Groups welcome — mention it in special requests</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <CalendarDays size={18} className="text-amber-400 mb-2" />
            <div className="text-white font-semibold text-sm">Free to Cancel</div>
            <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">Cancel anytime from your account before the slot</div>
          </div>
        </div>
      </div>
    </div>
  )
}
