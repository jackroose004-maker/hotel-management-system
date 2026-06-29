'use client'
import { useEffect, useState } from 'react'
import { ChefHat, Clock, Utensils, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'

interface Order {
  id: string; type: string; status: string; createdAt: string; tokenNumber?: number; notes?: string
  table?: { tableNumber: number }
  items: { quantity: number; notes?: string; menuItem: { name: string; prepTimeMins: number } }[]
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])

  const load = () => api.get('/orders/active').then(r => setOrders(
    r.data.filter((o: Order) => ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.status))
  ))

  useEffect(() => { load() }, [])

  useEffect(() => {
    const s = getSocket()
    s.on('order:new', (o: Order) => setOrders(p => [o, ...p]))
    s.on('order:updated', (o: Order) => {
      if (['DELIVERED', 'CANCELLED', 'READY'].includes(o.status)) {
        setOrders(p => p.filter(x => x.id !== o.id))
      } else {
        setOrders(p => p.map(x => x.id === o.id ? o : x))
      }
    })
    return () => { s.off('order:new'); s.off('order:updated') }
  }, [])

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/orders/${id}/status`, { status })
    if (status === 'READY') {
      setOrders(p => p.filter(o => o.id !== id))
      toast.success('Order marked ready — notifying team!')
    } else {
      setOrders(p => p.map(o => o.id === id ? { ...o, status } : o))
    }
  }

  const elapsed = (createdAt: string) => {
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    return { mins, late: mins > 20 }
  }

  const dineIn = orders.filter(o => o.type === 'DINE_IN')
  const takeaway = orders.filter(o => o.type === 'TAKEAWAY')

  const OrderCard = ({ order }: { order: Order }) => {
    const { mins, late } = elapsed(order.createdAt)
    return (
      <div className={`bg-white rounded-xl border-2 p-4 ${late ? 'border-red-300' : order.status === 'PREPARING' ? 'border-orange-300' : 'border-gray-200'}`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="font-bold text-gray-900 text-sm">
              {order.type === 'DINE_IN' ? `Table ${order.table?.tableNumber}` : `Token #${order.tokenNumber}`}
            </div>
            <div className={`text-xs flex items-center gap-1 mt-0.5 ${late ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
              <Clock size={11} /> {mins}m {late ? '— LATE!' : ''}
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.status === 'PREPARING' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {order.status}
          </span>
        </div>

        <div className="space-y-1.5 mb-4">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="bg-gray-100 text-gray-700 text-xs font-bold px-1.5 py-0.5 rounded">{item.quantity}×</span>
              <div>
                <div className="text-sm font-medium text-gray-800">{item.menuItem.name}</div>
                {item.notes && <div className="text-xs text-orange-500">Note: {item.notes}</div>}
              </div>
            </div>
          ))}
          {order.notes && <div className="text-xs text-orange-600 border-t pt-2 mt-2">Order note: {order.notes}</div>}
        </div>

        <div className="flex gap-2">
          {order.status === 'PENDING' && (
            <button onClick={() => updateStatus(order.id, 'PREPARING')}
              className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-orange-600">
              Start Cooking 🍳
            </button>
          )}
          {order.status === 'PREPARING' && (
            <button onClick={() => updateStatus(order.id, 'READY')}
              className="flex-1 bg-green-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-green-600">
              Mark Ready ✓
            </button>
          )}
          {order.status === 'ACCEPTED' && (
            <button onClick={() => updateStatus(order.id, 'PREPARING')}
              className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-orange-600">
              Start Cooking 🍳
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ChefHat size={22} className="text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900">Kitchen Display</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">{orders.length} active</span>
          <button onClick={load} className="text-gray-400 hover:text-gray-700 text-xs">Refresh</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Dine-In */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Utensils size={14} className="text-orange-500" />
            <h2 className="font-semibold text-gray-700 text-sm">Dine-In ({dineIn.length})</h2>
          </div>
          <div className="space-y-3">
            {dineIn.length === 0 && <div className="text-gray-300 text-sm text-center py-8 border-2 border-dashed rounded-xl">No dine-in orders</div>}
            {dineIn.map(o => <OrderCard key={o.id} order={o} />)}
          </div>
        </div>

        {/* Takeaway */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package size={14} className="text-blue-500" />
            <h2 className="font-semibold text-gray-700 text-sm">Takeaway ({takeaway.length})</h2>
          </div>
          <div className="space-y-3">
            {takeaway.length === 0 && <div className="text-gray-300 text-sm text-center py-8 border-2 border-dashed rounded-xl">No takeaway orders</div>}
            {takeaway.map(o => <OrderCard key={o.id} order={o} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
