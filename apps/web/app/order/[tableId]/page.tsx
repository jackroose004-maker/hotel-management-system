'use client'
import { useEffect, useState, use } from 'react'
import { Plus, Minus, ShoppingCart, X, ArrowLeft, Clock, CheckCircle, ChefHat, Bike, UtensilsCrossed, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useCartStore } from '@/store/cart'

type View = 'menu' | 'cart' | 'tracking'

interface MenuItem { id: string; name: string; description?: string; price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string }
interface Category { id: string; name: string; items: MenuItem[] }
interface Table { id: string; tableNumber: number; qrCode?: string }
interface Order { id: string; status: string; tokenNumber?: number; total: number; vatAmount: number; subtotal: number; type: string; items: { quantity: number; menuItem: { name: string } }[] }

const ORDER_STEPS = [
  { status: 'PENDING', icon: Clock, label: 'Order Received', color: 'text-yellow-500' },
  { status: 'ACCEPTED', icon: CheckCircle, label: 'Confirmed', color: 'text-blue-500' },
  { status: 'PREPARING', icon: ChefHat, label: 'Preparing', color: 'text-orange-500' },
  { status: 'READY', icon: Bike, label: 'Ready!', color: 'text-green-500' },
  { status: 'DELIVERED', icon: CheckCircle, label: 'Delivered', color: 'text-green-600' },
]
const STATUS_STEP = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

