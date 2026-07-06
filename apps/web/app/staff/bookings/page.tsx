'use client'
import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Users, Phone, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface Booking {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED'
  slotDate: string
  slotTime: string
  partySize: number
  notes?: string
  customer: { id: string; name: string; phone?: string }
  table?: { tableNumber: number }
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  CONFIRMED: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  ARRIVED:   'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  NO_SHOW:   'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  CANCELLED: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'arrived',  label: 'Arrived' },
  { key: 'noshows',  label: 'No-shows' },
  { key: 'all',      label: 'All' },
] as const

export default function StaffBookingsPage() {
  const { token } = useAuthStore()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'arrived' | 'noshows'>('upcoming')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/bookings/today`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await r.json()
      const data = json?.data ?? json
      setBookings(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  async function markArrived(id: string) {
    await fetch(`${API}/bookings/${id}/arrived`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    load()
  }

  async function cancelBooking(id: string) {
    await fetch(`${API}/bookings/${id}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    load()
  }

  const filtered = bookings.filter(b => {
    if (filter === 'upcoming') return ['PENDING', 'CONFIRMED'].includes(b.status)
    if (filter === 'arrived')  return b.status === 'ARRIVED'
    if (filter === 'noshows')  return b.status === 'NO_SHOW'
    return true
  })

  const counts = {
    pending:   bookings.filter(b => b.status === 'PENDING').length,
    confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
    arrived:   bookings.filter(b => b.status === 'ARRIVED').length,
    noshows:   bookings.filter(b => b.status === 'NO_SHOW').length,
  }

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Today's Bookings</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">{counts.pending} pending</span>
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">{counts.confirmed} confirmed</span>
            <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">{counts.arrived} arrived</span>
            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{counts.noshows} no-show</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <p className="text-xs text-gray-400 hidden sm:block">
            {new Date().toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              filter === f.key
                ? ''
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            style={filter === f.key ? { backgroundColor: 'var(--brand)', color: '#000' } : undefined}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">

        {/* Skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-[var(--card-border)] rounded-2xl h-20" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-blue-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <CalendarDays size={28} className="text-blue-400 dark:text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No bookings here</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[240px]">Reservations made by guests online or by staff will appear in this section.</p>
            </div>
          </div>
        )}

        {/* Booking rows */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-2.5">
            {filtered.map(b => (
              <div key={b.id}
                className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-[var(--card-border)] rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all">

                {/* Time block */}
                <div className="flex flex-col items-center justify-center min-w-[56px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-center flex-shrink-0">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">{slotLabel(b.slotTime)}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{b.table ? `T${b.table.tableNumber}` : '—'}</div>
                </div>

                <div className="w-px h-10 bg-gray-100 dark:bg-gray-800 flex-shrink-0" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{b.customer.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[b.status]}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Users size={11} /> {b.partySize} pax</span>
                    {b.customer.phone && (
                      <span className="flex items-center gap-1"><Phone size={11} /> {b.customer.phone}</span>
                    )}
                    {b.notes && <span className="truncate max-w-[160px]">{b.notes}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {b.status === 'CONFIRMED' && (
                    <button onClick={() => markArrived(b.id)}
                      className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shadow-sm">
                      <CheckCircle2 size={12} /> Arrived
                    </button>
                  )}
                  {b.status === 'PENDING' && (
                    <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs px-2.5 py-1.5 rounded-xl">
                      <AlertTriangle size={11} /> Waiting
                    </div>
                  )}
                  {['PENDING', 'CONFIRMED'].includes(b.status) && (
                    <button onClick={() => cancelBooking(b.id)}
                      className="flex items-center gap-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs border border-gray-200 dark:border-gray-700 px-2.5 py-2 rounded-xl transition-colors">
                      <XCircle size={12} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
