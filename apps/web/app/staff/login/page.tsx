'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, UtensilsCrossed, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useBrandStore } from '@/store/brand'

type ResetStep = 'email' | 'otp' | 'password' | 'done'

const INPUT_STYLE = {
  base: 'w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white placeholder-white/20 [color-scheme:dark]',
  bg: { backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' },
  focus: '1px solid rgba(var(--brand-rgb),0.6)',
  blur: '1px solid rgba(255,255,255,0.08)',
}

export default function StaffLogin() {
  const router = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const logoUrl = useBrandStore(s => s.logoUrl)
  const brandName = useBrandStore(s => s.restaurantName)
  const token = useAuthStore(s => s.token)

  // ── Force change password state ──
  const [mustChangePw, setMustChangePw]   = useState(false)
  const [tempPassword, setTempPassword]   = useState('')
  const [newPwVal, setNewPwVal]           = useState('')
  const [confirmPwVal, setConfirmPwVal]   = useState('')
  const [showNewPwVal, setShowNewPwVal]   = useState(false)
  const [changingPw, setChangingPw]       = useState(false)

  // ── Forgot password state ──
  const [resetMode, setResetMode]     = useState(false)
  const [resetStep, setResetStep]     = useState<ResetStep>('email')
  const [resetEmail, setResetEmail]   = useState('')
  const [resetOtp, setResetOtp]       = useState(['', '', '', '', '', ''])
  const [resetToken, setResetToken]   = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showNewPw, setShowNewPw]     = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/staff-login', form)
      if (!['OWNER', 'STAFF'].includes(data.user.role)) {
        toast.error('Access denied')
        return
      }
      setAuth(data.user, data.token)
      if (data.mustChangePassword) {
        setTempPassword(form.password)
        setMustChangePw(true)
        return
      }
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/staff/orders')
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const submitChangePassword = async () => {
    if (newPwVal.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPwVal !== confirmPwVal) { toast.error('Passwords do not match'); return }
    setChangingPw(true)
    try {
      await api.post('/auth/change-password', { currentPassword: tempPassword, newPassword: newPwVal },
        { headers: { Authorization: `Bearer ${token}` } })
      toast.success('Password updated! Welcome aboard.')
      router.push('/staff/orders')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update password')
    } finally {
      setChangingPw(false)
    }
  }

  // ── Reset flow ──
  const startResendCooldown = (secs = 60) => {
    setResendCooldown(secs)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(v => { if (v <= 1) { clearInterval(cooldownRef.current!); return 0 } return v - 1 })
    }, 1000)
  }

  const sendResetOtp = async (email: string) => {
    setResetLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setResetEmail(email)
      setResetStep('otp')
      setResetOtp(['', '', '', '', '', ''])
      startResendCooldown(60)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not send reset code')
    } finally {
      setResetLoading(false)
    }
  }

  const verifyOtp = async () => {
    const code = resetOtp.join('')
    if (code.length < 6) { toast.error('Enter the 6-digit code'); return }
    setResetLoading(true)
    try {
      const { data } = await api.post('/auth/verify-reset-otp', { email: resetEmail, code })
      setResetToken(data.resetToken)
      setResetStep('password')
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid or expired code')
    } finally {
      setResetLoading(false)
    }
  }

  const doReset = async () => {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPw) { toast.error('Passwords do not match'); return }
    setResetLoading(true)
    try {
      await api.post('/auth/reset-password', { resetToken, password: newPassword })
      setResetStep('done')
    } catch (e: any) {
      toast.error(e?.message ?? 'Reset failed. Start over.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !resetOtp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }
  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...resetOtp]; next[i] = digit; setResetOtp(next)
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
    if (digits.length === 6) { setResetOtp(digits); otpRefs.current[5]?.focus() }
  }

  // ── Reset panel content ──
  const renderReset = () => {
    if (resetStep === 'done') return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={36} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Password updated</h2>
        <p className="text-white/40 text-sm mb-8">You can now sign in with your new password.</p>
        <button onClick={() => { setResetMode(false); setResetStep('email'); setResetEmail(''); setNewPassword(''); setConfirmPw('') }}
          className="w-full font-bold py-3.5 rounded-xl text-sm text-black"
          style={{ backgroundColor: 'var(--brand)' }}>
          Back to Sign In
        </button>
      </div>
    )

    if (resetStep === 'password') return (
      <>
        <div className="mb-8">
          <h2 className="text-2xl font-black text-white mb-1">New password</h2>
          <p className="text-white/35 text-sm">Choose a strong password — at least 8 characters.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">New password</label>
            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className={INPUT_STYLE.base}
                style={INPUT_STYLE.bg}
                onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
                onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">Confirm password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && doReset()}
              className={INPUT_STYLE.base}
              style={INPUT_STYLE.bg}
              onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
              onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
            />
          </div>
          <button onClick={doReset} disabled={resetLoading || !newPassword || !confirmPw}
            className="w-full mt-2 font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            {resetLoading ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Set New Password'}
          </button>
        </div>
      </>
    )

    if (resetStep === 'otp') return (
      <>
        <div className="mb-8">
          <h2 className="text-2xl font-black text-white mb-1">Enter reset code</h2>
          <p className="text-white/35 text-sm">
            We sent a 6-digit code to <span className="text-white/60 font-medium">{resetEmail}</span>
          </p>
        </div>
        <div className="space-y-6">
          {/* 6-box OTP input */}
          <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
            {resetOtp.map((digit, i) => (
              <input
                key={i}
                ref={el => { otpRefs.current[i] = el }}
                type="text" inputMode="numeric" maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKey(i, e)}
                className="w-11 h-14 text-center text-xl font-bold rounded-xl outline-none transition-all text-white [color-scheme:dark]"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: digit ? '1.5px solid var(--brand)' : '1px solid rgba(255,255,255,0.1)' }}
                onFocus={e => e.currentTarget.style.border = '1.5px solid var(--brand)'}
                onBlur={e => e.currentTarget.style.border = digit ? '1.5px solid var(--brand)' : '1px solid rgba(255,255,255,0.1)'}
              />
            ))}
          </div>
          <button onClick={verifyOtp} disabled={resetLoading || resetOtp.join('').length < 6}
            className="w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            {resetLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify Code'}
          </button>
          <div className="text-center">
            {resendCooldown > 0
              ? <p className="text-white/25 text-xs">Resend in {resendCooldown}s</p>
              : <button onClick={() => sendResetOtp(resetEmail)}
                  className="text-xs underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--brand)' }}>
                  Didn't get it? Resend code
                </button>
            }
          </div>
        </div>
      </>
    )

    // Step 1: enter email
    return (
      <>
        <div className="mb-8">
          <h2 className="text-2xl font-black text-white mb-1">Forgot password?</h2>
          <p className="text-white/35 text-sm">Enter your staff email and we'll send a reset code.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">Email address</label>
            <input
              type="email" autoFocus
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && resetEmail && sendResetOtp(resetEmail)}
              placeholder="your@email.com"
              className={INPUT_STYLE.base}
              style={INPUT_STYLE.bg}
              onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
              onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
            />
          </div>
          <button onClick={() => sendResetOtp(resetEmail)} disabled={resetLoading || !resetEmail}
            className="w-full mt-2 font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            {resetLoading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send Reset Code'}
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-[#080808] flex overflow-hidden">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[var(--brand)]/10 blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[var(--brand)]/6 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          <Link href="/" className="flex items-center gap-3 w-fit">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-9 h-9 rounded-xl object-cover" />
              : <div className="w-9 h-9 rounded-xl bg-[var(--brand)] flex items-center justify-center"><UtensilsCrossed size={18} className="text-black" /></div>
            }
            <span className="text-white font-bold text-lg">{brandName}</span>
          </Link>
          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-8 w-fit"
              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              <span className="text-[var(--brand)] text-xs font-semibold tracking-wide">Staff Portal</span>
            </div>
            <h2 className="text-5xl font-black text-white leading-[1.05] mb-5">
              Run the floor<br />
              <span style={{ color: 'var(--brand)' }}>seamlessly.</span>
            </h2>
            <p className="text-white/40 text-sm leading-relaxed">
              Manage orders, tables, and bookings in real time — built for the pace of Dubai hospitality.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 pb-2">
            {[['Live Orders','Real-time kitchen updates'],['Table Control','Status at a glance'],['Bookings','Reservation management'],['Analytics','Revenue & insights']].map(([title, desc]) => (
              <div key={title} className="rounded-xl p-3.5 transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-white/80 text-sm font-semibold mb-0.5">{title}</div>
                <div className="text-white/30 text-xs">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-col w-full lg:w-[480px] min-h-screen relative"
        style={{ backgroundColor: '#0d0d0d', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="lg:hidden absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full pointer-events-none bg-[var(--brand)]/20 blur-[100px]" />
        <div className="lg:hidden absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full pointer-events-none bg-[var(--brand)]/10 blur-[80px]" />

        <div className="flex items-center justify-end px-8 pt-8 pb-4">
          <div className="flex items-center gap-2 lg:hidden">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover" />
              : <div className="w-7 h-7 rounded-lg bg-[var(--brand)] flex items-center justify-center"><UtensilsCrossed size={14} className="text-black" /></div>
            }
            <span className="text-white text-sm font-bold">{brandName}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 pb-8">

          {/* ── Must change password panel ── */}
          {mustChangePw ? (
            <>
              <div className="mb-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--brand)]/15 flex items-center justify-center mx-auto mb-5">
                  <KeyRound size={28} style={{ color: 'var(--brand)' }} />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">Set your password</h2>
                <p className="text-white/35 text-sm">
                  This is your first login. Please set a personal password to continue.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">New password</label>
                  <div className="relative">
                    <input
                      type={showNewPwVal ? 'text' : 'password'}
                      value={newPwVal}
                      onChange={e => setNewPwVal(e.target.value)}
                      placeholder="At least 8 characters"
                      autoFocus
                      className={INPUT_STYLE.base}
                      style={INPUT_STYLE.bg}
                      onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
                      onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
                    />
                    <button type="button" onClick={() => setShowNewPwVal(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                      {showNewPwVal ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPwVal}
                    onChange={e => setConfirmPwVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitChangePassword()}
                    placeholder="Repeat password"
                    className={INPUT_STYLE.base}
                    style={INPUT_STYLE.bg}
                    onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
                    onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
                  />
                </div>
                <button onClick={submitChangePassword} disabled={changingPw || !newPwVal || !confirmPwVal}
                  className="w-full mt-2 font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 0 32px rgba(var(--brand-rgb),0.25)' }}>
                  {changingPw ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Set Password & Continue →'}
                </button>
              </div>
            </>
          ) : resetMode ? (
            <>
              {resetStep !== 'done' && (
                <button onClick={() => { setResetMode(false); setResetStep('email') }}
                  className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-xs mb-8 transition-colors w-fit">
                  <ArrowLeft size={13} /> Back to sign in
                </button>
              )}
              {renderReset()}
            </>
          ) : (
            /* ── Login form ── */
            <>
              <div className="mb-10">
                <div className="text-[var(--brand)] text-xs font-semibold tracking-widest uppercase mb-3">Staff Access</div>
                <h1 className="text-3xl font-black text-white mb-2">Welcome back</h1>
                <p className="text-white/35 text-sm">Sign in to your staff account</p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">Email address</label>
                  <input
                    type="email" required autoComplete="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="staff@almanzil.ae"
                    className={INPUT_STYLE.base}
                    style={INPUT_STYLE.bg}
                    onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
                    onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 tracking-wide">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••"
                      className={`${INPUT_STYLE.base} pr-12`}
                      style={INPUT_STYLE.bg}
                      onFocus={e => e.currentTarget.style.border = INPUT_STYLE.focus}
                      onBlur={e => e.currentTarget.style.border = INPUT_STYLE.blur}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button type="button" onClick={() => { setResetMode(true); setResetEmail(form.email); setResetStep('email') }}
                    className="mt-2 text-xs font-medium transition-colors hover:opacity-80 flex items-center gap-1"
                    style={{ color: 'var(--brand)' }}>
                    Forgot password?
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full mt-2 font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 0 32px rgba(var(--brand-rgb),0.25)' }}>
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
                </button>
              </form>

              <div className="mt-8 rounded-xl p-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Demo credentials</p>
                <div className="space-y-1">
                  {[['Owner','owner@hotel.com','owner123'],['Manager','manager@hotel.com','manager123'],['Staff','staff@hotel.com','staff123'],['Chef','chef@hotel.com','chef123']].map(([role, email, pw]) => (
                    <button key={role} type="button" onClick={() => setForm({ email, password: pw })}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5 group text-left">
                      <span className="text-xs text-white/35 group-hover:text-white/60 transition-colors font-mono">{email}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.12)' }}>{role}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-white/[0.04] text-center space-y-2">
                <p className="text-xs text-white/20">© 2024 {brandName} · Dubai</p>
                <Link href="/" className="text-xs text-white/25 hover:text-[var(--brand)] transition-colors">
                  ← Return to {brandName}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
