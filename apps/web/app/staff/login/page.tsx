'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useBrandStore } from '@/store/brand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export default function StaffLogin() {
  const router = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const logoUrl = useBrandStore(s => s.logoUrl)
  const brandName = useBrandStore(s => s.restaurantName)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/staff-login', form)
      if (!['OWNER', 'MANAGER', 'STAFF'].includes(data.user.role)) {
        toast.error('Access denied')
        return
      }
      setAuth(data.user, data.token)
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/staff/orders')
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex overflow-hidden">

      {/* ── Left panel — decorative ───────────────────────── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-[#0f0f0f]">

        {/* Ambient glow */}
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-[var(--brand)]/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[var(--brand)]/8 blur-[100px] pointer-events-none" />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-12 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-9 h-9 rounded-xl object-cover" />
              : <div className="w-9 h-9 rounded-xl bg-[var(--brand)] flex items-center justify-center">
                  <UtensilsCrossed size={18} className="text-black" />
                </div>
            }
            <span className="text-white font-bold text-lg tracking-tight">{brandName}</span>
          </div>

          {/* Centre copy */}
          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <div className="inline-flex items-center gap-2 bg-[var(--brand)]/10 border border-[var(--brand)]/20 rounded-full px-3 py-1 mb-6 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              <span className="text-[var(--brand)] text-xs font-medium">Staff Portal</span>
            </div>
            <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Run the floor<br />
              <span className="text-[var(--brand)]">seamlessly.</span>
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Manage orders, tables, and bookings in real time — built for the pace of Dubai hospitality.
            </p>
          </div>

          {/* Feature list */}
          <div className="grid grid-cols-2 gap-3 pb-2">
            {[
              ['Live Orders', 'Real-time kitchen updates'],
              ['Table Control', 'Status at a glance'],
              ['Bookings', 'Reservation management'],
              ['Analytics', 'Revenue & insights'],
            ].map(([title, desc]) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
                <div className="text-white text-sm font-semibold mb-0.5">{title}</div>
                <div className="text-gray-600 text-xs">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────── */}
      <div className="flex flex-col items-center justify-center w-full lg:w-[440px] px-6 py-12 relative min-h-screen">

        {/* Back to home */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to home
          </Link>
        </div>

        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          {logoUrl
            ? <img src={logoUrl} alt={brandName} className="w-8 h-8 rounded-lg object-cover" />
            : <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center">
                <UtensilsCrossed size={16} className="text-black" />
              </div>
          }
          <span className="text-white font-bold">{brandName}</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-gray-500 text-sm">Sign in to your staff account</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Email address</label>
              <input
                type="email" required autoComplete="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="staff@almanzil.ae"
                className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] focus:border-[var(--brand)] text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder-gray-600"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] focus:border-[var(--brand)] text-white rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-colors placeholder-gray-600"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="w-full mt-2 relative overflow-hidden bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-black/20"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo creds */}
          <div className="mt-8 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 mb-2.5">Demo credentials</p>
            <div className="space-y-1.5">
              {[
                ['Owner', 'owner@hotel.com', 'owner123'],
                ['Manager', 'manager@hotel.com', 'manager123'],
              ].map(([role, email, pw]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm({ email, password: pw })}
                  className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors group"
                >
                  <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">{email}</span>
                  <span className="text-[10px] font-medium text-[var(--brand)]/70 bg-[var(--brand)]/10 px-2 py-0.5 rounded-full">{role}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-gray-700 mt-6">
            © 2024 Al Manzil · Dubai
          </p>
          <div className="mt-4 text-center">
            <Link href="/" className="text-xs text-gray-700 hover:text-[var(--brand)] transition-colors">
              ← Return to Al Manzil
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
