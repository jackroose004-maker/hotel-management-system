'use client'
import { useEffect, useState } from 'react'
import { Plus, ToggleLeft, ToggleRight, Pencil, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface MenuItem { id: string; name: string; price: number; isAvailable: boolean; prepTimeMins: number; description?: string }
interface Category { id: string; name: string; items: MenuItem[] }

const BLANK = { name: '', description: '', price: '', prepTimeMins: '15', categoryId: '' }

export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [active, setActive] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/menu/categories').then(r => {
    setCategories(r.data)
    if (!active && r.data[0]) setActive(r.data[0].id)
  })

  useEffect(() => { load() }, [])

  const toggle = async (id: string, isAvailable: boolean) => {
    await api.patch(`/menu/items/${id}/toggle`)
    setCategories(prev => prev.map(c => ({
      ...c, items: c.items.map(i => i.id === id ? { ...i, isAvailable: !isAvailable } : i)
    })))
    toast.success(isAvailable ? 'Marked unavailable' : 'Marked available')
  }

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/menu/items', {
        ...form, price: parseFloat(form.price), prepTimeMins: parseInt(form.prepTimeMins), categoryId: form.categoryId || active,
      })
      toast.success('Item added!')
      setShowForm(false)
      setForm(BLANK)
      load()
    } catch { toast.error('Failed to add item') }
    finally { setSaving(false) }
  }

  const currentCat = categories.find(c => c.id === active)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900">Menu Management</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600">
          <Plus size={16} /> Add Item
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={addItem} className="bg-white border rounded-xl p-5 mb-6 grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 text-sm font-semibold text-gray-700">New Menu Item</div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Category</label>
            <select value={form.categoryId || active} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Item Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="e.g. Chicken Biryani" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Price (AED) *</label>
            <input required type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Prep Time (mins)</label>
            <input type="number" value={form.prepTimeMins} onChange={e => setForm(f => ({ ...f, prepTimeMins: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="Optional description" />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <button type="submit" disabled={saving} className="bg-orange-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Item'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border text-gray-600 px-5 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {categories.map(c => (
          <button key={c.id} onClick={() => setActive(c.id)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${active === c.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
            {c.name} <span className="ml-1 text-xs opacity-60">({c.items.length})</span>
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {currentCat?.items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3.5 border-b last:border-b-0 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-sm ${!item.isAvailable ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">AED {Number(item.price).toFixed(2)} · ~{item.prepTimeMins} min</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full ${item.isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                {item.isAvailable ? 'Available' : 'Unavailable'}
              </span>
              <button onClick={() => toggle(item.id, item.isAvailable)} title="Toggle availability">
                {item.isAvailable
                  ? <ToggleRight size={22} className="text-green-500 hover:text-green-600" />
                  : <ToggleLeft size={22} className="text-gray-300 hover:text-gray-500" />}
              </button>
            </div>
          </div>
        ))}
        {currentCat?.items.length === 0 && (
          <div className="text-center py-12 text-gray-300 text-sm">No items in this category yet</div>
        )}
      </div>
    </div>
  )
}
