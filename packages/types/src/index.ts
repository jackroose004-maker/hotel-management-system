// Shared types used by both web (Next.js) and backend (NestJS)

export type Role = 'OWNER' | 'MANAGER' | 'STAFF' | 'USER' | 'GUEST'
export type OrderType = 'DINE_IN' | 'TAKEAWAY'
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED'
export type TableStatus = 'EMPTY' | 'OCCUPIED' | 'BILL_PENDING' | 'DIRTY'

export interface MenuCategory {
  id: string
  name: string
  nameAr?: string
  sortOrder: number
  isActive: boolean
  items?: MenuItem[]
}

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  nameAr?: string
  description?: string
  price: number
  imageUrl?: string
  isAvailable: boolean
  prepTimeMins: number
  isSpecialDay: boolean
  specialLabel?: string
}

export interface Order {
  id: string
  type: OrderType
  tableId?: string
  tokenNumber?: number
  status: OrderStatus
  subtotal: number
  vatAmount: number
  total: number
  paymentStatus: PaymentStatus
  notes?: string
  createdAt: string
  items: OrderItem[]
}

export interface OrderItem {
  id: string
  menuItemId: string
  quantity: number
  unitPrice: number
  notes?: string
  menuItem?: MenuItem
}

export interface RestaurantTable {
  id: string
  tableNumber: number
  capacity: number
  status: TableStatus
  qrCode?: string
}

// WebSocket event payloads
export interface WsOrderEvent {
  event: 'order:new' | 'order:updated' | 'order:ready'
  data: Order
}
