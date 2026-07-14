'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Receipt, RefreshCw, Printer, CreditCard, Banknote, Clock,
  CheckCircle2, History, Users, ChevronDown, ChevronRight,
  Package, Phone, Loader2, BadgeCheck, ArrowRight, RotateCcw, AlertTriangle, AlertCircle,
  ExternalLink, Share2, ArrowLeftRight,
} from 'lucide-react'
import api from '@/lib/api'
import { notify } from '@/lib/notify'
import { useAuthStore } from '@/store/auth'
import { ModalBackdrop } from '@/components/ModalBackdrop'
import { useBrandStore } from '@/store/brand'
import { useShallow } from 'zustand/react/shallow'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TableRow { id: string; tableNumber: number; name: string | null; status: string; capacity: number }
interface BillOrder {
  id: string; status: string; paymentStatus: string; paymentMethod?: string; type?: string
  createdAt: string; subtotal: number; vatAmount: number; total: number
  user?: { name: string } | null
  items: { quantity: number; unitPrice: number; menuItem: { name: string }; modifiers?: { name: string; priceAdd: number }[] }[]
}
interface BillSummary { subtotal: number; vatAmount: number; discount?: number; tipAmount?: number; total: number; allPaid: boolean; anyUnpaid: boolean; orderCount: number; settledBy?: { name: string } | null; settledAt?: string | null }
interface Tab { sessionId: string; orders: BillOrder[]; summary: BillSummary }
interface ActiveTableEntry { table: TableRow; tabs: Tab[]; combined: BillSummary }
interface ClosedSession { table: TableRow; sessionId: string; orders: BillOrder[]; summary: BillSummary; closedAt: string }
interface TakeawayEntry {
  tokenNumber: number; contactPhone: string | null
  customer: { id: string; name: string } | null
  orders: BillOrder[]; summary: BillSummary; latestStatus: string; createdAt: string
}

function tabLabel(tab: Tab, idx: number) {
  const user = tab.orders.find(o => o.user)?.user
  return user ? user.name.split(' ')[0] : `Guest ${idx + 1}`
}

// ── Print helpers ─────────────────────────────────────────────────────────────
function buildReceiptHtml(
  title: string,
  rows: { name: string; qty: number; total: number }[],
  summary: BillSummary,
  brand: { name: string; tagline: string; vatNumber?: string },
  paidLabel?: string,
) {
  const now = new Date().toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })
  const vatLine = brand.vatNumber ? `TRN: ${brand.vatNumber}` : ''
  return `<!DOCTYPE html><html><head><title>Receipt – ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;max-width:360px;margin:32px auto;padding:24px;color:#111}
h1{font-size:22px;font-weight:800;color:#f97316}h2{font-size:13px;color:#666;margin-top:2px}
.meta{font-size:11px;color:#999;margin:16px 0 8px;padding-top:16px;border-top:1px solid #eee}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th{text-align:left;font-weight:600;color:#666;padding:4px 0;border-bottom:1px solid #eee}
td{padding:5px 0;border-bottom:1px solid #f5f5f5}td:last-child,th:last-child{text-align:right}
.totals td{padding:3px 0}.totals td:last-child{text-align:right}.totals tr:last-child{font-size:16px;font-weight:800}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-top:12px}
.paid{background:#dcfce7;color:#15803d}.unpaid{background:#fef9c3;color:#854d0e}
.footer{font-size:10px;color:#999;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
</style></head><body>
<h1>${brand.name}</h1><h2>${brand.tagline}</h2>
<p class="meta"><strong>${title}</strong> &nbsp;·&nbsp; ${now}<br>Receipt #${Date.now().toString(36).toUpperCase().slice(-8)}</p>
<table><tr><th>Item</th><th>Qty</th><th>AED</th></tr>
${rows.map(r => `<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.total.toFixed(2)}</td></tr>`).join('')}
</table>
<table class="totals" style="margin-top:16px">
<tr><td style="color:#666">Subtotal</td><td>AED ${Number(summary.subtotal).toFixed(2)}</td></tr>
<tr><td style="color:#666">VAT (5%)</td><td>AED ${Number(summary.vatAmount).toFixed(2)}</td></tr>
<tr><td style="padding-top:8px">Total</td><td style="padding-top:8px">AED ${Number(summary.total).toFixed(2)}</td></tr>
</table>
<div><span class="badge ${summary.allPaid ? 'paid' : 'unpaid'}">${paidLabel ?? (summary.allPaid ? '✓ PAID' : 'PAYMENT PENDING')}</span></div>
<p class="footer">Thank you for dining with us · شكراً لزيارتكم${vatLine ? `<br>${vatLine}` : ''}</p>
<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`
}

function openPrint(html: string) {
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(html); w.document.close()
}

