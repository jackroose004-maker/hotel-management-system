'use client'
import { useState, useEffect, useCallback } from 'react'
import { ModalBackdrop } from '@/components/ModalBackdrop'
import {
  Users, Plus, X, Loader2, Shield, ChefHat, UserCheck, UserX,
  KeyRound, Edit2, Check, AlertTriangle, Search, Mail, Calendar, Eye, EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import api from '@/lib/api'

interface StaffRoleOption { id: string; name: string; color: string; permissions: string[] }

interface StaffMember {
  id: string; name: string; email: string
  role: 'OWNER' | 'STAFF'
  isActive: boolean; createdAt: string; avatarUrl?: string | null
  staffRoleId?: string | null
  staffRole?: StaffRoleOption | null
}

const ROLE_META = {
  OWNER:   { label: 'Owner',   icon: Shield,    color: 'var(--brand)', bg: 'rgba(var(--brand-rgb),0.14)', gFrom: 'var(--brand)', gTo: '#fbbf24' },
  MANAGER: { label: 'Manager', icon: UserCheck, color: '#818cf8', bg: 'rgba(129,140,248,0.14)', gFrom: '#818cf8', gTo: '#a5b4fc' },
  STAFF:   { label: 'Staff',   icon: Users,     color: '#34d399', bg: 'rgba(52,211,153,0.14)', gFrom: '#34d399', gTo: '#6ee7b7' },
  CHEF:    { label: 'Chef',    icon: ChefHat,   color: '#f97316', bg: 'rgba(249,115,22,0.14)', gFrom: '#f97316', gTo: '#fb923c' },
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ member, size = 48 }: { member: StaffMember; size?: number }) {
  const meta = ROLE_META[member.role] ?? ROLE_META.STAFF
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
  const meta = ROLE_META[m.role] ?? ROLE_META.STAFF
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

        {/* System role badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
          borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0,
          backgroundColor: meta.bg, color: meta.color,
        }}>
          <Icon size={11} />
          {m.role === 'OWNER' ? 'Owner' : m.staffRole ? m.staffRole.name : meta.label}
        </div>
      </div>

      {/* Module permissions chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {m.role === 'OWNER' ? (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>Full Access</span>
        ) : m.staffRole && m.staffRole.permissions.length > 0 ? (
          <>
            {m.staffRole.permissions.slice(0, 4).map((p: string) => (
              <span key={p} style={{
                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, textTransform: 'capitalize',
                backgroundColor: `${m.staffRole!.color}18`, color: m.staffRole!.color,
              }}>{p}</span>
            ))}
            {m.staffRole.permissions.length > 4 && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.55 }}>+{m.staffRole.permissions.length - 4}</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.45 }}>
            {m.staffRole ? 'No modules assigned' : 'No role assigned'}
          </span>
        )}
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

// Derive system Role enum from a custom role's permissions
function deriveRoleEnum(_permissions: string[]): 'STAFF' {
  // DB Role enum only has OWNER | STAFF. Manager/Chef/Waiter etc. are
  // custom roles stored in staffRole — the DB field is always STAFF.
  return 'STAFF'
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────
function StaffModal({ member, onClose, onSaved }: {
  member: StaffMember | null; onClose: () => void; onSaved: (m: StaffMember) => void
}) {
  const { token } = useAuthStore()
  const isNew = !member
  const isEditingOwner = member?.role === 'OWNER'

  const [name, setName]               = useState(member?.name ?? '')
  const [email, setEmail]             = useState(member?.email ?? '')
  const [emailChanged, setEmailChanged] = useState(false)
  const [password, setPassword]       = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [staffRoleId, setStaffRoleId] = useState<string | null>(member?.staffRoleId ?? null)
  const [availableRoles, setAvailableRoles] = useState<StaffRoleOption[]>([])
  const [rolesLoading, setRolesLoading]     = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.get('/roles', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setAvailableRoles(r.data); setRolesLoading(false) })
      .catch(() => setRolesLoading(false))
  }, [token])

  const selectedRole = staffRoleId ? availableRoles.find(r => r.id === staffRoleId) ?? null : null

  const submit = async () => {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (isNew) {
      if (!email.trim() || !password) { setError('All fields are required'); return }
      if (password !== confirmPw) { setError('Passwords do not match'); return }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    } else {
      if (showPass && password && password !== confirmPw) { setError('Passwords do not match'); return }
      if (showPass && password && password.length < 6) { setError('Password must be at least 6 characters'); return }
    }

    // Derive the system role enum from the selected custom role, or keep existing
    const derivedRole = selectedRole
      ? deriveRoleEnum(selectedRole.permissions)
      : isNew ? 'STAFF' : (member?.role === 'OWNER' ? undefined : member?.role)

    setSaving(true)
    try {
      const { data } = isNew
        ? await api.post('/users/staff',
            { name: name.trim(), email: email.trim(), password, role: derivedRole, staffRoleId: staffRoleId ?? undefined },
            { headers: { Authorization: `Bearer ${token}` } })
        : await api.patch(`/users/staff/${member!.id}`,
            {
              name: name.trim(),
              ...(isEditingOwner ? {} : {
                role: derivedRole,
                staffRoleId,
                ...(emailChanged ? { email: email.trim() } : {}),
              }),
              ...(showPass && password ? { password } : {}),
            },
            { headers: { Authorization: `Bearer ${token}` } })
      onSaved(data); onClose()
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? 'Save failed') }
    finally { setSaving(false) }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm outline-none border transition-colors"
  const inputStyle = { backgroundColor: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }

  return (
    <ModalBackdrop onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
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

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Name */}
          <Field label="Full Name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ahmed Al Farsi"
              className={inputCls} style={inputStyle} />
          </Field>

          {/* Email */}
          <Field label="Email">
            {isNew ? (
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="ahmed@almanzil.ae"
                className={inputCls} style={inputStyle} />
            ) : isEditingOwner ? (
              <input value={email} readOnly className={`${inputCls} opacity-60 cursor-not-allowed`}
                style={{ ...inputStyle, color: 'var(--text-muted)' }} />
            ) : (
              <>
                <input value={email} onChange={e => { setEmail(e.target.value); setEmailChanged(e.target.value !== member!.email) }}
                  type="email" className={inputCls} style={inputStyle} />
                {emailChanged && (
                  <p className="text-[11px] mt-1.5 px-1" style={{ color: '#fb923c' }}>
                    ⚠ A new temp password will be emailed to this address and they must change it on next login.
                  </p>
                )}
              </>
            )}
          </Field>
          {isNew && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ backgroundColor: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.18)', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--brand)', flexShrink: 0 }}>✉</span>
              <span>A welcome email with login credentials will be sent. Staff must set a new password on first login.</span>
            </div>
          )}

          {/* Role — single unified picker */}
          {isEditingOwner ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm"
              style={{ borderColor: ROLE_META.OWNER.color, backgroundColor: ROLE_META.OWNER.bg, color: ROLE_META.OWNER.color }}>
              <Shield size={14} />
              <span className="font-semibold">Owner</span>
              <span className="text-[11px] opacity-80 ml-auto">Role cannot be changed</span>
            </div>
          ) : (
            <Field label="Role">
              {rolesLoading ? (
                <div className="flex items-center gap-2 py-2" style={{ color: 'var(--text-muted)' }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">Loading roles…</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Role cards */}
                  <div className="grid grid-cols-1 gap-2">
                    {availableRoles.map(r => {
                      const active = staffRoleId === r.id
                      return (
                        <button type="button" key={r.id} onClick={() => setStaffRoleId(active ? null : r.id)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all w-full"
                          style={{
                            borderColor: active ? r.color : 'var(--card-border)',
                            backgroundColor: active ? `${r.color}10` : 'var(--input-bg)',
                          }}>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold" style={{ color: active ? r.color : 'var(--text-primary)' }}>
                              {r.name}
                            </span>
                            <span className="block text-[11px] mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>
                              {r.permissions.length === 0
                                ? 'No modules'
                                : r.permissions.slice(0, 4).join(', ') + (r.permissions.length > 4 ? ` +${r.permissions.length - 4}` : '')}
                            </span>
                          </div>
                          {active && <Check size={14} style={{ color: r.color, flexShrink: 0 }} />}
                        </button>
                      )
                    })}
                  </div>
                  {!staffRoleId && (
                    <p className="text-[11px] px-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                      Select a role above to set module access for this person.
                    </p>
                  )}
                </div>
              )}
            </Field>
          )}

          {/* Password */}
          {isNew ? (
            <>
              <Field label="Password">
                <PasswordInput value={password} onChange={setPassword} placeholder="Min 6 characters" />
              </Field>
              <Field label="Confirm Password">
                <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Repeat password" />
              </Field>
            </>
          ) : (
            <div>
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium mb-2 transition-colors"
                style={{ color: showPass ? 'var(--brand)' : 'var(--text-muted)' }}>
                <KeyRound size={12} /> {showPass ? 'Cancel password reset' : 'Reset password'}
              </button>
              {showPass && (
                <div className="space-y-3">
                  <Field label="New Password">
                    <PasswordInput value={password} onChange={setPassword} placeholder="Min 6 characters" />
                  </Field>
                  <Field label="Confirm New Password">
                    <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Repeat password" />
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

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)', backgroundColor: 'var(--input-bg)' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />{isNew ? 'Create Account' : 'Save Changes'}</>}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ─── Deactivate confirm ───────────────────────────────────────────────────────
function ConfirmDeactivate({ member, onClose, onConfirm, saving }: {
  member: StaffMember; onClose: () => void; onConfirm: () => void; saving: boolean
}) {
  return (
    <ModalBackdrop onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }} onClick={e => e.stopPropagation()}>
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
    </ModalBackdrop>
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
  const [filter, setFilter] = useState<string>('ALL')
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

  // Build dynamic tab list: All | Owner | <custom role names>
  const customRoleNames = Array.from(
    new Set(members.filter(m => m.staffRole?.name).map(m => m.staffRole!.name))
  ).sort()
  const filterTabs = ['ALL', 'OWNER', ...customRoleNames]

  const countFor = (tab: string) => {
    if (tab === 'ALL') return members.length
    if (tab === 'OWNER') return members.filter(m => m.role === 'OWNER').length
    return members.filter(m => m.staffRole?.name === tab).length
  }

  const activeCount = members.filter(m => m.isActive).length

  const filtered = members
    .filter(m => {
      if (filter === 'ALL') return true
      if (filter === 'OWNER') return m.role === 'OWNER'
      return m.staffRole?.name === filter
    })
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="flex flex-col flex-1">

        {/* ── Page header ── */}
        <div className="h-14 flex items-center gap-2 px-4 sm:px-6 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">Team</h1>
          {/* Role filter tabs inline — desktop */}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            {filterTabs.map(tab => (
              <button key={tab} onClick={() => setFilter(tab)}
                className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                style={filter === tab
                  ? { backgroundColor: 'var(--brand)', color: '#000' }
                  : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                {tab === 'ALL' ? 'All' : tab}
                <span className="text-[10px] font-bold opacity-70">{countFor(tab)}</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative hidden sm:block w-48">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="w-full pl-7 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg text-xs focus:outline-none focus:border-[var(--brand)] transition-all placeholder-gray-400" />
            </div>
            {isOwner && (
              <button onClick={() => setModal('create')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex-shrink-0"
                style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                <Plus size={13} /><span className="hidden sm:inline">Add Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile: search + filter tabs */}
        <div className="sm:hidden border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
          <div className="px-4 pt-2 pb-1">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
                className="w-full pl-7 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs focus:outline-none focus:border-[var(--brand)] transition-all placeholder-gray-400" style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2">
            {filterTabs.map(tab => (
              <button key={tab} onClick={() => setFilter(tab)}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
                style={filter === tab
                  ? { backgroundColor: 'var(--brand)', color: '#000' }
                  : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                {tab === 'ALL' ? 'All' : tab} <span className="opacity-60">{countFor(tab)}</span>
              </button>
            ))}
          </div>
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
