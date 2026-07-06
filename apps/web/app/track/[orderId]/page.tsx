'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Clock, CheckCircle, BellRing, PackageCheck, ChefHat,
  ArrowLeft, ArrowRight, Loader2, AlertCircle, UtensilsCrossed,
} from 'lucide-react'
import { useLangStore, applyLangDir, t } from '@/store/lang'
import { initBrand, useBrandStore } from '@/store/brand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

const STEPS_DINE_IN = [
  { labelKey: 'menu.received',  emoji: '📋' },
  { labelKey: 'menu.confirmed', emoji: '✅' },
  { labelKey: 'menu.preparing', emoji: '👨‍🍳' },
  { labelKey: 'menu.ready',     emoji: '🔔' },
]
const STEPS_TAKEAWAY = [
  { labelKey: 'menu.received',  emoji: '📋' },
  { labelKey: 'menu.confirmed', emoji: '✅' },
  { labelKey: 'menu.preparing', emoji: '👨‍🍳' },
  { labelKey: 'menu.ready',     emoji: '📦' },
]

type OrderItem = { quantity: number; unitPrice: string; menuItem: { name: string; nameAr?: string } }
type Order = {
  id: string; status: string; type: string; total: string; paymentStatus: string
  createdAt: string; tokenNumber?: number | null
  table?: { name: string | null; tableNumber: number } | null
  items: OrderItem[]
}

const DINE_IN_SUB: Record<string, { en: string; ar: string }> = {
  PENDING:   { en: 'Awaiting kitchen approval',         ar: 'في انتظار موافقة المطبخ' },
  ACCEPTED:  { en: 'In the kitchen queue',              ar: 'في قائمة انتظار المطبخ' },
  PREPARING: { en: 'Our chef is on it!',                ar: 'طاهينا يعمل عليه الآن!' },
  READY:     { en: 'Your waiter is bringing it now 🔔', ar: 'النادل في طريقه إليك الآن 🔔' },
  DELIVERED: { en: 'Thank you for dining with us',      ar: 'شكراً لتناولك الطعام معنا' },
  CANCELLED: { en: 'Please speak to a staff member',   ar: 'يرجى التواصل مع أحد الموظفين' },
}
const TAKEAWAY_SUB: Record<string, { en: string; ar: string }> = {
  PENDING:   { en: 'We got your order',                 ar: 'وصلنا طلبك' },
  ACCEPTED:  { en: 'Getting started in the kitchen',    ar: 'بدأنا في المطبخ' },
  PREPARING: { en: 'Cooking your order now!',           ar: 'طلبك يُحضَّر الآن!' },
  READY:     { en: 'Come collect at the counter 📦',    ar: 'تعال استلم من الكاونتر 📦' },
  DELIVERED: { en: 'Enjoy!',                            ar: 'بالهناء والشفاء!' },
  CANCELLED: { en: 'Please speak to a staff member',   ar: 'يرجى التواصل مع أحد الموظفين' },
}

function ForceDark() {
  useEffect(() => { document.documentElement.classList.add('dark') }, [])
  return null
}

