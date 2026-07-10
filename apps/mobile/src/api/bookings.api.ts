import { apiGet, apiPatch, apiPost } from './client'

export interface BookingSlot {
  time: string
  available: number
  bookableTables: number
  isPast: boolean
  isPeak: boolean
  isWalkInOnly: boolean
  isFull: boolean
}

export interface AvailabilityResponse {
  date: string
  slots: BookingSlot[]
  bookingsEnabled: boolean
}

export interface Booking {
  id: string
  partySize: number
  slotDate: string
  slotTime: string
  status: string
  notes?: string
  table?: { tableNumber: number; name?: string }
}

export function getAvailability(date: string) {
  return apiGet<AvailabilityResponse>(`/bookings/availability?date=${date}`)
}

export function createBooking(dto: { partySize: number; slotDate: string; slotTime: string; notes?: string; idempotencyKey: string }) {
  return apiPost<Booking>('/bookings', dto)
}

export function getMyBookings() {
  return apiGet<Booking[]>('/bookings/mine')
}

export function cancelBooking(id: string) {
  return apiPost<Booking>(`/bookings/${id}/cancel`)
}

// ── Staff (STAFF/MANAGER/OWNER) ─────────────────────────────────────────────

export function getTodayBookings() {
  return apiGet<(Booking & { customer: { name: string; phone?: string } })[]>('/bookings/today')
}

export function markArrived(id: string) {
  return apiPatch<Booking>(`/bookings/${id}/arrived`, {})
}

export function staffCancelBooking(id: string, reason?: string) {
  return apiPatch<Booking>(`/bookings/${id}/cancel`, { reason })
}

export function confirmBooking(id: string) {
  return apiPatch<Booking>(`/bookings/${id}/confirm`, {})
}
