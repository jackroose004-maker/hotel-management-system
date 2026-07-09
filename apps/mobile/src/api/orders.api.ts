import { apiGet, apiPost } from './client'
import type { CreateOrderInput, Order } from './types'

export function createOrder(dto: CreateOrderInput) {
  return apiPost<Order>('/orders', dto)
}

export function getMyOrders() {
  return apiGet<Order[]>('/orders/mine')
}

export function getBySessionToken(token: string) {
  return apiGet<Order[]>(`/orders/by-session/${token}`)
}

export function getById(id: string) {
  return apiGet<Order>(`/orders/${id}`)
}

export function claimGuestOrders(orderIds: string[]) {
  return apiPost<{ claimed: number }>('/orders/claim', { orderIds })
}

export function cancelOrder(id: string, cancelReason?: string) {
  return apiPost<Order>(`/orders/${id}/cancel`, { cancelReason })
}

export function submitFeedback(orderId: string, rating: number, comment?: string, tags?: string) {
  return apiPost(`/orders/${orderId}/feedback`, { rating, comment, tags })
}
