'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Tag, Calendar, Pencil, Trash2, Percent, Banknote, Check, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Offer {
  id: string; name: string; nameAr?: string
  scope: 'ALL' | 'CATEGORY' | 'ITEM'; categoryIds: string[]; itemIds: string[]
  type: 'PERCENT' | 'FIXED'; value: number
  startsAt: string; endsAt: string; isActive: boolean
  bannerText?: string; bannerTextAr?: string
}
interface Category { id: string; name: string }
interface MenuItemLite { id: string; name: string; category?: { name: string } }

const OFFER_COLORS: Record<string, string> = { PERCENT: '#ef4444', FIXED: '#f97316' }

// In-page dropdown (not a native <select>) — avoids the OS full-screen picker on mobile
// that made the "Applies to" / "Discount type" menus confusing.
function Dropdown({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const current = options.find(o => o.value === value)
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
        style={{ background: 'var(--muted-bg)', border: `1px solid ${open ? 'var(--brand)' : 'var(--card-border)'}`, color: 'var(--text-primary)' }}>
        {current?.label ?? value}
        <ChevronDown size={14} className="transition-transform flex-shrink-0" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left transition-colors"
              style={{ color: o.value === value ? 'var(--brand)' : 'var(--text-primary)', background: o.value === value ? 'rgba(var(--brand-rgb),0.08)' : 'transparent' }}>
              {o.label}
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const tzOff = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOff).toISOString().slice(0, 16)
}

const emptyDraft = (): Partial<Offer> => ({
  name: '', scope: 'ALL', categoryIds: [], itemIds: [], type: 'PERCENT', value: 10,
  startsAt: toLocalInput(new Date().toISOString()),
  endsAt: toLocalInput(new Date(Date.now() + 7 * 86400_000).toISOString()),
  isActive: true, bannerText: '',
})

