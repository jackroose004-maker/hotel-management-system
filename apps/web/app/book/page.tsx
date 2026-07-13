'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useLangStore, applyLangDir, syncLangToServer, t, type Lang } from '@/store/lang'
import { useBrandStore, initBrand } from '@/store/brand'
import {
  CalendarDays, Clock, Users, AlertTriangle, CheckCircle2,
  ArrowLeft, MapPin, UtensilsCrossed, Printer, ChevronLeft,
  ChevronRight, Loader2, Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { QRCodeCanvas } from 'qrcode.react'
import ForceDark from '@/components/ForceDark'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface Slot { time: string; available: number; total: number; isPast: boolean; isFull: boolean; isPeak?: boolean }
interface TableRow { id: string; tableNumber: number; name?: string; capacity: number; zone?: string | null }

function formatDate(d: Date) { return d.toLocaleDateString('en-CA') }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c }
function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function safeArray<T>(v: unknown): T[] { return Array.isArray(v) ? v : [] }
function dayAbbr(d: Date) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] }

// ── Mobile: horizontal 14-day date strip ─────────────────────────────────────
function DateStrip({ value, onChange, brandColor }: { value: Date; onChange: (d: Date) => void; brandColor: string }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const idx = days.findIndex(d => formatDate(d) === formatDate(value))
    if (scrollRef.current && idx >= 0) {
      const btn = scrollRef.current.children[idx] as HTMLElement
      btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [value])

  return (
    <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: 'none' }}>
      {days.map((d, i) => {
        const sel = formatDate(d) === formatDate(value)
        const isToday = i === 0
        return (
          <button key={i} onClick={() => onChange(d)}
            className="flex-shrink-0 flex flex-col items-center gap-0.5 py-2.5 rounded-xl transition-all"
            style={{
              width: 52,
              backgroundColor: sel ? brandColor : 'rgba(255,255,255,0.04)',
              border: sel ? `1px solid ${brandColor}` : '1px solid rgba(255,255,255,0.07)',
              boxShadow: sel ? `0 4px 12px ${brandColor}40` : 'none',
            }}>
            <span className="text-[10px] font-semibold" style={{ color: sel ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}>
              {isToday ? 'Today' : dayAbbr(d)}
            </span>
            <span className="text-base font-black" style={{ color: sel ? '#fff' : 'rgba(255,255,255,0.7)' }}>
              {d.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Desktop: full mini-calendar ───────────────────────────────────────────────
function MiniCalendar({ value, onChange, brandColor }: { value: Date; onChange: (d: Date) => void; brandColor: string }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const maxDate = addDays(today, 30)
  const [cal, setCal] = useState({ y: value.getFullYear(), m: value.getMonth() })

  const daysInMonth = new Date(cal.y, cal.m + 1, 0).getDate()
  const firstDay = (new Date(cal.y, cal.m, 1).getDay() + 6) % 7
  const monthName = new Date(cal.y, cal.m, 1).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={() => setCal(c => { const d = new Date(c.y, c.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <ChevronLeft size={13} />
        </button>
        <span className="text-[13px] font-bold text-white tracking-wide">{monthName}</span>
        <button onClick={() => setCal(c => { const d = new Date(c.y, c.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7 px-3 pt-3 pb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.15)' }}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <span key={'e'+i} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const d = new Date(cal.y, cal.m, day); d.setHours(0,0,0,0)
          const isSelected = formatDate(d) === formatDate(value)
          const isToday = formatDate(d) === formatDate(today)
          const disabled = d < today || d > maxDate
          return (
            <button key={day} onClick={() => { if (!disabled) onChange(d) }} disabled={disabled}
              className="w-8 h-8 mx-auto rounded-full text-[12px] font-semibold flex items-center justify-center transition-all"
              style={disabled
                ? { color: 'rgba(255,255,255,0.08)', cursor: 'not-allowed' }
                : isSelected
                  ? { backgroundColor: brandColor, color: '#fff', boxShadow: `0 2px 12px ${brandColor}60`, fontWeight: 800 }
                  : isToday
                    ? { color: brandColor, fontWeight: 800 }
                    : { color: 'rgba(255,255,255,0.6)' }}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Premium step indicator ─────────────────────────────────────────────────────
function StepBar({ current, brandColor }: { current: number; brandColor: string }) {
  const STEPS = ['Select', 'Confirm', 'Booked']
  return (
    <div className="flex items-center justify-center py-3 px-6">
      <div className="flex items-center gap-0 w-full max-w-xs">
        {STEPS.map((label, i) => {
          const done = i < current
          const active = i === current
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    backgroundColor: done ? '#22c55e' : active ? brandColor : 'transparent',
                    border: done ? '2px solid #22c55e' : active ? `2px solid ${brandColor}` : '2px solid rgba(255,255,255,0.12)',
                    color: done || active ? '#fff' : 'rgba(255,255,255,0.2)',
                    fontSize: 11,
                    fontWeight: 800,
                    boxShadow: active ? `0 0 0 3px ${brandColor}22` : 'none',
                  }}>
                  {done ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
                </div>
                <span
                  className="text-[10px] font-semibold tracking-wide transition-colors duration-300 whitespace-nowrap"
                  style={{ color: active ? 'rgba(255,255,255,0.9)' : done ? '#22c55e' : 'rgba(255,255,255,0.2)' }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-2 mb-4 h-px relative" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{ width: done ? '100%' : '0%', backgroundColor: '#22c55e' }}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default function BookPage() {
  const router = useRouter()
  const { user, token } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const ar = lang === 'ar'
  const showLangToggle = useBrandStore(s => s.showLanguageToggle)
  const brandColor = useBrandStore(s => s.brandColor) || '#f59e0b'
  const logoUrl = useBrandStore(s => s.logoUrl)
  const brandName = useBrandStore(s => s.restaurantName)
  useEffect(() => { applyLangDir(lang); initBrand() }, [lang])

  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().token) router.replace('/login?redirect=/book')
    }, 120)
    return () => clearTimeout(t)
  }, [router])

  const today = new Date(); today.setHours(0,0,0,0)

  const [date, setDate] = useState(new Date())
  const [partySize, setPartySize] = useState(2)
  const [debouncedPartySize, setDebouncedPartySize] = useState(2)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPartySize(partySize), 400)
    return () => clearTimeout(t)
  }, [partySize])
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [tables, setTables] = useState<TableRow[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [zoneFilter, setZoneFilter] = useState('All')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick')
  const [booking, setBooking] = useState<any>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [qrText, setQrText] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [preOrder, setPreOrder] = useState<any>(null)

  useEffect(() => {
    setSelectedTime(null)
    setSlotsLoading(true)
    fetch(`${API}/bookings/availability?date=${formatDate(date)}`)
      .then(r => r.json())
      .then(json => {
        const payload = json?.data ?? json
        setSlots(safeArray(payload?.slots))
        setBookingsEnabled(payload?.bookingsEnabled !== false)
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [date])

  useEffect(() => {
    if (!token) return
    setSelectedTableId(null)
    setZoneFilter('All')
    setTablesLoading(true)
    fetch(`${API}/bookings/customer-tables?date=${formatDate(date)}&partySize=${debouncedPartySize}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => setTables(safeArray(json?.data ?? json)))
      .catch(() => setTables([]))
      .finally(() => setTablesLoading(false))
  }, [date, debouncedPartySize, token])

  useEffect(() => {
    if (!qrText) return
    setTimeout(() => {
      const canvas = document.getElementById('booking-qr-canvas') as HTMLCanvasElement | null
      if (canvas) setQrDataUrl(canvas.toDataURL('image/png'))
    }, 100)
  }, [qrText])

  async function submitBooking() {
    if (!token || !selectedTime) return
    setSubmitting(true); setError('')
    try {
      const selTable = tables.find(t => t.id === selectedTableId)
      const r = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          partySize, slotDate: formatDate(date), slotTime: selectedTime,
          notes: notes.trim() || undefined,
          seatingPreference: selTable?.zone ?? 'Indoor',
          ...(selectedTableId ? { tableId: selectedTableId } : {}),
          idempotencyKey: `${user?.id}-${formatDate(date)}-${selectedTime}-${Date.now()}`,
        }),
      })
      const json = await r.json()
      const payload = json?.data ?? json
      if (!r.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Booking failed')
      setBooking(payload)
      setStep('done')
      setQrText(['AL MANZIL HOTEL', `Ref: ${payload.id.slice(-8).toUpperCase()}`,
        `Date: ${new Date(payload.slotDate).toLocaleDateString('en-AE', { weekday:'long', day:'numeric', month:'long' })}`,
        `Time: ${slotLabel(payload.slotTime)}`, `Table: ${payload.table?.tableNumber ?? '—'}`,
        `Guests: ${payload.partySize}`, `Name: ${user?.name ?? ''}`].join('\n'))
    } catch (e: any) {
      setError(e.message)
    } finally { setSubmitting(false) }
  }

  // Called on every exit from Booked step EXCEPT "Add Pre-Order".
  // Sends booking-only confirmation email (pre-order path sends its own combined email).
  function sendBookingEmail() {
    if (!booking || !token) return
    fetch(`${API}/bookings/${booking.id}/send-confirmation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }

  function printTicket() {
    if (!booking) return
    const w = window.open('', '_blank'); if (!w) return
    const ref = booking.id.slice(-8).toUpperCase()
    const dateStr = new Date(booking.slotDate).toLocaleDateString('en-AE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Booking ${ref}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f2f2f2;display:flex;justify-content:center;padding:40px 16px}.card{width:380px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.12)}.stripe{height:6px;background:${brandColor}}.head{background:#111;padding:24px}.hl{font-size:20px;font-weight:900;color:#fff}.hs{font-size:10px;color:rgba(255,255,255,.4);letter-spacing:1px;text-transform:uppercase;margin-top:2px}.body{padding:20px 24px}.ref{display:flex;justify-content:space-between;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:10px 14px;margin-bottom:16px}.rl{font-size:10px;font-weight:700;color:#aaa;letter-spacing:2px;text-transform:uppercase}.rv{font-family:monospace;font-size:13px;font-weight:900;color:#111;letter-spacing:3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}.dl{font-size:10px;font-weight:700;color:#bbb;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px}.dv{font-size:15px;font-weight:700;color:#111}.qrbox{border:1px solid #eee;border-radius:14px;padding:18px;text-align:center;margin-bottom:14px}.qrbox img{width:140px;height:140px;border-radius:8px;display:block;margin:0 auto 10px}.ql{font-size:11px;color:#999}.notice{background:#fff8ee;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;font-size:11.5px;color:#92400e;line-height:1.6}.foot{background:#f9f9f9;border-top:1px solid #f0f0f0;padding:12px 24px;display:flex;justify-content:space-between;font-size:10px;color:#bbb}@media print{body{padding:0;background:#fff}.card{box-shadow:none;border-radius:0;width:100%}}</style>
    </head><body><div class="card"><div class="stripe"></div><div class="head"><div class="hl">Al Manzil Hotel</div><div class="hs">Reservation Confirmed</div></div>
    <div class="body"><div class="ref"><span class="rl">Booking Ref</span><span class="rv">${ref}</span></div>
    <div class="grid"><div><div class="dl">Date</div><div class="dv">${dateStr}</div></div><div><div class="dl">Time</div><div class="dv" style="color:${brandColor}">${slotLabel(booking.slotTime)}</div></div>
    <div><div class="dl">Table</div><div class="dv">${booking.table ? `Table ${booking.table.tableNumber}` : 'TBD'}</div></div><div><div class="dl">Guests</div><div class="dv">${booking.partySize}</div></div></div>
    ${qrDataUrl ? `<div class="qrbox"><img src="${qrDataUrl}" alt="QR"/><div class="ql">Scan at entrance to confirm arrival</div></div>` : ''}
    <div class="notice">⏱ Please arrive within <strong>15 minutes</strong> of your slot time.</div></div>
    <div class="foot"><span>© Al Manzil Hotel · Dubai, UAE</span><span>${ref}</span></div></div>
    <script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  const futureSlots = slots.filter(s => !s.isPast)
  const availableCount = futureSlots.filter(s => !s.isFull && !s.isPeak).length
  const hasPeak = futureSlots.some(s => s.isPeak)
  const zones = ['All', ...Array.from(new Set(tables.map(t => t.zone ?? 'Indoor').filter(Boolean)))]
  const visibleTables = zoneFilter === 'All' ? tables : tables.filter(t => (t.zone ?? 'Indoor') === zoneFilter)
  const grouped = {
    Morning:   futureSlots.filter(s => parseInt(s.time) < 12),
    Afternoon: futureSlots.filter(s => { const h = parseInt(s.time); return h >= 12 && h < 17 }),
    Evening:   futureSlots.filter(s => parseInt(s.time) >= 17),
  }
  const selTable = tables.find(t => t.id === selectedTableId)

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (step === 'done' && booking) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col">
        <ForceDark />
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-white/[0.05]">
          <Link href="/" className="w-9 h-9 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0">
            {logoUrl ? <img src={logoUrl} alt={brandName} className="w-6 h-6 object-contain rounded" /> : <ArrowLeft size={16} className="text-white" />}
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-black text-white leading-tight">{brandName}</p>
            <p className="text-[10px] text-white/25 leading-tight">{t(lang, 'book.location')}</p>
          </div>
        </div>
        <div className="border-b border-white/[0.04]">
          <StepBar current={2} brandColor={brandColor} />
        </div>
        <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-sm mx-auto w-full">
          {/* Success icon */}
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <CheckCircle2 size={30} className="text-green-400" />
            </div>
            <div className="absolute -inset-2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)' }} />
          </div>
          <h1 className="text-2xl font-black text-white mb-1 tracking-tight">{t(lang, 'book.doneTitle')}</h1>
          <p className="text-sm text-white/35 mb-6 text-center leading-relaxed">{t(lang, 'book.doneSub')}</p>

          {/* Ticket */}
          <div className="w-full rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}>
              <div>
                <p className="font-black text-white text-sm tracking-wide">{t(lang, 'book.hotelName')}</p>
                <p className="text-white/60 text-[10px] mt-0.5 uppercase tracking-widest">Reservation Confirmed</p>
              </div>
              <span className="text-white/80 text-xs font-mono tracking-widest bg-black/20 px-2 py-1 rounded-lg">{booking.id.slice(-8).toUpperCase()}</span>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: t(lang, 'book.dateLabel'), value: new Date(booking.slotDate).toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { weekday:'long', day:'numeric', month:'long' }) },
                { label: t(lang, 'book.timeLabel'), value: slotLabel(booking.slotTime) },
                { label: t(lang, 'book.tableLabel'), value: booking.table ? `Table ${booking.table.tableNumber}${booking.table.name ? ` · ${booking.table.name}` : ''}` : 'TBD' },
                { label: t(lang, 'book.guestsLabel'), value: `${booking.partySize} ${t(lang, booking.partySize === 1 ? 'book.guest' : 'book.guests')}` },
              ].map((r, idx, arr) => (
                <div key={r.label} className="flex justify-between items-center"
                  style={{ paddingBottom: idx < arr.length - 1 ? 12 : 0, borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span className="text-white/30 text-xs font-medium">{r.label}</span>
                  <span className="font-bold text-sm" style={{ color: r.label === t(lang, 'book.timeLabel') ? brandColor : 'white' }}>{r.value}</span>
                </div>
              ))}
              {qrText && (
                <>
                  <div className="hidden"><QRCodeCanvas id="booking-qr-canvas" value={qrText} size={200} /></div>
                  <div className="pt-4 mt-1 border-t border-white/[0.05] flex flex-col items-center gap-2">
                    <div className="bg-white p-2.5 rounded-2xl"><QRCodeCanvas value={qrText} size={110} /></div>
                    <p className="text-white/20 text-[10px] tracking-wide uppercase">{t(lang, 'book.showAtEntrance')}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {!preOrder && (
            <div className="w-full rounded-2xl p-4 mb-3 relative overflow-hidden" style={{ backgroundColor: `${brandColor}0d`, border: `1px solid ${brandColor}25` }}>
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10" style={{ background: `radial-gradient(circle, ${brandColor}, transparent)`, transform: 'translate(30%, -30%)' }} />
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${brandColor}20` }}>
                  <UtensilsCrossed size={14} style={{ color: brandColor }} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{t(lang, 'book.preorderTitle')}</p>
                  <p className="text-white/35 text-xs mt-0.5 leading-relaxed">{t(lang, 'book.preorderSub')}</p>
                </div>
              </div>
              <Link href={`/menu?bookingId=${booking.id}${booking.table?.id ? `&tableId=${booking.table.id}` : ''}`}
                className="flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: brandColor }}>
                <Sparkles size={14} /> {t(lang, 'book.preorderBtn')}
              </Link>
            </div>
          )}

          <button onClick={() => { sendBookingEmail(); printTicket() }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-3 hover:bg-white/10 transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Printer size={14} style={{ color: brandColor }} /> {t(lang, 'book.printBtn')}
          </button>

          <div className="w-full flex gap-2.5 p-3.5 rounded-xl mb-6" style={{ backgroundColor: `${brandColor}0a`, border: `1px solid ${brandColor}20` }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: brandColor }} />
            <p className="text-xs leading-relaxed" style={{ color: `${brandColor}cc` }}>{t(lang, 'book.arriveWarning')}</p>
          </div>

          <Link href="/account?tab=bookings" onClick={sendBookingEmail}
            className="w-full flex items-center justify-center py-3 rounded-xl text-sm font-semibold mb-3 hover:bg-white/10 transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {t(lang, 'book.manageBookings')}
          </Link>
          <button onClick={() => { sendBookingEmail(); setStep('pick'); setSelectedTime(null); setBooking(null); setQrDataUrl(''); setQrText(''); setPreOrder(null) }}
            className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: brandColor }}>
            {t(lang, 'book.anotherBooking')}
          </button>
        </div>
      </div>
    )
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col">
        <ForceDark />
        <div className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur border-b border-white/[0.05]">
          <div className="flex items-center gap-3 px-4 h-14">
            <button onClick={() => setStep('pick')} className="w-9 h-9 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors">
              <ArrowLeft size={16} className="text-white" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{t(lang, 'book.confirmTitle')}</p>
              <p className="text-[11px] text-white/30 truncate">
                {date.toLocaleDateString('en-AE', { weekday:'short', day:'numeric', month:'short' })} · {selectedTime && slotLabel(selectedTime)} · {partySize} guests
              </p>
            </div>
          </div>
          <StepBar current={1} brandColor={brandColor} />
        </div>

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-3 pb-28">
          {/* Guest info */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div className="px-4 py-3.5 flex items-center gap-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}99)` }}>
                {(user?.name ?? 'G').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{user?.name ?? 'Guest'}</p>
                <p className="text-[11px] text-white/30 truncate">{user?.email}</p>
              </div>
            </div>
            {[
              { label: t(lang, 'book.dateLabel'), value: date.toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { weekday:'long', day:'numeric', month:'long' }) },
              { label: t(lang, 'book.timeLabel'), value: selectedTime ? slotLabel(selectedTime) : '—' },
              { label: t(lang, 'book.guestsLabel'), value: `${partySize} ${t(lang, partySize === 1 ? 'book.guest' : 'book.guests')}` },
              { label: t(lang, 'book.tableLabel'), value: selTable ? `${selTable.name ?? `Table ${selTable.tableNumber}`} · ${selTable.capacity} ${t(lang, 'book.seats')} · ${selTable.zone ?? 'Indoor'}` : t(lang, 'book.tableAssigned') },
            ].map((row, i, arr) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3.5"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span className="text-xs text-white/30 font-medium flex-shrink-0">{row.label}</span>
                <span className="text-sm font-semibold text-right ml-4" style={{ color: row.label === t(lang, 'book.timeLabel') ? brandColor : 'rgba(255,255,255,0.9)' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="rounded-2xl p-4" style={{ border: '1px solid rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2.5">
              {t(lang, 'book.specialRequests')} <span className="font-normal normal-case opacity-70">{t(lang, 'book.specialRequestsOptional')}</span>
            </p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={t(lang, 'book.specialRequestsPlaceholder')}
              className="w-full bg-transparent text-sm text-white/80 placeholder-white/15 resize-none focus:outline-none leading-relaxed"
              rows={3} />
          </div>

          <div className="flex gap-2.5 p-3.5 rounded-xl" style={{ backgroundColor: `${brandColor}0a`, border: `1px solid ${brandColor}20` }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: brandColor }} />
            <p className="text-xs leading-relaxed" style={{ color: `${brandColor}cc` }}>{t(lang, 'book.arriveNotice')}</p>
          </div>

          {error && (
            <div className="rounded-xl p-3.5 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>{error}</div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#080808] via-[#080808]/95 to-transparent">
          <button onClick={submitBooking} disabled={submitting}
            className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 text-white font-black py-4 rounded-2xl text-[15px] disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)`, boxShadow: `0 8px 28px ${brandColor}40`, display: 'flex' }}>
            {submitting ? <><Loader2 size={16} className="animate-spin" /> {t(lang, 'book.reserving')}</> : `${t(lang, 'book.confirmBtn')} ${partySize} ${t(lang, partySize === 1 ? 'book.guest' : 'book.guests')}`}
          </button>
        </div>
      </div>
    )
  }

  // ── PICK ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col">
      <ForceDark />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur border-b border-white/[0.05]">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/" className="w-9 h-9 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors">
            <ArrowLeft size={16} className="text-white" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}99)` }}>
                  <UtensilsCrossed size={13} className="text-white" />
                </div>
            }
            <div className="min-w-0">
              <p className="text-[13px] font-black text-white truncate leading-tight">{brandName || t(lang, 'book.hotelName')}</p>
              <p className="text-[10px] text-white/25 flex items-center gap-1 leading-tight"><MapPin size={8} /> {t(lang, 'book.location')}</p>
            </div>
          </div>
          {showLangToggle && (
            <button onClick={() => {
              const next: Lang = ar ? 'en' : 'ar'
              setLang(next)
              const tk = typeof window !== 'undefined' ? localStorage.getItem('token') : null
              syncLangToServer(next, tk)
            }}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 hover:bg-white/10 transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {ar ? 'EN' : 'ع'}
            </button>
          )}
        </div>
        <div className="border-t border-white/[0.04]">
          <StepBar current={0} brandColor={brandColor} />
        </div>
      </div>

      {/* Mobile date strip */}
      <div className="sm:hidden pt-3 pb-3 border-b border-white/[0.04]">
        <DateStrip value={date} onChange={d => { setDate(d); setSelectedTime(null) }} brandColor={brandColor} />
      </div>

      {/* ── Desktop 2-col / Mobile single-col layout ── */}
      <div className="flex-1 pb-36 sm:pb-8">
        <div className="sm:flex sm:gap-0 sm:max-w-5xl sm:mx-auto sm:h-full">

          {/* ── LEFT COLUMN ── */}
          <div className="sm:w-80 sm:flex-shrink-0 sm:border-r sm:border-white/[0.05] sm:overflow-y-auto sm:p-5 sm:space-y-6">

            {/* Calendar */}
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3 flex items-center gap-2">
                <CalendarDays size={10} style={{ color: brandColor }} /> Date
              </p>
              <MiniCalendar value={date} onChange={d => { setDate(d); setSelectedTime(null) }} brandColor={brandColor} />
              <p className="text-center text-xs font-semibold mt-2" style={{ color: brandColor }}>
                {date.toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { weekday:'long', day:'numeric', month:'long' })}
              </p>
            </div>

            {/* Party size */}
            <div className="px-4 py-4 sm:px-0 sm:py-0 border-b border-white/[0.04] sm:border-0">
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Users size={10} style={{ color: brandColor }} /> {t(lang, 'book.partySize')}
              </p>
              <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xl transition-all hover:scale-110 active:scale-95"
                  style={{ border: `1.5px solid ${brandColor}40`, color: brandColor, backgroundColor: `${brandColor}10` }}>
                  −
                </button>
                <div className="text-center">
                  <span className="text-3xl font-black text-white" dir="ltr">{partySize}</span>
                  <p className="text-[10px] text-white/20 mt-0.5">{t(lang, partySize === 1 ? 'book.guest' : 'book.guests')}</p>
                </div>
                <button onClick={() => setPartySize(Math.min(12, partySize + 1))}
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xl transition-all hover:scale-110 active:scale-95"
                  style={{ border: `1.5px solid ${brandColor}40`, color: brandColor, backgroundColor: `${brandColor}10` }}>
                  +
                </button>
              </div>
            </div>

            {/* Tables */}
            <div className="px-4 py-4 sm:px-0 sm:py-0 border-b border-white/[0.04] sm:border-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest flex items-center gap-2">
                  <MapPin size={10} style={{ color: brandColor }} /> {t(lang, 'book.table')}
                  <span className="font-normal normal-case text-white/15">{t(lang, 'book.tableOptional')}</span>
                </p>
                {selectedTableId && (
                  <button onClick={() => setSelectedTableId(null)} className="text-[10px] font-semibold hover:opacity-70 transition-opacity" style={{ color: brandColor }}>{t(lang, 'book.clearTable')}</button>
                )}
              </div>

              {tablesLoading ? (
                <div className="flex items-center gap-2 py-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <Loader2 size={11} className="animate-spin" /><span className="text-xs">{t(lang, 'book.loadingTables')}</span>
                </div>
              ) : tables.length === 0 ? (
                <p className="text-xs text-white/20 py-1">{t(lang, 'book.noTables')}</p>
              ) : (
                <>
                  {/* Zone filter — underline tab style */}
                  {zones.length > 1 && (
                    <div className="flex gap-0 mb-3 border-b border-white/[0.06]">
                      {zones.map(z => (
                        <button key={z} onClick={() => setZoneFilter(z)}
                          className="px-3 py-2 text-[11px] font-bold transition-all relative"
                          style={{ color: zoneFilter === z ? brandColor : 'rgba(255,255,255,0.25)' }}>
                          {z}
                          {zoneFilter === z && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: brandColor }} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {visibleTables.map(tbl => {
                      const active = selectedTableId === tbl.id
                      const fits = tbl.capacity >= partySize
                      return (
                        <button key={tbl.id} onClick={() => setSelectedTableId(active ? null : tbl.id)}
                          className="relative flex flex-col gap-2 p-3 rounded-2xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                          style={active
                            ? { backgroundColor: `${brandColor}12`, border: `1.5px solid ${brandColor}`, boxShadow: `0 0 20px ${brandColor}20` }
                            : { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {active && (
                            <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                              style={{ backgroundColor: brandColor, fontSize: 9, fontWeight: 900 }}>✓</span>
                          )}
                          {/* Capacity dots — elegant */}
                          <div className="flex gap-[3px] items-center">
                            {Array.from({ length: Math.min(tbl.capacity, 6) }).map((_, i) => (
                              <span key={i} className="w-1.5 h-1.5 rounded-full transition-colors"
                                style={{ backgroundColor: active ? brandColor : i < partySize ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)' }} />
                            ))}
                            {tbl.capacity > 6 && <span className="text-[9px] ml-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>+{tbl.capacity - 6}</span>}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold leading-tight truncate" style={{ color: active ? brandColor : 'rgba(255,255,255,0.85)' }}>
                              {tbl.name ?? `Table ${tbl.tableNumber}`}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: active ? `${brandColor}80` : 'rgba(255,255,255,0.22)' }}>
                              {tbl.capacity} seats · {tbl.zone ?? 'Indoor'}
                              {!fits && <span className="ml-1 text-amber-400/60"> small</span>}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN: time slots ── */}
          <div className="flex-1 sm:overflow-y-auto sm:p-5">
            <div className="px-4 pt-5 sm:px-0 sm:pt-0">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={10} style={{ color: brandColor }} /> {t(lang, 'book.availableTimes')}
                </p>
                {!slotsLoading && availableCount > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.08)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.15)' }}>
                    {availableCount} open
                  </span>
                )}
              </div>

              {slotsLoading ? (
                <div className="space-y-5 animate-pulse">
                  {[1,2].map(i => (
                    <div key={i}>
                      <div className="h-2.5 w-14 rounded-full bg-white/[0.04] mb-3" />
                      <div className="grid grid-cols-3 gap-2">
                        {[0,1,2].map(j => <div key={j} className="h-16 rounded-2xl bg-white/[0.02]" />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !bookingsEnabled ? (
                <div className="flex flex-col items-center py-14 gap-3 rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-4xl">🚶</span>
                  <p className="text-white font-semibold text-sm">{t(lang, 'book.walkInOnly')}</p>
                  <p className="text-white/25 text-xs text-center max-w-[200px] leading-relaxed">{t(lang, 'book.walkInOnlySub')}</p>
                </div>
              ) : futureSlots.length === 0 ? (
                <div className="flex flex-col items-center py-14 gap-3 rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-4xl">😴</span>
                  <p className="text-white/35 text-sm">{t(lang, 'book.noSlots')}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {hasPeak && (
                    <div className="flex gap-2.5 items-start rounded-xl px-3.5 py-3" style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.14)' }}>
                      <span className="text-sm leading-none mt-0.5">🔥</span>
                      <div>
                        <p className="text-purple-300/90 text-xs font-semibold">{t(lang, 'book.peakHours')}</p>
                        <p className="text-purple-400/50 text-[11px] mt-0.5">{t(lang, 'book.peakHoursSub')}</p>
                      </div>
                    </div>
                  )}
                  {(Object.entries(grouped) as [string, Slot[]][]).filter(([, s]) => s.length > 0).map(([label, slotGroup]) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'rgba(255,255,255,0.15)' }}>{label}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotGroup.map(slot => {
                          const isPeak = slot.isPeak
                          const isActive = selectedTime === slot.time
                          const disabled = slot.isFull || !!isPeak
                          return (
                            <button key={slot.time}
                              onClick={() => { if (!disabled) setSelectedTime(isActive ? null : slot.time) }}
                              disabled={disabled}
                              className="rounded-2xl p-3.5 text-left transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed"
                              style={isPeak
                                ? { backgroundColor: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)', opacity: 0.45 }
                                : slot.isFull
                                ? { backgroundColor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', opacity: 0.3 }
                                : isActive
                                ? { backgroundColor: `${brandColor}18`, border: `1.5px solid ${brandColor}`, boxShadow: `0 0 20px ${brandColor}18` }
                                : { backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                              <div className="text-sm font-black" dir="ltr"
                                style={{ color: isPeak ? '#c084fc' : slot.isFull ? 'rgba(255,255,255,0.15)' : isActive ? brandColor : 'rgba(255,255,255,0.8)' }}>
                                {slotLabel(slot.time)}
                              </div>
                              <div className="text-[10px] mt-1 font-medium"
                                style={{ color: isPeak ? '#a855f7' : slot.isFull ? 'rgba(255,255,255,0.1)' : slot.available <= 2 ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>
                                {isPeak ? t(lang, 'book.walkIn') : slot.isFull ? t(lang, 'book.full') : slot.available <= 2 ? `${slot.available} ${t(lang, 'book.left')}` : `${slot.available} ${t(lang, 'book.free')}`}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Sticky bottom CTA ── */}
      <div className={`fixed bottom-0 left-0 right-0 transition-all duration-300 ${selectedTime ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="p-4 bg-gradient-to-t from-[#080808] via-[#080808]/98 to-transparent pt-8">
          <div className="max-w-lg mx-auto">
            {/* Selection pills */}
            <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${brandColor}15`, color: brandColor, border: `1px solid ${brandColor}30` }}>
                <Clock size={10} /> <span dir="ltr">{selectedTime && slotLabel(selectedTime)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Users size={10} /> <span dir="ltr">{partySize}</span> {t(lang, 'book.guests')}
              </div>
              {selTable && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <MapPin size={10} /> {selTable.name ?? `T${selTable.tableNumber}`}
                </div>
              )}
            </div>
            <button onClick={() => setStep('confirm')}
              className="w-full flex items-center justify-center gap-2 text-white font-black py-4 rounded-2xl text-[15px] transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)`, boxShadow: `0 8px 28px ${brandColor}40` }}>
              {t(lang, 'book.continueToConfirm')} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