export default function OrderPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)

  const [view, setView] = useState<View>('menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [placing, setPlacing] = useState(false)
  const [notesOpen, setNotesOpen] = useState<string | null>(null)

  const cart = useCartStore()

  useEffect(() => {
    // Load table info via QR code lookup
    api.get(`/tables/qr/${tableId}`).then(r => {
      if (r.data) {
        setTable(r.data)
        cart.setTableId(r.data.id)
        cart.setOrderType('DINE_IN')
      }
    }).catch(() => {
      // tableId might be an actual UUID fallback
      cart.setOrderType('TAKEAWAY')
    })

    api.get('/menu/categories').then(r => {
      setCategories(r.data)
      if (r.data[0]) setActiveCategory(r.data[0].id)
    })
  }, [tableId])

  // Live order tracking
  useEffect(() => {
    if (!order) return
    const socket = getSocket()
    const handler = (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated)
        if (updated.status === 'READY') toast.success('🎉 Your order is ready!')
      }
    }
    socket.on('order:updated', handler)
    socket.on('order:ready', handler)
    return () => { socket.off('order:updated', handler); socket.off('order:ready', handler) }
  }, [order?.id])

  const placeOrder = async () => {
    if (cart.items.length === 0) return
    setPlacing(true)
    try {
      const payload = {
        type: cart.orderType,
        tableId: cart.orderType === 'DINE_IN' ? cart.tableId : undefined,
        items: cart.items.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
      }
      const { data } = await api.post('/orders', payload)
      setOrder(data)
      cart.clear()
      setView('tracking')
      toast.success('Order placed!')
    } catch {
      toast.error('Could not place order. Try again.')
    } finally {
      setPlacing(false)
    }
  }

  const currentCat = categories.find(c => c.id === activeCategory)
  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0)
  const stepIdx = order ? (STATUS_STEP[order.status as keyof typeof STATUS_STEP] ?? 0) : 0

  // ─── TRACKING VIEW ───────────────────────────────────────────────────────
  if (view === 'tracking' && order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b px-4 h-14 flex items-center gap-3">
          <UtensilsCrossed size={18} className="text-orange-500" />
          <span className="font-semibold text-sm">Al Manzil</span>
          {table && <span className="ml-auto text-sm text-gray-500">Table {table.tableNumber}</span>}
          {order.tokenNumber && <span className="ml-auto text-sm text-gray-500">Token #{order.tokenNumber}</span>}
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-8">
          {/* Status header */}
          <div className="text-center mb-8">
            <div className={`text-4xl mb-2 ${order.status === 'READY' ? 'animate-bounce' : ''}`}>
              {order.status === 'PENDING' && '⏳'}
              {order.status === 'ACCEPTED' && '✅'}
              {order.status === 'PREPARING' && '🍳'}
              {order.status === 'READY' && '🎉'}
              {order.status === 'DELIVERED' && '😊'}
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {order.status === 'PENDING' && 'Order received!'}
              {order.status === 'ACCEPTED' && 'Order confirmed'}
              {order.status === 'PREPARING' && 'Cooking your food...'}
              {order.status === 'READY' && 'Your order is ready!'}
              {order.status === 'DELIVERED' && 'Enjoy your meal!'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {order.status === 'PREPARING' && `Est. ${cart.maxPrepTime() || 15}–${(cart.maxPrepTime() || 15) + 5} mins`}
              {order.status === 'READY' && (order.type === 'DINE_IN' ? 'Your waiter is on the way' : 'Please collect at the counter')}
            </p>
          </div>

          {/* Progress bar */}
          <div className="relative mb-8">
            <div className="flex justify-between relative z-10">
              {ORDER_STEPS.slice(0, 4).map((step, i) => {
                const Icon = step.icon
                const done = i <= stepIdx
                return (
                  <div key={step.status} className="flex flex-col items-center gap-1.5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'}`}>
                      <Icon size={18} className={done ? 'text-white' : 'text-gray-300'} />
                    </div>
                    <span className={`text-xs text-center font-medium ${done ? 'text-orange-600' : 'text-gray-400'}`}>{step.label}</span>
                  </div>
                )
              })}
            </div>
            {/* Connecting line */}
            <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200 z-0">
              <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${Math.min((stepIdx / 3) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <h3 className="font-semibold text-sm text-gray-800 mb-3">Your Order</h3>
            <div className="space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal</span><span>AED {Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT (5%)</span><span>AED {Number(order.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-900">
                <span>Total</span><span>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button onClick={() => { setView('menu'); setOrder(null) }}
            className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
            Order More Items
          </button>
        </div>
      </div>
    )
  }

  // ─── CART VIEW ────────────────────────────────────────────────────────────
  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setView('menu')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
          <span className="font-semibold">Your Order</span>
          {table && <span className="ml-auto text-sm text-gray-400">Table {table.tableNumber}</span>}
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4">
          {/* Order type toggle */}
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Order Type</div>
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {(['DINE_IN', 'TAKEAWAY'] as const).map(type => (
                <button key={type} onClick={() => cart.setOrderType(type)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${cart.orderType === type ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>
                  {type === 'DINE_IN' ? '🍽 Dine In' : '📦 Takeaway'}
                </button>
              ))}
            </div>
            {cart.orderType === 'DINE_IN' && table && (
              <p className="text-xs text-gray-400 mt-2 text-center">Delivering to Table {table.tableNumber}</p>
            )}
            {cart.orderType === 'TAKEAWAY' && (
              <p className="text-xs text-gray-400 mt-2 text-center">You'll get a token number — we'll notify when ready</p>
            )}
          </div>

          {/* Items */}
          <div className="bg-white rounded-2xl border p-4 mb-4 space-y-3">
            {cart.items.length === 0 && (
              <div className="text-center text-gray-300 py-6 text-sm">Cart is empty</div>
            )}
            {cart.items.map(item => (
              <div key={item.menuItemId} className="border-b last:border-b-0 pb-3 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-400">AED {item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cart.updateQty(item.menuItemId, -1)}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                    <button onClick={() => cart.updateQty(item.menuItemId, 1)}
                      className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center hover:bg-orange-200">
                      <Plus size={12} className="text-orange-600" />
                    </button>
                    <button onClick={() => cart.removeItem(item.menuItemId)} className="ml-1 text-gray-300 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Notes toggle */}
                <button onClick={() => setNotesOpen(notesOpen === item.menuItemId ? null : item.menuItemId)}
                  className="text-xs text-orange-500 hover:underline">
                  {item.notes ? `Note: ${item.notes}` : '+ Add note (spice level, allergies...)'}
                </button>
                {notesOpen === item.menuItemId && (
                  <input autoFocus type="text" placeholder="e.g. No onion, extra spicy..."
                    value={item.notes || ''}
                    onChange={e => cart.updateNotes(item.menuItemId, e.target.value)}
                    className="mt-1.5 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
                  />
                )}

                <div className="text-xs font-semibold text-gray-700 mt-1.5">
                  AED {(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Bill breakdown */}
          {cart.items.length > 0 && (
            <div className="bg-white rounded-2xl border p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>AED {cart.subtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>VAT (5%)</span><span>AED {cart.vat().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t pt-2">
                <span>Total</span><span className="text-orange-600">AED {cart.total().toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={11} /> Est. prep time: ~{cart.maxPrepTime()}–{cart.maxPrepTime() + 5} mins
              </div>
            </div>
          )}

          <button onClick={placeOrder} disabled={placing || cart.items.length === 0}
            className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
            {placing ? <><Loader2 size={18} className="animate-spin" /> Placing Order...</> : `Place Order · AED ${cart.total().toFixed(2)}`}
          </button>
        </div>
      </div>
    )
  }

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-orange-500" />
            <span className="font-bold text-sm">Al Manzil</span>
          </div>
          <div className="flex items-center gap-2">
            {table && <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">Table {table.tableNumber}</span>}
            <button onClick={() => setView('cart')} className="relative">
              <ShoppingCart size={22} className="text-gray-700" />
              {totalQty > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {totalQty}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {categories.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeCategory === c.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4">
        {currentCat && (
          <>
            <h2 className="font-bold text-gray-800 mb-3">{currentCat.name}</h2>
            <div className="space-y-3">
              {currentCat.items.map(item => {
                const cartItem = cart.items.find(i => i.menuItemId === item.id)
                const qty = cartItem?.quantity ?? 0
                return (
                  <div key={item.id} className={`bg-white rounded-2xl border p-4 flex gap-3 ${!item.isAvailable ? 'opacity-50' : ''}`}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{item.name}</div>
                      {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400"><Clock size={10} className="inline mr-0.5" />{item.prepTimeMins} min</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-orange-600">AED {Number(item.price).toFixed(2)}</span>
                        {!item.isAvailable ? (
                          <span className="text-xs text-red-400 font-medium">Unavailable</span>
                        ) : qty === 0 ? (
                          <button onClick={() => cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })}
                            className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors">
                            <Plus size={12} /> Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => cart.updateQty(item.id, -1)}
                              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                              <Minus size={12} />
                            </button>
                            <span className="text-sm font-bold w-4 text-center">{qty}</span>
                            <button onClick={() => cart.updateQty(item.id, 1)}
                              className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center hover:bg-orange-600">
                              <Plus size={12} className="text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Floating cart bar */}
      {totalQty > 0 && (
        <div className="sticky bottom-0 px-4 pb-6 pt-2 bg-gradient-to-t from-gray-50">
          <button onClick={() => setView('cart')}
            className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold flex items-center justify-between px-5 shadow-lg hover:bg-orange-600 transition-colors">
            <span className="bg-orange-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">{totalQty}</span>
            <span>View Cart</span>
            <span>AED {cart.total().toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
