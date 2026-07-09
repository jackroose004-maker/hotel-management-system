'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, UtensilsCrossed, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useLangStore, applyLangDir, t } from '@/store/lang'
import { useBrandStore } from '@/store/brand'
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
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const _bs = useBrandStore()
  const brand = {
    name: _bs.restaurantName,
    nameAr: _bs.restaurantNameAr,
    tagline: _bs.tagline,
    taglineAr: _bs.taglineAr,
    logoUrl: _bs.logoUrl || null,
    loginDesktopImage: _bs.loginBg || null,
    showLanguageToggle: _bs.showLanguageToggle,
  }
  useEffect(() => { setQuoteIdx(Math.floor(Math.random() * HERO_QUOTES.length)) }, [])
  const [form, setForm] = useState({ name: '', email: '', phone: '+971 ', password: '', confirmPassword: '' })

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

  function switchTab(next: 'login' | 'signup') {
    setTab(next); setError(''); setOtpSent(false); setOtp('')
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
          toast.error(t(lang, 'login.passwordsMismatch'), { id: 'login-error' })
          return
        }
        await apiFetch('auth/send-otp', { email: form.email, name: form.name })
        setOtpSent(true)
        toast.success('Check your email — a 6-digit code is on its way!')
        return
      }

      // Signup — step 2: verify OTP + create account
      const payload = await apiFetch('auth/register', {
        name: form.name, email: form.email, phone: form.phone.trim().length > 5 ? form.phone.trim() : undefined,
        password: form.password, role: 'USER', otp,
      })
      setAuth(payload.user, payload.token)
      toast.success(`Account created! Welcome, ${payload.user?.name?.split(' ')[0]}! 🎉`)
      router.push(slotDate && slotTime ? `${redirect}?date=${slotDate}&slot=${slotTime}` : redirect)
    } catch (e: any) {
      if (e.message === 'STAFF_PORTAL') {
        setError('STAFF_PORTAL')
      } else {
        toast.error(e.message || 'Something went wrong', { id: 'login-error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const quote = HERO_QUOTES[quoteIdx]

  const hasBg = !!brand.loginDesktopImage

  return (
    <div className="min-h-screen relative flex items-center justify-center lg:overflow-hidden overflow-y-auto py-24 lg:py-0">

      {/* ── Full-screen background (video or fallback image) ── */}
      <div className="fixed inset-0 z-0">
        {hasBg && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(brand.loginDesktopImage!)
          ? <video src={brand.loginDesktopImage!} autoPlay muted loop playsInline className="w-full h-full object-cover"
              ref={el => { if (el) el.playbackRate = 1 }} />
          : <img
              src={hasBg ? brand.loginDesktopImage! : 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1600&q=80'}
              alt="" className="w-full h-full object-cover" />
        }
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/55 to-black/65" />
      </div>

      {/* ── Top bar — back + logo ── */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 pt-5 pb-3">
        <Link href="/" className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-3 py-2 rounded-xl">
          <ArrowLeft size={14} className="text-white" />
          <span className="text-white text-xs font-medium">{t(lang, 'menu.back')}</span>
        </Link>
        <Link href="/" className="flex items-center gap-2">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="w-7 h-7 rounded-lg object-cover" />
            : <div className="w-7 h-7 bg-[var(--brand)] rounded-lg flex items-center justify-center">
                <UtensilsCrossed size={13} className="text-black" />
              </div>
          }
          <span className="text-white text-sm font-bold hidden sm:block">{ar ? (brand.nameAr || brand.name) : brand.name}</span>
        </Link>
      </div>

      {/* ── Branding overlay — desktop left side ── */}
      <div className="hidden lg:flex flex-col justify-between absolute left-0 top-0 bottom-0 w-[45%] p-12 z-10 pointer-events-none">
        <div />
        <div>
          <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
            {ar ? (brand.nameAr || brand.name) : brand.name}
          </h2>
          {(brand.tagline || brand.taglineAr) && (
            <p className="text-white/60 text-base leading-relaxed max-w-xs">
              {ar ? (brand.taglineAr || brand.tagline) : brand.tagline}
            </p>
          )}
        </div>
        <div className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-5 pointer-events-auto">
          <div className="flex gap-0.5 mb-3">
            {[1,2,3,4,5].map(i => <span key={i} className="text-yellow-400 text-sm">★</span>)}
          </div>
          <p className="text-white/80 text-sm leading-relaxed mb-3 italic">&ldquo;{quote.text}&rdquo;</p>
          <p className="text-[var(--brand)]/80 text-xs font-medium">— {quote.by}</p>
        </div>
      </div>

      {/* ── Form card — centered on mobile, right side on desktop ── */}
      <div className="relative z-20 w-full max-w-[420px] mx-4 lg:mx-0 lg:absolute lg:right-[8%] xl:right-[10%] lg:top-1/2 lg:-translate-y-1/2">

        {/* Frosted glass card */}
        <div className="rounded-3xl px-6 py-7 lg:px-8 lg:py-9 flex flex-col"
          style={{ maxHeight: 'min(82vh, 680px)', backgroundColor: 'rgba(8,8,8,0.6)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)' }}>

          {/* Lang toggle + Heading */}
          <div className="mb-7">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-black" style={{ color: 'white' }}>
                {tab === 'login'
                  ? t(lang, 'account.welcomeBack')
                  : t(lang, 'login.createFreeAccount')}
              </h1>
              {brand.showLanguageToggle && (
                <button onClick={() => setLang(ar ? 'en' : 'ar')}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 border"
                  style={{ backgroundColor: 'var(--brand)', color: '#000', border: '1px solid var(--brand)' }}>
                  {ar ? 'EN' : 'ع'}
                </button>
              )}
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
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
              <p className="text-[var(--brand)] text-xs leading-relaxed font-medium">
                {t(lang, 'login.bookingBanner')}
              </p>
            </div>
          )}

          {/* Google button */}
          <button type="button" onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 font-semibold py-3 rounded-2xl text-sm transition-all shadow-sm mb-4 border hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {t(lang, 'login.continueWithGoogle')}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{t(lang, 'login.orContinueWithEmail')}</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-2xl p-1 mb-5 relative" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            {(['login', 'signup'] as const).map(tabId => (
              <button key={tabId} onClick={() => switchTab(tabId)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all relative"
                style={tab === tabId
                  ? { backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }
                  : { color: 'rgba(255,255,255,0.5)' }}>
                {tabId === 'login' ? t(lang, 'nav.signIn') : t(lang, 'login.createFreeAccount')}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">

            {/* Scrollable fields area */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-0.5 pb-1" style={{ scrollbarWidth: 'none' }}>

            {/* Signup step 2 — OTP entry */}
            {tab === 'signup' && otpSent ? (
              <>
                <div className="rounded-2xl px-4 py-4 text-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                  <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.codeSentTo')}</p>
                  <p className="text-sm font-bold" style={{ color: 'white' }}>{form.email}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.verificationCode')}</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    required placeholder="000000" value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }}
                    className="w-full rounded-xl px-4 py-3.5 text-2xl font-black text-center tracking-[0.4em] focus:outline-none transition-colors"
                    style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}
                    autoFocus
                  />
                </div>
                <button type="button" onClick={() => { setOtpSent(false); setOtp(''); setError('') }}
                  className="text-xs underline w-full text-center pt-1"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {t(lang, 'login.changeEmailResend')}
                </button>
              </>
            ) : (
              <>
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.fullName')}</label>
                    <input type="text" required placeholder={t(lang, 'login.yourNamePlaceholder')} value={form.name}
                      onChange={e => setField('name', e.target.value)}
                      className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white placeholder-white/25 [color-scheme:dark]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                      onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.7)'}
                      onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.emailAddress')}</label>
                  <input type="email" required placeholder="you@email.com" value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white placeholder-white/25 [color-scheme:dark]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.7)'}
                    onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'} />
                </div>

                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {t(lang, 'login.phone')} <span className="font-normal" style={{ color: '#9ca3af' }}>{t(lang, 'login.phoneOptional')}</span>
                    </label>
                    <input type="tel" placeholder="+971 50 000 0000" value={form.phone}
                      onChange={e => setField('phone', e.target.value)}
                      className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white placeholder-white/25 [color-scheme:dark]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                      onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.7)'}
                      onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.password')}</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} required minLength={6}
                      placeholder="••••••••" value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      className="w-full rounded-xl px-4 py-3.5 pr-11 text-sm outline-none transition-all text-white placeholder-white/25 [color-scheme:dark]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                      onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.7)'}
                      onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)'} />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {t(lang, 'login.confirmPassword')}
                    </label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} required minLength={6}
                        placeholder="••••••••" value={form.confirmPassword}
                        onChange={e => setField('confirmPassword', e.target.value)}
                        className="w-full rounded-xl px-4 py-3.5 pr-11 text-sm outline-none transition-all text-white placeholder-white/25 [color-scheme:dark]"
                        style={{ backgroundColor: 'rgba(255,255,255,0.07)',
                          border: `1px solid ${form.confirmPassword && form.password !== form.confirmPassword ? 'rgba(239,68,68,0.6)' : form.confirmPassword && form.password === form.confirmPassword ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)'}` }} />
                      {form.confirmPassword && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm"
                          style={{ color: form.password === form.confirmPassword ? '#10b981' : '#ef4444' }}>
                          {form.password === form.confirmPassword ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <p className="text-[11px] text-red-400 mt-1.5">{t(lang, 'login.passwordsMismatch')}</p>
                    )}
                  </div>
                )}
              </>
            )}

            </div>{/* end scrollable fields */}

            {error === 'STAFF_PORTAL' && (
              <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                <p className="font-bold text-[var(--brand)] mb-1">{t(lang, 'login.staffDetected')}</p>
                <p className="mb-2.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{t(lang, 'login.staffDetectedDesc')}</p>
                <Link href="/staff/login"
                  className="inline-flex items-center gap-1.5 font-bold text-black px-3 py-1.5 rounded-lg text-[11px]"
                  style={{ backgroundColor: 'var(--brand)' }}>
                  {t(lang, 'login.goToStaffPortal')}
                </Link>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full text-white font-bold py-3.5 rounded-2xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-black/20 hover:shadow-black/30 hover:scale-[1.01] active:scale-100 mt-3 flex-shrink-0"
              style={{ backgroundColor: 'var(--brand)' }}>
              {loading
                ? '…'
                : tab === 'login'
                  ? t(lang, 'login.signIn')
                  : otpSent
                    ? t(lang, 'login.verifyCreateAccount')
                    : t(lang, 'login.sendCode')}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <Link href="/staff/login"
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t(lang, 'login.staffAccess')}
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
