export type Role = 'OWNER' | 'MANAGER' | 'STAFF' | 'USER' | 'GUEST'
export type OrderType = 'DINE_IN' | 'TAKEAWAY'
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUND_REQUESTED' | 'REFUNDED'
export type PaymentMethod = 'CASH' | 'CARD' | 'APPLE_PAY' | 'GOOGLE_PAY' | 'CHARGE_TO_ROOM'
export type TableStatus = 'EMPTY' | 'OCCUPIED' | 'BILL_PENDING' | 'DIRTY'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl?: string
  phone?: string
  dietaryTags?: string
  notifOrderUpdates?: boolean
  notifBookingReminders?: boolean
}

export interface MenuModifierOption {
  id: string
  groupId: string
  name: string
  nameAr?: string
  priceAdd: number
  isDefault: boolean
  sortOrder: number
}

export interface MenuModifierGroup {
  id: string
  menuItemId: string
  name: string
  nameAr?: string
  required: boolean
  minSelect: number
  maxSelect: number
  sortOrder: number
  options: MenuModifierOption[]
}

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  nameAr?: string
  description?: string
  price: number
  imageUrl?: string
  videoUrl?: string
  isAvailable: boolean
  prepTimeMins: number
  isSpecialDay: boolean
  specialLabel?: string
  modifierGroups?: MenuModifierGroup[]
}

export interface MenuCategory {
  id: string
  name: string
  nameAr?: string
  sortOrder: number
  isActive: boolean
  items?: MenuItem[]
}

export interface RestaurantTable {
  id: string
  tableNumber: number
  name?: string
  capacity: number
  status: TableStatus
  qrCode?: string
}

export interface OrderItemModifier {
  id: string
  optionId: string
  name: string
  priceAdd: number
}

export interface OrderItem {
  id: string
  menuItemId: string
  quantity: number
  unitPrice: number
  notes?: string
  menuItem?: MenuItem
  modifiers?: OrderItemModifier[]
}

export interface Order {
  id: string
  type: OrderType
  tableId?: string
  tableSessionId?: string
  userId?: string
  tokenNumber?: number
  status: OrderStatus
  subtotal: number
  vatAmount: number
  total: number
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  notes?: string
  contactPhone?: string
  createdAt: string
  items: OrderItem[]
  table?: { id: string; tableNumber: number; name?: string }
}

export interface CreateOrderItemInput {
  menuItemId: string
  quantity: number
  notes?: string
}

export interface CreateOrderInput {
  type: OrderType
  tableId?: string
  notes?: string
  guestTabToken?: string
  contactPhone?: string
  paymentMethod?: PaymentMethod
  items: CreateOrderItemInput[]
}
