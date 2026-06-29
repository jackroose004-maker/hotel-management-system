'use client'
import { useEffect, useState } from 'react'
import { Table2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface Table { id: string; tableNumber: number; capacity: number; status: string; qrCode?: string }

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  EMPTY: { label: 'Empty', bg: 'bg-green-100', text: 'text-green-700' },
  OCCUPIED: { label: 'Occupied', bg: 'bg-red-100', text: 'text-red-700' },
  BILL_PENDING: { label: 'Bill Pending', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  DIRTY: { label: 'Needs Cleaning', bg: 'bg-gray-100', text: 'text-gray-600' },
}
const STATUSES = ['EMPTY', 'OCCUPIED', 'BILL_PENDING', 'DIRTY']

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([])

  useEffect(() => { api.get('/tables').then(r => setTables(r.data)) }, [])

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/tables/${id}/status`, { status })
    setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    toast.success('Table updated')
  }

  const summary = (status: string) => tables.filter(t => t.status === status).length

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Table2 size={20} className="text-orange-500" />
        <h1 className="text-xl font-bold text-gray-900">Table Status</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {STATUSES.map(s => {
          const { label, bg, text } = STATUS_CONFIG[s]
          return (
            <div key={s} className={`${bg} rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-bold ${text}`}>{summary(s)}</div>
              <div className={`text-xs ${text} mt-0.5`}>{label}</div>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {tables.map(table => {
          const { label, bg, text } = STATUS_CONFIG[table.status]
          return (
            <div key={table.id} className={`${bg} rounded-xl p-4 border-2 ${table.status === 'OCCUPIED' ? 'border-red-200' : table.status === 'BILL_PENDING' ? 'border-yellow-200' : 'border-transparent'}`}>
              <div className={`font-bold text-lg ${text}`}>T{table.tableNumber}</div>
              <div className="text-xs text-gray-500 mb-3">{table.capacity} seats</div>
              <div className={`text-xs font-medium ${text} mb-3`}>{label}</div>
              <select value={table.status} onChange={e => updateStatus(table.id, e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400">
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
          )
        })}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Table2 size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No tables yet. Add tables via API or seed.</p>
        </div>
      )}
    </div>
  )
}
