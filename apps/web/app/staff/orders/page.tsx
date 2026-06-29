'use client'
import { useEffect, useState } from 'react'
import { Clock, Package, Utensils, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'

interface Order {
  id: string; type: string; status: string; total: number; vatAmount: number; subtotal: number
  tokenNumber?: number; notes?: string; createdAt: string
  table?: { tableNumber: number }
  items: { quantity: number; unitPrice: number; menuItem: { name: string } }[]
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-100 text-red-500',
}

const NEXT_STATUS: Record<string, string> = {
  PENDING: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState('active')

  const load = async () => {
    const { data } = await api.get(filter === 'active' ? '/orders/active' : '/orders')
    setOrders(data)
  }

  useEffect(() => { load() }, [filter])

  useEffect(() => {
    const socket = getSocket()
    socket.on('order:new', (o: Order) => {
      setOrders(prev => [o, ...prev])
      toast.success(`New order — ${o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Takeaway #${o.tokenNumber}`}`)
    })
    socket.on('order:updated', (o: Order) => setOrders(prev => prev.map(x => x.id === o.id ? o : x)))
    socket.on('order:ready', (o: Order) => {
      setOrders(prev => prev.map(x => x.id === o.id ? o : x))
      toast.success(`Order ready — ${o.type === 'DINE_IN' ? `Table ${o.table?.tableNumber}` : `Token #${o.tokenNumber}`}`)
    })
    return () => { socket.off('order:new'); socket.off('order:updated'); socket.off('order:ready') }
  }, [])

  const advance = async (id: string, status: string) => {
    await api.patch(`/orders/${id}/status`, { status })
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }

  const elapsed = (createdAt: string) => {
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    return mins < 1 ? 'just now' : `${mins}m ago`
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Live Orders</h1>
        <div className="flex gap-2">
          {['active', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border'}`}>
              {f === 'active' ? 'Active' : 'All'}
            </button>
          ))}
          <button onClick={load} className="px-4 py-1.5 rounded-full text-sm font-medium bg-white text-gray-600 border hover:bg-gray-50">
            Refresh
          </button>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p>No orders yet</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map(order => (
          <div key={order.id} className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  {order.type === 'DINE_IN' ? <Utensils size={14} className="text-orange-500" /> : <Package size={14} className="text-blue-500" />}
                  {order.type === 'DINE_IN' ? `Table ${order.table?.tableNumber ?? '—'}` : `Takeaway #${order.tokenNumber}`}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <Clock size={11} /> {elapsed(order.createdAt)}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.status]}`}>{order.status}</span>
            </div>

            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600">
                  <span>{item.quantity}× {item.menuItem.name}</span>
                  <span className="text-gray-400">AED {(item.quantity * Number(item.unitPrice)).toFixed(2)}</span>
                </div>
              ))}
              {order.notes && <p className="text-xs text-orange-600 mt-1">Note: {order.notes}</p>}
            </div>

            <div className="border-t pt-2 flex justify-between text-xs text-gray-500 mb-3">
              <span>Subtotal: AED {Number(order.subtotal).toFixed(2)}</span>
              <span className="font-semibold text-gray-800">Total: AED {Number(order.total).toFixed(2)}</span>
            </div>

            {NEXT_STATUS[order.status] && (
              <button onClick={() => advance(order.id, NEXT_STATUS[order.status])}
                className="w-full bg-orange-500 text-white py-2 rounded-lg text-xs font-semibold hover:bg-orange-600 transition-colors">
                Mark as {NEXT_STATUS[order.status]}
              </button>
            )}
            {order.status === 'PENDING' && (
              <button onClick={() => advance(order.id, 'CANCELLED')}
                className="w-full mt-1.5 border border-red-200 text-red-500 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
                Cancel
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
