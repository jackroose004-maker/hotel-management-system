'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, MapPin, Calendar, Clock, Users, UtensilsCrossed } from 'lucide-react'
import ForceDark from '@/components/ForceDark'
import { useBrandStore } from '@/store/brand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

type BookingDetails = {
  ref: string
  status: string
  slotDate: string
  slotTime: string
  partySize: number
  guestName: string | null
  table: { number: string; zone: string | null } | null
  preOrderItems: { name: string; nameAr: string | null; quantity: number }[]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

export default function ArriveByQrPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const { restaurantName, brandColor } = useBrandStore()

  const [booking, setBooking] = useState<BookingDetails | null>(null)
  const [loadError, setLoadError] = useState('')
  const [checkinState, setCheckinState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [checkinMsg, setCheckinMsg] = useState('')
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    if (!bookingId) return

    // Detect staff from stored auth
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const u = JSON.parse(userStr)
        if (u?.role === 'STAFF' || u?.role === 'OWNER') setIsStaff(true)
      } catch {}
    }

    fetch(`${API}/bookings/${bookingId}/public`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json())?.message ?? 'Booking not found')
        return r.json()
      })
      .then(setBooking)
      .catch(e => setLoadError(e.message))
  }, [bookingId])

  // Staff: auto-trigger check-in once booking details load
  useEffect(() => {
    if (!isStaff || !booking || checkinState !== 'idle') return
    if (booking.status === 'CANCELLED') return
    runStaffCheckIn()
  }, [isStaff, booking])

  async function runStaffCheckIn() {
    setCheckinState('loading')
    const token = localStorage.getItem('token')
    try {
      const r = await fetch(`${API}/bookings/${bookingId}/staff-checkin`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.message ?? 'Check-in failed')
      setCheckinState('done')
      setCheckinMsg('Guest checked in successfully')
    } catch (e: any) {
      setCheckinState('error')
      setCheckinMsg(e.message)
    }
  }

  const accent = brandColor ?? '#f59e0b'

  // --- Loading booking details ---
  if (!booking && !loadError) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 text-center">
        <ForceDark />
        <Loader2 size={40} className="animate-spin mb-4" style={{ color: accent }} />
        <p className="text-white/60 text-sm">Loading booking…</p>
      </div>
    )
  }

  // --- Error loading booking ---
  if (loadError) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 text-center">
        <ForceDark />
        <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
          <XCircle size={44} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Booking Not Found</h1>
        <p className="text-white/50 text-sm max-w-xs">{loadError}</p>
      </div>
    )
  }

  // --- Staff check-in overlay (after booking loads for staff) ---
  if (isStaff) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 text-center">
        <ForceDark />
        {checkinState === 'loading' && (
          <>
            <Loader2 size={40} className="animate-spin mb-4" style={{ color: accent }} />
            <p className="text-white font-semibold text-lg">Checking in guest…</p>
            <p className="text-white/40 text-sm mt-1">Seating table · firing kitchen</p>
          </>
        )}
        {checkinState === 'done' && (
          <>
            <div className="w-24 h-24 rounded-full bg-green-500/15 flex items-center justify-center mb-5">
              <CheckCircle2 size={52} className="text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">{booking!.guestName ?? 'Guest'}</h1>
            <p className="text-green-400 font-medium mb-4">{checkinMsg}</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-left space-y-2 w-full max-w-xs">
              {booking!.table && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin size={14} />
                  <span>Table {booking!.table.number}{booking!.table.zone ? ` · ${booking!.table.zone}` : ''}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <Users size={14} />
                <span>{booking!.partySize} {booking!.partySize === 1 ? 'guest' : 'guests'}</span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <Clock size={14} />
                <span>{formatTime(booking!.slotTime)}</span>
              </div>
              {booking!.preOrderItems.length > 0 && (
                <div className="flex items-start gap-2 text-white/70 text-sm pt-1">
                  <UtensilsCrossed size={14} className="mt-0.5 shrink-0" />
                  <span>{booking!.preOrderItems.map(i => `${i.quantity}× ${i.name}`).join(', ')} — fired to kitchen</span>
                </div>
              )}
            </div>
          </>
        )}
        {checkinState === 'error' && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
              <XCircle size={44} className="text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Check-in Failed</h1>
            <p className="text-white/50 text-sm max-w-xs mb-5">{checkinMsg}</p>
            <button onClick={runStaffCheckIn}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white"
              style={{ background: accent }}>
              Try Again
            </button>
          </>
        )}
      </div>
    )
  }

  // --- Customer view: booking ticket (read-only) ---
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4 py-10">
      <ForceDark />
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-1">{restaurantName ?? 'Al Manzil'}</p>
          <h1 className="text-white text-2xl font-bold">Your Reservation</h1>
          <p className="text-white/30 text-xs mt-1 font-mono">{booking!.ref}</p>
        </div>

        {/* Ticket card */}
        <div className="rounded-3xl overflow-hidden border border-white/10" style={{ background: '#111' }}>
          {/* Colored top stripe */}
          <div className="h-1.5 w-full" style={{ background: accent }} />

          <div className="p-6 space-y-4">
            {booking!.guestName && (
              <p className="text-white font-semibold text-lg">{booking!.guestName}</p>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Calendar size={15} className="text-white/50" />
                </div>
                <div>
                  <p className="text-white/40 text-xs">Date</p>
                  <p className="text-white text-sm font-medium">{formatDate(booking!.slotDate)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Clock size={15} className="text-white/50" />
                </div>
                <div>
                  <p className="text-white/40 text-xs">Time</p>
                  <p className="text-white text-sm font-medium">{formatTime(booking!.slotTime)}</p>
                </div>
              </div>

              {booking!.table && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <MapPin size={15} className="text-white/50" />
                  </div>
                  <div>
                    <p className="text-white/40 text-xs">Table</p>
                    <p className="text-white text-sm font-medium">
                      {booking!.table.number}{booking!.table.zone ? ` · ${booking!.table.zone}` : ''}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Users size={15} className="text-white/50" />
                </div>
                <div>
                  <p className="text-white/40 text-xs">Guests</p>
                  <p className="text-white text-sm font-medium">{booking!.partySize} {booking!.partySize === 1 ? 'person' : 'people'}</p>
                </div>
              </div>
            </div>

            {/* Pre-order items */}
            {booking!.preOrderItems.length > 0 && (
              <>
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UtensilsCrossed size={13} className="text-white/40" />
                    <p className="text-white/40 text-xs uppercase tracking-widest">Pre-ordered</p>
                  </div>
                  <div className="space-y-1.5">
                    {booking!.preOrderItems.map((item, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-white/70 text-sm">{item.name}</span>
                        <span className="text-white/40 text-sm">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Dashed divider */}
          <div className="flex items-center px-4">
            <div className="w-5 h-5 rounded-full bg-[#080808] -ml-7 shrink-0" />
            <div className="flex-1 border-t border-dashed border-white/10 mx-1" />
            <div className="w-5 h-5 rounded-full bg-[#080808] -mr-7 shrink-0" />
          </div>

          <div className="px-6 py-4 text-center">
            <p className="text-white/30 text-xs leading-relaxed">
              Show this screen to staff at the entrance.<br />They will scan to seat you.
            </p>
          </div>
        </div>

        {/* Status badge */}
        {booking!.status === 'ARRIVED' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-green-400 text-sm">
            <CheckCircle2 size={15} />
            <span>Checked in</span>
          </div>
        )}
        {booking!.status === 'CANCELLED' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-red-400 text-sm">
            <XCircle size={15} />
            <span>This booking has been cancelled</span>
          </div>
        )}
      </div>
    </div>
  )
}
