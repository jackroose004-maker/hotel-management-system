import { apiGet, apiPatch } from './client'
import type { RestaurantTable, TableStatus } from './types'

export function getAll() {
  return apiGet<RestaurantTable[]>('/tables')
}

export function getByQrCode(qrCode: string) {
  return apiGet<RestaurantTable>(`/tables/qr/${qrCode}`)
}

export function updateStatus(id: string, status: TableStatus) {
  return apiPatch<RestaurantTable>(`/tables/${id}/status`, { status })
}
