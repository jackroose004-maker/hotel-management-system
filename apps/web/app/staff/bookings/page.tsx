'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CalendarDays, Users, Phone, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Plus, Loader2, UtensilsCrossed, ChevronRight, Trash2, Search, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import api from '@/lib/api'
import { useConfirm } from '@/lib/confirm'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface ModifierOption { id: string; name: string; nameAr?: string; priceAdd: number; isDefault: boolean }
interface ModifierGroup { id: string; name: string; nameAr?: string; required: boolean; minSelect: number; maxSelect: number; options: ModifierOption[] }
interface MenuItem { id: string; name: string; price: number; categoryId: string; isAvailable: boolean; modifierGroups?: ModifierGroup[] }
interface CartEntry { menuItemId: string; quantity: number; optionIds: string[]; label: string } // label = human-readable modifier summary

interface PreOrderItem {
  id: string
  menuItem?: { name: string }
  quantity: number
  unitPrice: string
  notes?: string
  modifiers?: { id: string; name: string; priceAdd: string }[]
}

interface Booking {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED'
  slotDate: string
  slotTime: string
  partySize: number
  notes?: string
  customer?: { id: string; name: string; phone?: string }
  table?: { id: string; tableNumber: number; name?: string }
  preOrders?: { id: string; status: string; total: string; items: PreOrderItem[] }[]
}

interface AvailableTable {
  id: string; tableNumber: number; name: string; capacity: number; zone: string | null
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  CONFIRMED: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  ARRIVED:   'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  NO_SHOW:   'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  CANCELLED: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

// Strip ISO timestamp to plain YYYY-MM-DD so new Date('YYYY-MM-DDT12:00:00') always parses correctly
function dateOnly(d: string): string { return d ? d.slice(0, 10) : d }

function slotLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'arrived',  label: 'Arrived' },
  { key: 'noshows',  label: 'No-shows' },
  { key: 'all',      label: 'All' },
] as const

const PARTY_SIZES = [1,2,3,4,5,6,7,8,10,12]

