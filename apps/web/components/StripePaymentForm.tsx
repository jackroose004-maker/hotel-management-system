'use client'
import { useState } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Loader2, Lock } from 'lucide-react'

interface Props {
  orderId: string
  total: number
  onSuccess: (paymentIntentId: string) => void
  onCancel: () => void
}

export default function StripePaymentForm({ orderId, total, onSuccess, onCancel }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message || 'Payment failed')
      setLoading(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id)
    } else {
      setError('Payment could not be confirmed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
        <PaymentElement options={{
          layout: 'accordion',
          wallets: { link: 'never', applePay: 'never', googlePay: 'never' },
          fields: { billingDetails: { name: 'never', email: 'never', phone: 'never', address: 'never' } },
        }} />
      </div>

      {error && (
        <div className="text-sm px-4 py-3 rounded-xl" style={{ background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-bdr)', color: 'var(--c-danger-fg)' }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading || !stripe}
        className="w-full py-4 rounded-2xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'var(--brand)', color: '#000' }}>
        {loading
          ? <><Loader2 size={18} className="animate-spin" /> Processing...</>
          : <><Lock size={16} /> Pay AED {total.toFixed(2)}</>
        }
      </button>

      <button type="button" onClick={onCancel}
        className="w-full py-3 rounded-2xl text-sm transition-colors"
        style={{ border: '1px solid var(--card-border)', color: 'var(--text-muted)', background: 'transparent' }}>
        Back to Cart
      </button>

      <p className="text-center text-xs flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <Lock size={10} /> Secured by Stripe · AED only
      </p>
    </form>
  )
}
