import { apiGet, apiPatch, apiPost } from './client'
import { deepNormalizeDecimals } from './decimal'
import type { CreateOrderInput, Order, OrderStatus } from './types'

// Order responses carry several Prisma Decimal fields (subtotal, vatAmount, total,
// items[].unitPrice, items[].modifiers[].priceAdd) that arrive as strings — see decimal.ts.
// Normalized here so every screen consuming an Order can trust `number` types.
function normalizeOrder(order: Order): Order {
  return deepNormalizeDecimals(order)
}
function normalizeOrders(orders: Order[]): Order[] {
  return orders.map(normalizeOrder)
}

export async function createOrder(dto: CreateOrderInput) {
  return normalizeOrder(await apiPost<Order>('/orders', dto))
}

export async function getMyOrders() {
  return normalizeOrders(await apiGet<Order[]>('/orders/mine'))
}

export async function getBySessionToken(token: string) {
  return normalizeOrders(await apiGet<Order[]>(`/orders/by-session/${token}`))
}

export async function getById(id: string) {
  return normalizeOrder(await apiGet<Order>(`/orders/${id}`))
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

// ── Staff (STAFF/MANAGER/OWNER) ─────────────────────────────────────────────

export async function getActive() {
  return normalizeOrders(await apiGet<Order[]>('/orders/active'))
}

export async function getAll(status?: string) {
  return normalizeOrders(await apiGet<Order[]>(`/orders${status ? `?status=${status}` : ''}`))
}

export async function updateOrderStatus(id: string, status: OrderStatus, cancelReason?: string) {
  return normalizeOrder(await apiPatch<Order>(`/orders/${id}/status`, { status, cancelReason }))
}

export async function getActiveBills() {
  return deepNormalizeDecimals(await apiGet<any[]>('/orders/active-bills'))
}

export async function getTableBill(tableId: string) {
  return deepNormalizeDecimals(await apiGet<any>(`/orders/table/${tableId}/bill`))
}

export async function getClosedBillsToday() {
  return deepNormalizeDecimals(await apiGet<any[]>('/orders/closed-bills-today'))
}

export async function getTakeawayToday() {
  return deepNormalizeDecimals(await apiGet<any[]>('/orders/takeaway-today'))
}
