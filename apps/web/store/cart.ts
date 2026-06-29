'use client'
import { create } from 'zustand'

export interface CartItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  notes?: string
  prepTimeMins: number
}

interface CartStore {
  items: CartItem[]
  orderType: 'DINE_IN' | 'TAKEAWAY'
  tableId?: string
  setOrderType: (type: 'DINE_IN' | 'TAKEAWAY') => void
  setTableId: (id: string) => void
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (menuItemId: string) => void
  updateQty: (menuItemId: string, delta: number) => void
  updateNotes: (menuItemId: string, notes: string) => void
  clear: () => void
  subtotal: () => number
  vat: () => number
  total: () => number
  maxPrepTime: () => number
}

const VAT = 0.05

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  orderType: 'DINE_IN',
  tableId: undefined,

  setOrderType: type => set({ orderType: type }),
  setTableId: id => set({ tableId: id }),

  addItem: item => set(state => {
    const exists = state.items.find(i => i.menuItemId === item.menuItemId)
    if (exists) {
      return { items: state.items.map(i => i.menuItemId === item.menuItemId ? { ...i, quantity: i.quantity + 1 } : i) }
    }
    return { items: [...state.items, { ...item, quantity: 1 }] }
  }),

  removeItem: id => set(state => ({ items: state.items.filter(i => i.menuItemId !== id) })),

  updateQty: (id, delta) => set(state => ({
    items: state.items
      .map(i => i.menuItemId === id ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
  })),

  updateNotes: (id, notes) => set(state => ({
    items: state.items.map(i => i.menuItemId === id ? { ...i, notes } : i)
  })),

  clear: () => set({ items: [] }),

  subtotal: () => get().items.reduce((s, i) => s + i.price * i.quantity, 0),
  vat: () => Math.round(get().subtotal() * VAT * 100) / 100,
  total: () => Math.round((get().subtotal() + get().vat()) * 100) / 100,
  maxPrepTime: () => get().items.reduce((max, i) => Math.max(max, i.prepTimeMins), 0),
}))
