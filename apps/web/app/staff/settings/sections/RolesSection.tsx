'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Loader2, Lock, Unlock, UserCog, Trash2 as TrashIcon } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import api from '@/lib/api'
import { useConfirm } from '@/lib/confirm'

const MODULE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard',  desc: 'Home / overview screen' },
  { key: 'orders',    label: 'Orders',     desc: 'Live order management & kitchen flow' },
  { key: 'tables',    label: 'Tables',     desc: 'Table status & floor plan' },
  { key: 'bookings',  label: 'Bookings',   desc: 'Reservations management' },
  { key: 'bills',     label: 'Bills',      desc: 'Bill settlement & receipts' },
  { key: 'menu',      label: 'Menu',       desc: 'Add/edit/remove menu items' },
  { key: 'analytics', label: 'Analytics',  desc: 'Revenue & operational reports' },
  { key: 'team',      label: 'Team',       desc: 'Staff management' },
  { key: 'kitchen',   label: 'Kitchen',    desc: 'KDS screen access' },
] as const

interface StaffRoleData { id: string; name: string; color: string; permissions: string[]; isSystem: boolean }

const ROLE_COLORS = ['#818cf8','#34d399','#f59e0b','#f97316','#ec4899','#14b8a6','#8b5cf6','#06b6d4']

export default function RolesSection() {
  const { token, updatePermissions, user } = useAuthStore()
  const [roles, setRoles]     = useState<StaffRoleData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating]   = useState(false)
  const [draft, setDraft] = useState<{ name: string; color: string; permissions: string[] }>({
    name: '', color: ROLE_COLORS[0], permissions: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const { confirm: confirmDel, dialog: confirmDelDialog } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/roles', { headers: { Authorization: `Bearer ${token}` } })
      setRoles(data)
    } catch { setError('Failed to load roles') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setDraft({ name: '', color: ROLE_COLORS[0], permissions: [] })
    setCreating(true); setEditingId(null); setError('')
  }
  const openEdit = (r: StaffRoleData) => {
    setDraft({ name: r.name, color: r.color, permissions: [...r.permissions] })
    setEditingId(r.id); setCreating(false); setError('')
  }
  const closeForm = () => { setCreating(false); setEditingId(null); setError('') }

  const togglePerm = (key: string) =>
    setDraft(p => ({
      ...p,
      permissions: p.permissions.includes(key)
        ? p.permissions.filter(k => k !== key)
        : [...p.permissions, key],
    }))

  const save = async () => {
    if (!draft.name.trim()) { setError('Role name is required'); return }
    setError(''); setSaving(true)
    try {
      if (creating) {
        const { data } = await api.post('/roles', draft, { headers: { Authorization: `Bearer ${token}` } })
        setRoles(p => [...p, data])
        closeForm()
      } else if (editingId) {
        const { data } = await api.patch(`/roles/${editingId}`, draft, { headers: { Authorization: `Bearer ${token}` } })
        setRoles(p => p.map(r => r.id === editingId ? data : r))
        if (user?.staffRoleId === editingId)
          updatePermissions({ id: data.id, name: data.name, color: data.color, permissions: data.permissions })
        closeForm()
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed')
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    const ok = await confirmDel({ title: 'Delete this role?', message: 'Assigned staff will revert to their default access.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await api.delete(`/roles/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      setRoles(p => p.filter(r => r.id !== id))
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Delete failed') }
  }

  const isOpen = creating || !!editingId

  return (
    <>
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Staff Roles</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Define roles and pick which modules each one can access. Assign in Team page — takes effect instantly.
          </p>
        </div>
        {!isOpen && (
          <button type="button" onClick={openCreate}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--brand)', color: '#000' }}>
            + New Role
          </button>
        )}
      </div>

      {/* Form */}
      {isOpen && (
        <div className="rounded-2xl p-5 space-y-5"
          style={{ border: `1.5px solid ${draft.color}`, background: 'var(--card-bg)' }}>

          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {creating ? 'New Role' : `Edit "${roles.find(r => r.id === editingId)?.name}"`}
          </p>

          {/* Name + color */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Role name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Senior Waiter, Head Cashier…"
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Badge color
              </label>
              <div className="flex gap-2 flex-wrap">
                {ROLE_COLORS.map(c => (
                  <button type="button" key={c} onClick={() => setDraft(p => ({ ...p, color: c }))}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      background: c,
                      outline: draft.color === c ? `3px solid ${c}` : '2px solid transparent',
                      outlineOffset: 2,
                      opacity: draft.color === c ? 1 : 0.55,
                    }} />
                ))}
              </div>
            </div>
          </div>

          {/* Module toggles */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--text-muted)' }}>
              Module access
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODULE_PERMISSIONS.map(({ key, label, desc }) => {
                const on = draft.permissions.includes(key)
                return (
                  <button type="button" key={key} onClick={() => togglePerm(key)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all w-full"
                    style={{
                      background: on ? `${draft.color}14` : 'var(--muted-bg)',
                      border: `1.5px solid ${on ? draft.color : 'var(--card-border)'}`,
                    }}>
                    <span className="flex-shrink-0 w-4 flex justify-center">
                      {on
                        ? <Unlock size={13} style={{ color: draft.color }} />
                        : <Lock size={13} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold" style={{ color: on ? draft.color : 'var(--text-muted)' }}>{label}</span>
                      <span className="block text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>{desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              Settings is always OWNER-only and cannot be granted.
            </p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--brand)', color: '#000' }}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save Role'}
            </button>
            <button type="button" onClick={closeForm}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Role list — card grid */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>No roles yet</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roles.map(r => (
            <div key={r.id} className="relative rounded-2xl overflow-hidden"
              style={{ border: `1px solid var(--card-border)`, background: 'var(--card-bg)' }}>
              {/* Left color accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: r.color }} />

              <div className="pl-5 pr-4 pt-4 pb-3">
                {/* Name row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                    {r.isSystem && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ background: `${r.color}18`, color: r.color }}>
                        System
                      </span>
                    )}
                  </div>
                  {/* Actions top-right */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted-bg)]"
                      style={{ color: 'var(--text-muted)' }}>
                      <UserCog size={13} />
                    </button>
                    {!r.isSystem && (
                      <button type="button" onClick={() => remove(r.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: '#f87171' }}>
                        <TrashIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Permission pills */}
                <div className="flex flex-wrap gap-1">
                  {r.permissions.length === 0
                    ? <span className="text-[11px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>No modules</span>
                    : (r.permissions as string[]).map(p => (
                      <span key={p} className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                        style={{ background: `${r.color}18`, color: r.color }}>
                        {p}
                      </span>
                    ))}
                </div>

                {/* Module count footer */}
                <p className="text-[10px] mt-2.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  {r.permissions.length} of {MODULE_PERMISSIONS.length} modules
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>How roles work</p>
        <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <li>• OWNER always has full access — cannot be restricted</li>
          <li>• Assign a role to any staff member in the Team page</li>
          <li>• Editing a role updates permissions instantly for everyone on it</li>
          <li>• System roles can be edited but not deleted</li>
        </ul>
      </div>
    </div>
    {confirmDelDialog}
    </>
  )
}
