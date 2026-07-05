'use client'
import { useEffect, useState } from 'react'
import {
  Plus, Search, X, FolderPlus, Clock, Tag,
  UtensilsCrossed, Pencil, Trash2, ToggleLeft, ToggleRight, Check, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import ImageUpload from '@/components/ui/ImageUpload'

interface ModifierOption {
  id: string; name: string; priceAdd: number; isDefault: boolean
}
interface ModifierGroup {
  id: string; name: string; required: boolean; options: ModifierOption[]
}
interface MenuItem {
  id: string; name: string; price: number; isAvailable: boolean
  prepTimeMins: number; description?: string; imageUrl?: string; categoryId?: string
  modifierGroups?: ModifierGroup[]
}
interface Category { id: string; name: string; items: MenuItem[] }
type SearchItem = MenuItem & { categoryName: string }

const BLANK = { name: '', description: '', price: '', prepTimeMins: '15', categoryId: '', imageUrl: '' }

// ─── Thumb ─────────────────────────────────────────────────────────────────
function Thumb({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' | 'cover' }) {
  const [failed, setFailed] = useState(false)
  if (size === 'cover') {
    if (!src || failed) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/10 flex items-center justify-center">
          <UtensilsCrossed size={26} className="text-orange-300" />
        </div>
      )
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setFailed(true)} />
  }
  const dim = size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'
  const icon = size === 'lg' ? 20 : size === 'sm' ? 12 : 15
  if (!src || failed) {
    return (
      <div className={`${dim} rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/25 dark:to-amber-900/10 flex items-center justify-center flex-shrink-0`}>
        <UtensilsCrossed size={icon} className="text-orange-300" />
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className={`${dim} rounded-xl object-cover flex-shrink-0`} onError={() => setFailed(true)} />
}

// ─── Edit / Add Modal ──────────────────────────────────────────────────────
function ItemModal({ item, categories, onClose, onSave }: {
  item: Partial<MenuItem> | null
  categories: Category[]
  onClose: () => void
  onSave: (updated: MenuItem) => void | Promise<void>
}) {
  const isEdit = !!item?.id
  const [form, setForm] = useState({
    name: item?.name ?? '',
    nameAr: (item as any)?.nameAr ?? '',
    description: item?.description ?? '',
    descriptionAr: (item as any)?.descriptionAr ?? '',
    price: item?.price != null ? String(item.price) : '',
    prepTimeMins: String(item?.prepTimeMins ?? 15),
    categoryId: item?.categoryId ?? categories[0]?.id ?? '',
    imageUrl: item?.imageUrl ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Modifier groups state — fetched fresh from API when modal opens in edit mode
  const [groups,          setGroups]          = useState<ModifierGroup[]>([])
  const [groupsLoading,   setGroupsLoading]   = useState(false)
  const [newGroupName,    setNewGroupName]     = useState('')
  const [newGroupRequired,setNewGroupRequired] = useState(false)
  const [addingGroup,     setAddingGroup]      = useState(false)
  const [newOpt, setNewOpt] = useState<Record<string, { name: string; priceAdd: string }>>({})

  // Fetch full item (with modifier groups) when modal opens in edit mode
  useEffect(() => {
    if (!item?.id) return
    setGroupsLoading(true)
    api.get(`/menu/items?all=true`)
      .then(r => {
        const found = (r.data ?? []).find((i: MenuItem) => i.id === item.id)
        if (found?.modifierGroups) setGroups(found.modifierGroups)
      })
      .catch(() => {})
      .finally(() => setGroupsLoading(false))
  }, [item?.id])

  const addGroup = async () => {
    if (!item?.id || !newGroupName.trim()) return
    setAddingGroup(true)
    try {
      const { data } = await api.post(`/menu/items/${item.id}/modifier-groups`, { name: newGroupName.trim(), required: newGroupRequired })
      setGroups(prev => [...prev, { ...data, options: data.options ?? [] }])
      setNewGroupName('')
      setNewGroupRequired(false)
      toast.success(`"${data.name}" group added`)
    } catch { toast.error('Failed to add group') }
    finally { setAddingGroup(false) }
  }

  const deleteGroup = async (groupId: string) => {
    try {
      await api.delete(`/menu/modifier-groups/${groupId}`)
      setGroups(prev => prev.filter(g => g.id !== groupId))
    } catch { toast.error('Failed to delete group') }
  }

  const addOption = async (groupId: string) => {
    const opt = newOpt[groupId]
    if (!opt?.name?.trim()) return
    try {
      const { data } = await api.post(`/menu/modifier-groups/${groupId}/options`, {
        name: opt.name.trim(),
        priceAdd: parseFloat(opt.priceAdd || '0') || 0,
      })
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, options: [...g.options, data] } : g))
      setNewOpt(prev => ({ ...prev, [groupId]: { name: '', priceAdd: '' } }))
    } catch { toast.error('Failed to add option') }
  }

  const deleteOption = async (groupId: string, optionId: string) => {
    try {
      await api.delete(`/menu/modifier-options/${optionId}`)
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, options: g.options.filter(o => o.id !== optionId) } : g))
    } catch { toast.error('Failed to delete option') }
  }

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        nameAr: form.nameAr || undefined,
        description: form.description || undefined,
        descriptionAr: form.descriptionAr || undefined,
        price: parseFloat(form.price),
        prepTimeMins: parseInt(form.prepTimeMins),
        categoryId: form.categoryId,
        imageUrl: form.imageUrl || undefined,
      }
      let saved: MenuItem
      if (isEdit) {
        const { data } = await api.patch(`/menu/items/${item!.id}`, payload)
        saved = { ...item, ...data, id: item!.id! } as MenuItem
      } else {
        const { data } = await api.post('/menu/items', payload)
        saved = data
      }
      setSavedFlash(true)
      await new Promise(r => setTimeout(r, 450))
      onSave(saved)
      onClose()
    } catch { toast.error(isEdit ? 'Failed to update' : 'Failed to add item') }
    finally { setSaving(false); setSavedFlash(false) }
  }

  const ic = 'w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-500 focus:bg-white dark:focus:bg-gray-900 transition-all placeholder-gray-400 dark:placeholder-gray-600'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-[var(--card-border)] flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            {isEdit ? <Pencil size={14} className="text-orange-500" /> : <Plus size={14} className="text-orange-500" />}
          </div>
          <div className="flex-1">
            <div className="font-bold text-gray-900 dark:text-white text-sm">{isEdit ? 'Edit Item' : 'New Menu Item'}</div>
            {isEdit && <div className="text-xs text-gray-400 truncate">{item?.name}</div>}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={14} />
          </button>
        </div>


        {/* Form */}
        <form id="item-form" onSubmit={submit} className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Item Name (EN) *</label>
              <input required value={form.name} onChange={e => f('name', e.target.value)}
                placeholder="e.g. Chicken Biriyani" className={ic} autoFocus={!isEdit} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">
                اسم العنصر (AR) <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <input value={form.nameAr} onChange={e => f('nameAr', e.target.value)}
                placeholder="مثال: بريياني دجاج" className={ic} dir="rtl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Price (AED) *</label>
              <input required type="number" step="0.01" min="0" value={form.price}
                onChange={e => f('price', e.target.value)} placeholder="0.00" className={ic} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <Clock size={10} /> Prep Time
              </label>
              <div className="relative">
                <input type="number" min="1" max="120" value={form.prepTimeMins}
                  onChange={e => f('prepTimeMins', e.target.value)} className={`${ic} pr-10`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">min</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <Tag size={10} /> Category *
              </label>
              <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)} className={ic}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Description (EN)</label>
              <textarea value={form.description} onChange={e => f('description', e.target.value)}
                placeholder="Short description of the dish (optional)"
                rows={2} className={`${ic} resize-none`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">
                الوصف (AR) <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <textarea value={form.descriptionAr} onChange={e => f('descriptionAr', e.target.value)}
                placeholder="وصف قصير للطبق"
                rows={2} dir="rtl" className={`${ic} resize-none`} />
            </div>
            <div className="col-span-2">
              <ImageUpload
                value={form.imageUrl}
                onChange={v => f('imageUrl', v)}
                folder="almanzil/menu"
                label="Photo"
                hint="Drag & drop, click, or paste · uploads to CDN instantly"
                aspectRatio="video"
              />
            </div>
          </div>

          {/* ── Sizes & Variants (edit mode only) ── */}
          {isEdit && (
            <div className="mt-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Tag size={10} /> Sizes &amp; Variants
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full normal-case"
                    style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>
                    auto-saved
                  </span>
                </div>
                {groupsLoading && <Loader2 size={12} className="animate-spin text-amber-500" />}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                Add option groups (e.g. "Size") and set a price per option. Customers pick one option per required group before ordering.
              </p>

              {/* Existing groups */}
              {groups.length === 0 && !groupsLoading && (
                <p className="text-xs text-gray-500 italic mb-4">No option groups yet. Add one below.</p>
              )}
              {groups.map(group => (
                <div key={group.id} className="mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                  {/* Group header */}
                  <div className="flex items-center justify-between px-3 py-2.5"
                    style={{ backgroundColor: 'var(--muted-bg)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{group.name}</span>
                      {group.required && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                          Required
                        </span>
                      )}
                    </div>
                    <button type="button" onClick={() => deleteGroup(group.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="p-3 space-y-1.5" style={{ backgroundColor: 'var(--card-bg)' }}>
                    {/* Option rows */}
                    {group.options.length === 0 && (
                      <p className="text-[11px] text-gray-500 italic">No options yet — add one below.</p>
                    )}
                    {group.options.map(opt => (
                      <div key={opt.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg"
                        style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold" style={{ color: Number(opt.priceAdd) > 0 ? 'var(--brand)' : 'var(--text-muted)' }}>
                            {Number(opt.priceAdd) > 0 ? `+AED ${Number(opt.priceAdd).toFixed(2)}` : 'no extra'}
                          </span>
                          <button type="button" onClick={() => deleteOption(group.id, opt.id)}
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-400 transition-colors">
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add option row */}
                    <div className="flex gap-1.5 pt-1">
                      <input
                        placeholder="Option name (e.g. Large)"
                        value={newOpt[group.id]?.name ?? ''}
                        onChange={e => setNewOpt(p => ({ ...p, [group.id]: { ...p[group.id], name: e.target.value } }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id) } }}
                        className="flex-1 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-amber-400"
                        style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                      />
                      <input
                        placeholder="AED"
                        type="number" step="0.01" min="0"
                        value={newOpt[group.id]?.priceAdd ?? ''}
                        onChange={e => setNewOpt(p => ({ ...p, [group.id]: { ...p[group.id], priceAdd: e.target.value } }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id) } }}
                        className="w-20 text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-amber-400"
                        style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                      />
                      <button type="button" onClick={() => addOption(group.id)}
                        disabled={!newOpt[group.id]?.name?.trim()}
                        className="text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40 transition-colors"
                        style={{ backgroundColor: 'var(--brand)' }}>
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add new group row */}
              <div className="flex gap-2 items-center mt-2 pt-3" style={{ borderTop: '1px dashed var(--card-border)' }}>
                <input
                  placeholder="Group name (e.g. Size, Extras)"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup() } }}
                  className="flex-1 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400"
                  style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                />
                <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={newGroupRequired} onChange={e => setNewGroupRequired(e.target.checked)} className="accent-amber-500" />
                  Required
                </label>
                <button type="button" onClick={addGroup} disabled={!newGroupName.trim() || addingGroup}
                  className="text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                  {addingGroup ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  Add Group
                </button>
              </div>
            </div>
          )}
          {!isEdit && (
            <p className="text-xs text-gray-500 mt-2">💡 Save the item first, then reopen to add size/variant options.</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-[var(--card-border)] flex-shrink-0 bg-white dark:bg-gray-900">
          <button type="submit" form="item-form" disabled={saving || savedFlash}
            className={`flex-1 flex items-center justify-center gap-2 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-sm ${savedFlash ? 'bg-green-600 shadow-green-200 dark:shadow-none' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200 dark:shadow-none'}`}>
            {savedFlash
              ? <><Check size={14} /> Saved!</>
              : saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Check size={14} /> {isEdit ? 'Save Changes' : 'Add Item'}</>}
          </button>
          <button type="button" onClick={onClose}
            className="px-5 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Item Card ─────────────────────────────────────────────────────────────
function ItemCard({ item, catName, onToggle, onEdit, onDelete }: {
  item: MenuItem; catName?: string
  onToggle: (id: string, cur: boolean) => void
  onEdit: (item: MenuItem) => void
  onDelete: (item: MenuItem) => void
}) {
  return (
    <div className={`group relative flex flex-col bg-[var(--card-bg)] rounded-2xl border overflow-hidden transition-all duration-150
      ${item.isAvailable
        ? 'border-gray-200 dark:border-[var(--card-border)] shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700'
        : 'border-gray-200 dark:border-[var(--card-border)] opacity-60'}`}>

      {/* Image */}
      <div className="relative h-32 sm:h-36 bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <Thumb src={item.imageUrl} name={item.name} size="cover" />

        {/* Status badge */}
        <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm
          ${item.isAvailable
            ? 'bg-green-500 text-white'
            : 'bg-gray-700 text-white'}`}>
          {item.isAvailable ? 'On menu' : 'Off menu'}
        </span>

        {/* Actions overlay */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(item)} title="Edit"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur text-gray-600 dark:text-gray-300 hover:text-orange-500 shadow-sm transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => onDelete(item)} title="Delete"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur text-gray-600 dark:text-gray-300 hover:text-red-500 shadow-sm transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`font-semibold text-sm leading-snug ${!item.isAvailable ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
            {item.name}
          </h3>
          <button onClick={() => onToggle(item.id, item.isAvailable)} title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
            className="flex-shrink-0 transition-transform hover:scale-105">
            {item.isAvailable
              ? <ToggleRight size={22} className="text-green-500" />
              : <ToggleLeft size={22} className="text-gray-300 dark:text-gray-600" />}
          </button>
        </div>

        {item.description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
        )}

        <div className="flex items-center justify-between mt-auto pt-3">
          <span className="text-sm font-extrabold text-orange-500">AED {Number(item.price).toFixed(2)}</span>
          <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={10} />{item.prepTimeMins} min</span>
        </div>

        {catName && (
          <span className="mt-2 self-start text-[10px] text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{catName}</span>
        )}
      </div>
    </div>
  )
}

// ─── Delete confirm ────────────────────────────────────────────────────────
function DeleteConfirm({ item, onConfirm, onCancel }: { item: MenuItem; onConfirm: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-[var(--card-bg)] rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-1">Delete item?</h3>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{item.name}</span> will be permanently removed from the menu.
        </p>
        <div className="flex gap-2">
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [active, setActive]         = useState('')
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState<{ item: Partial<MenuItem> | null } | null>(null)
  const [delItem, setDelItem]       = useState<MenuItem | null>(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [catName, setCatName]         = useState('')
  const [catNameAr, setCatNameAr]     = useState('')
  const [catSaving, setCatSaving]     = useState(false)

  const load = async () => {
    const [catRes, itemRes] = await Promise.all([
      api.get('/menu/categories'),
      api.get('/menu/items?all=true'),
    ])
    const items: MenuItem[] = itemRes.data ?? []
    const grouped = (catRes.data ?? []).map((cat: { id: string; name: string }) => ({
      ...cat,
      items: items.filter(i => i.categoryId === cat.id || (i as any).category?.id === cat.id),
    }))
    setCategories(grouped)
    if (!active && grouped[0]) setActive(grouped[0].id)
  }

  useEffect(() => { load() }, [])

  const toggle = async (id: string, isAvailable: boolean) => {
    await api.patch(`/menu/items/${id}/toggle`)
    setCategories(prev => prev.map(c => ({ ...c, items: c.items.map(i => i.id === id ? { ...i, isAvailable: !isAvailable } : i) })))
    toast.success(isAvailable ? 'Marked off menu' : 'Back on menu')
  }

  const handleSave = async (saved: MenuItem) => {
    await load()
    setActive(saved.categoryId ?? active)
    toast.success(`"${saved.name}" saved`)
  }

  const handleDelete = async () => {
    if (!delItem) return
    await api.delete(`/menu/items/${delItem.id}`)
    toast.success('Item deleted')
    setCategories(prev => prev.map(c => ({ ...c, items: c.items.filter(i => i.id !== delItem.id) })))
    setDelItem(null)
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catName.trim()) return
    setCatSaving(true)
    try {
      const { data } = await api.post('/menu/categories', { name: catName.trim(), ...(catNameAr.trim() ? { nameAr: catNameAr.trim() } : {}) })
      toast.success('Category created!')
      setShowCatForm(false)
      setCatName('')
      setCatNameAr('')
      await load()
      if (data?.id) setActive(data.id)
    } catch { toast.error('Failed') }
    finally { setCatSaving(false) }
  }

  const moveCategory = async (id: string, dir: -1 | 1) => {
    const idx = categories.findIndex(c => c.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= categories.length) return
    const reordered = [...categories]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    setCategories(reordered)
    try { await api.patch('/menu/categories/reorder', { ids: reordered.map(c => c.id) }) }
    catch { toast.error('Failed to save order'); await load() }
  }

  const allItems: SearchItem[] = categories.flatMap(c => c.items.map(i => ({ ...i, categoryName: c.name, categoryId: c.id })))
  const filteredItems = search.trim()
    ? allItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
    : null

  const currentCat = categories.find(c => c.id === active)
  const totalAvailable = allItems.filter(i => i.isAvailable).length

  const gridItems = filteredItems ?? (currentCat?.items.map(i => ({ ...i, categoryName: currentCat.name, categoryId: currentCat.id })) ?? [])

  return (
    <>
      {modal && <ItemModal item={modal.item} categories={categories} onClose={() => setModal(null)} onSave={handleSave} />}
      {delItem && <DeleteConfirm item={delItem} onConfirm={handleDelete} onCancel={() => setDelItem(null)} />}

      <div className="flex flex-col flex-1">

        {/* ── Page header: title + stat pills + search + add ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Menu Management</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{allItems.length} items</span>
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{categories.length} categories</span>
              <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">{totalAvailable} active</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative flex-1 lg:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
                className="w-full pl-8 pr-8 py-2.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:bg-white dark:focus:bg-gray-900 transition-all placeholder-gray-400" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
            </div>
            {!search && currentCat && (
              <button onClick={() => setModal({ item: { categoryId: currentCat.id } })}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm shadow-orange-200 dark:shadow-none flex-shrink-0">
                <Plus size={14} /> Add Item
              </button>
            )}
          </div>
        </div>

        {/* ── Category tabs ── */}
        {!search && (
          <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
            {categories.map((c, ci) => {
              const isActive = active === c.id
              const offCount = c.items.filter(i => !i.isAvailable).length
              return (
                <div key={c.id} className="flex-shrink-0 flex items-center gap-0.5">
                  {isActive && (
                    <button type="button" onClick={() => moveCategory(c.id, -1)} disabled={ci === 0}
                      className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-colors" title="Move left">
                      <ChevronLeft size={13} />
                    </button>
                  )}
                  <button onClick={() => setActive(c.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
                      ${isActive
                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-200 dark:shadow-none'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {c.name}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isActive ? 'bg-white/20' : 'bg-white dark:bg-gray-900 text-gray-400'}`}>{c.items.length}</span>
                    {offCount > 0 && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                  </button>
                  {isActive && (
                    <button type="button" onClick={() => moveCategory(c.id, 1)} disabled={ci === categories.length - 1}
                      className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-colors" title="Move right">
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              )
            })}

            {showCatForm ? (
              <form onSubmit={addCategory} className="flex items-center gap-1.5 flex-shrink-0">
                <input autoFocus required value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder="Name (EN)…"
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-orange-400/40 placeholder-gray-400" />
                <input value={catNameAr} onChange={e => setCatNameAr(e.target.value)}
                  placeholder="الاسم (AR)"
                  dir="rtl"
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-orange-400/40 placeholder-gray-400" />
                <button type="submit" disabled={catSaving}
                  className="bg-orange-500 text-white rounded-xl px-3 py-2 text-xs font-bold hover:bg-orange-600 disabled:opacity-50">
                  {catSaving ? '…' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowCatForm(false)}
                  className="text-gray-400 hover:text-gray-600 px-2"><X size={16} /></button>
              </form>
            ) : (
              <button onClick={() => setShowCatForm(true)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:text-orange-500 hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <FolderPlus size={14} /> New
              </button>
            )}
          </div>
        )}

        {/* ── Grid ── */}
        <div className="p-4 sm:p-6">

          {search && (
            <div className="text-xs text-gray-400 mb-3 font-medium">
              {gridItems.length} result{gridItems.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
            </div>
          )}

          {gridItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {gridItems.map(item => (
                <ItemCard key={item.id} item={item} catName={search ? item.categoryName : undefined} onToggle={toggle}
                  onEdit={i => setModal({ item: { ...i, categoryId: search ? item.categoryId : currentCat?.id } })}
                  onDelete={setDelItem} />
              ))}
            </div>
          )}

          {search && gridItems.length === 0 && (
            <div className="text-center py-20 text-sm text-gray-400">Nothing matches &ldquo;{search}&rdquo;</div>
          )}

          {!search && currentCat && currentCat.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 bg-[var(--card-bg)] rounded-2xl border border-dashed border-gray-200 dark:border-[var(--card-border)]">
              <UtensilsCrossed size={32} className="text-gray-200 dark:text-gray-700" />
              <div className="text-sm text-gray-400">No items in {currentCat.name} yet</div>
              <button onClick={() => setModal({ item: { categoryId: currentCat.id } })}
                className="text-sm text-orange-500 font-semibold hover:text-orange-600">
                + Add the first item
              </button>
            </div>
          )}

          {categories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-5">
              <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/20 rounded-3xl flex items-center justify-center">
                <UtensilsCrossed size={36} className="text-orange-400" />
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-900 dark:text-white text-lg">No menu yet</div>
                <div className="text-sm text-gray-400 mt-1 max-w-xs">Start by creating a category, then add dishes to it.</div>
              </div>
              <button onClick={() => setShowCatForm(true)}
                className="flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors shadow-sm shadow-orange-200 dark:shadow-none">
                <FolderPlus size={15} /> Create First Category
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
