'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import ForceDark from '@/components/ForceDark'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export default function ArriveByQrPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!bookingId) return
    fetch(`${API}/bookings/${bookingId}/arrive`, { method: 'POST' })
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json?.message ?? 'Could not mark arrival')
        setStatus('success')
        setMsg('Welcome! Your table is ready. A member of staff will seat you shortly.')
        setTimeout(() => router.replace('/menu'), 4000)
      })
      .catch(e => {
        setStatus('error')
        setMsg(e.message)
      })
  }, [bookingId])

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-6 text-center">
      <ForceDark />
      {status === 'loading' && (
        <>
          <Loader2 size={48} className="text-amber-400 animate-spin mb-5" />
          <p className="text-white font-semibold text-lg">Confirming your arrival…</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="w-24 h-24 rounded-full bg-green-500/15 flex items-center justify-center mb-5">
            <CheckCircle2 size={52} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You're checked in!</h1>
          <p className="text-gray-400 text-sm max-w-xs leading-relaxed">{msg}</p>
          <p className="text-gray-600 text-xs mt-4">Redirecting you to the menu…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="w-24 h-24 rounded-full bg-red-500/15 flex items-center justify-center mb-5">
            <XCircle size={52} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm max-w-xs">{msg}</p>
          <button onClick={() => router.replace('/')}
            className="mt-6 px-6 py-3 bg-amber-500 text-white font-bold rounded-xl text-sm">
            Back to Home
          </button>
        </>
      )}
    </div>
  )
}
