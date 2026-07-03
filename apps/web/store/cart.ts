'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SelectedModifier {
  optionId: string
  groupName: string
  name: string
  priceAdd: number  // extra AED on top of base (ex-VAT)
}

export interface CartItem {
  cartKey: string        // unique key: `${menuItemId}_${optionIds.join('_') || 'plain'}`
  menuItemId: string
  name: string
  basePrice: number      // ex-VAT base price from backend
  price: number          // VAT-inclusive final price (base + modifiers) * 1.05
  modifiers: SelectedModifier[]
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
  addItem: (item: Omit<CartItem, 'quantity' | 'cartKey' | 'price'> & { modifiers: SelectedModifier[] }) => void
  removeItem: (cartKey: string) => void
  updateQty: (cartKey: string, delta: number) => void
  updateNotes: (cartKey: string, notes: string) => void
  clear: () => void
  subtotal: () => number     // VAT-inclusive total
  vatPortion: () => number   // VAT embedded (5/105)
  total: () => number        // same as subtotal
  maxPrepTime: () => number
}

function makeKey(menuItemId: string, modifiers: SelectedModifier[]) {
  const ids = modifiers.map(m => m.optionId).sort().join('_')
  return `${menuItemId}_${ids || 'plain'}`
}

function calcPrice(basePrice: number, modifiers: SelectedModifier[]) {
  const totalBase = basePrice + modifiers.reduce((s, m) => s + m.priceAdd, 0)
  return Math.round(totalBase * 1.05 * 100) / 100   // VAT-inclusive
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      orderType: 'DINE_IN',
      tableId: undefined,

      setOrderType: type => set({ orderType: type }),
      setTableId: id => set({ tableId: id }),

      addItem: item => set(state => {
        const key = makeKey(item.menuItemId, item.modifiers)
        const price = calcPrice(item.basePrice, item.modifiers)
        const exists = state.items.find(i => i.cartKey === key)
        if (exists) {
          return { items: state.items.map(i => i.cartKey === key ? { ...i, quantity: i.quantity + 1 } : i) }
        }
        return { items: [...state.items, { ...item, cartKey: key, price, quantity: 1 }] }
      }),

      removeItem: key => set(state => ({ items: state.items.filter(i => i.cartKey !== key) })),

      updateQty: (key, delta) => set(state => ({
        items: state.items
          .map(i => i.cartKey === key ? { ...i, quantity: i.quantity + delta } : i)
          .filter(i => i.quantity > 0)
      })),

      updateNotes: (key, notes) => set(state => ({
        items: state.items.map(i => i.cartKey === key ? { ...i, notes } : i)
      })),

      clear: () => set({ items: [], tableId: undefined }),

      subtotal: () => get().items.reduce((s, i) => s + i.price * i.quantity, 0),
      vatPortion: () => {
        const sub = get().items.reduce((s, i) => s + i.price * i.quantity, 0)
        return Math.round((sub * 5 / 105) * 100) / 100
      },
      total: () => Math.round(get().items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100,
      maxPrepTime: () => get().items.reduce((max, i) => Math.max(max, i.prepTimeMins), 0),
    }),
    {
      name: 'almanzil-cart',
      partialize: state => ({ items: state.items, orderType: state.orderType }),
    }
  )
)