// ── Totals row ────────────────────────────────────────────────────────────────
function TotalsBlock({ subtotal, vat, total, packing }: { subtotal: number; vat: number; total: number; packing?: number }) {
  return (
    <div className="space-y-0.5 pt-2 mt-2 border-t" style={{ borderColor: 'var(--card-border)' }}>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Subtotal</span><span>AED {subtotal.toFixed(2)}</span>
      </div>
      {(packing ?? 0) > 0 && (
        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>📦 Packing charge</span><span>AED {(packing ?? 0).toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>VAT (5%)</span><span>AED {vat.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm font-black pt-1" style={{ color: 'var(--text-primary)' }}>
        <span>Total</span><span>AED {total.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ── Refund / Void modal ───────────────────────────────────────────────────────
function RefundModal({ orderId, amount, onClose, onDone }: {
  orderId: string; amount: number; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const PRESETS = ['Wrong amount charged', 'Customer dissatisfied', 'Order mistake', 'Duplicate charge', 'Item not available']

  const confirm = async () => {
    if (!reason.trim()) return
    setBusy(true)
    try {
      await api.post(`/orders/${orderId}/refund`, { reason })
      onDone()
    } catch (e: any) {
      notify.error(e?.message ?? 'Refund failed — try again')
    } finally { setBusy(false) }
  }

  return (
    <ModalBackdrop onClick={onClose} className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid rgba(239,68,68,0.3)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
            <RotateCcw size={16} style={{ color: '#f87171' }} />
          </div>
          <div>
            <p className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>Void / Refund</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              AED {amount.toFixed(2)} · This marks the order as refunded and logs it.
              <br />For card payments, reverse the transaction on your POS terminal separately.
            </p>
          </div>
        </div>

        <div className="rounded-xl p-3 flex items-start gap-2"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <p className="text-xs" style={{ color: '#f59e0b' }}>
            This action is logged. Manager approval may be required depending on policy.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Reason</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setReason(p)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                style={reason === p
                  ? { backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171' }
                  : { backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                {p}
              </button>
            ))}
          </div>
          <input
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: 'var(--muted-bg)', border: `1px solid ${reason ? 'rgba(239,68,68,0.4)' : 'var(--card-border)'}`, color: 'var(--text-primary)' }}
            placeholder="Or type a custom reason…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <button
          onClick={confirm}
          disabled={!reason.trim() || busy}
          className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
          style={{ backgroundColor: '#ef4444', color: '#fff' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          {busy ? 'Processing…' : 'Confirm Refund'}
        </button>
        <button onClick={onClose}
          className="w-full py-2.5 rounded-2xl text-sm font-semibold"
          style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
          Cancel
        </button>
      </div>
    </ModalBackdrop>
  )
}

// ── Payment method picker modal ───────────────────────────────────────────────
const CASH_NOTES = [5, 10, 20, 50, 100, 200, 500]
const DISCOUNT_PRESETS_PCT = [5, 10, 15, 20, 25, 50]

interface SettleOpts { method: 'CASH' | 'CARD' | 'SPLIT'; discountAmount?: number; discountReason?: string; splitCashAmount?: number; tipAmount?: number }

function SettleModal({ amount, items, onConfirm, onClose, busy, isManager, error, splitPaymentEnabled, tipEnabled, discountEnabled }: {
  amount: number
  items: { name: string; qty: number; price: number }[]
  onConfirm: (opts: SettleOpts) => void
  onClose: () => void
  busy: boolean
  isManager: boolean
  error?: string
  splitPaymentEnabled?: boolean
  tipEnabled?: boolean
  discountEnabled?: boolean
}) {
  const [step, setStep] = useState<'review' | 'discount' | 'tip' | 'method' | 'cash' | 'card' | 'split'>('review')
  const [received, setReceived] = useState('')
  const [confirming, setConfirming] = useState<'CASH' | 'CARD' | 'SPLIT' | null>(null)

  // Discount state
  const [discountMode, setDiscountMode] = useState<'pct' | 'fixed'>('pct')
  const [discountInput, setDiscountInput] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const discountInputNum = parseFloat(discountInput) || 0
  const discountAmount = discountMode === 'pct'
    ? Math.round(amount * discountInputNum / 100 * 100) / 100
    : Math.min(discountInputNum, amount)
  const finalAmount = Math.max(0, amount - discountAmount)

  // Tip state
  const [tipInput, setTipInput] = useState('')
  const tipNum = parseFloat(tipInput) || 0
  const TIP_PRESETS_PCT = [5, 10, 15, 20]

  // Split payment state
  const [splitCash, setSplitCash] = useState('')
  const splitCashNum = parseFloat(splitCash) || 0
  const splitCard = Math.max(0, finalAmount - splitCashNum)
  const splitValid = splitCashNum > 0 && splitCashNum <= finalAmount

  // Cash step uses finalAmount + tip
  const receivedNum = parseFloat(received) || 0
  const cashTarget = finalAmount + tipNum
  const change = receivedNum - cashTarget
  const changeValid = receivedNum >= cashTarget

  const confirm = (method: 'CASH' | 'CARD' | 'SPLIT', extraCash?: number) => {
    setConfirming(method)
    onConfirm({
      method,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      discountReason: discountAmount > 0 && discountReason ? discountReason : undefined,
      splitCashAmount: method === 'SPLIT' ? extraCash : undefined,
      tipAmount: tipNum > 0 ? tipNum : undefined,
    })
  }

  const AmountDisplay = ({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) => (
    <div className="flex justify-between items-center px-3 py-2" style={{ backgroundColor: highlight ? 'rgba(var(--brand-rgb),0.08)' : 'var(--muted-bg)', borderRadius: 10 }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={`font-black tabular-nums ${highlight ? 'text-lg' : 'text-sm'}`} style={{ color: 'var(--text-primary)' }}>AED {value.toFixed(2)}</span>
    </div>
  )

  return (
    <ModalBackdrop onClick={onClose} style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Review ── */}
        {step === 'review' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Review Bill</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                Verify before settling
              </span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
              <div className="divide-y divide-[var(--card-border)]">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      <span className="font-black text-xs mr-1.5" style={{ color: 'var(--brand)' }}>{item.qty}×</span>
                      {item.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      AED {item.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-3 py-2.5" style={{ backgroundColor: 'var(--muted-bg)', borderTop: '1px solid var(--card-border)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
                <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>AED {amount.toFixed(2)}</span>
              </div>
            </div>
            {isManager && (discountEnabled ?? true) && (
              <button onClick={() => setStep('discount')}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ border: '1px solid rgba(var(--brand-rgb),0.35)', color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.06)' }}>
                % Apply Discount
              </button>
            )}
            {(tipEnabled ?? true) && (
              <button onClick={() => setStep('tip')}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ border: `1px solid ${tipNum > 0 ? 'var(--c-success-fg)' : 'var(--card-border)'}`, color: tipNum > 0 ? 'var(--c-success-fg)' : 'var(--text-muted)', backgroundColor: tipNum > 0 ? 'rgba(22,163,74,0.06)' : 'transparent' }}>
                {tipNum > 0 ? `✓ Tip: AED ${tipNum.toFixed(2)}` : '☕ Add Tip (Gratuity)'}
              </button>
            )}
            <button onClick={() => setStep('method')}
              className="w-full py-3.5 rounded-2xl font-black text-sm"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              ✓ Looks Good — Choose Payment
            </button>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-sm font-semibold"
              style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
              Go Back
            </button>
          </>
        )}

        {/* ── Discount ── */}
        {step === 'discount' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('review')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Apply Discount</h2>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-xl p-1" style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
              {(['pct', 'fixed'] as const).map(m => (
                <button key={m} onClick={() => { setDiscountMode(m); setDiscountInput('') }}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                  style={discountMode === m
                    ? { background: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                    : { color: 'var(--text-muted)' }}>
                  {m === 'pct' ? '% Percentage' : 'AED Fixed'}
                </button>
              ))}
            </div>

            {discountMode === 'pct' && (
              <div className="flex flex-wrap gap-1.5">
                {DISCOUNT_PRESETS_PCT.map(p => (
                  <button key={p} onClick={() => setDiscountInput(String(p))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={discountInputNum === p
                      ? { background: 'var(--brand)', color: '#000' }
                      : { background: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
                    {p}%
                  </button>
                ))}
              </div>
            )}

            <input type="number" inputMode="decimal" autoFocus
              placeholder={discountMode === 'pct' ? 'Enter % (e.g. 10)' : 'Enter AED amount'}
              value={discountInput} onChange={e => setDiscountInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-base font-bold outline-none"
              style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />

            <input type="text" placeholder="Reason (e.g. Cold dish, Loyalty, Staff)"
              value={discountReason} onChange={e => setDiscountReason(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />

            {discountAmount > 0 && (
              <div className="space-y-1.5">
                <AmountDisplay label="Original total" value={amount} />
                <AmountDisplay label={`Discount (${discountMode === 'pct' ? `${discountInputNum}%` : 'fixed'})`} value={-discountAmount} />
                <AmountDisplay label="Guest pays" value={finalAmount} highlight />
              </div>
            )}

            <button onClick={() => setStep('method')} disabled={discountAmount <= 0 && !!discountInput}
              className="w-full py-3.5 rounded-2xl font-black text-sm"
              style={{ backgroundColor: 'var(--brand)', color: '#000', opacity: !discountInput || discountAmount > 0 ? 1 : 0.4 }}>
              {discountAmount > 0 ? `Apply −AED ${discountAmount.toFixed(2)} → Choose Payment` : 'Skip — Choose Payment'}
            </button>
          </>
        )}

        {/* ── Tip ── */}
        {step === 'tip' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('review')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Add Tip</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Bill total: <strong style={{ color: 'var(--text-primary)' }}>AED {finalAmount.toFixed(2)}</strong>
            </p>
            {/* Percentage quick-picks */}
            <div className="flex gap-1.5">
              {TIP_PRESETS_PCT.map(p => {
                const val = Math.round(finalAmount * p / 100 * 100) / 100
                const selected = tipInput === String(val)
                return (
                  <button key={p} onClick={() => setTipInput(selected ? '' : String(val))}
                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={selected
                      ? { backgroundColor: 'var(--brand)', color: '#000' }
                      : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
                    {p}%
                    <div className="text-[9px] mt-0.5 opacity-70">{val.toFixed(0)}</div>
                  </button>
                )
              })}
            </div>
            <input type="number" inputMode="decimal" autoFocus
              placeholder="Custom amount (AED)"
              value={tipInput} onChange={e => setTipInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-base font-bold outline-none"
              style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
            {tipNum > 0 && (
              <div className="rounded-xl px-4 py-3 flex justify-between items-center"
                style={{ backgroundColor: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)' }}>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Guest pays (incl. tip)</span>
                <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>AED {(finalAmount + tipNum).toFixed(2)}</span>
              </div>
            )}
            <button onClick={() => setStep('method')}
              className="w-full py-3.5 rounded-2xl font-black text-sm"
              style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
              {tipNum > 0 ? `Add AED ${tipNum.toFixed(2)} tip → Choose Payment` : 'No tip — Choose Payment'}
            </button>
          </>
        )}

        {/* ── Method ── */}
        {step === 'method' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('review')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <div>
                <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>How did they pay?</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {discountAmount > 0
                    ? <><s className="opacity-50">AED {amount.toFixed(2)}</s> → <strong style={{ color: 'var(--text-primary)' }}>AED {finalAmount.toFixed(2)}</strong></>
                    : <>Bill total: <strong style={{ color: 'var(--text-primary)' }}>AED {finalAmount.toFixed(2)}</strong></>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('cash')} disabled={!!confirming}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: 'var(--c-success-fg)', backgroundColor: 'rgba(22,163,74,0.08)' }}>
                <Banknote size={22} style={{ color: 'var(--c-success-fg)' }} />
                <div className="text-center">
                  <p className="text-sm font-black" style={{ color: 'var(--c-success-fg)' }}>Cash</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Physical notes</p>
                </div>
              </button>
              <button onClick={() => setStep('card')} disabled={!!confirming}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: 'var(--c-info-fg)', backgroundColor: 'rgba(59,130,246,0.08)' }}>
                <CreditCard size={22} style={{ color: 'var(--c-info-fg)' }} />
                <div className="text-center">
                  <p className="text-sm font-black" style={{ color: 'var(--c-info-fg)' }}>Card · Tap</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Online · Transfer</p>
                </div>
              </button>
            </div>

            {(splitPaymentEnabled ?? true) && (
              <button onClick={() => { setSplitCash(''); setStep('split') }} disabled={!!confirming}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-black transition-all hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>
                <Banknote size={14} />+<CreditCard size={14} /> Split Payment
              </button>
            )}
          </>
        )}

        {/* ── Card ── */}
        {step === 'card' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('method')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Card Payment</h2>
            </div>
            <div className="rounded-2xl p-5 text-center space-y-2"
              style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <CreditCard size={32} className="mx-auto" style={{ color: 'var(--c-info-fg)' }} />
              <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>AED {finalAmount.toFixed(2)}</p>
              {discountAmount > 0 && <p className="text-xs" style={{ color: 'var(--c-success-fg)' }}>−AED {discountAmount.toFixed(2)} discount applied</p>}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Tap card / QR on POS. Confirm <strong>after terminal shows Approved</strong>.
              </p>
            </div>
            <button onClick={() => confirm('CARD')} disabled={!!confirming}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: 'var(--c-info-fg)', color: '#fff' }}>
              {confirming === 'CARD' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {confirming === 'CARD' ? 'Recording…' : 'Terminal approved — Confirm'}
            </button>
            <button onClick={() => setStep('method')} className="w-full py-2.5 rounded-2xl text-sm font-semibold"
              style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>Cancel</button>
          </>
        )}

        {/* ── Cash ── */}
        {step === 'cash' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('method')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Cash Collection</h2>
            </div>
            <AmountDisplay label="Bill Total" value={finalAmount} highlight />
            {discountAmount > 0 && <p className="text-xs text-center" style={{ color: 'var(--c-success-fg)' }}>Discount −AED {discountAmount.toFixed(2)} already applied</p>}
            {tipNum > 0 && <p className="text-xs text-center" style={{ color: 'var(--brand)' }}>Tip included: +AED {tipNum.toFixed(2)}</p>}
            <div>
              <p className="text-[10px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Amount received (incl. tip)</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CASH_NOTES.filter(n => n >= cashTarget || n === Math.ceil(cashTarget / 10) * 10).slice(0, 6).map(n => (
                  <button key={n} onClick={() => setReceived(String(n))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={Number(received) === n
                      ? { backgroundColor: 'var(--brand)', color: '#000' }
                      : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
                    {n}
                  </button>
                ))}
              </div>
              <input type="number" inputMode="decimal"
                placeholder={`Enter amount (min ${cashTarget.toFixed(2)})`}
                value={received} onChange={e => setReceived(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-base font-bold outline-none"
                style={{ backgroundColor: 'var(--muted-bg)', border: `2px solid ${changeValid && received ? 'var(--c-success-fg)' : 'var(--card-border)'}`, color: 'var(--text-primary)' }} />
            </div>
            {received && (
              <div className="rounded-xl px-4 py-3 flex justify-between items-center"
                style={{ backgroundColor: changeValid ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${changeValid ? 'var(--c-success-bdr)' : 'rgba(239,68,68,0.3)'}` }}>
                <span className="text-sm font-semibold" style={{ color: changeValid ? 'var(--c-success-fg)' : '#f87171' }}>
                  {changeValid ? 'Change to return' : 'Not enough'}
                </span>
                <span className="text-xl font-black" style={{ color: changeValid ? 'var(--c-success-fg)' : '#f87171' }}>
                  {changeValid ? `AED ${change.toFixed(2)}` : `Short AED ${Math.abs(change).toFixed(2)}`}
                </span>
              </div>
            )}
            <button onClick={() => confirm('CASH')} disabled={!!confirming || !changeValid}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: 'var(--c-success-fg)', color: '#fff' }}>
              {confirming === 'CASH' ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
              {confirming === 'CASH' ? 'Recording…' : `Confirm — AED ${finalAmount.toFixed(2)} received`}
            </button>
          </>
        )}

        {/* ── Split ── */}
        {step === 'split' && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('method')} style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</button>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Split Payment</h2>
            </div>

            <AmountDisplay label="Total to collect" value={finalAmount} highlight />
            {discountAmount > 0 && <p className="text-xs text-center" style={{ color: 'var(--c-success-fg)' }}>Discount −AED {discountAmount.toFixed(2)} applied</p>}

            <div>
              <p className="text-[10px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Cash portion</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[Math.floor(finalAmount / 2), Math.floor(finalAmount * 0.25), Math.floor(finalAmount * 0.75)].filter(n => n > 0 && n < finalAmount).map(n => (
                  <button key={n} onClick={() => setSplitCash(String(n))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={splitCashNum === n
                      ? { backgroundColor: 'var(--brand)', color: '#000' }
                      : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
                    {n}
                  </button>
                ))}
              </div>
              <input type="number" inputMode="decimal" placeholder={`Cash amount (max ${finalAmount.toFixed(2)})`}
                value={splitCash} onChange={e => setSplitCash(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-base font-bold outline-none"
                style={{ backgroundColor: 'var(--muted-bg)', border: `2px solid ${splitValid ? 'var(--c-success-fg)' : 'var(--card-border)'}`, color: 'var(--text-primary)' }} />
            </div>

            {splitValid && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(22,163,74,0.1)' }}>
                  <span className="text-sm flex items-center gap-1.5"><Banknote size={13} style={{ color: 'var(--c-success-fg)' }} /> Cash</span>
                  <span className="font-black" style={{ color: 'var(--c-success-fg)' }}>AED {splitCashNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                  <span className="text-sm flex items-center gap-1.5"><CreditCard size={13} style={{ color: 'var(--c-info-fg)' }} /> Card</span>
                  <span className="font-black" style={{ color: 'var(--c-info-fg)' }}>AED {splitCard.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button onClick={() => confirm('SPLIT', splitCashNum)} disabled={!!confirming || !splitValid}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: '#a855f7', color: '#fff' }}>
              {confirming === 'SPLIT' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {confirming === 'SPLIT' ? 'Recording…' : 'Confirm Split Payment'}
            </button>
          </>
        )}

        {error && (
          <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={13} className="flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </ModalBackdrop>
  )
}

// ── Per-tab row inside a table card ──────────────────────────────────────────
function TabRow({ tab, idx, tableName, onSettle, onTransferDone, busy, isManager, splitPaymentEnabled, tipEnabled, discountEnabled }: {
  tab: Tab; idx: number; tableName: string
  onSettle: (sessionId: string, opts: SettleOpts) => void
  onTransferDone: () => void
  busy: boolean
  isManager: boolean
  splitPaymentEnabled?: boolean
  tipEnabled?: boolean
  discountEnabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [settleError, setSettleError] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showConvert, setShowConvert] = useState(false)
  const [convertSel, setConvertSel] = useState<Set<string>>(new Set())
  const label = tabLabel(tab, idx)
  const isMember = !!tab.orders.find(o => o.user)
  const total = Number(tab.summary.total)
  // Block settle until every unpaid order has actually been SERVED (DELIVERED).
  // READY is not enough — food still on the pass means the meal isn't over.
  const hasUnapproved = tab.orders.some(
    o => ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status) && o.paymentStatus !== 'PAID'
  )
  const isDineIn = tab.orders.some(o => o.type === 'DINE_IN' && o.paymentStatus === 'UNPAID')

  async function convertToTakeaway(orderIds: string[]) {
    if (!tab.sessionId || !orderIds.length) return
    setConverting(true)
    try {
      await api.post(`/orders/session/${tab.sessionId}/convert-to-takeaway`, { orderIds })
      notify.success(`${orderIds.length} order${orderIds.length !== 1 ? 's' : ''} converted to takeaway — bill stays open until settled`)
      setShowConvert(false)
      onTransferDone() // refresh so bill shows updated type
    } catch (e: any) {
      notify.error(e?.response?.data?.message ?? 'Could not convert')
    } finally { setConverting(false) }
  }

  const itemMap = new Map<string, { name: string; qty: number; price: number; modifiers: { name: string; priceAdd: number }[] }>()
  for (const o of tab.orders) {
    for (const i of o.items) {
      const mods = (i.modifiers ?? []).sort((a, b) => a.name.localeCompare(b.name))
      const modExtra = mods.reduce((s, m) => s + Number(m.priceAdd), 0)
      const linePrice = (Number(i.unitPrice) + modExtra) * i.quantity
      const k = i.menuItem.name + (mods.length ? '|' + mods.map(m => m.name).join(',') : '')
      const existing = itemMap.get(k)
      if (existing) { existing.qty += i.quantity; existing.price += linePrice }
      else itemMap.set(k, { name: i.menuItem.name, qty: i.quantity, price: linePrice, modifiers: mods })
    }
  }
  const items = [...itemMap.values()]

  function printTab() {
    window.open(`/receipt/${tab.sessionId}`, '_blank')
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left hover:opacity-90"
        style={{ backgroundColor: 'var(--muted-bg)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
            style={{ backgroundColor: 'var(--brand)' }}>
            {label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
              {isMember && <BadgeCheck size={12} className="flex-shrink-0" style={{ color: 'var(--c-info-fg)' }} />}
            </div>
            <div className="text-[10px] text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''} · {tab.orders.length} order{tab.orders.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-black text-gray-900 dark:text-white">AED {total.toFixed(2)}</div>
            <div className="text-[10px] font-semibold" style={{ color: tab.summary.allPaid ? 'var(--c-success-fg)' : 'var(--c-pending-fg)' }}>
              {tab.summary.allPaid ? '✓ Paid' : 'Pending'}
            </div>
          </div>
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 space-y-2" style={{ backgroundColor: 'var(--card-bg)' }}>
          {tab.orders.map((o, oi) => (
            <div key={o.id} className="grid gap-x-3" style={{ gridTemplateColumns: '58px 1fr auto' }}>
              {/* Col 1: order number + time */}
              <div className="text-[10px] text-gray-400 pt-0.5">
                <div className="font-semibold flex items-center gap-1"><Clock size={8} /> Ord {oi + 1}</div>
                <div>{new Date(o.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}</div>
                {o.paymentMethod === 'CARD' && o.paymentStatus === 'PAID' && (
                  <div className="font-semibold" style={{ color: 'var(--c-success-fg)' }}>card paid</div>
                )}
              </div>
              {/* Col 2 + 3: item names / prices */}
              <div className="space-y-0.5 min-w-0">
                {o.items.map((item, i) => (
                  <div key={i}>
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      <span className="font-semibold">{item.quantity}×</span> {item.menuItem.name}
                    </div>
                    {(item.modifiers ?? []).map((m, mi) => (
                      <div key={mi} className="text-[10px] text-blue-500 dark:text-blue-400 ml-4 truncate">+ {m.name}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 text-right">
                {o.items.map((item, i) => (
                  <div key={i}>
                    <div className="text-xs text-gray-400">AED {(Number(item.unitPrice) * item.quantity).toFixed(2)}</div>
                    {(item.modifiers ?? []).map((m, mi) => (
                      <div key={mi} className="text-[10px] text-blue-500 dark:text-blue-400">
                        {Number(m.priceAdd) > 0 ? `AED ${(Number(m.priceAdd) * item.quantity).toFixed(2)}` : '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <TotalsBlock subtotal={Number(tab.summary.subtotal)} vat={Number(tab.summary.vatAmount)} total={total} packing={Number((tab.summary as any).packingCharge ?? 0)} />

          {isDineIn && (
            <button
              onClick={() => {
                // Pre-select all convertible orders, then let staff refine in the modal
                const convertible = tab.orders.filter(o => o.type === 'DINE_IN' && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED')
                setConvertSel(new Set(convertible.map(o => o.id)))
                setShowConvert(true)
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors hover:bg-[var(--muted-bg)] mb-1"
              style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
              <Package size={11} /> Convert to Takeaway…
            </button>
          )}

          {showConvert && (
            <ModalBackdrop onClick={() => setShowConvert(false)} className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
              <div className="w-full max-w-sm rounded-2xl p-4 space-y-3" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                onClick={e => e.stopPropagation()}>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Convert to Takeaway</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Pick which orders to pack to go. They stay on this bill and are settled normally.
                  </p>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {tab.orders.filter(o => o.type === 'DINE_IN' && o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED').map((o, oi) => {
                    const checked = convertSel.has(o.id)
                    const itemsLabel = o.items.map(i => `${i.quantity}× ${i.menuItem.name}`).join(', ')
                    const orderTotal = o.items.reduce((s, i) => s + (Number(i.unitPrice) + (i.modifiers ?? []).reduce((ms, m) => ms + Number(m.priceAdd), 0)) * i.quantity, 0)
                    return (
                      <label key={o.id} className="flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-colors"
                        style={{ borderColor: checked ? 'var(--brand)' : 'var(--card-border)', backgroundColor: checked ? 'rgba(var(--brand-rgb),0.06)' : 'transparent' }}>
                        <input type="checkbox" checked={checked} className="mt-0.5 accent-[var(--brand)]"
                          onChange={() => setConvertSel(prev => {
                            const next = new Set(prev)
                            if (next.has(o.id)) next.delete(o.id); else next.add(o.id)
                            return next
                          })} />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            <span>Order {oi + 1} · {new Date(o.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>AED {orderTotal.toFixed(2)}</span>
                          </div>
                          <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{itemsLabel}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowConvert(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                    style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                    Cancel
                  </button>
                  <button onClick={() => convertToTakeaway([...convertSel])} disabled={converting || convertSel.size === 0}
                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    {converting ? 'Converting…' : `Convert ${convertSel.size} order${convertSel.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </ModalBackdrop>
          )}
          <div className="flex items-center gap-2 pt-1">
            {!tab.summary.allPaid ? (
              <>
              {hasUnapproved && (
                <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                  {tab.orders.some(o => o.status === 'PENDING' && o.paymentStatus !== 'PAID')
                    ? '⏳ Waiting for kitchen to accept'
                    : tab.orders.some(o => o.status === 'READY' && o.paymentStatus !== 'PAID')
                      ? '🛎 Food ready — serve it before settling'
                      : '🍳 Food still being prepared'}
                </div>
              )}
              {!hasUnapproved && (
              <>
              {(splitPaymentEnabled ?? true) && (
              <button
                onClick={() => setShowSplit(true)} disabled={busy}
                className="py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity hover:opacity-90 flex-shrink-0"
                style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}
                title="Split bill between guests">
                <Users size={11} /> Split
              </button>
              )}
              <button
                onClick={() => setShowSettle(true)} disabled={busy}
                className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity hover:opacity-90 text-white"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                Settle Bill
              </button>
              </>
              )}
              {showSplit && (
                <SplitBillModal
                  total={total}
                  subtotal={Number(tab.summary.subtotal)}
                  vatAmount={Number(tab.summary.vatAmount)}
                  items={items}
                  onClose={() => setShowSplit(false)}
                  onProceedSettle={() => { setShowSplit(false); setShowSettle(true) }}
                />
              )}
              {showSettle && (
                <SettleModal
                  amount={total}
                  items={items}
                  busy={busy}
                  isManager={isManager}
                  error={settleError}
                  splitPaymentEnabled={splitPaymentEnabled}
                  tipEnabled={tipEnabled}
                  discountEnabled={discountEnabled}
                  onClose={() => { setShowSettle(false); setSettleError('') }}
                  onConfirm={opts => { setSettleError(''); onSettle(tab.sessionId, opts) }}
                />
              )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>
                <CheckCircle2 size={11} /> Settled
              </div>
            )}
            <button onClick={printTab}
              className="w-9 h-9 rounded-lg border flex items-center justify-center hover:opacity-80 transition-colors flex-shrink-0"
              style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
              <Printer size={13} />
            </button>
            <button
              onClick={() => setShowTransfer(true)}
              title="Transfer to another table"
              className="w-9 h-9 rounded-lg border flex items-center justify-center hover:opacity-80 transition-colors flex-shrink-0"
              style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
              <ArrowLeftRight size={13} />
            </button>
          </div>
        </div>
      )}

      {showTransfer && (
        <TransferModal
          sessionId={tab.sessionId}
          currentTableName={tableName}
          onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); notify.success('Table transferred'); onTransferDone() }}
        />
      )}
    </div>
  )
}

// ── Active table card ─────────────────────────────────────────────────────────
function ActiveTableCard({ entry, onSettle, onTransferDone, busySession, isManager, splitPaymentEnabled, tipEnabled, discountEnabled }: {
  entry: ActiveTableEntry
  onSettle: (sessionId: string, tableId: string, opts: SettleOpts) => void
  onTransferDone: () => void
  busySession: Record<string, boolean>
  isManager: boolean
  splitPaymentEnabled?: boolean
  tipEnabled?: boolean
  discountEnabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const brand = useBrandStore(useShallow(s => ({ name: s.restaurantName, tagline: s.tagline })))
  const tableName = entry.table.name ?? `Table ${entry.table.tableNumber}`
  const pendingTabs = entry.tabs.filter(t => t.summary.anyUnpaid).length
  const allSettled = pendingTabs === 0

  // One combined receipt: all guests' items on a single printout with the table's combined totals
  const printCombined = () => {
    const rows = entry.tabs.flatMap(t =>
      t.orders.flatMap(o => o.items.map(i => {
        const mods = i.modifiers ?? []
        const modExtra = mods.reduce((s, m) => s + Number(m.priceAdd), 0)
        return {
          name: mods.length ? `${i.menuItem.name} (${mods.map(m => `+ ${m.name}`).join(', ')})` : i.menuItem.name,
          qty: i.quantity,
          total: (Number(i.unitPrice) + modExtra) * i.quantity,
        }
      }))
    )
    const html = buildReceiptHtml(`${tableName} — Combined`, rows, entry.combined, brand)
    openPrint(html)
  }

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: allSettled ? 'var(--c-success-bdr)' : 'var(--c-pending-bdr)' }}>

      {/* Table header */}
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:opacity-90">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: allSettled ? 'var(--c-success-fg)' : 'var(--c-pending-fg)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-gray-900 dark:text-white">{tableName}</span>
            <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Users size={9} /> {entry.tabs.length} {entry.tabs.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-gray-500">AED {Number(entry.combined.total).toFixed(2)}</span>
            {pendingTabs > 0
              ? <span className="text-[10px] font-semibold" style={{ color: 'var(--c-pending-fg)' }}>· {pendingTabs} awaiting payment</span>
              : <span className="text-[10px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>· fully settled</span>
            }
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-base font-black text-gray-900 dark:text-white">AED {Number(entry.combined.total).toFixed(2)}</div>
          </div>
          {expanded ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <>
          <div className="px-4 pb-3 space-y-2">
            {entry.tabs.map((tab, idx) => (
              <TabRow
                key={tab.sessionId}
                tab={tab}
                idx={idx}
                tableName={tableName}
                onSettle={(sessionId, opts) => onSettle(sessionId, entry.table.id, opts)}
                onTransferDone={onTransferDone}
                busy={!!busySession[tab.sessionId]}
                isManager={isManager}
                splitPaymentEnabled={splitPaymentEnabled}
                tipEnabled={tipEnabled}
                discountEnabled={discountEnabled}
              />
            ))}
          </div>

          {/* Combined footer */}
          <div className="mx-4 border-t pt-3 pb-3" style={{ borderColor: 'var(--card-border)' }}>
            <div className="flex justify-between text-xs text-gray-400 mb-0.5">
              <span>Subtotal</span><span>AED {Number(entry.combined.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>VAT (5%)</span><span>AED {Number(entry.combined.vatAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-gray-900 dark:text-white">
              <span>Combined Total</span><span>AED {Number(entry.combined.total).toFixed(2)}</span>
            </div>
          </div>

          <div className="px-4 pb-4 flex items-center gap-2">
            <button onClick={printCombined}
              className="flex-1 flex items-center justify-center gap-2 border py-2.5 rounded-xl text-xs font-semibold hover:opacity-80 transition-colors">
              <Printer size={13} /> Print Combined Bill
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Closed session card ───────────────────────────────────────────────────────
function ClosedSessionCard({ s, onRefund }: { s: ClosedSession; onRefund: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [refundOrder, setRefundOrder] = useState<BillOrder | null>(null)
  const tableName = s.table.name ?? `Table ${s.table.tableNumber}`
  const guestName = s.orders.find(o => o.user)?.user?.name?.split(' ')[0] ?? 'Guest'

  const itemMap = new Map<string, { name: string; qty: number; price: number; modifiers: { name: string; priceAdd: number }[] }>()
  for (const o of s.orders) {
    for (const i of o.items) {
      const mods = (i.modifiers ?? []).sort((a, b) => a.name.localeCompare(b.name))
      const modExtra = mods.reduce((s, m) => s + Number(m.priceAdd), 0)
      const linePrice = (Number(i.unitPrice) + modExtra) * i.quantity
      const k = i.menuItem.name + (mods.length ? '|' + mods.map(m => m.name).join(',') : '')
      const ex = itemMap.get(k)
      if (ex) { ex.qty += i.quantity; ex.price += linePrice }
      else itemMap.set(k, { name: i.menuItem.name, qty: i.quantity, price: linePrice, modifiers: mods })
    }
  }
  const items = [...itemMap.values()]

  // Payment method from first paid order
  const paymentMethod = s.orders.find(o => o.paymentMethod)?.paymentMethod
  const methodIcon = paymentMethod === 'CARD' ? <CreditCard size={10} />
    : paymentMethod === 'SPLIT' ? <><Banknote size={10} /><span>+</span><CreditCard size={10} /></>
    : <Banknote size={10} />
  const methodLabel = paymentMethod === 'CARD' ? 'Card' : paymentMethod === 'SPLIT' ? 'Split' : 'Cash'
  const methodColor = paymentMethod === 'CARD' ? '#60a5fa' : paymentMethod === 'SPLIT' ? '#a78bfa' : '#4ade80'

  const settledBy = s.summary.settledBy?.name?.split(' ')[0]
  const closedTime = new Date(s.closedAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
  const hasRefundable = s.orders.some(o => o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUND_REQUESTED')

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      {/* Green settled stripe */}
      <div className="h-0.5" style={{ backgroundColor: 'var(--c-success-fg)' }} />

      {/* Header row — always visible */}
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
        {/* Table badge */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
          style={{ backgroundColor: 'var(--c-success-fg)' }}>
          {s.table.tableNumber}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{tableName}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{guestName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{closedTime}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
            {settledBy && <>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>by {settledBy}</span>
            </>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right flex flex-col items-end gap-0.5">
            <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>AED {Number(s.summary.total).toFixed(2)}</div>
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${methodColor}22`, color: methodColor }}>
                {methodIcon} {methodLabel}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>✓ Settled</span>
            </div>
          </div>
          {expanded ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: 'var(--card-border)' }}>
          {/* Items */}
          <div className="space-y-1">
            {items.map((item, i) => {
              const modExtraPerUnit = item.modifiers.reduce((sum, m) => sum + Number(m.priceAdd), 0)
              const basePrice = item.price - modExtraPerUnit * item.qty
              return (
                <div key={i} className="text-xs">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.qty}×</span> {item.name}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>AED {basePrice.toFixed(2)}</span>
                  </div>
                  {item.modifiers.length > 0 && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {item.modifiers.map((m, mi) => (
                        <div key={mi} className="flex justify-between text-[10px] text-blue-500 dark:text-blue-400">
                          <span>+ {m.name}</span>
                          {Number(m.priceAdd) > 0 && <span>AED {(Number(m.priceAdd) * item.qty).toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <TotalsBlock subtotal={Number(s.summary.subtotal)} vat={Number(s.summary.vatAmount)} total={Number(s.summary.total)} packing={Number((s.summary as any).packingCharge ?? 0)} />

          {/* Action row */}
          <div className="flex items-center gap-2 pt-1">
            {hasRefundable && (
              <div className="flex gap-1.5 flex-wrap flex-1">
                {s.orders.filter(o => o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUND_REQUESTED').map((o, oi) => (
                  <button key={o.id} onClick={() => o.paymentStatus === 'PAID' ? setRefundOrder(o) : undefined}
                    disabled={o.paymentStatus === 'REFUND_REQUESTED'}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: o.paymentStatus === 'REFUND_REQUESTED' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)', border: `1px solid ${o.paymentStatus === 'REFUND_REQUESTED' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.2)'}`, color: o.paymentStatus === 'REFUND_REQUESTED' ? '#f59e0b' : '#f87171' }}>
                    <RotateCcw size={10} />
                    {o.paymentStatus === 'REFUND_REQUESTED' ? `Refund pending` : `Refund${s.orders.length > 1 ? ` #${oi + 1}` : ''}`}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => window.open(`/receipt/${s.sessionId}`, '_blank')}
                title="Print receipt"
                className="p-2 rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                <Printer size={13} />
              </button>
              <button onClick={() => window.open(`${window.location.origin}/receipt/${s.sessionId}`, '_blank')}
                title="View / PDF"
                className="p-2 rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                <Receipt size={13} />
              </button>
              <button
                title="Share receipt link"
                onClick={() => {
                  const url = `${window.location.origin}/receipt/${s.sessionId}`
                  if (navigator.share) { navigator.share({ title: 'Your Receipt', url }) }
                  else { navigator.clipboard.writeText(url); notify.success('Receipt link copied!') }
                }}
                className="p-2 rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                <Share2 size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {refundOrder && (
        <RefundModal
          orderId={refundOrder.id}
          amount={Number(refundOrder.total)}
          onClose={() => setRefundOrder(null)}
          onDone={() => { setRefundOrder(null); onRefund() }}
        />
      )}
    </div>
  )
}

// ── Takeaway card ─────────────────────────────────────────────────────────────
function TakeawayCard({ entry, onRefresh }: { entry: TakeawayEntry; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [collecting, setCollecting] = useState(false)

  async function collect(method: 'CASH' | 'CARD') {
    setCollecting(true)
    try {
      const unpaid = entry.orders.filter(o => o.paymentStatus !== 'PAID')
      for (const o of unpaid) {
        await api.post(`/payments/order/${o.id}/collect`, { method })
      }
      notify.success(`Payment collected — ${method === 'CASH' ? 'cash' : 'card'}`)
      onRefresh?.()
    } catch (e: any) {
      notify.error(e?.response?.data?.message ?? 'Could not collect payment')
    } finally { setCollecting(false) }
  }
  const items = (() => {
    const m = new Map<string, { name: string; qty: number; price: number; modifiers: { name: string; priceAdd: number }[] }>()
    for (const o of entry.orders) {
      for (const i of o.items) {
        const mods = (i.modifiers ?? []).sort((a, b) => a.name.localeCompare(b.name))
        const modExtra = mods.reduce((s, mm) => s + Number(mm.priceAdd), 0)
        const linePrice = (Number(i.unitPrice) + modExtra) * i.quantity
        const k = i.menuItem.name + (mods.length ? '|' + mods.map(mm => mm.name).join(',') : '')
        const ex = m.get(k)
        if (ex) { ex.qty += i.quantity; ex.price += linePrice }
        else m.set(k, { name: i.menuItem.name, qty: i.quantity, price: linePrice, modifiers: mods })
      }
    }
    return [...m.values()]
  })()
  const label = entry.customer?.name ?? entry.contactPhone ?? `Token #${entry.tokenNumber}`
  const time = new Date(entry.createdAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
  const allPaid = entry.orders.length > 0 && entry.orders.every(o => o.paymentStatus === 'PAID')
  const paymentMethod = entry.orders.find(o => o.paymentMethod)?.paymentMethod
  const methodIcon = paymentMethod === 'CARD' ? <CreditCard size={10} />
    : paymentMethod === 'SPLIT' ? <><Banknote size={10} /><span>+</span><CreditCard size={10} /></>
    : <Banknote size={10} />
  const methodLabel = paymentMethod === 'CARD' ? 'Card' : paymentMethod === 'SPLIT' ? 'Split' : 'Cash'
  const methodColor = paymentMethod === 'CARD' ? '#60a5fa' : paymentMethod === 'SPLIT' ? '#a78bfa' : '#4ade80'

  function printTakeawayReceipt() {
    // Use the configurable receipt template. Session id if the takeaway is linked to a
    // table session (converted dine-in); otherwise the order id (backend falls back to it).
    const target = (entry.orders[0] as any)?.tableSessionId ?? entry.orders[0]?.id
    if (target) window.open(`/receipt/${target}`, '_blank')
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <button onClick={() => setExpanded(p => !p)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:opacity-90">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base flex-shrink-0"
          style={{ backgroundColor: 'var(--brand)' }}>
          #{entry.tokenNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{label}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {entry.contactPhone && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Phone size={9} />{entry.contactPhone}</span>
            )}
            <span className="text-[10px] text-gray-400">{time} · {items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right flex flex-col items-end gap-0.5">
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AED {Number(entry.summary.total).toFixed(2)}</div>
            <div className="flex items-center gap-1">
              {allPaid && paymentMethod ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${methodColor}22`, color: methodColor }}>
                  {methodIcon} {methodLabel}
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                  Unpaid{paymentMethod === 'CASH' ? ' · Cash' : ''}
                </span>
              )}
              <StatusBadge variant="delivered" label={entry.latestStatus} size="xs" />
            </div>
          </div>
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300"><span className="font-semibold">{item.qty}×</span> {item.name}</span>
                <span className="text-gray-400">AED {((item.price / item.qty - item.modifiers.reduce((s, mm) => s + Number(mm.priceAdd), 0)) * item.qty).toFixed(2)}</span>
              </div>
              {item.modifiers.length > 0 && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {item.modifiers.map((m, mi) => (
                    <div key={mi} className="flex justify-between text-[10px] text-blue-500 dark:text-blue-400">
                      <span>+ {m.name}</span>
                      {Number(m.priceAdd) > 0 && <span>AED {(Number(m.priceAdd) * item.qty).toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <TotalsBlock subtotal={Number(entry.summary.subtotal)} vat={Number(entry.summary.vatAmount)} total={Number(entry.summary.total)} packing={Number((entry.summary as any).packingCharge ?? 0)} />
          {!allPaid && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => collect('CASH')} disabled={collecting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                <Banknote size={12} /> {collecting ? 'Collecting…' : 'Collect Cash'}
              </button>
              <button onClick={() => collect('CARD')} disabled={collecting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}>
                <CreditCard size={12} /> Card
              </button>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: allPaid ? 'var(--c-success-fg)' : '#f59e0b' }}>
              {allPaid
                ? <>{paymentMethod === 'CARD' ? <CreditCard size={10} /> : <Banknote size={10} />} Paid by {methodLabel.toLowerCase()}</>
                : <>Payment pending{paymentMethod === 'CASH' ? ' — cash at counter' : ''}</>}
            </div>
            <button onClick={printTakeawayReceipt}
              className="flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors">
              <Printer size={11} /> Print
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Split Bill Modal ──────────────────────────────────────────────────────────
interface SplitItem { name: string; qty: number; price: number }

function SplitBillModal({ total, subtotal, vatAmount, items, onClose, onProceedSettle }: {
  total: number; subtotal: number; vatAmount: number
  items: SplitItem[]
  onClose: () => void
  onProceedSettle: () => void
}) {
  const brandName = useBrandStore(s => s.restaurantName)
  const [mode, setMode] = useState<'choose' | 'evenly' | 'byitem'>('choose')
  const [ways, setWays] = useState(2)
  // byitem: for each item, which guest (1-indexed, 0 = unassigned)
  const [assignments, setAssignments] = useState<number[]>(() => items.map(() => 0))
  const [guestCount, setGuestCount] = useState(2)
  const [currentGuest, setCurrentGuest] = useState(1)

  const perPerson = total / ways
  const perPersonVat = vatAmount / ways
  const perPersonSub = subtotal / ways

  // by-item guest totals
  const guestTotals = Array.from({ length: guestCount }, (_, gi) => {
    const guestItems = items.filter((_, i) => assignments[i] === gi + 1)
    const sub = guestItems.reduce((s, it) => s + it.price, 0)
    const vatRatio = subtotal > 0 ? sub / subtotal : 0
    const vat = vatAmount * vatRatio
    return { items: guestItems, subtotal: sub, vat, total: sub + vat }
  })
  const unassigned = items.filter((_, i) => assignments[i] === 0)

  function printGuestReceipt(guestIdx: number, guestTotal: number, guestSub: number, guestVat: number, guestItems: SplitItem[]) {
    const rows = guestItems.map(it => ({ name: it.name, qty: it.qty, total: it.price }))
    const html = `<!DOCTYPE html><html><head><title>Split Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',sans-serif;max-width:360px;margin:32px auto;padding:24px;color:#111}
h1{font-size:20px;font-weight:800;color:#f97316}h3{font-size:13px;color:#666}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
th{text-align:left;font-weight:600;color:#666;padding:4px 0;border-bottom:1px solid #eee}
td{padding:5px 0;border-bottom:1px solid #f5f5f5}td:last-child,th:last-child{text-align:right}
.totals{margin-top:16px}.totals td{padding:3px 0}.totals td:last-child{text-align:right}
.footer{font-size:10px;color:#999;text-align:center;margin-top:24px;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<h1>${brandName}</h1><h3>Split Bill — Guest ${guestIdx + 1}</h3>
<table><tr><th>Item</th><th>Qty</th><th>AED</th></tr>
${rows.map(r => `<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.total.toFixed(2)}</td></tr>`).join('')}
</table>
<table class="totals">
<tr><td style="color:#666">Subtotal</td><td>AED ${guestSub.toFixed(2)}</td></tr>
<tr><td style="color:#666">VAT (5%)</td><td>AED ${guestVat.toFixed(2)}</td></tr>
<tr><td style="font-weight:800;font-size:16px;padding-top:8px">Total</td><td style="font-weight:800;font-size:16px;padding-top:8px">AED ${guestTotal.toFixed(2)}</td></tr>
</table>
<p class="footer">Thank you for dining with us · شكراً لزيارتكم</p>
<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <ModalBackdrop style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--card-border)' }}>
          <div>
            <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Split Bill</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>AED {total.toFixed(2)} total</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Mode choose */}
          {mode === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>How do you want to split?</p>
              <button onClick={() => setMode('evenly')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all hover:opacity-90"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>⚖️</div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Split Evenly</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Divide total equally between 2–8 guests</p>
                </div>
              </button>
              <button onClick={() => setMode('byitem')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all hover:opacity-90"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>🧾</div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Split by Item</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Assign each item to a specific guest</p>
                </div>
              </button>
            </div>
          )}

          {/* Split evenly */}
          {mode === 'evenly' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>NUMBER OF GUESTS</p>
                <div className="flex gap-2 flex-wrap">
                  {[2,3,4,5,6,7,8].map(n => (
                    <button key={n} onClick={() => setWays(n)}
                      className="w-10 h-10 rounded-xl text-sm font-black transition-all"
                      style={ways === n
                        ? { backgroundColor: 'var(--brand)', color: '#000' }
                        : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>EACH GUEST PAYS</p>
                <p className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>AED {perPerson.toFixed(2)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Incl. AED {perPersonVat.toFixed(2)} VAT · Subtotal AED {perPersonSub.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1.5">
                {Array.from({ length: ways }, (_, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Guest {i + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>AED {perPerson.toFixed(2)}</span>
                      <button onClick={() => printGuestReceipt(i, perPerson, perPersonSub, perPersonVat, items)}
                        className="text-[10px] px-2 py-1 rounded-lg"
                        style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                        🖨️ Print
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Split by item */}
          {mode === 'byitem' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>GUESTS</p>
                <div className="flex gap-2 flex-wrap">
                  {[2,3,4,5,6].map(n => (
                    <button key={n} onClick={() => { setGuestCount(n); setAssignments(items.map(() => 0)); setCurrentGuest(1) }}
                      className="w-10 h-10 rounded-xl text-sm font-black transition-all"
                      style={guestCount === n
                        ? { backgroundColor: 'var(--brand)', color: '#000' }
                        : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {/* Active guest selector */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>ASSIGNING FOR</p>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: guestCount }, (_, i) => (
                    <button key={i} onClick={() => setCurrentGuest(i + 1)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={currentGuest === i + 1
                        ? { backgroundColor: 'var(--brand)', color: '#000' }
                        : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                      Guest {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              {/* Item list */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>TAP ITEMS TO ASSIGN</p>
                {items.map((it, i) => {
                  const assigned = assignments[i]
                  return (
                    <button key={i} onClick={() => {
                      setAssignments(prev => {
                        const next = [...prev]
                        next[i] = prev[i] === currentGuest ? 0 : currentGuest
                        return next
                      })
                    }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: assigned ? 'rgba(var(--brand-rgb),0.1)' : 'var(--muted-bg)',
                        border: `1px solid ${assigned ? 'rgba(var(--brand-rgb),0.4)' : 'var(--card-border)'}`,
                      }}>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{it.name}</span>
                        <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>×{it.qty}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>AED {it.price.toFixed(2)}</span>
                        {assigned > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: 'var(--brand)' }}>G{assigned}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
                {unassigned.length > 0 && (
                  <p className="text-[10px] text-amber-400">⚠ {unassigned.length} item{unassigned.length !== 1 ? 's' : ''} not assigned</p>
                )}
              </div>
              {/* Guest totals */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>GUEST TOTALS</p>
                {guestTotals.map((gt, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Guest {i + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black" style={{ color: gt.total > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        AED {gt.total.toFixed(2)}
                      </span>
                      {gt.items.length > 0 && (
                        <button onClick={() => printGuestReceipt(i, gt.total, gt.subtotal, gt.vat, gt.items)}
                          className="text-[10px] px-2 py-1 rounded-lg"
                          style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                          🖨️ Print
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t flex-shrink-0 flex gap-3" style={{ borderColor: 'var(--card-border)' }}>
          {mode !== 'choose' && (
            <button onClick={() => setMode('choose')}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Back
            </button>
          )}
          <button onClick={onProceedSettle}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            Collect &amp; Settle Full Bill →
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ── Table transfer modal ──────────────────────────────────────────────────────
interface TableOption { id: string; tableNumber: number; name: string | null; status: string; capacity: number }

function TransferModal({ sessionId, currentTableName, onClose, onDone }: {
  sessionId: string
  currentTableName: string
  onClose: () => void
  onDone: () => void
}) {
  const [tables, setTables] = useState<TableOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/tables').then(r => {
      setTables((r.data ?? []) as TableOption[])
    }).catch(() => setError('Could not load tables')).finally(() => setLoading(false))
  }, [])

  const eligible = tables.filter(t => t.status !== 'DIRTY')

  async function confirm() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/orders/session/${sessionId}/transfer`, { toTableId: selected })
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'Transfer failed — try again')
      setBusy(false)
    }
  }

  const statusColor = (s: string) => s === 'OCCUPIED' || s === 'BILL_PENDING' ? '#f59e0b' : '#4ade80'
  const statusLabel = (s: string) => s === 'OCCUPIED' ? 'Occupied' : s === 'BILL_PENDING' ? 'Bill Pending' : 'Empty'

  return (
    <ModalBackdrop onClick={onClose} className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)' }}>
            <ArrowLeftRight size={16} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>Transfer Table</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Move this tab from <strong style={{ color: 'var(--text-primary)' }}>{currentTableName}</strong> to another table
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {eligible.map(t => {
              const name = t.name ?? `Table ${t.tableNumber}`
              const isSelected = selected === t.id
              const isOccupied = t.status === 'OCCUPIED' || t.status === 'BILL_PENDING'
              return (
                <button key={t.id} onClick={() => setSelected(t.id)}
                  className="relative flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all text-center"
                  style={{
                    borderColor: isSelected ? 'var(--brand)' : isOccupied ? 'rgba(245,158,11,0.4)' : 'var(--card-border)',
                    backgroundColor: isSelected ? 'rgba(var(--brand-rgb),0.1)' : isOccupied ? 'rgba(245,158,11,0.06)' : 'var(--muted-bg)',
                  }}>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-black"
                      style={{ backgroundColor: 'var(--brand)' }}>✓</span>
                  )}
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black text-white"
                    style={{ backgroundColor: isSelected ? 'var(--brand)' : statusColor(t.status) }}>
                    {t.tableNumber}
                  </span>
                  <span className="text-[11px] font-semibold leading-tight px-1" style={{ color: 'var(--text-primary)' }}>{name}</span>
                  <span className="text-[9px] font-bold" style={{ color: statusColor(t.status) }}>{statusLabel(t.status)}</span>
                  {isOccupied && (
                    <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Will merge tabs</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}

        {selected && !loading && (() => {
          const dest = eligible.find(t => t.id === selected)
          const destName = dest?.name ?? `Table ${dest?.tableNumber}`
          const isOccupied = dest?.status === 'OCCUPIED' || dest?.status === 'BILL_PENDING'
          return (
            <div className="rounded-xl px-3 py-2.5 text-xs" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
              <p style={{ color: 'var(--text-primary)' }}>
                <strong>{currentTableName}</strong> → <strong style={{ color: 'var(--brand)' }}>{destName}</strong>
                {isOccupied && <span style={{ color: '#f59e0b' }}> (tabs will merge)</span>}
              </p>
              <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>All orders in this tab will move. The original table will be marked dirty.</p>
            </div>
          )
        })()}

        <button onClick={confirm} disabled={!selected || busy}
          className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
          {busy ? 'Transferring…' : 'Confirm Transfer'}
        </button>
        <button onClick={onClose} className="w-full py-2.5 rounded-2xl text-sm font-semibold"
          style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
          Cancel
        </button>
      </div>
    </ModalBackdrop>
  )
}

// ── Post-settlement receipt prompt ────────────────────────────────────────────
function ReceiptPromptModal({ sessionId, total, method, onClose }: {
  sessionId: string; total: number; method: string; onClose: () => void
}) {
  const receiptUrl = `${window.location.origin}/receipt/${sessionId}`

  function openReceipt() {
    window.open(receiptUrl, '_blank')
    onClose()
  }

  function share() {
    if (navigator.share) {
      navigator.share({ title: 'Your Receipt – Al Manzil', url: receiptUrl })
    } else {
      navigator.clipboard.writeText(receiptUrl)
      notify.success('Receipt link copied to clipboard')
    }
  }

  const methodIcon = method === 'CARD' ? <CreditCard size={18} className="text-blue-400" />
    : method === 'SPLIT' ? <><Banknote size={14} className="text-green-400" /><CreditCard size={14} className="text-blue-400" /></>
    : <Banknote size={18} className="text-green-400" />

  const methodLabel = method === 'CARD' ? 'Card' : method === 'SPLIT' ? 'Split' : 'Cash'

  return (
    <ModalBackdrop className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>

        {/* Success indicator */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
            <CheckCircle2 size={28} style={{ color: 'var(--c-success-fg)' }} />
          </div>
          <div className="text-center">
            <p className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Bill Settled!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1">{methodIcon}</span>
              {' '}{methodLabel} · <span className="font-bold" style={{ color: 'var(--text-primary)' }}>AED {total.toFixed(2)}</span>
            </p>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: 'var(--card-border)' }} />

        <p className="text-xs font-semibold text-center uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Print guest receipt?
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={openReceipt}
            className="flex flex-col items-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            <Printer size={18} />
            Print / PDF
          </button>
          <button onClick={share}
            className="flex flex-col items-center gap-2 py-3.5 rounded-2xl font-bold text-sm border transition-all"
            style={{ border: '1px solid var(--card-border)', backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)' }}>
            <Share2 size={18} />
            Share Link
          </button>
        </div>

        <button onClick={() => { openReceipt(); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs"
          style={{ color: 'var(--text-muted)' }}>
          <ExternalLink size={11} /> Open in new tab
        </button>

        <button onClick={onClose}
          className="w-full py-2.5 rounded-2xl text-sm font-semibold"
          style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
          No thanks — Done
        </button>
      </div>
    </ModalBackdrop>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BillsPage() {
  const { user } = useAuthStore()
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const brand = useBrandStore(useShallow(s => ({ name: s.restaurantName, tagline: s.tagline })))

  const [active, setActive]         = useState<ActiveTableEntry[]>([])
  const [closed, setClosed]         = useState<ClosedSession[]>([])
  const [takeaway, setTakeaway]     = useState<TakeawayEntry[]>([])
  const [pendingRefunds, setPendingRefunds] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [busySession, setBusySession] = useState<Record<string, boolean>>({})
  const [approvingRefund, setApprovingRefund] = useState<Record<string, boolean>>({})
  const [settledReceipt, setSettledReceipt] = useState<{ sessionId: string; total: number; method: string } | null>(null)
  const [billFeatures, setBillFeatures] = useState({ splitPaymentEnabled: true, tipEnabled: true, discountEnabled: true })
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [historyDate, setHistoryDate] = useState(todayStr)

  const loadHistory = useCallback(async (date: string) => {
    setHistoryLoading(true)
    try {
      const [closedRes, takeawayRes] = await Promise.all([
        api.get(`/orders/closed-bills-today?date=${date}`),
        api.get(`/orders/takeaway-today?date=${date}`),
      ])
      setClosed(closedRes.data ?? [])
      setTakeaway(takeawayRes.data ?? [])
    } finally { setHistoryLoading(false) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const requests: Promise<any>[] = [
        api.get('/orders/active-bills'),
        api.get(`/orders/closed-bills-today?date=${historyDate}`),
        api.get(`/orders/takeaway-today?date=${historyDate}`),
        api.get('/settings'),
      ]
      if (isManager) requests.push(api.get('/orders/pending-refunds'))
      const [activeRes, closedRes, takeawayRes, settingsRes, refundsRes] = await Promise.all(requests)
      setActive(activeRes.data ?? [])
      setClosed(closedRes.data ?? [])
      setTakeaway(takeawayRes.data ?? [])
      const s = settingsRes.data ?? {}
      setBillFeatures({
        splitPaymentEnabled: s.splitPaymentEnabled ?? true,
        tipEnabled: s.tipEnabled ?? true,
        discountEnabled: s.discountEnabled ?? true,
      })
      if (refundsRes) setPendingRefunds(refundsRes.data ?? [])
    } finally { setLoading(false) }
  }, [isManager, historyDate])

  useEffect(() => { load() }, [load])

  const settle = async (sessionId: string, _tableId: string, opts: SettleOpts) => {
    // Capture the tab total before the state updates
    const originalTotal = Number(
      active.find(e => e.tabs.some(t => t.sessionId === sessionId))
        ?.tabs.find(t => t.sessionId === sessionId)?.summary.total ?? 0
    )
    const finalTotal = Math.max(0, originalTotal - (opts.discountAmount ?? 0))

    setBusySession(p => ({ ...p, [sessionId]: true }))
    try {
      await api.post(`/payments/session/${sessionId}/settle`, {
        method: opts.method,
        discountAmount: opts.discountAmount,
        discountReason: opts.discountReason,
        splitCashAmount: opts.splitCashAmount,
        tipAmount: opts.tipAmount,
      })
      const label = opts.method === 'CARD' ? 'Card payment recorded'
        : opts.method === 'SPLIT' ? 'Split payment recorded'
        : 'Cash collected'
      notify.order.cashCollected(label)
      await load()
      setSettledReceipt({ sessionId, total: finalTotal, method: opts.method })
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to settle')
    } finally {
      setBusySession(p => ({ ...p, [sessionId]: false }))
    }
  }

  const approveRefund = async (orderId: string) => {
    setApprovingRefund(p => ({ ...p, [orderId]: true }))
    try {
      await api.post(`/orders/${orderId}/approve-refund`, {})
      notify.success('Refund approved')
      await load()
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to approve refund')
    } finally {
      setApprovingRefund(p => ({ ...p, [orderId]: false }))
    }
  }

  const totalTabs    = active.reduce((s, e) => s + e.tabs.length, 0)
  const pendingTabs  = active.reduce((s, e) => s + e.tabs.filter(t => t.summary.anyUnpaid).length, 0)
  // Unpaid takeaways (cash at counter, not yet collected) are NOT settled — separate them
  const paidTakeaway   = takeaway.filter(t => t.orders.length > 0 && t.orders.every(o => o.paymentStatus === 'PAID'))
  const unpaidTakeaway = takeaway.filter(t => !(t.orders.length > 0 && t.orders.every(o => o.paymentStatus === 'PAID')))
  const closedRevenue  = closed.reduce((s, c) => s + Number(c.summary.total), 0)
  const takeawayRevenue = paidTakeaway.reduce((s, t) => s + Number(t.summary.total), 0)
  const todayRevenue = closedRevenue + takeawayRevenue
  const historyCount = closed.length + paidTakeaway.length

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Header ── */}
      <div className="h-14 flex items-center justify-between gap-3 px-4 sm:px-6 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Bills & Payment</h1>
          <button onClick={load} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {/* Stat badges */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {active.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand-dark)' }}>
              {active.length} table{active.length !== 1 ? 's' : ''} · {totalTabs} tab{totalTabs !== 1 ? 's' : ''}
            </span>
          )}
          {pendingTabs > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline"
              style={{ backgroundColor: 'var(--c-pending-bg)', color: 'var(--c-pending-fg)' }}>
              {pendingTabs} pending
            </span>
          )}
          {todayRevenue > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline"
              style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>
              AED {todayRevenue.toFixed(2)} {historyDate === todayStr ? 'today' : historyDate.split('-').reverse().join('/')}
            </span>
          )}
        </div>
      </div>

      {/* ── Content — single scrollable page, no tabs ── */}
      <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-8">

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-24 rounded-2xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }} />
            ))}
          </div>
        )}

        {/* ── Pending Refund Approvals (manager/owner only) ── */}
        {!loading && isManager && pendingRefunds.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Refund Requests</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {pendingRefunds.length}
              </span>
            </div>
            <div className="space-y-2">
              {pendingRefunds.map((o: any) => {
                const tableName = o.table?.name ?? (o.table ? `Table ${o.table.tableNumber}` : 'Takeaway')
                const reason = o.statusHistory?.[0]?.note?.replace('REFUND REQUESTED: ', '') ?? ''
                return (
                  <div key={o.id} className="rounded-xl border p-3 flex items-center gap-3"
                    style={{ backgroundColor: 'var(--card-bg)', borderColor: 'rgba(245,158,11,0.3)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{tableName}</span>
                        <span className="text-xs text-gray-400">AED {Number(o.total).toFixed(2)}</span>
                      </div>
                      {reason && <p className="text-[11px] text-gray-400 mt-0.5 truncate">"{reason}"</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {o.items.map((i: any) => `${i.quantity}× ${i.menuItem.name}`).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => approveRefund(o.id)}
                      disabled={approvingRefund[o.id]}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-50 transition-colors text-white flex-shrink-0"
                      style={{ backgroundColor: '#f59e0b' }}>
                      {approvingRefund[o.id] ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                      Approve
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Section 1: Active tables (guests seated, payment pending) ── */}
        {!loading && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={14} style={{ color: 'var(--brand)' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Active Bills</h2>
              {active.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand-dark)' }}>
                  {active.length}
                </span>
              )}
            </div>

            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--brand-light)' }}>
                  <Receipt size={20} style={{ color: 'var(--brand)' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No active bills right now</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Bills appear here when guests place dine-in orders</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {active.map(e => (
                  <ActiveTableCard key={e.table.id} entry={e} onSettle={settle} onTransferDone={load} busySession={busySession} isManager={isManager} {...billFeatures} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Receipt prompt — fires after each settlement ── */}
        {settledReceipt && (
          <ReceiptPromptModal
            sessionId={settledReceipt.sessionId}
            total={settledReceipt.total}
            method={settledReceipt.method}
            onClose={() => setSettledReceipt(null)}
          />
        )}

        {/* ── Awaiting payment: delivered takeaways where cash hasn't been collected yet ── */}
        {!loading && unpaidTakeaway.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Banknote size={14} style={{ color: '#f59e0b' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Takeaway — Awaiting Payment</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                {unpaidTakeaway.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {unpaidTakeaway.map(e => <TakeawayCard key={e.tokenNumber} entry={e} onRefresh={load} />)}
            </div>
          </section>
        )}

        {/* ── Section 2: Settled bills — browseable by date ── */}
        {!loading && (
          <section>
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <History size={14} style={{ color: 'var(--text-muted)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {historyDate === todayStr ? 'Settled Today' : 'Settled Bills'}
                </h2>
                {historyCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' }}>
                    {historyCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {todayRevenue > 0 && (
                  <span className="text-sm font-black" style={{ color: 'var(--c-success-fg)' }}>
                    AED {todayRevenue.toFixed(2)}
                  </span>
                )}
                <input
                  type="date"
                  value={historyDate}
                  max={todayStr}
                  onChange={e => {
                    const d = e.target.value
                    setHistoryDate(d)
                    loadHistory(d)
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {historyLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
                {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />)}
              </div>
            ) : historyCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl border border-dashed"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <History size={18} style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No settled bills for this date</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {closed.map(s => <ClosedSessionCard key={s.sessionId} s={s} onRefund={load} />)}
                {paidTakeaway.map(e => <TakeawayCard key={e.tokenNumber} entry={e} onRefresh={load} />)}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