export default function TrackOrderPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { lang, setLang } = useLangStore()
  const [mounted, setMounted] = useState(false)
  const ar = mounted && lang === 'ar'
  const brandName   = useBrandStore(s => s.restaurantName)
  const brandNameAr = useBrandStore(s => s.restaurantNameAr)
  const logoUrl     = useBrandStore(s => s.logoUrl)

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`${API}/orders/${orderId}`)
      if (!res.ok) { setError('Order not found'); setLoading(false); return }
      const data = await res.json()
      setOrder(data?.data ?? data)
    } catch { setError('Could not load order') }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    setMounted(true)
    applyLangDir(lang)
    initBrand()
    fetchOrder()
  }, [lang, fetchOrder])

  // Poll every 10s while order is active
  useEffect(() => {
    if (!order || ['DELIVERED', 'CANCELLED'].includes(order.status)) return
    const id = setInterval(fetchOrder, 10_000)
    return () => clearInterval(id)
  }, [order, fetchOrder])

  const isTakeaway = order?.type === 'TAKEAWAY'
  const steps      = isTakeaway ? STEPS_TAKEAWAY : STEPS_DINE_IN
  const stepIdx    = order ? (STATUS_STEP[order.status] ?? 0) : 0
  const subMap     = isTakeaway ? TAKEAWAY_SUB : DINE_IN_SUB
  const sub        = order ? (ar ? subMap[order.status]?.ar : subMap[order.status]?.en) : ''
  const isCancelled = order?.status === 'CANCELLED'
  const isDone      = order?.status === 'DELIVERED'

  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: '#080808' }}><ForceDark /></div>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808', color: '#ededed' }}>
      <ForceDark />

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14"
        style={{ backgroundColor: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div dir="ltr" className="flex items-center gap-3 w-full">
          {ar
            ? <>
                <button onClick={() => setLang('en')} className="text-[10px] font-bold px-2.5 py-1 rounded-full ml-auto flex-shrink-0"
                  style={{ backgroundColor: '#1a1a1a', color: 'var(--brand)', border: '1px solid #2a2a2a' }}>EN</button>
                <div className="flex-1 min-w-0 text-right">
                  <div className="font-black text-sm text-white leading-none">{brandNameAr || brandName}</div>
                  <div className="text-[9px] tracking-widest uppercase truncate" style={{ color: 'var(--brand)' }}>
                    {t(lang, 'menu.trackOrder')}
                  </div>
                </div>
                {logoUrl && <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />}
                <Link href="/menu" className="text-gray-600 hover:text-white flex-shrink-0"><ArrowRight size={18} /></Link>
              </>
            : <>
                <Link href="/menu" className="text-gray-600 hover:text-white flex-shrink-0"><ArrowLeft size={18} /></Link>
                {logoUrl && <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm text-white leading-none">{brandName}</div>
                  <div className="text-[9px] tracking-widest uppercase truncate" style={{ color: 'var(--brand)' }}>
                    {t(lang, 'menu.trackOrder')}
                  </div>
                </div>
                <button onClick={() => setLang('ar')} className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#1a1a1a', color: '#555', border: '1px solid #2a2a2a' }}>ع</button>
              </>
          }
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-8">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
            <p className="text-sm text-gray-500">{ar ? 'جارٍ تحميل الطلب…' : 'Loading your order…'}</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <AlertCircle size={40} style={{ color: 'var(--brand)' }} />
            <p className="text-white font-bold">{ar ? 'الطلب غير موجود' : 'Order not found'}</p>
            <p className="text-sm text-gray-500">{ar ? 'تحقق من الرابط أو تواصل مع الموظف' : 'Check the link or speak to a staff member'}</p>
            <Link href="/menu" className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              {ar ? 'العودة للقائمة' : 'Back to Menu'}
            </Link>
          </div>
        )}

        {/* Order */}
        {!loading && order && (
          <div className="space-y-5 animate-[fadeUp_0.4s_ease_forwards]">

            {/* Order ID + table */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide">
                  {order.tokenNumber ? `#${order.tokenNumber}` : `#${order.id.slice(0, 8).toUpperCase()}`}
                </p>
                <p className="text-lg font-black text-white">
                  {isTakeaway
                    ? (ar ? 'تيك أواي' : 'Takeaway')
                    : order.table
                      ? (ar ? `طاولة ${order.table.name ?? order.table.tableNumber}` : `Table ${order.table.name ?? order.table.tableNumber}`)
                      : (ar ? 'تناول في المطعم' : 'Dine In')}
                </p>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${isCancelled ? 'text-red-400' : 'text-black'}`}
                style={{ backgroundColor: isCancelled ? 'rgba(239,68,68,0.15)' : isDone ? 'rgba(74,222,128,0.9)' : 'var(--brand)' }}>
                {isCancelled ? (ar ? 'ملغى' : 'Cancelled') : isDone ? (ar ? 'تم التوصيل' : 'Delivered') : (ar ? 'نشط' : 'Active')}
              </div>
            </div>

            {/* Progress steps */}
            {!isCancelled && (
              <div className="rounded-2xl p-5" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
                <div className="flex items-start justify-between mb-4">
                  {steps.map((step, i) => {
                    const done   = i <= stepIdx
                    const active = i === stepIdx
                    return (
                      <div key={step.labelKey} className="relative flex flex-col items-center gap-1.5 flex-1">
                        {i < steps.length - 1 && (
                          <div className="absolute top-4 left-1/2 w-full h-0.5 -translate-y-1/2"
                            style={{ backgroundColor: i < stepIdx ? 'var(--brand)' : '#2a2a2a' }} />
                        )}
                        <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
                          style={{
                            backgroundColor: active ? 'var(--brand)' : done ? 'rgba(var(--brand-rgb),0.2)' : '#1a1a1a',
                            border: `2px solid ${done ? 'var(--brand)' : '#2a2a2a'}`,
                            boxShadow: active ? '0 0 14px rgba(var(--brand-rgb),0.5)' : 'none',
                          }}>
                          {step.emoji}
                        </div>
                        <span className="text-[9px] text-center leading-tight"
                          style={{ color: active ? 'var(--brand)' : done ? '#aaa' : '#555' }}>
                          {t(lang, step.labelKey)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {sub && (
                  <p className="text-sm text-center font-semibold mt-2" style={{ color: 'var(--brand)' }}>{sub}</p>
                )}
              </div>
            )}

            {/* Items */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 text-sm"
                  style={i > 0 ? { borderTop: '1px solid #1e1e1e' } : {}}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-bold">{item.quantity}×</span>
                    <span className="text-white">
                      {ar && (item.menuItem as any).nameAr ? (item.menuItem as any).nameAr : item.menuItem.name}
                    </span>
                  </div>
                  <span className="text-gray-400 font-semibold">
                    AED {(Number(item.unitPrice) * 1.05 * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3" style={{ borderTop: '1px solid #1e1e1e', backgroundColor: '#0d0d0d' }}>
                <span className="font-black text-white text-sm">{ar ? 'الإجمالي' : 'Total'}</span>
                <span className="font-black text-base" style={{ color: 'var(--brand)' }}>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
              <div className="flex items-center gap-2 text-sm">
                <UtensilsCrossed size={14} style={{ color: 'var(--brand)' }} />
                <span className="text-gray-400">{ar ? 'الدفع' : 'Payment'}</span>
              </div>
              <span className={`text-sm font-bold ${order.paymentStatus === 'PAID' ? 'text-green-400' : ''}`}
                style={order.paymentStatus !== 'PAID' ? { color: 'var(--brand)' } : {}}>
                {order.paymentStatus === 'PAID'
                  ? (ar ? '✓ مدفوع' : '✓ Paid')
                  : (ar ? '💵 عند المغادرة' : '💵 Pay on exit')}
              </span>
            </div>

            {/* Back to menu */}
            {!isDone && !isCancelled && (
              <Link href="/menu"
                className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.3)' }}>
                {ar ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                {ar ? 'إضافة المزيد من الطلبات' : 'Add more items'}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
