'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList, CheckCircle2, ChefHat, BellRing, PackageCheck,
  ArrowLeft, ArrowRight, Loader2, AlertCircle, Banknote, CreditCard,
  Star, XCircle, Clock, Plus,
} from 'lucide-react'
import { useLangStore, applyLangDir, t } from '@/store/lang'
import { initBrand, useBrandStore } from '@/store/brand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const STATUS_STEP: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 }

const STEP_ICONS_DINE   = [ClipboardList, CheckCircle2, ChefHat, BellRing]
const STEP_ICONS_TAKEAWAY = [ClipboardList, CheckCircle2, ChefHat, PackageCheck]

const STEPS_DINE_IN   = ['menu.received', 'menu.confirmed', 'menu.preparing', 'menu.ready']
const STEPS_TAKEAWAY  = ['menu.received', 'menu.confirmed', 'menu.preparing', 'menu.ready']

type OrderItem = { quantity: number; unitPrice: string; menuItem: { name: string; nameAr?: string } }
type Order = {
  id: string; status: string; type: string; total: string; paymentStatus: string
  createdAt: string; tokenNumber?: number | null
  table?: { name: string | null; tableNumber: number } | null
  items: OrderItem[]
}

const STATUS_HERO: Record<string, { en: string; ar: string; sub_en: string; sub_ar: string }> = {
  PENDING:   { en: 'Order received',        ar: 'تم استلام طلبك',        sub_en: 'Waiting for kitchen to confirm',        sub_ar: 'في انتظار تأكيد المطبخ' },
  ACCEPTED:  { en: 'Confirmed!',            ar: 'تم التأكيد!',            sub_en: "You're in the queue — won't be long",   sub_ar: 'أنت في الطابور — لن يطول الانتظار' },
  PREPARING: { en: 'Being prepared',        ar: 'يُحضَّر الآن',           sub_en: 'Our chef is working on your order',     sub_ar: 'طاهينا يعمل على طلبك الآن' },
  READY:     { en: "It's ready!",           ar: 'جاهز!',                  sub_en: '',                                      sub_ar: '' },
  DELIVERED: { en: 'Enjoy your meal!',       ar: 'بالهناء والشفاء!',      sub_en: 'Thank you for dining with us',          sub_ar: 'شكراً لتناولك الطعام معنا' },
  CANCELLED: { en: 'Order cancelled',        ar: 'تم إلغاء الطلب',        sub_en: 'Please speak to a staff member',        sub_ar: 'يرجى التواصل مع أحد الموظفين' },
}
const READY_SUB: Record<string, { en: string; ar: string }> = {
  DINE_IN:  { en: 'Your waiter is bringing it to your table now', ar: 'النادل في طريقه إلى طاولتك الآن' },
  TAKEAWAY: { en: 'Come collect at the counter',                   ar: 'تعال استلم طلبك من الكاونتر' },
}

function ForceDark() {
  useEffect(() => { document.documentElement.classList.add('dark') }, [])
  return null
}

