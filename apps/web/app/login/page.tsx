'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, UtensilsCrossed, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'

const API     = process.env.NEXT_PUBLIC_API_URL     ?? 'http://localhost:3001/api/v1'
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

const HERO_QUOTES = [
  { text: 'The Malabar Biriyani here is unlike anything else in Dubai.', by: 'Mohammed A.' },
  { text: 'Crispy Masala Dosa, ready in 12 minutes. Incredible.', by: 'Priya S.' },
  { text: 'Feels like home — the Appam & Stew is absolutely perfect.', by: 'Arjun N.' },
]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth, token } = useAuthStore()

  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [quoteIdx, setQuoteIdx] = useState(0)
  useEffect(() => { setQuoteIdx(Math.floor(Math.random() * HERO_QUOTES.length)) }, [])
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })

  const redirect = searchParams.get('redirect') ?? '/account'
  const slotDate = searchParams.get('date')
  const slotTime = searchParams.get('slot')

  const comingForBooking = redirect === '/book'

  useEffect(() => {
    if (token) {
      const dest = slotDate && slotTime
        ? `${redirect}?date=${slotDate}&slot=${slotTime}`
        : redirect
      router.replace(dest)
    }
  }, [token])

  function setField(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setError('')
  }

  function switchTab(t: 'login' | 'signup') {
    setTab(t); setError('')
  }

  function handleGoogleLogin() {
    const state = btoa(JSON.stringify({ redirect }))
    window.location.href = `${BACKEND}/api/v1/auth/google?state=${state}`
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const endpoint = tab === 'login' ? 'auth/login' : 'auth/register'
      const body = tab === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, phone: form.phone, password: form.password, role: 'USER' }

      const r = await fetch(`${API}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await r.json()
      // Unwrap NestJS interceptor: { success, data: { user, token }, timestamp }
      const payload = json?.data ?? json
      if (!r.ok) throw new Error(payload?.message ?? json?.message ?? 'Something went wrong')

      setAuth(payload.user, payload.token)
      toast.success(tab === 'login' ? `Welcome back, ${payload.user?.name?.split(' ')[0]}! 👋` : `Account created! Welcome, ${payload.user?.name?.split(' ')[0]}! 🎉`)

      const dest = slotDate && slotTime
        ? `${redirect}?date=${slotDate}&slot=${slotTime}`
        : redirect
      router.push(dest)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const quote = HERO_QUOTES[quoteIdx]

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — branding + food (desktop only) ── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col">
        {/* Background food photo */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&q=80"
            alt="" className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-gray-950/90 via-gray-900/80 to-orange-950/70" />
        </div>

        {/* Content */}
        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mb-auto">
            <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center">
              <UtensilsCrossed size={18} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-base leading-none">Al Manzil</div>
              <div className="text-orange-300/70 text-xs">Hotel · Dubai</div>
            </div>
          </Link>

          {/* Main pitch */}
          <div className="mb-auto">
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-4">
              Kerala flavours,<br />
              <span className="text-orange-400">right at your table.</span>
            </h2>
            <p className="text-gray-300 text-base leading-relaxed max-w-xs">
              Order fresh Kerala & South Indian cuisine, track your meal live, and book your table — all in one place.
            </p>
          </div>

          {/* Testimonial */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
            <div className="flex gap-0.5 mb-3">
              {[1,2,3,4,5].map(i => <span key={i} className="text-yellow-400 text-sm">★</span>)}
            </div>
            <p className="text-white/80 text-sm leading-relaxed mb-3 italic">&ldquo;{quote.text}&rdquo;</p>
            <p className="text-orange-300/70 text-xs font-medium">— {quote.by}</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col bg-gray-950 lg:bg-white dark:bg-gray-950 min-h-screen overflow-auto">

        {/* Mobile header */}
        <div className="lg:hidden relative">
          <div className="h-52 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80"
              alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-gray-950" />
          </div>
          <div className="absolute top-4 left-4">
            <Link href="/" className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-3 py-2 rounded-xl">
              <ArrowLeft size={14} className="text-white" />
              <span className="text-white text-xs font-medium">Back</span>
            </Link>
          </div>
          <div className="absolute bottom-4 left-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <UtensilsCrossed size={15} className="text-white" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Al Manzil</div>
                <div className="text-orange-300/80 text-xs">Authentic Kerala Cuisine</div>
              </div>
            </div>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col justify-center px-5 py-8 max-w-md mx-auto w-full">

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-black text-white lg:text-gray-900 dark:text-white mb-1.5">
              {tab === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-gray-400 lg:text-gray-500 dark:text-gray-400 text-sm">
              {comingForBooking
                ? 'Sign in or register to complete your table reservation.'
                : tab === 'login'
                ? 'Sign in to order, track meals, and manage bookings.'
                : 'Join us to order food, book tables, and track your meals.'}
            </p>
          </div>

          {/* Context banner for booking redirect */}
          {comingForBooking && (
            <div className="mb-5 flex items-center gap-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
              <span className="text-lg">📅</span>
              <p className="text-orange-300 text-xs leading-relaxed">
                You&apos;re one step away from reserving your table. Sign in or create a free account to confirm.
              </p>
            </div>
          )}

          {/* Google button */}
          <button type="button" onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white lg:border lg:border-gray-200 dark:bg-gray-800 dark:border-gray-700 border border-white/10 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold py-3 rounded-2xl text-sm transition-colors shadow-sm mb-4">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10 lg:bg-gray-200 dark:bg-white/10" />
            <span className="text-xs text-gray-500">or continue with email</span>
            <div className="flex-1 h-px bg-white/10 lg:bg-gray-200 dark:bg-white/10" />
          </div>

          {/* Tab switcher */}
          <div className="flex bg-white/5 lg:bg-gray-100 dark:bg-white/5 rounded-2xl p-1 mb-5">
            {(['login', 'signup'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  tab === t
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-400 lg:text-gray-500 dark:text-gray-400 hover:text-gray-200 lg:hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-3.5">
            {tab === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 lg:text-gray-600 dark:text-gray-400 mb-1.5">Full Name</label>
                <input type="text" required placeholder="Your name" value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  className="w-full bg-white/5 lg:bg-white dark:bg-white/5 border border-white/10 lg:border-gray-200 dark:border-white/10 text-white lg:text-gray-800 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder:text-gray-600 lg:placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors" />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 lg:text-gray-600 dark:text-gray-400 mb-1.5">Email Address</label>
              <input type="email" required placeholder="you@email.com" value={form.email}
                onChange={e => setField('email', e.target.value)}
                className="w-full bg-white/5 lg:bg-white dark:bg-white/5 border border-white/10 lg:border-gray-200 dark:border-white/10 text-white lg:text-gray-800 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder:text-gray-600 lg:placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors" />
            </div>

            {tab === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 lg:text-gray-600 dark:text-gray-400 mb-1.5">
                  Phone <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                  onChange={e => setField('phone', e.target.value)}
                  className="w-full bg-white/5 lg:bg-white dark:bg-white/5 border border-white/10 lg:border-gray-200 dark:border-white/10 text-white lg:text-gray-800 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder:text-gray-600 lg:placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors" />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 lg:text-gray-600 dark:text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} required minLength={6}
                  placeholder="••••••••" value={form.password}
                  onChange={e => setField('password', e.target.value)}
                  className="w-full bg-white/5 lg:bg-white dark:bg-white/5 border border-white/10 lg:border-gray-200 dark:border-white/10 text-white lg:text-gray-800 dark:text-white rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-orange-500 placeholder:text-gray-600 lg:placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors" />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 lg:hover:text-gray-600 dark:hover:text-gray-300">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl px-4 py-2.5">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3.5 rounded-2xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 hover:scale-[1.01] active:scale-100 mt-1">
              {loading
                ? (tab === 'login' ? 'Signing in…' : 'Creating account…')
                : (tab === 'login' ? 'Sign In' : 'Create Free Account')}
            </button>
          </form>

          <div className="flex justify-center mt-8">
            <Link href="/staff/login"
              className="flex items-center gap-1.5 text-[11px] text-gray-700 hover:text-gray-500 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Staff access
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