export default function OffersSection() {
  const { token } = useAuthStore()
  const [offers, setOffers] = useState<Offer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItemLite[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Partial<Offer>>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [offersRes, catRes, itemsRes] = await Promise.all([
        api.get('/offers', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/menu/categories'),
        api.get('/menu/items?all=true'),
      ])
      setOffers(offersRes.data ?? [])
      setCategories(catRes.data ?? [])
      setItems((itemsRes.data ?? []).map((i: any) => ({ id: i.id, name: i.name, category: i.category })))
    } catch {
      toast.error('Could not load offers')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setDraft(emptyDraft())
    setCreating(true); setEditingId(null); setError('')
  }
  function openEdit(o: Offer) {
    setDraft({ ...o, startsAt: toLocalInput(o.startsAt), endsAt: toLocalInput(o.endsAt) })
    setEditingId(o.id); setCreating(false); setError('')
  }
  function closeForm() { setCreating(false); setEditingId(null); setError('') }

  async function save() {
    if (!draft.name?.trim()) { setError('Name is required'); return }
    if (draft.scope === 'CATEGORY' && !(draft.categoryIds?.length)) { setError('Select at least one category'); return }
    if (draft.scope === 'ITEM' && !(draft.itemIds?.length)) { setError('Select at least one item'); return }
    setError(''); setSaving(true)
    try {
      if (creating) {
        await api.post('/offers', draft, { headers: { Authorization: `Bearer ${token}` } })
        toast.success('Offer created')
      } else if (editingId) {
        await api.patch(`/offers/${editingId}`, draft, { headers: { Authorization: `Bearer ${token}` } })
        toast.success('Offer updated')
      }
      closeForm()
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not save offer')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this offer?')) return
    try {
      await api.delete(`/offers/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      toast.success('Offer deleted')
      setOffers(prev => prev.filter(o => o.id !== id))
    } catch {
      toast.error('Could not delete offer')
    }
  }

  async function toggleActive(o: Offer) {
    try {
      await api.patch(`/offers/${o.id}`, { isActive: !o.isActive }, { headers: { Authorization: `Bearer ${token}` } })
      setOffers(prev => prev.map(x => x.id === o.id ? { ...x, isActive: !x.isActive } : x))
    } catch {
      toast.error('Could not update offer')
    }
  }

  function offerStatus(o: Offer): { label: string; color: string } {
    const now = Date.now()
    const start = new Date(o.startsAt).getTime()
    const end = new Date(o.endsAt).getTime()
    if (!o.isActive) return { label: 'Disabled', color: '#6b7280' }
    if (now < start) return { label: 'Scheduled', color: '#60a5fa' }
    if (now > end) return { label: 'Expired', color: '#6b7280' }
    return { label: 'Live', color: '#4ade80' }
  }

  const scopeLabel = (o: { scope: string; categoryIds: string[]; itemIds: string[] }) => o.scope === 'ALL'
    ? 'Whole menu'
    : o.scope === 'CATEGORY'
      ? `${o.categoryIds.length} categor${o.categoryIds.length === 1 ? 'y' : 'ies'}`
      : `${o.itemIds.length} item${o.itemIds.length === 1 ? '' : 's'}`

  const isOpen = creating || !!editingId
  const accentColor = OFFER_COLORS[draft.type ?? 'PERCENT']

  return (
    <div className="p-4 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Seasonal Offers</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Time-boxed discounts, applied automatically at checkout.
          </p>
        </div>
        {!isOpen && (
          <button type="button" onClick={openCreate}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--brand)', color: '#000' }}>
            + New Offer
          </button>
        )}
      </div>

      {/* Inline form */}
      {isOpen && (
        <div className="rounded-2xl p-5 space-y-5" style={{ border: `1.5px solid ${accentColor}`, background: 'var(--card-bg)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {creating ? 'New Offer' : `Edit "${offers.find(o => o.id === editingId)?.name}"`}
          </p>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Offer name
            </label>
            <input
              type="text" value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Ramadan Special"
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Discount type
              </label>
              <Dropdown value={draft.type ?? 'PERCENT'} onChange={v => setDraft(d => ({ ...d, type: v as any }))}
                options={[{ value: 'PERCENT', label: 'Percent off' }, { value: 'FIXED', label: 'Fixed AED off' }]} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {draft.type === 'FIXED' ? 'Amount (AED)' : 'Percent (%)'}
              </label>
              <input type="number" min={0} max={draft.type === 'PERCENT' ? 100 : undefined} value={draft.value ?? 0}
                onChange={e => setDraft(d => ({ ...d, value: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Applies to
            </label>
            <Dropdown value={draft.scope ?? 'ALL'} onChange={v => setDraft(d => ({ ...d, scope: v as any, categoryIds: [], itemIds: [] }))}
              options={[
                { value: 'ALL', label: 'Whole menu' },
                { value: 'CATEGORY', label: 'Specific categories' },
                { value: 'ITEM', label: 'Specific items' },
              ]} />
          </div>

          {draft.scope === 'CATEGORY' && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--text-muted)' }}>
                Categories
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {categories.map(c => {
                  const on = (draft.categoryIds ?? []).includes(c.id)
                  return (
                    <button type="button" key={c.id}
                      onClick={() => setDraft(d => {
                        const cur = d.categoryIds ?? []
                        return { ...d, categoryIds: cur.includes(c.id) ? cur.filter(x => x !== c.id) : [...cur, c.id] }
                      })}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all"
                      style={{ background: on ? `${accentColor}14` : 'var(--muted-bg)', border: `1.5px solid ${on ? accentColor : 'var(--card-border)'}`, color: on ? accentColor : 'var(--text-muted)' }}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {draft.scope === 'ITEM' && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: 'var(--text-muted)' }}>
                Items
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {items.map(i => {
                  const on = (draft.itemIds ?? []).includes(i.id)
                  return (
                    <button type="button" key={i.id}
                      onClick={() => setDraft(d => {
                        const cur = d.itemIds ?? []
                        return { ...d, itemIds: cur.includes(i.id) ? cur.filter(x => x !== i.id) : [...cur, i.id] }
                      })}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all min-w-0"
                      style={{ background: on ? `${accentColor}14` : 'var(--muted-bg)', border: `1.5px solid ${on ? accentColor : 'var(--card-border)'}`, color: on ? accentColor : 'var(--text-muted)' }}>
                      <span className="truncate">{i.name}</span>
                      <span className="flex-shrink-0 opacity-60">· {i.category?.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Starts
              </label>
              <input type="datetime-local" value={draft.startsAt ?? ''} onChange={e => setDraft(d => ({ ...d, startsAt: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Ends
              </label>
              <input type="datetime-local" value={draft.endsAt ?? ''} onChange={e => setDraft(d => ({ ...d, endsAt: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Banner text <span className="normal-case font-normal opacity-60">— optional</span>
            </label>
            <input value={draft.bannerText ?? ''} onChange={e => setDraft(d => ({ ...d, bannerText: e.target.value }))}
              placeholder="Shown at the top of the guest menu"
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }} />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--brand)', color: '#000' }}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Saving…' : creating ? 'Create Offer' : 'Save Changes'}
            </button>
            <button type="button" onClick={closeForm}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Offer list — card grid, same visual language as Roles */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>No offers yet</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {offers.map(o => {
            const status = offerStatus(o)
            const color = OFFER_COLORS[o.type]
            return (
              <div key={o.id} className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
                <div className="pl-5 pr-4 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{o.name}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                        style={{ background: `${status.color}18`, color: status.color }}>
                        ● {status.label}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" onClick={() => openEdit(o)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted-bg)]" style={{ color: 'var(--text-muted)' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => remove(o.id)}
                        className="p-1.5 rounded-lg transition-colors" style={{ color: '#f87171' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>
                        {o.type === 'PERCENT' ? <Percent size={9} /> : <Banknote size={9} />}
                        {o.type === 'PERCENT' ? `${o.value}% OFF` : `AED ${Number(o.value).toFixed(0)} OFF`}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                        <Tag size={9} /> {scopeLabel(o)}
                      </span>
                    </div>
                    <p className="text-[10px] flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                      <Calendar size={10} />
                      {new Date(o.startsAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })} – {new Date(o.endsAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>

                  {o.bannerText && (
                    <p className="text-[10px] italic mt-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                      "{o.bannerText}"
                    </p>
                  )}

                  <button type="button" onClick={() => toggleActive(o)}
                    className="w-full mt-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                    style={{ background: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                    {o.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
