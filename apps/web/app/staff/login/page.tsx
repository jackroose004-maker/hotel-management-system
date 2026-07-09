'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useBrandStore } from '@/store/brand'

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
      if (!['OWNER', 'MANAGER', 'STAFF', 'CHEF'].includes(data.user.role)) {
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
    <div className="min-h-screen bg-[#080808] flex overflow-hidden">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">

        {/* Ambient glows */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[var(--brand)]/10 blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[var(--brand)]/6 blur-[120px] pointer-events-none" />

        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />

        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 w-fit">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-9 h-9 rounded-xl object-cover" />
              : <div className="w-9 h-9 rounded-xl bg-[var(--brand)] flex items-center justify-center">
                  <UtensilsCrossed size={18} className="text-black" />
                </div>
            }
            <span className="text-white font-bold text-lg">{brandName}</span>
          </Link>

          {/* Centre copy */}
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

          {/* Feature tiles */}
          <div className="grid grid-cols-2 gap-2.5 pb-2">
            {[
              ['Live Orders', 'Real-time kitchen updates'],
              ['Table Control', 'Status at a glance'],
              ['Bookings', 'Reservation management'],
              ['Analytics', 'Revenue & insights'],
            ].map(([title, desc]) => (
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

        {/* Mobile-only ambient glows */}
        <div className="lg:hidden absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full pointer-events-none bg-[var(--brand)]/20 blur-[100px]" />
        <div className="lg:hidden absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full pointer-events-none bg-[var(--brand)]/10 blur-[80px]" />

        {/* Top nav */}
        <div className="flex items-center justify-end px-8 pt-8 pb-4">
          <div className="flex items-center gap-2 lg:hidden">
            {logoUrl
              ? <img src={logoUrl} alt={brandName} className="w-7 h-7 rounded-lg object-cover" />
              : <div className="w-7 h-7 rounded-lg bg-[var(--brand)] flex items-center justify-center">
                  <UtensilsCrossed size={14} className="text-black" />
                </div>
            }
            <span className="text-white text-sm font-bold">{brandName}</span>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 flex flex-col justify-center px-8 pb-8">

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
                className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all text-white placeholder-white/20 [color-scheme:dark]"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.6)'}
                onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'}
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
                  className="w-full rounded-xl px-4 py-3.5 pr-12 text-sm outline-none transition-all text-white placeholder-white/20 [color-scheme:dark]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => e.currentTarget.style.border = '1px solid rgba(var(--brand-rgb),0.6)'}
                  onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full mt-2 font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 0 32px rgba(var(--brand-rgb),0.25)' }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-8 rounded-xl p-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Demo credentials</p>
            <div className="space-y-1">
              {[
                ['Owner', 'owner@hotel.com', 'owner123'],
                ['Manager', 'manager@hotel.com', 'manager123'],
                ['Staff', 'staff@hotel.com', 'staff123'],
                ['Chef', 'chef@hotel.com', 'chef123'],
              ].map(([role, email, pw]) => (
                <button key={role} type="button" onClick={() => setForm({ email, password: pw })}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5 group text-left">
                  <span className="text-xs text-white/35 group-hover:text-white/60 transition-colors font-mono">{email}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.12)' }}>{role}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-white/[0.04] text-center space-y-2">
            <p className="text-xs text-white/20">© 2024 {brandName} · Dubai</p>
            <Link href="/" className="text-xs text-white/25 hover:text-[var(--brand)] transition-colors">
              ← Return to {brandName}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
