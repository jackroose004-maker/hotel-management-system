'use client'
import { useEffect, useState, use } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { Plus, Minus, ShoppingCart, X, ArrowLeft, Clock, CheckCircle, ChefHat, Bike, UtensilsCrossed, Loader2, Lock, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useCartStore } from '@/store/cart'
import StripePaymentForm from '@/components/StripePaymentForm'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

type View = 'menu' | 'cart' | 'payment' | 'tracking'

interface MenuItem { id: string; name: string; description?: string; price: number; prepTimeMins: number; isAvailable: boolean; imageUrl?: string }
interface Category { id: string; name: string; items: MenuItem[] }
interface Table { id: string; tableNumber: number }
interface Order {
  id: string; status: string; tokenNumber?: number; total: number
  vatAmount: number; subtotal: number; type: string; paymentStatus: string
  items: { quantity: number; menuItem: { name: string } }[]
}

const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

const STEPS = [
  { label: 'Received', icon: Clock },
  { label: 'Confirmed', icon: CheckCircle },
  { label: 'Cooking', icon: ChefHat },
  { label: 'Ready!', icon: Bike },
]

export default function OrderPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params)

  const [view, setView] = useState<View>('menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [placing, setPlacing] = useState(false)
  const [notesOpen, setNotesOpen] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const cart = useCartStore()

  useEffect(() => {
    api.get(`/tables/qr/${tableId}`).then(r => {
      if (r.data) { setTable(r.data); cart.setTableId(r.data.id); cart.setOrderType('DINE_IN') }
    }).catch(() => cart.setOrderType('TAKEAWAY'))

    api.get('/menu/categories').then(r => {
      setCategories(r.data)
      if (r.data[0]) setActiveCategory(r.data[0].id)
    })
  }, [tableId])

  useEffect(() => {
    if (!order) return
    const socket = getSocket()
    const handler = (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated)
        if (updated.status === 'READY') toast.success('🎉 Your order is ready!')
        if (updated.status === 'ACCEPTED' && order.status === 'PENDING') toast('✅ Order confirmed by kitchen!')
      }
    }
    socket.on('order:updated', handler)
    socket.on('order:ready', handler)
    return () => { socket.off('order:updated', handler); socket.off('order:ready', handler) }
  }, [order?.id])

  // Place order (creates it in backend, returns order + clientSecret for Stripe)
  const placeOrder = async (payWithCard: boolean) => {
    if (cart.items.length === 0) return
    setPlacing(true)
    try {
      const { data: newOrder } = await api.post('/orders', {
        type: cart.orderType,
        tableId: cart.orderType === 'DINE_IN' ? cart.tableId : undefined,
        items: cart.items.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
      })
      setOrder(newOrder)
      cart.clear()

      if (payWithCard) {
        // Get Stripe clientSecret for this order
        const { data } = await api.post(`/payments/create-intent/${newOrder.id}`)
        setClientSecret(data.clientSecret)
        setView('payment')
      } else {
        // Cash — go straight to tracking
        await api.post(`/payments/cash/${newOrder.id}`)
        setOrder({ ...newOrder, paymentStatus: 'PAID', status: 'ACCEPTED' })
        setView('tracking')
        toast.success('Order placed! Pay cash at the counter.')
      }
    } catch {
      toast.error('Could not place order. Try again.')
    } finally {
      setPlacing(false)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!order) return
    try {
      const { data } = await api.post(`/payments/confirm/${order.id}`, { paymentIntentId })
      setOrder(data.order)
      setClientSecret(null)
      setView('tracking')
      toast.success('Payment confirmed! 🎉')
    } catch {
      toast.error('Payment went through but confirmation failed. Show this screen to staff.')
      setView('tracking')
    }
  }

  const currentCat = categories.find(c => c.id === activeCategory)
  const totalQty = cart.items.reduce((s, i) => s + i.quantity, 0)
  const stepIdx = order ? (STATUS_STEP[order.status] ?? 0) : 0

  // ─── PAYMENT VIEW ─────────────────────────────────────────────────────────
  if (view === 'payment' && clientSecret && order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setView('cart')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
          <Lock size={16} className="text-green-500" />
          <span className="font-semibold text-sm">Secure Payment</span>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-6">
          {/* Order mini-summary */}
          <div className="bg-white rounded-2xl border p-4 mb-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Summary</div>
            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-700">
                  <span>{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal</span><span>AED {Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT 5%</span><span>AED {Number(order.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900">
                <span>Total</span><span className="text-orange-600">AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#f97316' } } }}>
            <StripePaymentForm
              orderId={order.id}
              total={Number(order.total)}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setView('cart')}
            />
          </Elements>

          <p className="text-center text-xs text-gray-300 mt-4">
            Test card: 4242 4242 4242 4242 · Any future date · Any CVC
          </p>
        </div>
      </div>
    )
  }

  // ─── TRACKING VIEW ────────────────────────────────────────────────────────
  if (view === 'tracking' && order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-orange-500" />
            <span className="font-bold text-sm">Al Manzil</span>
          </div>
          <div className="text-sm text-gray-400">
            {table ? `Table ${table.tableNumber}` : order.tokenNumber ? `Token #${order.tokenNumber}` : ''}
          </div>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-8">
          {/* Status hero */}
          <div className="text-center mb-8">
            <div className={`text-5xl mb-3 ${order.status === 'READY' ? 'animate-bounce' : ''}`}>
              {order.status === 'PENDING' && '⏳'}
              {order.status === 'ACCEPTED' && '✅'}
              {order.status === 'PREPARING' && '🍳'}
              {order.status === 'READY' && '🎉'}
              {order.status === 'DELIVERED' && '😊'}
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {order.status === 'PENDING' && 'Order received!'}
              {order.status === 'ACCEPTED' && 'Order confirmed by kitchen'}
              {order.status === 'PREPARING' && 'Cooking your food...'}
              {order.status === 'READY' && 'Your order is ready! 🎉'}
              {order.status === 'DELIVERED' && 'Enjoy your meal! 😊'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {order.status === 'PREPARING' && "Hang tight, it won't be long"}
              {order.status === 'READY' && (order.type === 'DINE_IN' ? 'Your waiter is on the way' : 'Please collect at the counter')}
              {order.paymentStatus === 'PAID' && <span className="text-green-500 text-xs block mt-1">✓ Payment confirmed</span>}
              {order.paymentStatus === 'UNPAID' && order.status === 'ACCEPTED' && <span className="text-orange-500 text-xs block mt-1">Cash payment — please pay the waiter</span>}
            </p>
          </div>

          {/* Progress steps */}
          <div className="relative mb-8 px-2">
            <div className="flex justify-between relative z-10">
              {STEPS.map((step, i) => {
                const Icon = step.icon
                const done = i <= stepIdx
                const active = i === stepIdx
                return (
                  <div key={step.label} className="flex flex-col items-center gap-1.5 w-16">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500
                      ${done ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'}
                      ${active ? 'ring-4 ring-orange-100' : ''}`}>
                      <Icon size={18} className={done ? 'text-white' : 'text-gray-300'} />
                    </div>
                    <span className={`text-xs text-center leading-tight ${done ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-200 z-0">
              <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${Math.min((stepIdx / 3) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-800">Your Order</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {order.paymentStatus === 'PAID' ? '✓ Paid' : 'Cash'}
              </span>
            </div>
            <div className="space-y-1.5 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.quantity}× {item.menuItem.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal</span><span>AED {Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT (5%)</span><span>AED {Number(order.vatAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900">
                <span>Total</span><span>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button onClick={() => { setView('menu'); setOrder(null) }}
            className="w-full border border-gray-200 text-gray-600 py-3 rounded-2xl text-sm font-medium hover:bg-gray-50">
            + Order More Items
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
          <span className="font-semibold">Review Order</span>
          {table && <span className="ml-auto text-xs bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full">Table {table.tableNumber}</span>}
        </div>

        <div className="flex-1 max-w-md mx-auto w-full px-4 py-4">
          {/* Order type */}
          <div className="bg-white rounded-2xl border p-4 mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">How would you like it?</div>
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {(['DINE_IN', 'TAKEAWAY'] as const).map(type => (
                <button key={type} onClick={() => cart.setOrderType(type)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${cart.orderType === type ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>
                  {type === 'DINE_IN' ? '🍽  Dine In' : '📦  Takeaway'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {cart.orderType === 'DINE_IN' && table ? `Food served to Table ${table.tableNumber}` : 'Token number given · WhatsApp alert when ready'}
            </p>
          </div>

          {/* Cart items */}
          <div className="bg-white rounded-2xl border divide-y mb-4">
            {cart.items.length === 0 && <div className="text-center py-10 text-gray-300 text-sm">Your cart is empty</div>}
            {cart.items.map(item => (
              <div key={item.menuItemId} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-400">AED {item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => cart.updateQty(item.menuItemId, -1)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => cart.updateQty(item.menuItemId, 1)} className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                      <Plus size={12} className="text-orange-600" />
                    </button>
                    <button onClick={() => cart.removeItem(item.menuItemId)} className="ml-1 text-gray-200 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <button onClick={() => setNotesOpen(notesOpen === item.menuItemId ? null : item.menuItemId)}
                  className="text-xs text-orange-500 hover:underline">
                  {item.notes ? `📝 ${item.notes}` : '+ Add note (spice, allergies...)'}
                </button>
                {notesOpen === item.menuItemId && (
                  <input autoFocus type="text" placeholder="e.g. No onion, less spicy, extra chutney..."
                    value={item.notes || ''}
                    onChange={e => cart.updateNotes(item.menuItemId, e.target.value)}
                    className="mt-2 w-full text-xs border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
                  />
                )}

                <div className="text-xs font-bold text-gray-800 mt-2">
                  AED {(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Bill breakdown */}
          {cart.items.length > 0 && (
            <div className="bg-white rounded-2xl border p-4 mb-5">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Subtotal</span><span>AED {cart.subtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500 mb-3">
                <span>VAT (5%)</span><span>AED {cart.vat().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t pt-3">
                <span>Total</span><span className="text-orange-600">AED {cart.total().toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> Est. prep: ~{cart.maxPrepTime()}–{cart.maxPrepTime() + 5} mins
              </div>
            </div>
          )}

          {/* Payment buttons */}
          {cart.items.length > 0 && (
            <div className="space-y-3">
              <button onClick={() => placeOrder(true)} disabled={placing}
                className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors disabled:opacity-50">
                {placing ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
                Pay by Card · AED {cart.total().toFixed(2)}
              </button>
              <button onClick={() => placeOrder(false)} disabled={placing}
                className="w-full border-2 border-gray-200 text-gray-700 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors disabled:opacity-50">
                <Banknote size={16} className="text-green-600" />
                Pay Cash at Counter
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-orange-500" />
            <div>
              <div className="font-bold text-sm leading-none">Al Manzil</div>
              <div className="text-xs text-gray-400 leading-none mt-0.5">Kerala & South Indian Cuisine</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {table && <span className="text-xs bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full font-medium">Table {table.tableNumber}</span>}
            <button onClick={() => setView('cart')} className="relative p-1">
              <ShoppingCart size={22} className="text-gray-700" />
              {totalQty > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs w-4.5 h-4.5 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]">
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
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap
                ${activeCategory === c.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-28">
        {currentCat && (
          <>
            <h2 className="font-bold text-gray-800 mb-3 text-base">{currentCat.name}</h2>
            <div className="space-y-3">
              {currentCat.items.map(item => {
                const qty = cart.items.find(i => i.menuItemId === item.id)?.quantity ?? 0
                return (
                  <div key={item.id} className={`bg-white rounded-2xl border p-4 flex gap-3 transition-all ${!item.isAvailable ? 'opacity-40' : 'hover:border-orange-200'}`}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                      {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Clock size={10} className="text-gray-300" />
                        <span className="text-xs text-gray-400">{item.prepTimeMins} min</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-orange-600">AED {Number(item.price).toFixed(2)}</span>
                        {!item.isAvailable ? (
                          <span className="text-xs text-red-400 font-medium">Unavailable</span>
                        ) : qty === 0 ? (
                          <button onClick={() => cart.addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), prepTimeMins: item.prepTimeMins })}
                            className="flex items-center gap-1 bg-orange-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors">
                            <Plus size={12} /> Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2.5 bg-orange-50 rounded-xl px-1 py-0.5">
                            <button onClick={() => cart.updateQty(item.id, -1)} className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <Minus size={11} />
                            </button>
                            <span className="text-sm font-bold text-orange-600 w-4 text-center">{qty}</span>
                            <button onClick={() => cart.updateQty(item.id, 1)} className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-sm">
                              <Plus size={11} className="text-white" />
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
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-2 bg-gradient-to-t from-gray-50 via-gray-50">
          <button onClick={() => setView('cart')}
            className="w-full max-w-2xl mx-auto flex bg-orange-500 text-white py-4 rounded-2xl font-bold items-center justify-between px-5 shadow-xl hover:bg-orange-600 transition-colors">
            <span className="bg-orange-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">{totalQty}</span>
            <span>Review Order</span>
            <span>AED {cart.total().toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
