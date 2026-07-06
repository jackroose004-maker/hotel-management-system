'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, UtensilsCrossed, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useLangStore, applyLangDir, t } from '@/store/lang'
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
  const { lang, setLang } = useLangStore()
  const ar = lang === 'ar'
  useEffect(() => { applyLangDir(lang) }, [lang])

  const initialTab = searchParams.get('tab') === 'signup' ? 'signup' : 'login'
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [brand, setBrand] = useState<{
    name: string; logoUrl: string | null
    loginDesktopImage?: string | null; loginMobileImage?: string | null
  }>({ name: 'Al Manzil', logoUrl: null })
  useEffect(() => { setQuoteIdx(Math.floor(Math.random() * HERO_QUOTES.length)) }, [])
  useEffect(() => {
    fetch(`${API}/settings`).then(r => r.json()).then(j => {
      const d = j?.data ?? j
      if (d?.restaurantName) setBrand({
        name: d.restaurantName,
        logoUrl: d.logoUrl ?? null,
        loginDesktopImage: d.loginDesktopImage ?? null,
        loginMobileImage: d.loginMobileImage ?? null,
      })
    }).catch(() => {})
  }, [])
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })

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
    setTab(t); setError(''); setOtpSent(false); setOtp('')
    setForm(f => ({ ...f, confirmPassword: '' }))
  }

  function handleGoogleLogin() {
    const state = btoa(JSON.stringify({ redirect }))
    window.location.href = `${BACKEND}/api/v1/auth/google?state=${state}`
  }

  async function apiFetch(endpoint: string, body: object) {
    const r = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await r.json()
    const payload = json?.data ?? json
    if (!r.ok) throw new Error(json?.error?.message ?? payload?.message ?? json?.message ?? 'Something went wrong')
    return payload
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (tab === 'login') {
        const payload = await apiFetch('auth/login', { email: form.email, password: form.password })
        setAuth(payload.user, payload.token)
        toast.success(`Welcome back, ${payload.user?.name?.split(' ')[0]}! 👋`)
        const isStaff = payload.user?.role && ['STAFF', 'MANAGER', 'OWNER'].includes(payload.user.role)
        router.push(isStaff ? '/staff' : slotDate && slotTime ? `${redirect}?date=${slotDate}&slot=${slotTime}` : redirect)
        return
      }

      // Signup — step 1: send OTP
      if (!otpSent) {
        if (form.password !== form.confirmPassword) {
          setError('Passwords do not match')
          return
        }
        await apiFetch('auth/send-otp', { email: form.email, name: form.name })
        setOtpSent(true)
        toast.success('Check your email — a 6-digit code is on its way!')
        return
      }

      // Signup — step 2: verify OTP + create account
      const payload = await apiFetch('auth/register', {
        name: form.name, email: form.email, phone: form.phone,
        password: form.password, role: 'USER', otp,
      })
      setAuth(payload.user, payload.token)
      toast.success(`Account created! Welcome, ${payload.user?.name?.split(' ')[0]}! 🎉`)
      router.push(slotDate && slotTime ? `${redirect}?date=${slotDate}&slot=${slotTime}` : redirect)
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
            src={brand.loginDesktopImage ?? 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&q=80'}
            alt="" className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-gray-950/90 via-gray-900/80 to-neutral-950/70" />
        </div>

        {/* Content */}
        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mb-auto">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.name} className="w-9 h-9 rounded-xl object-cover" />
              : <div className="w-9 h-9 bg-[var(--brand)] rounded-xl flex items-center justify-center">
                  <UtensilsCrossed size={18} className="text-black" />
                </div>
            }
            <div>
              <div className="font-bold text-white text-base leading-none">{brand.name}</div>
              <div className="text-[var(--brand)]/70 text-xs">Hotel · Dubai</div>
            </div>
          </Link>

          {/* Main pitch */}
          <div className="mb-auto">
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-4">
              Kerala flavours,<br />
              <span className="text-[var(--brand)]">right at your table.</span>
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
            <p className="text-[var(--brand-light)]/70 text-xs font-medium">— {quote.by}</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-auto" style={{ backgroundColor: '#0c0c0c' }}>

        {/* Mobile header */}
        <div className="lg:hidden relative">
          <div className="h-52 overflow-hidden">
            <img src={brand.loginMobileImage ?? 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80'}
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
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt={brand.name} className="w-8 h-8 rounded-lg object-cover" />
                : <div className="w-8 h-8 bg-[var(--brand)] rounded-lg flex items-center justify-center">
                    <UtensilsCrossed size={15} className="text-black" />
                  </div>
              }
              <div>
                <div className="font-bold text-white text-sm">Al Manzil</div>
                <div className="text-[var(--brand-light)]/80 text-xs">Authentic Kerala Cuisine</div>
              </div>
            </div>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col justify-center px-5 py-8 max-w-md mx-auto w-full">

          {/* Lang toggle + Heading */}
          <div className="mb-7">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-black text-white">
                {tab === 'login'
                  ? (ar ? 'مرحباً بعودتك' : 'Welcome back')
                  : (ar ? 'إنشاء حساب جديد' : 'Create your account')}
              </h1>
              <button onClick={() => setLang(ar ? 'en' : 'ar')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: ar ? 'var(--brand)' : '#666', border: '1px solid rgba(255,255,255,0.1)' }}>
                {ar ? 'EN' : 'ع'}
              </button>
            </div>
            <p className="text-gray-400 text-sm">
              {comingForBooking
                ? (ar ? 'سجّل الدخول أو أنشئ حساباً لإتمام حجز طاولتك.' : 'Sign in or register to complete your table reservation.')
                : tab === 'login'
                ? (ar ? 'سجّل الدخول لطلب الطعام وتتبع الوجبات وإدارة الحجوزات.' : 'Sign in to order, track meals, and manage bookings.')
                : (ar ? 'انضم إلينا لطلب الطعام وحجز الطاولات وتتبع وجباتك.' : 'Join us to order food, book tables, and track your meals.')}
            </p>
          </div>

          {/* Context banner for booking redirect */}
          {comingForBooking && (
            <div className="mb-5 flex items-center gap-2.5 bg-[var(--brand)]/10 border border-[var(--brand)]/20 rounded-xl px-4 py-3">
              <span className="text-lg">📅</span>
              <p className="text-[var(--brand-light)] text-xs leading-relaxed">
                You&apos;re one step away from reserving your table. Sign in or create a free account to confirm.
              </p>
            </div>
          )}

          {/* Google button */}
          <button type="button" onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold py-3 rounded-2xl text-sm transition-colors shadow-sm mb-4">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {ar ? 'المتابعة مع Google' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500">or continue with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Tab switcher */}
          <div className="flex bg-white/5 rounded-2xl p-1 mb-5">
            {(['login', 'signup'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  tab === t
                    ? 'text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 lg:hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
                {t === 'login' ? (ar ? 'تسجيل الدخول' : 'Sign In') : (ar ? 'إنشاء حساب' : 'Sign Up')}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-3.5">

            {/* Signup step 2 — OTP entry */}
            {tab === 'signup' && otpSent ? (
              <>
                <div className="rounded-2xl px-4 py-4 text-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.06)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                  <p className="text-xs text-gray-400 mb-0.5">Code sent to</p>
                  <p className="text-sm font-bold text-white">{form.email}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">6-digit verification code</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    required placeholder="000000" value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3.5 text-2xl font-black text-center tracking-[0.4em] focus:outline-none focus:border-[var(--brand)] placeholder:text-gray-700 transition-colors"
                    autoFocus
                  />
                </div>
                <button type="button" onClick={() => { setOtpSent(false); setOtp(''); setError('') }}
                  className="text-xs text-gray-500 hover:text-gray-300 underline w-full text-center pt-1">
                  ← Change email or resend code
                </button>
              </>
            ) : (
              <>
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">{ar ? 'الاسم الكامل' : 'Full Name'}</label>
                    <input type="text" required placeholder="Your name" value={form.name}
                      onChange={e => setField('name', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--brand)] placeholder:text-gray-600 transition-colors" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">{ar ? 'البريد الإلكتروني' : 'Email Address'}</label>
                  <input type="email" required placeholder="you@email.com" value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--brand)] placeholder:text-gray-600 transition-colors" />
                </div>

                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                      Phone <span className="font-normal text-gray-500">(optional)</span>
                    </label>
                    <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                      onChange={e => setField('phone', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--brand)] placeholder:text-gray-600 transition-colors" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">{ar ? 'كلمة المرور' : 'Password'}</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} required minLength={6}
                      placeholder="••••••••" value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[var(--brand)] placeholder:text-gray-600 transition-colors" />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                      {ar ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                    </label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} required minLength={6}
                        placeholder="••••••••" value={form.confirmPassword}
                        onChange={e => setField('confirmPassword', e.target.value)}
                        className={`w-full bg-white/5 border text-white rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none placeholder:text-gray-600 transition-colors ${
                          form.confirmPassword && form.password !== form.confirmPassword
                            ? 'border-red-500/60 focus:border-red-500'
                            : form.confirmPassword && form.password === form.confirmPassword
                              ? 'border-emerald-500/60 focus:border-emerald-500'
                              : 'border-white/10 focus:border-[var(--brand)]'
                        }`} />
                      {form.confirmPassword && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm">
                          {form.password === form.confirmPassword ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <p className="text-[11px] text-red-400 mt-1.5">Passwords do not match</p>
                    )}
                  </div>
                )}
              </>
            )}

            {error && (
              error === 'STAFF_PORTAL' ? (
                <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                  <p className="font-bold text-[var(--brand)] mb-1">Staff account detected</p>
                  <p className="text-gray-400 mb-2.5">This email is registered as a staff member. Please use the Staff Portal to sign in.</p>
                  <Link href="/staff/login"
                    className="inline-flex items-center gap-1.5 font-bold text-black px-3 py-1.5 rounded-lg text-[11px]"
                    style={{ backgroundColor: 'var(--brand)' }}>
                    Go to Staff Portal →
                  </Link>
                </div>
              ) : (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl px-4 py-2.5">
                  {error}
                </div>
              )
            )}

            <button type="submit" disabled={loading}
              className="w-full text-white font-bold py-3.5 rounded-2xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-black/20 hover:shadow-black/30 hover:scale-[1.01] active:scale-100 mt-1"
              style={{ backgroundColor: 'var(--brand)' }}>
              {loading
                ? '…'
                : tab === 'login'
                  ? (ar ? 'تسجيل الدخول' : 'Sign In')
                  : otpSent
                    ? 'Verify & Create Account'
                    : (ar ? 'إنشاء حساب مجاني' : 'Send Verification Code')}
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
