'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UtensilsCrossed, ArrowLeft } from 'lucide-react'
import api from '@/lib/api'

interface MenuItem { id: string; name: string; description?: string; price: number; prepTimeMins: number; imageUrl?: string; isAvailable: boolean }
interface Category { id: string; name: string; items: MenuItem[] }

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [active, setActive] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/menu/categories').then(r => {
      setCategories(r.data)
      if (r.data[0]) setActive(r.data[0].id)
    }).finally(() => setLoading(false))
  }, [])

  const currentCat = categories.find(c => c.id === active)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></Link>
          <UtensilsCrossed size={18} className="text-orange-500" />
          <span className="font-semibold">Our Menu</span>
          <span className="ml-auto text-xs text-gray-400">All prices include 5% VAT</span>
        </div>
        {/* Category tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {categories.map(c => (
            <button key={c.id} onClick={() => setActive(c.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${active === c.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading && <div className="text-center text-gray-400 py-20">Loading menu...</div>}
        {currentCat && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-4">{currentCat.name}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {currentCat.items.map(item => (
                <div key={item.id} className={`bg-white rounded-xl border p-4 flex justify-between gap-3 ${!item.isAvailable ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-orange-600 font-bold text-sm">AED {Number(item.price).toFixed(2)}</span>
                      <span className="text-gray-400 text-xs">~{item.prepTimeMins} min</span>
                      {!item.isAvailable && <span className="text-red-400 text-xs">Unavailable</span>}
                    </div>
                  </div>
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
