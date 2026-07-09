import { apiGet } from './client'
import type { RestaurantTable } from './types'

export function getByQrCode(qrCode: string) {
  return apiGet<RestaurantTable>(`/tables/qr/${qrCode}`)
}