function fmtSlot(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const STEPS = ['Guest', 'Reservation', 'Confirm', 'Pre-order'] as const
type Step = 0 | 1 | 2 | 3

function StepBar({ current, showPreOrder }: { current: Step; showPreOrder?: boolean }) {
  const steps = showPreOrder ? STEPS : STEPS.slice(0, 3)
  return (
    <div className="flex w-full items-center">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const isLast = i === steps.length - 1
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 72 }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all" style={{
                backgroundColor: done ? '#22c55e' : active ? 'var(--brand)' : 'var(--muted-bg)',
                border: done || active ? 'none' : '1px solid var(--card-border)',
                color: done || active ? '#fff' : 'var(--text-muted)',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span className="text-[11px] font-semibold text-center" style={{
                color: active ? 'var(--text-primary)' : done ? '#22c55e' : 'var(--text-muted)',
              }}>{label}</span>
            </div>
            {!isLast && (
              <div className="flex-1 h-px" style={{ backgroundColor: done ? '#22c55e' : 'var(--card-border)' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function NewBookingPanel({ onClose, onDone, token }: { onClose: () => void; onDone: () => void; token: string }) {
  const router = useRouter()
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm()
  const today = new Date().toLocaleDateString('en-CA')
  const [step, setStep] = useState<Step>(0)

  // Guest
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('+971 ')
  const [customerLookup, setCustomerLookup] = useState<{ found: boolean; name: string } | null>(null)
  const emailTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reservation
  const [slotDate, setSlotDate] = useState(today)
  const [partySize, setPartySize] = useState(2)
  const [tables, setTables] = useState<AvailableTable[]>([])
  const [tablesMsg, setTablesMsg] = useState('')
  const [tablesLoading, setTablesLoading] = useState(false)
  const [tableId, setTableId] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [slotGroups, setSlotGroups] = useState<{ morning: string[]; afternoon: string[]; evening: string[] }>({ morning: [], afternoon: [], evening: [] })
  const [slotsMsg, setSlotsMsg] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotTime, setSlotTime] = useState('')

  const [zoneFilter, setZoneFilter] = useState<string>('All')

  // Settings feature flags
  const [preOrderEnabled, setPreOrderEnabled] = useState(true)
  useEffect(() => {
    api.get('/settings').then(r => {
      setPreOrderEnabled(r.data?.preOrderEnabled ?? true)
    }).catch(() => {})
  }, [])

  // Confirm
  const [notes, setNotes] = useState('')
  const [orderFood, setOrderFood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Pre-order (Step 3)
  const [pendingTempPassword, setPendingTempPassword] = useState<string | null>(null)
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null)
  const [menuCategories, setMenuCategories] = useState<{ id: string; name: string }[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  // cart: one entry per item+modifier combo. Items without modifiers use optionIds=[]
  const [cart, setCart] = useState<CartEntry[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [preOrderBusy, setPreOrderBusy] = useState(false)
  // Modifier sheet
  const [modSheet, setModSheet] = useState<{ item: MenuItem; selections: Record<string, string[]> } | null>(null)

  // Debounced email lookup
  function onEmailChange(email: string) {
    setGuestEmail(email)
    setCustomerLookup(null)
    if (emailTimeout.current) clearTimeout(emailTimeout.current)
    if (!email.includes('@')) return
    emailTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/users/lookup?email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (r.ok) {
          const json = await r.json()
          const u = json?.data ?? json
          if (u?.id) {
            setCustomerLookup({ found: true, name: u.name })
            setGuestName(u.name)
            setGuestPhone(u.phone ?? '+971 ')
          } else {
            setCustomerLookup({ found: false, name: '' })
          }
        }
      } catch {}
    }, 500)
  }

  async function fetchTables(date: string, size: number) {
    setTablesLoading(true); setTables([]); setTablesMsg(''); setTableId(''); setSlots([]); setSlotTime('')
    try {
      const r = await fetch(`${API}/bookings/tables-for-date?date=${date}&partySize=${size}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await r.json()
      setTables(Array.isArray(json?.data) ? json.data : [])
      setTablesMsg(json?.message ?? '')
    } catch {} finally { setTablesLoading(false) }
  }

  async function fetchSlots(date: string, tblId: string) {
    setSlotsLoading(true); setSlots([]); setSlotGroups({ morning: [], afternoon: [], evening: [] }); setSlotsMsg(''); setSlotTime('')
    try {
      const r = await fetch(`${API}/bookings/slots-for-table?date=${date}&tableId=${tblId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await r.json()
      const d = json?.data
      setSlots(Array.isArray(d?.slots) ? d.slots : [])
      setSlotGroups(d?.grouped ?? { morning: [], afternoon: [], evening: [] })
      setSlotsMsg(json?.message ?? '')
    } catch {} finally { setSlotsLoading(false) }
  }

  function goStep(s: Step) { setError(''); setStep(s); setMenuSearch('') }

  function nextFromGuest() {
    if (!guestName.trim()) { setError('Name is required'); return }
    if (!guestEmail.trim() || !guestEmail.includes('@')) { setError('Valid email is required'); return }
    setError('')
    goStep(1)
    fetchTables(slotDate, partySize)
  }

  function nextFromReservation() {
    if (!tableId) { setError('Please select a table'); return }
    if (!slotTime) { setError('Please select a time slot'); return }
    setError(''); goStep(2)
  }

  async function loadMenu() {
    setMenuLoading(true)
    try {
      const [catRes, itemRes] = await Promise.all([
        api.get('/menu/categories', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/menu/items?all=true', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const cats = Array.isArray(catRes.data) ? catRes.data : []
      const items = Array.isArray(itemRes.data?.data) ? itemRes.data.data : Array.isArray(itemRes.data) ? itemRes.data : []
      setMenuCategories(cats)
      setMenuItems(items.filter((i: any) => i.isAvailable).map((i: any) => ({
        ...i,
        price: Number(i.price),
        modifierGroups: (i.modifierGroups ?? []).map((g: any) => ({
          ...g,
          options: (g.options ?? []).map((o: any) => ({ ...o, priceAdd: Number(o.priceAdd) })),
        })),
      })))
      if (cats.length > 0) setActiveCatId(cats[0].id)
    } catch {} finally { setMenuLoading(false) }
  }

  async function submit() {
    const tableName = selectedTable ? (selectedTable.name ?? `Table ${selectedTable.tableNumber}`) : '—'
    const dateStr = new Date(slotDate + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })
    // When pre-ordering food, skip the dialog here — it will show at the end of step 3
    // with the full food summary. Only show it now for a plain booking.
    if (!orderFood) {
      const ok = await confirmDialog({
        title: 'Confirm Booking',
        message: `${guestName} — ${dateStr} at ${fmtSlot(slotTime)} · ${tableName} · ${partySize} guest${partySize > 1 ? 's' : ''}${notes ? ` · "${notes}"` : ''}`,
        confirmLabel: 'Confirm Booking',
      })
      if (!ok) return
    }
    setBusy(true); setError('')
    try {
      const res = await api.post('/bookings/staff-create', {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim().length > 5 ? guestPhone.trim() : undefined,
        partySize,
        slotDate,
        slotTime,
        tableId: tableId || undefined,
        notes: notes.trim() || undefined,
        skipEmail: orderFood, // defer email until after pre-order is saved
      }, { headers: { Authorization: `Bearer ${token}` } })
      const data = (res as any)?.data ?? res
      const bookingId = data?.id
      if (orderFood && bookingId) {
        setCreatedBookingId(bookingId)
        // Store temp password in memory so it can be included in the combined email
        setPendingTempPassword(data?.tempPassword ?? null)
        await loadMenu()
        goStep(3)
      } else {
        onDone()
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Could not create booking')
    } finally { setBusy(false) }
  }

  async function savePreOrder() {
    if (!createdBookingId) return
    if (cart.length === 0) { onDone(); return }

    // Merge identical entries (same item + same modifiers)
    const merged: Record<string, CartEntry & { qty: number }> = {}
    for (const e of cart) {
      const key = `${e.menuItemId}|${[...e.optionIds].sort().join(',')}`
      if (merged[key]) merged[key].qty += e.quantity
      else merged[key] = { ...e, qty: e.quantity }
    }
    const items = Object.values(merged).map(e => ({
      menuItemId: e.menuItemId,
      quantity: e.qty,
      modifiers: e.optionIds.map(id => ({ optionId: id })),
    }))

    // Show final confirmation with booking + food summary
    const tableName = selectedTable ? (selectedTable.name ?? `Table ${selectedTable.tableNumber}`) : '—'
    const dateStr = new Date(slotDate + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })
    const foodSummary = Object.values(merged).map(e => {
      const item = menuItems.find(i => i.id === e.menuItemId)
      if (!item) return null
      const modLabels = e.optionIds.length
        ? item.modifierGroups?.flatMap(g => g.options).filter(o => e.optionIds.includes(o.id)).map(o => o.name).join(', ')
        : ''
      return `${e.qty}× ${item.name}${modLabels ? ` (${modLabels})` : ''}`
    }).filter(Boolean).join(', ')
    const ok = await confirmDialog({
      title: 'Confirm Booking & Pre-order',
      message: `${guestName} — ${dateStr} at ${fmtSlot(slotTime)} · ${tableName} · ${partySize} guest${partySize > 1 ? 's' : ''} · Food: ${foodSummary} (AED ${cartTotal.toFixed(2)})`,
      confirmLabel: `Confirm · AED ${cartTotal.toFixed(2)}`,
    })
    if (!ok) return

    setPreOrderBusy(true); setError('')
    try {
      await api.post(`/orders/booking/${createdBookingId}/pre-order`, {
        items,
        type: 'DINE_IN',
        ...(pendingTempPassword ? { tempPassword: pendingTempPassword } : {}),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      onDone()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Could not save pre-order')
    } finally { setPreOrderBusy(false) }
  }

  function cartAddSimple(item: MenuItem) {
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds: [], label: '' }])
  }
  function cartRemoveEntry(idx: number) {
    setCart(c => {
      const n = [...c]
      if (n[idx].quantity > 1) { n[idx] = { ...n[idx], quantity: n[idx].quantity - 1 }; return n }
      n.splice(idx, 1); return n
    })
  }
  function cartAddEntry(idx: number) {
    setCart(c => { const n = [...c]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n })
  }
  function openModSheet(item: MenuItem) {
    // Pre-select defaults
    const defaults: Record<string, string[]> = {}
    for (const g of item.modifierGroups ?? []) {
      const def = g.options.filter(o => o.isDefault).map(o => o.id)
      defaults[g.id] = def
    }
    setModSheet({ item, selections: defaults })
  }
  function confirmModSheet() {
    if (!modSheet) return
    const { item, selections } = modSheet
    const optionIds = Object.values(selections).flat()
    const labelParts: string[] = []
    for (const g of item.modifierGroups ?? []) {
      const chosen = g.options.filter(o => selections[g.id]?.includes(o.id))
      if (chosen.length) labelParts.push(chosen.map(o => o.name).join(', '))
    }
    setCart(c => [...c, { menuItemId: item.id, quantity: 1, optionIds, label: labelParts.join(' · ') }])
    setModSheet(null)
  }
  function toggleModOption(groupId: string, optionId: string, maxSelect: number) {
    setModSheet(s => {
      if (!s) return s
      const prev = s.selections[groupId] ?? []
      let next: string[]
      if (prev.includes(optionId)) {
        next = prev.filter(id => id !== optionId)
      } else if (maxSelect === 1) {
        next = [optionId]
      } else {
        next = prev.length < maxSelect ? [...prev, optionId] : prev
      }
      return { ...s, selections: { ...s.selections, [groupId]: next } }
    })
  }

  // Group cart by item for display (items without modifiers merged by id)
  const cartCount = cart.reduce((s, e) => s + e.quantity, 0)
  const cartTotal = cart.reduce((s, e) => {
    const item = menuItems.find(i => i.id === e.menuItemId)
    if (!item) return s
    const modExtra = (item.modifierGroups ?? []).flatMap(g => g.options).filter(o => e.optionIds.includes(o.id)).reduce((a, o) => a + o.priceAdd, 0)
    return s + (item.price + modExtra) * e.quantity
  }, 0)

  const selectedTable = tables.find(t => t.id === tableId)
  const zones = ['All', ...Array.from(new Set(tables.map(t => t.zone ?? 'Indoor').filter(Boolean)))]
  const visibleTables = zoneFilter === 'All' ? tables : tables.filter(t => (t.zone ?? 'Indoor') === zoneFilter)
  const groupedSlots = [
    { label: 'Morning',   slots: slotGroups.morning },
    { label: 'Afternoon', slots: slotGroups.afternoon },
    { label: 'Evening',   slots: slotGroups.evening },
  ]

  const INPUT = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
  const inputStyle = { backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }
  const labelCls = "block text-[11px] font-bold mb-1.5 tracking-wider uppercase"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full sm:max-w-lg sm:mx-4 sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header + step bar */}
        <div className="px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--card-border)' }}>
          <StepBar current={step} showPreOrder={orderFood} />
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-5">

          {/* ── STEP 0 — Guest ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Full Name *</label>
                <input value={guestName} onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Ahmed Al Rashid"
                  className={INPUT} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Email *</label>
                <input type="email" value={guestEmail} onChange={e => onEmailChange(e.target.value)}
                  placeholder="guest@email.com"
                  className={INPUT} style={inputStyle} />
                {customerLookup?.found && (
                  <p className="text-[11px] mt-1 font-semibold" style={{ color: '#22c55e' }}>
                    ✓ Existing customer — {customerLookup.name}
                  </p>
                )}
                {customerLookup && !customerLookup.found && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    New customer — account will be created & credentials emailed
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                  Phone <span className="font-normal normal-case opacity-60">(optional)</span>
                </label>
                <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                  placeholder="+971 50 000 0000"
                  className={INPUT} style={inputStyle} />
              </div>
            </div>
          )}

          {/* ── STEP 1 — Reservation (date + size + table + time, progressive reveal) ── */}
          {step === 1 && (
            <div className="space-y-5">

              {/* Date & Party Size — stacked for clean alignment */}
              <div className="flex flex-col gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Date</label>
                  <input type="date" value={slotDate} min={today}
                    onChange={e => { setSlotDate(e.target.value); fetchTables(e.target.value, partySize) }}
                    className={INPUT + ' [color-scheme:dark]'} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Party Size</label>
                  <div className="grid grid-cols-5 gap-1.5 mt-1">
                    {PARTY_SIZES.map(n => (
                      <button key={n} type="button"
                        onClick={() => { setPartySize(n); fetchTables(slotDate, n) }}
                        className="h-9 rounded-xl text-sm font-bold transition-all"
                        style={partySize === n
                          ? { backgroundColor: 'var(--brand)', color: '#fff' }
                          : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tables — shows after date/size selected */}
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                  Table
                  <span className="ml-1 font-normal normal-case opacity-60">· seats {partySize}+ guests</span>
                </label>
                {tablesLoading && (
                  <div className="flex items-center gap-2 py-3" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 size={13} className="animate-spin" />
                    <span className="text-xs">Loading tables…</span>
                  </div>
                )}
                {!tablesLoading && tablesMsg && (
                  <p className="text-[11px] mb-2" style={{ color: tables.length === 0 ? '#f87171' : 'var(--text-muted)' }}>{tablesMsg}</p>
                )}
                {!tablesLoading && tables.length > 0 && (
                  <>
                    {/* Zone filter pills */}
                    {zones.length > 2 && (
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {zones.map(z => (
                          <button key={z} type="button" onClick={() => setZoneFilter(z)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                            style={zoneFilter === z
                              ? { backgroundColor: 'var(--brand)', color: '#fff' }
                              : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                            {z}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {visibleTables.map(tbl => (
                        <button key={tbl.id} type="button"
                          onClick={() => { setTableId(tbl.id); fetchSlots(slotDate, tbl.id) }}
                          className="flex flex-col items-start p-3 rounded-xl text-left transition-all"
                          style={tableId === tbl.id
                            ? { backgroundColor: 'var(--brand)', color: '#fff', border: '2px solid var(--brand)' }
                            : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '2px solid var(--card-border)' }}>
                          <span className="text-sm font-bold">{tbl.name ?? `Table ${tbl.tableNumber}`}</span>
                          <span className="text-[11px] mt-0.5" style={{ opacity: 0.75 }}>
                            #{tbl.tableNumber} · {tbl.capacity} seats{tbl.zone ? ` · ${tbl.zone}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Time slots — shows after table selected */}
              {tableId && (
                <div>
                  <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                    Time Slot
                    {selectedTable && <span className="ml-1 font-normal normal-case opacity-60">· {selectedTable.name ?? `Table ${selectedTable.tableNumber}`}</span>}
                  </label>
                  {slotsLoading && (
                    <div className="flex items-center gap-2 py-3" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 size={13} className="animate-spin" />
                      <span className="text-xs">Checking availability…</span>
                    </div>
                  )}
                  {!slotsLoading && slotsMsg && (
                    <p className="text-[11px] mb-2" style={{ color: slots.length === 0 ? '#f87171' : 'var(--text-muted)' }}>{slotsMsg}</p>
                  )}
                  {!slotsLoading && slots.length > 0 && (
                    <div className="space-y-3">
                      {groupedSlots.filter(g => g.slots.length > 0).map(group => (
                        <div key={group.label}>
                          <p className="text-[10px] font-bold mb-1.5 uppercase tracking-widest" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>{group.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.slots.map(t => (
                              <button key={t} type="button" onClick={() => setSlotTime(t)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                                style={slotTime === t
                                  ? { backgroundColor: 'var(--brand)', color: '#fff' }
                                  : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                                {fmtSlot(t)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2 — Confirm ── */}
          {step === 2 && (
            <div className="space-y-4">

              {/* Guest + booking summary card */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                {/* Guest header */}
                <div className="px-4 py-3 flex items-center justify-between gap-2"
                  style={{ backgroundColor: 'var(--muted-bg)', borderBottom: '1px solid var(--card-border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{guestName}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {guestEmail}{guestPhone && guestPhone.length > 5 ? ` · ${guestPhone}` : ''}
                    </p>
                  </div>
                  {customerLookup?.found
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>Existing</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>New</span>
                  }
                </div>

                {/* Booking detail rows */}
                {[
                  { label: 'Date', value: new Date(slotDate + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
                  { label: 'Time', value: fmtSlot(slotTime) },
                  { label: 'Party', value: `${partySize} guest${partySize > 1 ? 's' : ''}` },
                  { label: 'Table', value: selectedTable ? `${selectedTable.name ?? `Table ${selectedTable.tableNumber}`} · ${selectedTable.capacity} seats` : '—' },
                ].map((row, i, arr) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--card-border)' : 'none' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                  Notes <span className="font-normal normal-case opacity-60">(optional)</span>
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Special requests, allergies, occasion…"
                  rows={2}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
                  style={inputStyle} />
              </div>

              {/* Order food toggle — hidden when pre-order is disabled in settings */}
              {preOrderEnabled && <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                <button type="button" onClick={() => setOrderFood(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{ backgroundColor: orderFood ? 'rgba(var(--brand-rgb),0.06)' : 'var(--card-bg)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: orderFood ? 'var(--brand)' : 'var(--muted-bg)' }}>
                    <UtensilsCrossed size={15} style={{ color: orderFood ? '#fff' : 'var(--text-muted)' }} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Pre-order food</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {orderFood ? 'You\'ll pick items next — held until guest arrives' : 'Select dishes now, fired to kitchen on arrival'}
                    </p>
                  </div>
                  {/* Toggle pill */}
                  <div className="relative flex-shrink-0 transition-all duration-200"
                    style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: orderFood ? 'var(--brand)' : 'var(--card-border)' }}>
                    <span className="absolute top-[3px] transition-all duration-200 rounded-full bg-white shadow-sm"
                      style={{ width: 14, height: 14, left: orderFood ? 19 : 3 }} />
                  </div>
                </button>
              </div>}
            </div>
          )}

          {/* ── STEP 3 — Pre-order menu picker ── */}
          {step === 3 && (
            <div className="space-y-4">
              {menuLoading ? (
                <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
              ) : (
                <>
                  {/* Search bar */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={menuSearch}
                      onChange={e => { setMenuSearch(e.target.value); if (e.target.value) setActiveCatId(null) }}
                      placeholder="Search dishes…"
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                      style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Category tabs — hidden while searching */}
                  {!menuSearch && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {menuCategories.map(cat => (
                        <button key={cat.id} type="button"
                          onClick={() => setActiveCatId(cat.id)}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                          style={{
                            backgroundColor: activeCatId === cat.id ? 'var(--brand)' : 'var(--muted-bg)',
                            color: activeCatId === cat.id ? '#fff' : 'var(--text-muted)',
                            border: '1px solid var(--card-border)',
                          }}>
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-2">
                    {(() => {
                      const q = menuSearch.trim().toLowerCase()
                      return q
                        ? menuItems.filter(i => i.name.toLowerCase().includes(q))
                        : menuItems.filter(i => i.categoryId === activeCatId)
                    })().map(item => {
                      const hasModifiers = (item.modifierGroups ?? []).length > 0
                      const itemEntries = cart.filter(e => e.menuItemId === item.id)
                      const totalQty = itemEntries.reduce((s, e) => s + e.quantity, 0)
                      return (
                        <div key={item.id} className="rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
                          style={{ border: `1px solid ${totalQty > 0 ? 'rgba(var(--brand-rgb),0.3)' : 'var(--card-border)'}`, backgroundColor: totalQty > 0 ? 'rgba(var(--brand-rgb),0.04)' : 'var(--card-bg)' }}
                          onClick={() => hasModifiers ? openModSheet(item) : cartAddSimple(item)}>
                          <div className="flex items-center gap-3 px-3 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                AED {item.price.toFixed(2)}{hasModifiers && <span className="ml-1 opacity-60">· customisable</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              {hasModifiers ? (
                                <button type="button" onClick={() => openModSheet(item)}
                                  className="px-3 h-7 rounded-full text-xs font-semibold transition-all"
                                  style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                                  + Add
                                </button>
                              ) : totalQty > 0 ? (
                                <>
                                  <button type="button" onClick={() => { const idx = cart.findLastIndex(e => e.menuItemId === item.id); if (idx >= 0) cartRemoveEntry(idx) }}
                                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                    style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>−</button>
                                  <span className="w-5 text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{totalQty}</span>
                                  <button type="button" onClick={() => cartAddSimple(item)}
                                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                    style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>+</button>
                                </>
                              ) : (
                                <button type="button" onClick={() => cartAddSimple(item)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                                  style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>+</button>
                              )}
                            </div>
                          </div>
                          {/* Per-entry modifier summary for items with modifiers */}
                          {hasModifiers && itemEntries.length > 0 && (
                            <div className="px-3 pb-2 space-y-1">
                              {itemEntries.map((e, idx) => {
                                const globalIdx = cart.indexOf(e)
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <span className="flex-1 truncate">{e.label || 'No extras'} ×{e.quantity}</span>
                                    <button type="button" onClick={() => cartRemoveEntry(globalIdx)}
                                      className="text-red-400 hover:text-red-500 flex items-center justify-center">
                                      <Trash2 size={12} />
                                    </button>
                                    <button type="button" onClick={() => cartAddEntry(globalIdx)}
                                      className="font-bold" style={{ color: 'var(--brand)' }}>+1</button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {(() => {
                      const q = menuSearch.trim().toLowerCase()
                      const visible = q ? menuItems.filter(i => i.name.toLowerCase().includes(q)) : menuItems.filter(i => i.categoryId === activeCatId)
                      if (visible.length > 0) return null
                      return <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>{q ? `No results for "${menuSearch}"` : 'No items in this category'}</p>
                    })()}
                  </div>

                  {/* Cart summary */}
                  {cartCount > 0 && (
                    <div className="rounded-xl p-3 flex items-center justify-between"
                      style={{ backgroundColor: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.2)' }}>
                      <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                        {cartCount} item{cartCount > 1 ? 's' : ''} selected
                      </span>
                      <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>AED {cartTotal.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <p className="text-xs font-semibold mt-3" style={{ color: '#f87171' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center gap-3 flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
          {step > 0 && step < 3 ? (
            <button type="button" onClick={() => goStep((step - 1) as Step)}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Back
            </button>
          ) : step === 0 ? (
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          ) : null}
          <div className="flex-1" />
          {step < 2 && (
            <button type="button"
              onClick={step === 0 ? nextFromGuest : nextFromReservation}
              className="px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
              style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
              Continue <ChevronRight size={14} />
            </button>
          )}
          {step === 2 && (
            <button type="button" onClick={submit} disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 min-w-0"
              style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
              {busy && <Loader2 size={13} className="animate-spin flex-shrink-0" />}
              <span className="truncate">{orderFood ? 'Confirm & Add Food' : 'Confirm Booking'}</span>
            </button>
          )}
          {step === 3 && (
            <button type="button" onClick={savePreOrder} disabled={preOrderBusy}
              className="px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
              {preOrderBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {cartCount > 0 ? `Save Pre-order · AED ${cartTotal.toFixed(2)}` : 'Skip Pre-order'}
            </button>
          )}
        </div>
      </div>

      {confirmDialogNode}

      {/* Modifier bottom sheet */}
      {modSheet && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModSheet(null) }}>
          <div className="rounded-t-2xl overflow-hidden flex flex-col max-h-[80vh]"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{modSheet.item.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>AED {modSheet.item.price.toFixed(2)}</p>
              </div>
              <button type="button" onClick={() => setModSheet(null)} className="text-lg font-bold leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
            </div>
            {/* Groups */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {(modSheet.item.modifierGroups ?? []).map(group => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
                    {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>Required</span>}
                    {group.maxSelect > 1 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pick up to {group.maxSelect}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {group.options.map(opt => {
                      const selected = (modSheet.selections[group.id] ?? []).includes(opt.id)
                      const isRadio = group.maxSelect === 1
                      return (
                        <button key={opt.id} type="button"
                          onClick={() => toggleModOption(group.id, opt.id, group.maxSelect)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                          style={{
                            border: `1px solid ${selected ? 'var(--brand)' : 'var(--card-border)'}`,
                            backgroundColor: selected ? 'rgba(var(--brand-rgb),0.06)' : 'var(--muted-bg)',
                          }}>
                          <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: selected ? 'var(--brand)' : 'var(--card-border)', backgroundColor: selected ? 'var(--brand)' : 'transparent' }}>
                            {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.name}</span>
                          {opt.priceAdd > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>+AED {opt.priceAdd.toFixed(2)}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Confirm */}
            <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
              {/* Validate required groups */}
              {(() => {
                const missing = (modSheet.item.modifierGroups ?? []).filter(g => g.required && !(modSheet.selections[g.id]?.length))
                return (
                  <button type="button" onClick={confirmModSheet} disabled={missing.length > 0}
                    className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
                    style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
                    {missing.length > 0 ? `Select ${missing[0].name}` : 'Add to Pre-order'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false)
  const [cal, setCal] = useState(() => { const d = new Date(value + 'T12:00:00'); return { y: d.getFullYear(), m: d.getMonth() } })
  const ref = useRef<HTMLDivElement>(null)
  const todayStr = new Date().toLocaleDateString('en-CA')

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = value === todayStr ? 'Today'
    : value === new Date(new Date(todayStr + 'T12:00:00').getTime() + 86400000).toLocaleDateString('en-CA') ? 'Tomorrow'
    : new Date(value + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })

  const daysInMonth = new Date(cal.y, cal.m + 1, 0).getDate()
  const firstDay = (new Date(cal.y, cal.m, 1).getDay() + 6) % 7 // Mon=0
  const monthName = new Date(cal.y, cal.m, 1).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

  function pick(day: number) {
    const d = new Date(cal.y, cal.m, day)
    onChange(d.toLocaleDateString('en-CA'))
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(v => !v); setCal(() => { const d = new Date(value + 'T12:00:00'); return { y: d.getFullYear(), m: d.getMonth() } }) }}
        className="px-2 py-0.5 rounded-lg text-sm font-bold whitespace-nowrap flex items-center gap-1.5 transition-all"
        style={{ color: value === todayStr ? 'var(--brand)' : 'var(--text-primary)' }}>
        <CalendarDays size={12} style={{ opacity: 0.5 }} />
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', width: 260 }}>
          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <button onClick={() => setCal(c => { const d = new Date(c.y, c.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })}
              className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }}><ChevronLeft size={14} /></button>
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{monthName}</span>
            <button onClick={() => setCal(c => { const d = new Date(c.y, c.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })}
              className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }}><ChevronRight size={14} /></button>
          </div>
          {/* Day labels */}
          <div className="grid grid-cols-7 px-3 pt-2 pb-1">
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <span key={i} className="text-center text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{d}</span>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <span key={'e' + i} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = new Date(cal.y, cal.m, day).toLocaleDateString('en-CA')
              const isSelected = dateStr === value
              const isToday = dateStr === todayStr
              return (
                <button key={day} onClick={() => pick(day)}
                  className="w-8 h-8 mx-auto rounded-xl text-xs font-semibold flex items-center justify-center transition-all"
                  style={isSelected
                    ? { background: 'var(--brand)', color: '#fff' }
                    : isToday
                      ? { background: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)', fontWeight: 800 }
                      : { color: 'var(--text-primary)' }}>
                  {day}
                </button>
              )
            })}
          </div>
          {/* Today shortcut */}
          <div className="px-3 pb-3">
            <button onClick={() => { onChange(todayStr); setOpen(false) }}
              className="w-full py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: 'var(--muted-bg)', color: 'var(--brand)', border: '1px solid var(--card-border)' }}>
              Jump to Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StaffBookingsPage() {
  const { token } = useAuthStore()
  const router = useRouter()
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [viewDate, setViewDate] = useState(todayStr)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'arrived' | 'noshows'>('upcoming')
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  function shiftDate(days: number) {
    const d = new Date(viewDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setViewDate(d.toLocaleDateString('en-CA'))
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/bookings/today?date=${viewDate}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) { setBookings([]); return }
      const json = await r.json()
      const data = json?.data ?? json
      setBookings(Array.isArray(data) ? data : [])
    } catch { setBookings([]) }
    finally { setLoading(false) }
  }, [token, viewDate])

  useEffect(() => { load() }, [load])

  async function markArrived(id: string) {
    await api.patch(`/bookings/${id}/arrived`)
    load()
  }

  async function confirmBooking(id: string) {
    await api.patch(`/bookings/${id}/confirm`)
    load()
  }

  async function cancelBooking(id: string) {
    const ok = await confirm({ title: 'Cancel this booking?', message: 'The guest will be notified and the slot will be released.', confirmLabel: 'Cancel Booking', danger: true })
    if (!ok) return
    await api.patch(`/bookings/${id}/cancel`)
    load()
  }

  const filtered = bookings.filter(b => {
    if (filter === 'upcoming') return ['PENDING', 'CONFIRMED'].includes(b.status)
    if (filter === 'arrived')  return b.status === 'ARRIVED'
    if (filter === 'noshows')  return b.status === 'NO_SHOW'
    return true
  })

  const counts = {
    pending:   bookings.filter(b => b.status === 'PENDING').length,
    confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
    arrived:   bookings.filter(b => b.status === 'ARRIVED').length,
    noshows:   bookings.filter(b => b.status === 'NO_SHOW').length,
  }

  return (
    <div className="flex flex-col flex-1">

      {/* Header */}
      <div className="h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {/* Date navigator */}
          <div className="flex items-center gap-1">
            <button onClick={() => shiftDate(-1)} className="p-1 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
              <ChevronLeft size={15} />
            </button>
            <DatePicker value={viewDate} onChange={setViewDate} />
            <button onClick={() => shiftDate(1)} className="p-1 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
              <ChevronRight size={15} />
            </button>
          </div>
          <button onClick={load} className="p-1 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }} title="Refresh">
            <RefreshCw size={12} />
          </button>
          {/* Filter pills — inline in header */}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            {FILTERS.map(f => {
              const cnt = f.key === 'upcoming' ? counts.pending + counts.confirmed
                : f.key === 'arrived' ? counts.arrived
                : f.key === 'noshows' ? counts.noshows
                : bookings.length
              return (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                  style={filter === f.key
                    ? { backgroundColor: 'var(--brand)', color: '#fff' }
                    : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
                  {f.label}
                  <span className="text-[10px] font-bold opacity-70">{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <p className="text-xs hidden md:block" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
          <button onClick={() => setShowNewBooking(true)}
            className="flex items-center gap-1.5 rounded-xl font-bold transition-opacity hover:opacity-90 px-2.5 py-1.5 sm:px-3"
            style={{ backgroundColor: 'var(--brand)', color: '#fff' }}>
            <Plus size={14} className="flex-shrink-0" />
            <span className="hidden sm:inline text-xs">New</span>
          </button>
        </div>
      </div>

      {/* Mobile-only filter pills row */}
      <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-gray-200 dark:border-[var(--card-border)] bg-[var(--header-bg)] flex-shrink-0">
        {FILTERS.map(f => {
          const cnt = f.key === 'upcoming' ? counts.pending + counts.confirmed
            : f.key === 'arrived' ? counts.arrived
            : f.key === 'noshows' ? counts.noshows
            : bookings.length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
              style={filter === f.key
                ? { backgroundColor: 'var(--brand)', color: '#fff' }
                : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              {f.label}
              <span className="opacity-60">{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">

        {/* Skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-[var(--card-border)] rounded-2xl h-20" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[var(--card-bg)] rounded-2xl border border-dashed border-blue-200 dark:border-[var(--card-border)]">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <CalendarDays size={28} className="text-blue-400 dark:text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No bookings here</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[240px]">Reservations made by guests online or by staff will appear in this section.</p>
            </div>
          </div>
        )}

        {/* Booking list — mobile keeps row layout, desktop gets card grid */}
        {!loading && filtered.length > 0 && (
          <>
            {/* ── Mobile list (hidden on sm+) ── */}
            <div className="flex flex-col gap-3 sm:hidden">
              {filtered.map(b => {
                const name = b.customer?.name ?? '—'
                const phone = b.customer?.phone
                return (
                <div key={b.id} className="rounded-2xl border overflow-hidden"
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                  onClick={() => setDetailBooking(b)}>
                  {/* Top strip: time + table + status badge */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{slotLabel(b.slotTime)}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                        {b.table ? (b.table.name ?? `T${b.table.tableNumber}`) : 'TBD'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                  </div>
                  {/* Guest info */}
                  <div className="px-4 pb-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{name}</p>
                    <div className="flex items-center gap-3 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1 text-xs"><Users size={11} /> {b.partySize} guests</span>
                      {phone && <span className="flex items-center gap-1 text-xs"><Phone size={11} /> {phone}</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    {b.status === 'CONFIRMED' && (
                      <button onClick={() => markArrived(b.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-green-500">
                        <CheckCircle2 size={13} /> Mark Arrived
                      </button>
                    )}
                    {b.status === 'ARRIVED' && (
                      <button onClick={() => router.push(`/staff/orders?tableId=${b.table?.id}&tableName=${encodeURIComponent(b.table?.name ?? `Table ${b.table?.tableNumber}`)}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                        <UtensilsCrossed size={13} /> Order Food
                      </button>
                    )}
                    {b.status === 'PENDING' && (
                      <button onClick={() => confirmBooking(b.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                        <CheckCircle2 size={13} /> Confirm
                      </button>
                    )}
                    {['PENDING', 'CONFIRMED'].includes(b.status) && (
                      <button onClick={() => cancelBooking(b.id)} className="px-4 py-2 rounded-xl text-xs font-semibold"
                        style={{ color: '#ef4444', border: '1px solid var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>

            {/* ── Desktop card grid (hidden on mobile) ── */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(b => {
                const name = b.customer?.name ?? '—'
                const phone = b.customer?.phone
                return (
                <div key={b.id} className="rounded-2xl border flex flex-col overflow-hidden cursor-pointer hover:border-[var(--brand)] transition-colors"
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                  onClick={() => setDetailBooking(b)}>
                  <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <div>
                      <p className="text-xl font-black leading-tight" style={{ color: 'var(--text-primary)' }}>{slotLabel(b.slotTime)}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{b.table ? `Table ${b.table.tableNumber}` : 'Table TBD'}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                  </div>
                  <div className="px-4 py-3 flex-1 flex flex-col gap-1.5">
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{name}</p>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><Users size={11} /> {b.partySize} guests</span>
                    {phone && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><Phone size={11} /> {phone}</span>}
                    {b.notes && <p className="text-xs italic mt-1" style={{ color: 'var(--text-muted)' }}>{b.notes}</p>}
                  </div>
                  <div className="px-4 pb-4 pt-2 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                    {b.status === 'CONFIRMED' && (
                      <button onClick={() => markArrived(b.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-green-500 hover:bg-green-600 transition-colors">
                        <CheckCircle2 size={13} /> Mark Arrived
                      </button>
                    )}
                    {b.status === 'ARRIVED' && (
                      <button onClick={() => router.push(`/staff/orders?tableId=${b.table?.id}&tableName=${encodeURIComponent(b.table?.name ?? `Table ${b.table?.tableNumber}`)}`)
} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                        <UtensilsCrossed size={13} /> Order Food
                      </button>
                    )}
                    {b.status === 'PENDING' && (
                      <button onClick={() => confirmBooking(b.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                        <CheckCircle2 size={13} /> Confirm
                      </button>
                    )}
                    {['PENDING', 'CONFIRMED'].includes(b.status) && (
                      <button onClick={() => cancelBooking(b.id)} className="w-full py-2 rounded-xl text-xs font-semibold"
                        style={{ color: '#ef4444', border: '1px solid var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {confirmDialog}

      {showNewBooking && (
        <NewBookingPanel
          token={token ?? ''}
          onClose={() => setShowNewBooking(false)}
          onDone={() => { setShowNewBooking(false); load() }}
        />
      )}

      {/* ── Booking Detail Slide-over ── */}
      {detailBooking && (() => {
        const b = detailBooking
        const name = b.customer?.name ?? '—'
        const phone = b.customer?.phone
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDetailBooking(null)}>
            <div className="w-full sm:max-w-sm sm:mx-4 sm:rounded-2xl rounded-t-2xl overflow-hidden"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              onClick={e => e.stopPropagation()}>

              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--card-border)' }} />
              </div>

              {/* Header */}
              <div className="px-5 pt-3 pb-4 border-b flex items-start justify-between" style={{ borderColor: 'var(--card-border)' }}>
                <div>
                  <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{slotLabel(b.slotTime)}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {b.table ? (b.table.name ?? `Table ${b.table.tableNumber}`) : 'No table assigned'}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[b.status]}`}>{b.status}</span>
              </div>

              {/* Details grid */}
              <div className="px-5 py-4 grid grid-cols-2 gap-y-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Guest</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Party</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{b.partySize} guests</p>
                </div>
                {phone && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Phone</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Date</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {new Date(dateOnly(b.slotDate) + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
                {b.notes && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Notes</p>
                    <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>{b.notes}</p>
                  </div>
                )}
              </div>

              {/* Pre-order section */}
              {(() => {
                const preOrder = b.preOrders?.find(o => o.status === 'PRE_ORDER')
                if (!preOrder) return null
                return (
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Pre-order</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand)' }}>
                        Held · fires on arrival
                      </span>
                    </div>
                    <div className="space-y-2">
                      {preOrder.items.map(item => {
                        const basePrice = Number(item.unitPrice)
                        const modTotal = (item.modifiers ?? []).reduce((s, m) => s + Number(m.priceAdd), 0)
                        return (
                          <div key={item.id} className="space-y-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                                  style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                                  ×{item.quantity}
                                </span>
                                <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                                  {item.menuItem?.name ?? '—'}
                                </p>
                              </div>
                              <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                AED {(basePrice * item.quantity).toFixed(2)}
                              </span>
                            </div>
                            {(item.modifiers ?? []).map(m => (
                              <div key={m.id} className="flex items-center justify-between gap-2 pl-8">
                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>+ {m.name}</span>
                                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                  AED {Number(m.priceAdd).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Pre-order total</span>
                      <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                        AED {Number(preOrder.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="px-5 py-4 flex flex-col gap-2">
                {b.status === 'CONFIRMED' && (
                  <button onClick={() => { markArrived(b.id); setDetailBooking(null) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-green-500">
                    <CheckCircle2 size={14} /> Mark Arrived
                  </button>
                )}
                {b.status === 'ARRIVED' && (
                  <button onClick={() => { setDetailBooking(null); router.push(`/staff/orders?tableId=${b.table?.id}&tableName=${encodeURIComponent(b.table?.name ?? `Table ${b.table?.tableNumber}`)}`) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                    <UtensilsCrossed size={14} /> Order Food
                  </button>
                )}
                {b.status === 'PENDING' && (
                  <button onClick={() => { confirmBooking(b.id); setDetailBooking(null) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.25)' }}>
                    <CheckCircle2 size={14} /> Confirm Booking
                  </button>
                )}
                {['PENDING', 'CONFIRMED'].includes(b.status) && (
                  <button onClick={() => { cancelBooking(b.id); setDetailBooking(null) }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{ color: '#ef4444', border: '1px solid var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                    Cancel Booking
                  </button>
                )}
                <button onClick={() => setDetailBooking(null)}
                  className="w-full py-2 rounded-xl text-sm font-semibold"
                  style={{ color: 'var(--text-muted)' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
