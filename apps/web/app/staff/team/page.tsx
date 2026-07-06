'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, X, Loader2, Shield, ChefHat, UserCheck, UserX,
  KeyRound, Edit2, Check, AlertTriangle, Search, Mail, Calendar, Eye, EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import api from '@/lib/api'

interface StaffMember {
  id: string; name: string; email: string
  role: 'OWNER' | 'MANAGER' | 'STAFF'
  isActive: boolean; createdAt: string; avatarUrl?: string | null
}

const ROLE_META = {
  OWNER:   { label: 'Owner',   icon: Shield,    color: 'var(--brand)', bg: 'rgba(var(--brand-rgb),0.14)', gFrom: 'var(--brand)', gTo: '#fbbf24' },
  MANAGER: { label: 'Manager', icon: UserCheck, color: '#818cf8', bg: 'rgba(129,140,248,0.14)', gFrom: '#818cf8', gTo: '#a5b4fc' },
  STAFF:   { label: 'Staff',   icon: ChefHat,   color: '#34d399', bg: 'rgba(52,211,153,0.14)', gFrom: '#34d399', gTo: '#6ee7b7' },
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ member, size = 48 }: { member: StaffMember; size?: number }) {
  const meta = ROLE_META[member.role]
  if (member.avatarUrl) {
    return <img src={member.avatarUrl} alt={member.name}
      style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
      background: `linear-gradient(135deg, ${meta.gFrom}, ${meta.gTo})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 900, color: '#000',
      boxShadow: `0 4px 16px ${meta.color}40`,
    }}>
      {initials(member.name)}
    </div>
  )
}

// ─── Member Card ─────────────────────────────────────────────────────────────
function MemberCard({ m, isSelf, isOwner, onEdit, onToggle }: {
  m: StaffMember; isSelf: boolean; isOwner: boolean
  onEdit: () => void; onToggle: () => void
}) {
  const meta = ROLE_META[m.role]
  const Icon = meta.icon
  const joined = new Date(m.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{
      backgroundColor: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: 20,
      padding: '20px 20px 16px',
      display: 'flex', flexDirection: 'column', gap: 14,
      opacity: m.isActive ? 1 : 0.55,
      transition: 'box-shadow 0.2s ease',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

      {/* Subtle role color top stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: `linear-gradient(to right, ${meta.gFrom}, ${meta.gTo}, transparent)` }} />

      {/* Top row: avatar + name + badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Avatar member={m} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{m.name}</span>
            {isSelf && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)', letterSpacing: '0.03em' }}>YOU</span>
            )}
            {!m.isActive && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}>Inactive</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 12 }}>
            <Mail size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
          </div>
        </div>

        {/* Role badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
          borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0,
          backgroundColor: meta.bg, color: meta.color,
        }}>
          <Icon size={11} />
          {meta.label}
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 11 }}>
        <Calendar size={11} />
        <span>Joined {joined}</span>
      </div>

      {/* Action row — owner edits staff/manager; owner edits own profile only */}
      {((isOwner && !isSelf && m.role !== 'OWNER') || (isSelf && isOwner && m.role === 'OWNER')) && (
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--card-border)', paddingTop: 12 }}>
          <button onClick={onEdit}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, border: '1px solid var(--card-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Edit2 size={12} /> Edit
          </button>
          {isOwner && !isSelf && m.role !== 'OWNER' && (
            <button onClick={onToggle}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, border: '1px solid var(--card-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = m.isActive ? '#f87171' : '#34d399'
                e.currentTarget.style.color = m.isActive ? '#f87171' : '#34d399'
                e.currentTarget.style.backgroundColor = m.isActive ? 'rgba(239,68,68,0.07)' : 'rgba(52,211,153,0.07)'
              }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'var(--input-bg)' }}>
              {m.isActive ? <><UserX size={12} /> Deactivate</> : <><UserCheck size={12} /> Reactivate</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm outline-none border transition-colors"
        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────
function StaffModal({ member, onClose, onSaved }: {
  member: StaffMember | null; onClose: () => void; onSaved: (m: StaffMember) => void
}) {
  const { token } = useAuthStore()
  const isNew = !member
  const isEditingOwner = member?.role === 'OWNER'
  const [form, setForm] = useState({
    name: member?.name ?? '', email: member?.email ?? '',
    role: member?.role === 'OWNER' ? 'MANAGER' : (member?.role ?? 'STAFF'),
    password: '', confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    setError('')
    if (isNew) {
      if (!form.name.trim() || !form.email.trim() || !form.password) { setError('All fields are required'); return }
      if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
      if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    } else {
      if (!form.name.trim()) { setError('Name is required'); return }
      if (showPass && form.password && form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
      if (showPass && form.password && form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    }
    setSaving(true)
    try {
      const { data } = isNew
        ? await api.post('/users/staff', { name: form.name, email: form.email, password: form.password, role: form.role }, { headers: { Authorization: `Bearer ${token}` } })
        : await api.patch(`/users/staff/${member!.id}`,
            {
              name: form.name.trim(),
              ...(isEditingOwner ? {} : { role: form.role }),
              ...(showPass && form.password ? { password: form.password } : {}),
            },
            { headers: { Authorization: `Bearer ${token}` } })
      onSaved(data); onClose()
    } catch (e: any) { setError(e.message ?? 'Save failed') }
    finally { setSaving(false) }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm outline-none border transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>
              {isNew ? <Plus size={14} style={{ color: 'var(--brand)' }} /> : <Edit2 size={14} style={{ color: 'var(--brand)' }} />}
            </div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {isNew ? 'Add team member' : `Edit ${member!.name.split(' ')[0]}`}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--muted-bg)] transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isNew ? (
            <>
              <Field label="Full Name">
                <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Ahmed Al Farsi"
                  className={inputCls} style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }} />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => f('email', e.target.value)} type="email" placeholder="ahmed@almanzil.ae"
                  className={inputCls} style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Full Name">
                <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Ahmed Al Farsi"
                  className={inputCls} style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }} />
              </Field>
              <Field label="Email">
                <input value={form.email} readOnly
                  className={`${inputCls} opacity-60 cursor-not-allowed`}
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }} />
              </Field>
            </>
          )}
          {!isEditingOwner && (
            <Field label="Role">
              <div className="grid grid-cols-2 gap-2">
                {(['MANAGER', 'STAFF'] as const).map(r => {
                  const meta = ROLE_META[r]; const Icon = meta.icon; const active = form.role === r
                  return (
                    <button key={r} onClick={() => f('role', r)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
                      style={{ borderColor: active ? meta.color : 'var(--card-border)', backgroundColor: active ? meta.bg : 'var(--input-bg)', color: active ? meta.color : 'var(--text-muted)' }}>
                      <Icon size={14} /> {meta.label} {active && <Check size={12} className="ml-auto" />}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                {form.role === 'MANAGER' ? 'Full access — can manage menu, orders, bills & bookings' : 'Limited access — orders, tables & bookings only'}
              </p>
            </Field>
          )}
          {isEditingOwner && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm"
              style={{ borderColor: ROLE_META.OWNER.color, backgroundColor: ROLE_META.OWNER.bg, color: ROLE_META.OWNER.color }}>
              <Shield size={14} />
              <span className="font-semibold">Owner</span>
              <span className="text-[11px] opacity-80 ml-auto">Role cannot be changed</span>
            </div>
          )}
          {isNew ? (
            <>
              <Field label="Password">
                <PasswordInput value={form.password} onChange={v => f('password', v)} placeholder="Min 6 characters" />
              </Field>
              <Field label="Confirm Password">
                <PasswordInput value={form.confirmPassword} onChange={v => f('confirmPassword', v)} placeholder="Repeat password" />
              </Field>
            </>
          ) : (
            <div>
              <button onClick={() => setShowPass(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium mb-2 transition-colors"
                style={{ color: showPass ? 'var(--brand)' : 'var(--text-muted)' }}>
                <KeyRound size={12} /> {showPass ? 'Cancel password reset' : 'Reset password'}
              </button>
              {showPass && (
                <div className="space-y-3">
                  <Field label="New Password">
                    <PasswordInput value={form.password} onChange={v => f('password', v)} placeholder="Min 6 characters" />
                  </Field>
                  <Field label="Confirm New Password">
                    <PasswordInput value={form.confirmPassword} onChange={v => f('confirmPassword', v)} placeholder="Repeat password" />
                  </Field>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)', backgroundColor: 'var(--input-bg)' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ backgroundColor: 'var(--brand)' }}>
            {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />{isNew ? 'Create Account' : 'Save Changes'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Deactivate confirm ───────────────────────────────────────────────────────
function ConfirmDeactivate({ member, onClose, onConfirm, saving }: {
  member: StaffMember; onClose: () => void; onConfirm: () => void; saving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-6 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: member.isActive ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.12)' }}>
            {member.isActive ? <UserX size={22} className="text-red-400" /> : <UserCheck size={22} className="text-emerald-400" />}
          </div>
          <p className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
            {member.isActive ? 'Deactivate' : 'Reactivate'} {member.name.split(' ')[0]}?
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {member.isActive
              ? 'They will no longer be able to log into the staff portal.'
              : 'They will regain access with their existing password.'}
          </p>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)', backgroundColor: 'var(--input-bg)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={saving}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all ${member.isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {member.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { token, user: me, setAuth } = useAuthStore()
  const isOwner = me?.role === 'OWNER'

  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'create' | StaffMember | null>(null)
  const [confirmMember, setConfirmMember] = useState<StaffMember | null>(null)
  const [toggling, setToggling] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'OWNER' | 'MANAGER' | 'STAFF'>('ALL')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get('/users/staff', { headers: { Authorization: `Bearer ${token}` } })
      setMembers(data ?? [])
    } catch (e: any) { setError(e.message ?? 'Failed to load team') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  const handleSaved = (saved: StaffMember) => {
    setMembers(prev => {
      const idx = prev.findIndex(m => m.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [...prev, saved]
    })
    if (me?.id === saved.id && token) {
      setAuth({ ...me, name: saved.name, email: saved.email, role: saved.role }, token)
    }
  }

  const toggleActive = async () => {
    if (!confirmMember) return
    setToggling(true)
    try {
      const { data } = await api.patch(`/users/staff/${confirmMember.id}`, { isActive: !confirmMember.isActive }, { headers: { Authorization: `Bearer ${token}` } })
      handleSaved(data); setConfirmMember(null)
    } catch (e: any) { alert(e.message ?? 'Failed') }
    finally { setToggling(false) }
  }

  const counts = {
    ALL: members.length,
    OWNER: members.filter(m => m.role === 'OWNER').length,
    MANAGER: members.filter(m => m.role === 'MANAGER').length,
    STAFF: members.filter(m => m.role === 'STAFF').length,
  }
  const activeCount = members.filter(m => m.isActive).length

  const filtered = (filter === 'ALL' ? members : members.filter(m => m.role === filter))
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="flex flex-col flex-1">

        {/* ── Page header ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)' }}>
                <Users size={16} style={{ color: 'var(--brand)' }} />
              </div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Team</h1>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                {activeCount} active
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.1)' }}>
                {counts.OWNER} owner{counts.OWNER !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">
                {counts.MANAGER} manager{counts.MANAGER !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                {counts.STAFF} staff
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative flex-1 lg:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:border-[var(--brand)] focus:bg-white dark:focus:bg-gray-900 transition-all placeholder-gray-400"
              />
            </div>
            {isOwner && (
              <button onClick={() => setModal('create')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex-shrink-0"
                style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                <Plus size={14} /> Add Member
              </button>
            )}
          </div>
        </div>

        {/* ── Role filter tabs ── */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
          {(['ALL', 'OWNER', 'MANAGER', 'STAFF'] as const).map(r => {
            const isActive = filter === r
            return (
              <button key={r} onClick={() => setFilter(r)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
                  ${isActive
                    ? ''
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                style={isActive ? { backgroundColor: 'var(--brand)', color: '#000' } : undefined}>
                {r === 'ALL' ? 'All' : ROLE_META[r].label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isActive ? 'bg-white/20' : 'bg-white dark:bg-gray-900 text-gray-400'}`}>
                  {counts[r]}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div className="p-4 sm:p-6 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <AlertTriangle size={28} className="text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={load} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--muted-bg)' }}>
                <Users size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                {search ? 'No results match your search' : 'No members in this category'}
              </p>
              {search && <button onClick={() => setSearch('')} className="text-xs" style={{ color: 'var(--brand)' }}>Clear search</button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(m => (
                <MemberCard key={m.id} m={m} isSelf={m.id === me?.id} isOwner={isOwner}
                  onEdit={() => setModal(m)}
                  onToggle={() => setConfirmMember(m)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <StaffModal member={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {confirmMember && (
        <ConfirmDeactivate member={confirmMember} onClose={() => setConfirmMember(null)} onConfirm={toggleActive} saving={toggling} />
      )}
    </>
  )
}