function useElapsed(createdAt: string | undefined) {
  const [mins, setMins] = useState(0)
  useEffect(() => {
    if (!createdAt) return
    const update = () => setMins(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [createdAt])
  return mins
}

export default function TrackOrderPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { lang, setLang } = useLangStore()
  const [mounted, setMounted] = useState(false)
  const ar = mounted && lang === 'ar'
  const brandName   = useBrandStore(s => s.restaurantName)
  const brandNameAr = useBrandStore(s => s.restaurantNameAr)
  const logoUrl     = useBrandStore(s => s.logoUrl)

  const [order, setOrder]   = useState<Order | null>(null)
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

  useEffect(() => {
    if (!order || ['DELIVERED', 'CANCELLED'].includes(order.status)) return
    const id = setInterval(fetchOrder, 10_000)
    return () => clearInterval(id)
  }, [order, fetchOrder])

  const elapsed     = useElapsed(order?.createdAt)
  const isTakeaway  = order?.type === 'TAKEAWAY'
  const stepIcons   = isTakeaway ? STEP_ICONS_TAKEAWAY : STEP_ICONS_DINE
  const stepKeys    = isTakeaway ? STEPS_TAKEAWAY : STEPS_DINE_IN
  const stepIdx     = order ? (STATUS_STEP[order.status] ?? 0) : 0
  const isReady     = order?.status === 'READY'
  const isDone      = order?.status === 'DELIVERED'
  const isCancelled = order?.status === 'CANCELLED'
  const isActive    = !isDone && !isCancelled
  const hero        = order ? STATUS_HERO[order.status] : null
  const readySub    = isTakeaway ? READY_SUB.TAKEAWAY : READY_SUB.DINE_IN

  if (!mounted) return <div style={{ minHeight: '100vh', backgroundColor: '#080808' }}><ForceDark /></div>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#080808', color: '#ededed' }}>
      <ForceDark />

      {/* Header */}
      <div className="sticky top-0 z-10 h-14 px-4"
        style={{ backgroundColor: 'rgba(8,8,8,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div dir="ltr" className="flex items-center gap-3 h-full w-full">
          {ar ? (
            <>
              <button onClick={() => setLang('en')} className="text-[10px] font-bold px-2.5 py-1 rounded-full ml-auto flex-shrink-0"
                style={{ backgroundColor: '#141414', color: 'var(--brand)', border: '1px solid #222' }}>EN</button>
              <div className="flex-1 min-w-0 text-right">
                <div className="font-black text-sm text-white leading-none">{brandNameAr || brandName}</div>
              </div>
              {logoUrl
                ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
              }
              <Link href="/menu" className="text-gray-600 hover:text-white flex-shrink-0"><ArrowRight size={18} /></Link>
            </>
          ) : (
            <>
              <Link href="/menu" className="text-gray-600 hover:text-white flex-shrink-0"><ArrowLeft size={18} /></Link>
              {logoUrl
                ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
              }
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm text-white leading-none">{brandName}</div>
              </div>
              <button onClick={() => setLang('ar')} className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#141414', color: '#666', border: '1px solid #222' }}>ع</button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pb-12">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-24">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
            <p className="text-sm text-gray-500">{ar ? 'جارٍ تحميل الطلب…' : 'Loading your order…'}</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <AlertCircle size={40} style={{ color: 'var(--brand)' }} />
            <p className="text-white font-bold text-lg">{ar ? 'الطلب غير موجود' : 'Order not found'}</p>
            <p className="text-sm text-gray-500">{ar ? 'تحقق من الرابط أو تواصل مع الموظف' : 'Check the link or speak to a staff member'}</p>
            <Link href="/menu" className="mt-4 px-6 py-3 rounded-2xl text-sm font-bold"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              {ar ? 'العودة للقائمة' : 'Back to Menu'}
            </Link>
          </div>
        )}

        {/* ── Order ── */}
        {!loading && order && (
          <div className="space-y-4 animate-[fadeUp_0.4s_ease_forwards]">

            {/* ── READY hero banner ── */}
            {isReady && (
              <div className="rounded-3xl p-6 text-center mt-6"
                style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(52,211,153,0.06))', border: '1px solid rgba(52,211,153,0.25)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"
                  style={{ backgroundColor: 'rgba(52,211,153,0.15)', border: '2px solid rgba(52,211,153,0.4)' }}>
                  {isTakeaway
                    ? <PackageCheck size={28} style={{ color: '#34d399' }} />
                    : <BellRing size={28} style={{ color: '#34d399' }} />
                  }
                </div>
                <p className="text-2xl font-black text-white mb-1">{ar ? hero?.ar : hero?.en}</p>
                <p className="text-sm font-semibold" style={{ color: '#34d399' }}>
                  {ar ? readySub.ar : readySub.en}
                </p>
              </div>
            )}

            {/* ── Delivered hero ── */}
            {isDone && (
              <div className="rounded-3xl p-6 text-center mt-6"
                style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.10), rgba(var(--brand-rgb),0.04))', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', border: '2px solid rgba(var(--brand-rgb),0.3)' }}>
                  <Star size={28} style={{ color: 'var(--brand)' }} />
                </div>
                <p className="text-2xl font-black text-white mb-1">{ar ? hero?.ar : hero?.en}</p>
                <p className="text-sm text-gray-400">{ar ? hero?.sub_ar : hero?.sub_en}</p>
              </div>
            )}

            {/* ── Cancelled ── */}
            {isCancelled && (
              <div className="rounded-3xl p-6 text-center mt-6"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.25)' }}>
                  <XCircle size={28} className="text-red-400" />
                </div>
                <p className="text-xl font-black text-white mb-1">{ar ? hero?.ar : hero?.en}</p>
                <p className="text-sm text-gray-400">{ar ? hero?.sub_ar : hero?.sub_en}</p>
              </div>
            )}

            {/* ── Active status hero (non-ready) ── */}
            {isActive && !isReady && (
              <div className="rounded-3xl p-6 mt-4" style={{ backgroundColor: '#111', border: '1px solid #1e1e1e' }}>
                {/* Order ref + elapsed */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-0.5">
                      {order.tokenNumber ? `Token #${order.tokenNumber}` : `Order #${order.id.slice(0, 6).toUpperCase()}`}
                    </p>
                    <p className="font-black text-white text-base">
                      {isTakeaway
                        ? (ar ? 'تيك أواي' : 'Takeaway')
                        : order.table
                          ? (ar ? `طاولة ${order.table.name ?? order.table.tableNumber}` : `Table ${order.table.name ?? order.table.tableNumber}`)
                          : (ar ? 'تناول في المطعم' : 'Dine In')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                    <Clock size={11} style={{ color: 'var(--brand)' }} />
                    <span className="text-[11px] font-bold" style={{ color: 'var(--brand)' }}>
                      {elapsed < 1 ? (ar ? 'الآن' : 'just now') : `${elapsed} ${ar ? 'د' : 'min'}`}
                    </span>
                  </div>
                </div>

                {/* Progress stepper */}
                <div className="flex items-start">
                  {stepKeys.map((key, i) => {
                    const Icon   = stepIcons[i]
                    const done   = i <= stepIdx
                    const active = i === stepIdx
                    return (
                      <div key={key} className="flex-1 flex flex-col items-center gap-2 relative">
                        {/* connector line */}
                        {i < stepKeys.length - 1 && (
                          <div className="absolute top-[18px] left-1/2 w-full h-px"
                            style={{ backgroundColor: i < stepIdx ? 'var(--brand)' : '#2a2a2a', transition: 'background-color 0.4s' }} />
                        )}
                        {/* icon bubble */}
                        <div className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
                          style={{
                            backgroundColor: active ? 'var(--brand)' : done ? 'rgba(var(--brand-rgb),0.18)' : '#1a1a1a',
                            border: `1.5px solid ${done ? 'var(--brand)' : '#2a2a2a'}`,
                            boxShadow: active ? '0 0 0 4px rgba(var(--brand-rgb),0.15)' : 'none',
                          }}>
                          <Icon size={15}
                            style={{ color: active ? '#000' : done ? 'var(--brand)' : '#555' }} />
                        </div>
                        {/* label */}
                        <span className="text-[9px] font-semibold text-center leading-tight px-0.5"
                          style={{ color: active ? 'var(--brand)' : done ? '#ccc' : '#444' }}>
                          {t(lang, key)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Status subtitle */}
                <p className="text-sm text-center font-semibold mt-5 pt-4"
                  style={{ borderTop: '1px solid #1e1e1e', color: 'var(--brand)' }}>
                  {ar ? hero?.sub_ar : hero?.sub_en}
                </p>
              </div>
            )}

            {/* ── Order items ── */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid #1e1e1e', backgroundColor: '#0d0d0d' }}>
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                  {ar ? 'طلبك' : 'Your order'} · {order.items.reduce((s, i) => s + i.quantity, 0)} {ar ? 'صنف' : 'items'}
                </span>
              </div>
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 text-sm"
                  style={i > 0 ? { borderTop: '1px solid #1a1a1a' } : {}}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-black text-xs px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)' }}>
                      ×{item.quantity}
                    </span>
                    <span className="text-white truncate">
                      {ar && (item.menuItem as any).nameAr ? (item.menuItem as any).nameAr : item.menuItem.name}
                    </span>
                  </div>
                  <span className="text-gray-500 font-medium text-xs flex-shrink-0 ml-2">
                    AED {(Number(item.unitPrice) * 1.05 * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3.5"
                style={{ borderTop: '1px solid #1e1e1e', backgroundColor: '#0d0d0d' }}>
                <span className="font-bold text-gray-400 text-sm">{ar ? 'الإجمالي شامل الضريبة' : 'Total incl. VAT'}</span>
                <span className="font-black text-lg" style={{ color: 'var(--brand)' }}>AED {Number(order.total).toFixed(2)}</span>
              </div>
            </div>

            {/* ── Payment status ── */}
            <div className="rounded-2xl px-4 py-3.5 flex items-center justify-between"
              style={
                order.paymentStatus === 'PAID'
                  ? { backgroundColor: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }
                  : { backgroundColor: '#111', border: '1px solid #1e1e1e' }
              }>
              <div className="flex items-center gap-2 text-sm">
                {order.paymentStatus === 'PAID'
                  ? <CreditCard size={15} style={{ color: '#34d399' }} />
                  : <Banknote size={15} style={{ color: 'var(--brand)' }} />
                }
                <span className="text-gray-400 text-sm">{ar ? 'الدفع' : 'Payment'}</span>
              </div>
              <span className="text-sm font-bold"
                style={{ color: order.paymentStatus === 'PAID' ? '#34d399' : 'var(--brand)' }}>
                {order.paymentStatus === 'PAID'
                  ? (ar ? '✓ تم الدفع' : '✓ Paid')
                  : (ar ? 'ادفع عند المغادرة' : 'Pay on exit')}
              </span>
            </div>

            {/* ── Add more items (active only) ── */}
            {isActive && (
              <Link href="/menu"
                className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                <Plus size={15} />
                {ar ? 'أضف المزيد من العناصر' : 'Add more items'}
              </Link>
            )}

            {/* ── Delivered: back to menu CTA ── */}
            {isDone && (
              <Link href="/menu"
                className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                {ar ? 'تصفح القائمة مرة أخرى' : 'Browse the menu again'}
              </Link>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
